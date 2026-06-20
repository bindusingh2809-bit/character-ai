import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import { detectPoseFromImage } from '../poseDetector.js'
import { buildSkeleton, buildSkeletonFromBackend, buildBones } from '../skeleton.js'
import { loadImage } from '../imageUtils.js'
import { isBackendAvailable, uploadImage, runSegment, cutoutUrl } from '../api.js'

const EDITOR_SIZE = 500

// Joint display metadata — name, label, colour
const JOINT_DEFS = [
  { name: 'headTop',         label: 'Head Top',    color: '#ff6b8b' },
  { name: 'midShoulder',     label: 'Neck',         color: '#36e2c4' },
  { name: 'midHip',          label: 'Hips',         color: '#36e2c4' },
  { name: 'left_shoulder',   label: 'L Shoulder',   color: '#7c5cff' },
  { name: 'right_shoulder',  label: 'R Shoulder',   color: '#7c5cff' },
  { name: 'left_elbow',      label: 'L Elbow',      color: '#7c5cff' },
  { name: 'right_elbow',     label: 'R Elbow',      color: '#7c5cff' },
  { name: 'left_wrist',      label: 'L Wrist',      color: '#7c5cff' },
  { name: 'right_wrist',     label: 'R Wrist',      color: '#7c5cff' },
  { name: 'left_hip',        label: 'L Hip',        color: '#f59e0b' },
  { name: 'right_hip',       label: 'R Hip',        color: '#f59e0b' },
  { name: 'left_knee',       label: 'L Knee',       color: '#f59e0b' },
  { name: 'right_knee',      label: 'R Knee',       color: '#f59e0b' },
  { name: 'left_ankle',      label: 'L Ankle',      color: '#f59e0b' },
  { name: 'right_ankle',     label: 'R Ankle',      color: '#f59e0b' },
]

// Bone lines to draw between joints
const BONE_LINES = [
  ['midHip',        'midShoulder',    '#36e2c4'],
  ['midShoulder',   'headTop',        '#ff6b8b'],
  ['midShoulder',   'left_shoulder',  '#7c5cff'],
  ['midShoulder',   'right_shoulder', '#7c5cff'],
  ['left_shoulder', 'left_elbow',     '#7c5cff'],
  ['left_elbow',    'left_wrist',     '#7c5cff'],
  ['right_shoulder','right_elbow',    '#7c5cff'],
  ['right_elbow',   'right_wrist',    '#7c5cff'],
  ['midHip',        'left_hip',       '#f59e0b'],
  ['midHip',        'right_hip',      '#f59e0b'],
  ['left_hip',      'left_knee',      '#f59e0b'],
  ['left_knee',     'left_ankle',     '#f59e0b'],
  ['right_hip',     'right_knee',     '#f59e0b'],
  ['right_knee',    'right_ankle',    '#f59e0b'],
]

export default function JointEditor({ imageUrl, file, onConfirm, onPoseSource, onBackendReady }) {
  const [imgEl, setImgEl]         = useState(null)
  const [joints, setJoints]       = useState(null)
  const [isDetecting, setDetecting] = useState(true)
  const [detectLabel, setDetectLabel] = useState('Detecting skeleton…')
  const [hoveredJoint, setHoveredJoint] = useState(null)
  const containerRef = useRef(null)
  const draggingRef  = useRef(null)

  // ── Pose detection on mount ──────────────────────────────────────────────
  // Tries the Python backend first (rembg + MediaPipe Pose — much more
  // accurate than the client-side MoveNet path, especially background
  // cleanup). Falls back to the original client-side detector if the
  // backend isn't reachable, so the app still works with zero setup.
  useEffect(() => {
    let cancelled = false
    setDetecting(true)
    async function detect() {
      const img = await loadImage(imageUrl)
      if (cancelled) return
      setImgEl(img)

      const backendUp = file ? await isBackendAvailable() : false

      if (backendUp) {
        try {
          setDetectLabel('Uploading to backend…')
          const { project_id } = await uploadImage(file)
          if (cancelled) return

          setDetectLabel('Segmenting + detecting pose…')
          const result = await runSegment(project_id)
          if (cancelled) return

          const { joints: j, source } = buildSkeletonFromBackend(
            result.keypoints, result.used_fallback_pose, img.naturalWidth, img.naturalHeight
          )
          setJoints(j)
          onPoseSource(source)
          onBackendReady?.(project_id, cutoutUrl(project_id))
          setDetecting(false)
          return
        } catch (e) {
          console.warn('Backend pipeline failed, falling back to client-side detection:', e)
        }
      }

      // ── Fallback: original client-side MoveNet + proportional rig ──────
      let kps = null
      try { kps = await detectPoseFromImage(img) }
      catch (e) { console.warn('Pose detection failed, using proportions:', e) }
      if (cancelled) return

      const { joints: j, source } = buildSkeleton(kps, img.naturalWidth, img.naturalHeight)
      setJoints(j)
      onPoseSource(source)
      onBackendReady?.(null, null)
      setDetecting(false)
    }
    detect()
    return () => { cancelled = true }
  }, [imageUrl, file]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Display-space transform ──────────────────────────────────────────────
  const transform = useMemo(() => {
    if (!imgEl) return null
    const nW = imgEl.naturalWidth
    const nH = imgEl.naturalHeight
    const scale = Math.min(EDITOR_SIZE / nW, EDITOR_SIZE / nH)
    return {
      scale,
      offX: (EDITOR_SIZE - nW * scale) / 2,
      offY: (EDITOR_SIZE - nH * scale) / 2,
      imgW: nW * scale,
      imgH: nH * scale,
    }
  }, [imgEl])

  const toDisplay = useCallback((jName) => {
    if (!joints?.[jName] || !transform) return null
    return {
      x: joints[jName].x * transform.scale + transform.offX,
      y: joints[jName].y * transform.scale + transform.offY,
    }
  }, [joints, transform])

  // ── Drag handling ────────────────────────────────────────────────────────
  const getEventPos = (e) => {
    const rect = containerRef.current.getBoundingClientRect()
    const clientX = e.touches ? e.touches[0].clientX : e.clientX
    const clientY = e.touches ? e.touches[0].clientY : e.clientY
    return {
      x: (clientX - rect.left  - transform.offX) / transform.scale,
      y: (clientY - rect.top   - transform.offY) / transform.scale,
    }
  }

  const onPointerMove = useCallback((e) => {
    if (!draggingRef.current || !transform) return
    e.preventDefault()
    const pos = getEventPos(e)
    setJoints(prev => ({ ...prev, [draggingRef.current]: pos }))
  }, [transform]) // eslint-disable-line react-hooks/exhaustive-deps

  const onPointerUp = useCallback(() => {
    draggingRef.current = null
  }, [])

  const startDrag = (e, name) => {
    e.preventDefault()
    draggingRef.current = name
  }

  // ── Confirm → build bones and hand off ──────────────────────────────────
  const handleConfirm = () => {
    if (!joints) return
    const bones = buildBones(joints)
    onConfirm(bones, joints)
  }

  // ── Loading state ────────────────────────────────────────────────────────
  if (isDetecting || !joints || !transform) {
    return (
      <div className="flex flex-col items-center gap-4 w-full max-w-2xl">
        <div
          className="rounded-2xl border border-ink-600 bg-ink-800 flex flex-col items-center justify-center gap-4"
          style={{ width: EDITOR_SIZE, height: EDITOR_SIZE, maxWidth: '100%' }}
        >
          <div className="flex gap-2">
            {[0, 1, 2].map(i => (
              <div key={i} className="w-2.5 h-2.5 rounded-full bg-signal-violet animate-pulseDot"
                   style={{ animationDelay: `${i * 0.2}s` }} />
            ))}
          </div>
          <p className="text-sm text-mist-400 font-mono">{detectLabel}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center gap-4 w-full max-w-2xl">
      {/* Header instruction */}
      <div className="flex items-center gap-2 text-xs text-mist-400 font-mono bg-ink-800 border border-ink-600 rounded-lg px-3 py-2 max-w-lg text-center">
        <span className="text-signal-teal">●</span>
        Drag the joint circles to match your character's anatomy, then click&nbsp;<strong className="text-mist-200">Animate</strong>
      </div>

      {/* Editor canvas */}
      <div
        ref={containerRef}
        className="relative rounded-2xl overflow-hidden border border-ink-600 canvas-checker select-none touch-none"
        style={{ width: EDITOR_SIZE, height: EDITOR_SIZE, maxWidth: '100%', cursor: draggingRef.current ? 'grabbing' : 'default' }}
        onMouseMove={onPointerMove}
        onMouseUp={onPointerUp}
        onMouseLeave={onPointerUp}
        onTouchMove={onPointerMove}
        onTouchEnd={onPointerUp}
      >
        {/* Character image */}
        <img
          src={imageUrl}
          alt="character"
          draggable={false}
          style={{
            position: 'absolute',
            left: transform.offX,
            top:  transform.offY,
            width:  transform.imgW,
            height: transform.imgH,
            pointerEvents: 'none',
            userSelect: 'none',
          }}
        />

        {/* Bone lines (SVG) */}
        <svg
          style={{ position: 'absolute', inset: 0, width: EDITOR_SIZE, height: EDITOR_SIZE, pointerEvents: 'none' }}
        >
          {BONE_LINES.map(([from, to, color]) => {
            const f = toDisplay(from)
            const t = toDisplay(to)
            if (!f || !t) return null
            return (
              <line
                key={`${from}-${to}`}
                x1={f.x} y1={f.y}
                x2={t.x} y2={t.y}
                stroke={color}
                strokeWidth={2.5}
                strokeOpacity={0.65}
                strokeLinecap="round"
              />
            )
          })}
        </svg>

        {/* Draggable joint circles */}
        {JOINT_DEFS.map(({ name, label, color }) => {
          const pos = toDisplay(name)
          if (!pos) return null
          const isHovered = hoveredJoint === name
          const r = 8
          return (
            <div
              key={name}
              style={{
                position: 'absolute',
                left:   pos.x - r,
                top:    pos.y - r,
                width:  r * 2,
                height: r * 2,
                borderRadius: '50%',
                background: color,
                border: `2px solid ${isHovered ? '#fff' : 'rgba(255,255,255,0.55)'}`,
                cursor: 'grab',
                zIndex: 20,
                boxShadow: isHovered ? `0 0 0 3px ${color}44` : 'none',
                transition: 'box-shadow 0.1s, border-color 0.1s',
              }}
              onMouseDown={(e) => startDrag(e, name)}
              onTouchStart={(e) => startDrag(e, name)}
              onMouseEnter={() => setHoveredJoint(name)}
              onMouseLeave={() => setHoveredJoint(null)}
            >
              {/* Tooltip label */}
              {isHovered && (
                <div
                  style={{
                    position: 'absolute',
                    bottom: '100%',
                    left: '50%',
                    transform: 'translateX(-50%)',
                    marginBottom: 4,
                    background: '#1a1f2e',
                    border: '1px solid #2a3040',
                    color: '#d0d5e8',
                    fontSize: 10,
                    fontFamily: 'monospace',
                    padding: '2px 6px',
                    borderRadius: 4,
                    whiteSpace: 'nowrap',
                    pointerEvents: 'none',
                    zIndex: 30,
                  }}
                >
                  {label}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Animate button */}
      <button
        onClick={handleConfirm}
        className="flex items-center gap-2 bg-signal-violet hover:bg-violet-500 text-white font-semibold text-sm px-6 py-3 rounded-xl transition-colors focus-ring shadow-lg"
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
          <path d="M2 2l10 5-10 5V2z" />
        </svg>
        Animate Character
      </button>

      <p className="text-[11px] text-mist-600 font-mono -mt-2">
        {JOINT_DEFS.length} joints · drag to reposition any misplaced circle
      </p>
    </div>
  )
}

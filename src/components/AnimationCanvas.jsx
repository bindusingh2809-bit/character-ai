import React, { useEffect, useRef } from 'react'
import * as PIXI from 'pixi.js'
import { buildMeshGrid, computeSkinning, computeWorldBones, deformMesh, getCharacterScale } from '../rig.js'
import { loadImage, removeBackground } from '../imageUtils.js'

const CANVAS_W = 560
const CANVAS_H = 560

const BONE_COLOR  = 0x7c5cff
const JOINT_COLOR = 0x36e2c4

export default function AnimationCanvas({ imageUrl, usingBackendCutout, bones, animation, isPlaying, onPixiApp }) {
  const mountRef   = useRef(null)
  const appRef     = useRef(null)
  const stateRef   = useRef(null)
  const animRef    = useRef(animation)
  const playingRef = useRef(isPlaying)
  const startTimeRef = useRef(null)
  const pauseTimeRef = useRef(0)

  useEffect(() => { animRef.current   = animation  }, [animation])
  useEffect(() => { playingRef.current = isPlaying }, [isPlaying])

  // ── Init PIXI once ────────────────────────────────────────────────────────
  useEffect(() => {
    const container = mountRef.current
    if (!container) return

    const app = new PIXI.Application({
      width: CANVAS_W,
      height: CANVAS_H,
      backgroundColor: 0x0a0d12,
      antialias: true,
      resolution: window.devicePixelRatio || 1,
      autoDensity: true,
    })
    container.appendChild(app.view)
    appRef.current = app
    onPixiApp(app)

    // Checker bg
    const bg = new PIXI.Graphics()
    const ts = 24
    for (let row = 0; row * ts < CANVAS_H; row++) {
      for (let col = 0; col * ts < CANVAS_W; col++) {
        bg.beginFill((row + col) % 2 === 0 ? 0x0a0d12 : 0x12161f)
        bg.drawRect(col * ts, row * ts, ts, ts)
        bg.endFill()
      }
    }
    app.stage.addChild(bg)

    return () => {
      app.destroy(true, { children: true, texture: true, baseTexture: true })
      appRef.current = null
      onPixiApp(null)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Build rig whenever imageUrl or bones change ───────────────────────────
  useEffect(() => {
    if (!imageUrl || !bones || !appRef.current) return
    let cancelled = false

    async function setup() {
      const app = appRef.current

      // Cleanup previous rig
      if (stateRef.current) {
        app.stage.removeChild(stateRef.current.container)
        stateRef.current.container.destroy({ children: true })
        app.ticker.remove(stateRef.current.tickerFn)
        stateRef.current = null
      }
      startTimeRef.current = null
      pauseTimeRef.current = 0

      try {
        // 1. Load image. If this is already the backend's rembg cutout it's
        // clean — skip the crude client-side flood-fill removal. Otherwise
        // (backend unavailable / fallback path) clean it the old way.
        const imgEl = await loadImage(imageUrl)
        if (cancelled) return
        const bgCanvas = usingBackendCutout ? imgEl : removeBackground(imgEl)

        // 2. PIXI texture from cleaned canvas
        const texture = PIXI.Texture.from(bgCanvas)
        if (cancelled) return

        const imgW = imgEl.naturalWidth
        const imgH = imgEl.naturalHeight

        // 3. Fit into canvas with padding
        const padding  = 40
        const scale    = Math.min((CANVAS_W - padding * 2) / imgW, (CANVAS_H - padding * 2) / imgH)
        const dispW    = imgW * scale
        const dispH    = imgH * scale
        const offsetX  = (CANVAS_W - dispW) / 2
        const offsetY  = (CANVAS_H - dispH) / 2

        // 4. Scale the pre-built bones into display space
        const scaledBones = scaleBonesToDisplay(bones, scale, offsetX, offsetY)

        // 5. Build mesh + skinning (no deformWeight — every pixel follows its bone 100%)
        const grid = buildMeshGrid(dispW, dispH, 18, 24)
        const shiftedRestPoints = grid.restPoints.map(p => ({ x: p.x + offsetX, y: p.y + offsetY }))
        const shiftedPositions  = new Float32Array(grid.positions)
        for (let i = 0; i < shiftedPositions.length; i += 2) {
          shiftedPositions[i]     += offsetX
          shiftedPositions[i + 1] += offsetY
        }
        const skinning  = computeSkinning(shiftedRestPoints, scaledBones)
        const charScale = getCharacterScale(scaledBones)

        // 6. PIXI mesh
        const geometry = new PIXI.MeshGeometry(shiftedPositions, grid.uvs, grid.indices)
        const mat      = new PIXI.MeshMaterial(texture)
        const mesh     = new PIXI.Mesh(geometry, mat)

        // 7. Skeleton overlay graphics
        const skelGfx = new PIXI.Graphics()

        const cont = new PIXI.Container()
        cont.addChild(mesh)
        cont.addChild(skelGfx)
        app.stage.addChild(cont)

        const animPositions = new Float32Array(shiftedPositions)

        function drawSkeleton(gfx, worldBones) {
          gfx.clear()
          for (const wb of Object.values(worldBones)) {
            gfx.lineStyle(3, BONE_COLOR, 0.68)
            gfx.moveTo(wb.start.x, wb.start.y)
            gfx.lineTo(wb.end.x,   wb.end.y)
          }
          const seen = new Set()
          for (const wb of Object.values(worldBones)) {
            for (const pt of [wb.start, wb.end]) {
              const key = `${Math.round(pt.x)},${Math.round(pt.y)}`
              if (seen.has(key)) continue
              seen.add(key)
              gfx.lineStyle(1.5, 0xffffff, 0.4)
              gfx.beginFill(JOINT_COLOR, 0.95)
              gfx.drawCircle(pt.x, pt.y, 5)
              gfx.endFill()
            }
          }
        }

        // Draw rest-pose skeleton immediately
        const REST_POSE = { bones: {}, root: { dx: 0, dy: 0 } }
        const restWorldBones = computeWorldBones(scaledBones, REST_POSE)
        drawSkeleton(skelGfx, restWorldBones)
        let lastWorldBones = restWorldBones

        // 8. Ticker
        function tick() {
          const now = performance.now()

          if (playingRef.current) {
            if (startTimeRef.current === null) {
              startTimeRef.current = now - pauseTimeRef.current
            }
            const elapsed = now - startTimeRef.current
            const anim    = animRef.current
            const t       = (elapsed % anim.loopMs) / anim.loopMs
            const pose    = anim.evaluate(t, { scale: charScale })
            lastWorldBones = computeWorldBones(scaledBones, pose)

            deformMesh(skinning, lastWorldBones, animPositions)
            const buf = mesh.geometry.getBuffer('aVertexPosition')
            buf.data.set(animPositions)
            buf.update()
          } else {
            startTimeRef.current = null
          }

          drawSkeleton(skelGfx, lastWorldBones)
        }

        stateRef.current = { container: cont, tickerFn: tick }
        app.ticker.add(tick)
      } catch (err) {
        console.error('AnimationCanvas setup error:', err)
      }
    }

    setup()
    return () => { cancelled = true }
  }, [imageUrl, bones, usingBackendCutout]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Pause/resume ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isPlaying && startTimeRef.current !== null) {
      pauseTimeRef.current = performance.now() - startTimeRef.current
      startTimeRef.current = null
    }
  }, [isPlaying])

  return (
    <div className="flex flex-col items-center gap-4 w-full max-w-2xl">
      <div
        ref={mountRef}
        className="rounded-2xl overflow-hidden border border-ink-600"
        style={{ width: CANVAS_W, height: CANVAS_H, maxWidth: '100%', aspectRatio: '1/1' }}
      />
      <p className="text-xs text-mist-500 font-mono">
        {animation?.label} · {animation?.loopMs}ms loop
      </p>
    </div>
  )
}

function scaleBonesToDisplay(bones, scale, offsetX, offsetY) {
  const scaled = {}
  for (const [name, bone] of Object.entries(bones)) {
    scaled[name] = {
      ...bone,
      restStart: { x: bone.restStart.x * scale + offsetX, y: bone.restStart.y * scale + offsetY },
      restEnd:   { x: bone.restEnd.x   * scale + offsetX, y: bone.restEnd.y   * scale + offsetY },
      length: bone.length * scale,
    }
  }
  return scaled
}

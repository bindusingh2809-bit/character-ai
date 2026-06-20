import React, { useState, useCallback } from 'react'
import UploadZone from './components/UploadZone.jsx'
import AnimationPicker from './components/AnimationPicker.jsx'
import AnimationCanvas from './components/AnimationCanvas.jsx'
import JointEditor from './components/JointEditor.jsx'
import ExportBar from './components/ExportBar.jsx'
import { ANIMATION_LIST } from './animations.js'

// mode: 'upload' → 'setup' → 'animate'
export default function App() {
  const [mode, setMode]           = useState('upload')
  const [imageUrl, setImageUrl]   = useState(null)
  const [uploadFile, setUploadFile] = useState(null)
  const [rigBones, setRigBones]   = useState(null)  // built + user-confirmed bones
  const [activeAnim, setActiveAnim] = useState(ANIMATION_LIST[0])
  const [poseSource, setPoseSource] = useState(null)
  const [isPlaying, setIsPlaying] = useState(true)
  const [pixiApp, setPixiApp]     = useState(null)
  const [projectId, setProjectId] = useState(null)
  const [cutoutImageUrl, setCutoutImageUrl] = useState(null)

  const handleUpload = useCallback((file, url) => {
    setImageUrl(url)
    setUploadFile(file)
    setRigBones(null)
    setPoseSource(null)
    setProjectId(null)
    setCutoutImageUrl(null)
    setIsPlaying(true)
    setMode('setup')
  }, [])

  const handleBackendReady = useCallback((id, cutoutUrl) => {
    setProjectId(id)
    setCutoutImageUrl(cutoutUrl)
  }, [])

  const handleJointConfirm = useCallback((bones) => {
    setRigBones(bones)
    setMode('animate')
  }, [])

  const handleBackToSetup = useCallback(() => {
    setMode('setup')
    setPixiApp(null)
  }, [])

  const handleReset = useCallback(() => {
    setImageUrl(null)
    setUploadFile(null)
    setRigBones(null)
    setPoseSource(null)
    setProjectId(null)
    setCutoutImageUrl(null)
    setPixiApp(null)
    setMode('upload')
  }, [])

  return (
    <div className="min-h-screen bg-ink-900 font-sans flex flex-col">
      {/* Header */}
      <header className="border-b border-ink-600 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-signal-violet flex items-center justify-center">
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
              <circle cx="9" cy="5" r="2.5" fill="white" />
              <rect x="7.5" y="7.5" width="3" height="5" rx="1" fill="white" />
              <line x1="7.5" y1="9" x2="4" y2="11" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
              <line x1="10.5" y1="9" x2="14" y2="11" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
              <line x1="9" y1="12.5" x2="7" y2="16" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
              <line x1="9" y1="12.5" x2="11" y2="16" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </div>
          <span className="font-display font-700 text-lg text-mist-100 tracking-tight">Rigit</span>
          <span className="text-xs text-mist-500 font-mono bg-ink-700 px-2 py-0.5 rounded">beta</span>
        </div>
        <p className="text-sm text-mist-500 hidden sm:block">Animate any 2D character — no rigging required</p>
      </header>

      <div className="flex flex-col lg:flex-row flex-1 overflow-hidden">
        {/* Left Panel */}
        <aside className="w-full lg:w-72 border-b lg:border-b-0 lg:border-r border-ink-600 flex flex-col">
          <div className="p-5 flex-1 overflow-y-auto space-y-6">

            {/* Character thumbnail */}
            <section>
              <SectionLabel>Character</SectionLabel>
              {imageUrl ? (
                <div className="relative group mt-2">
                  <div className="canvas-checker rounded-xl overflow-hidden border border-ink-600">
                    <img src={imageUrl} alt="character" className="w-full h-36 object-contain" />
                  </div>
                  {poseSource && (
                    <div className={`absolute top-2 left-2 text-[10px] font-mono px-2 py-1 rounded-full ${
                      poseSource === 'detected'
                        ? 'bg-signal-teal/20 text-signal-teal border border-signal-teal/30'
                        : 'bg-signal-amber/20 text-signal-amber border border-signal-amber/30'
                    }`}>
                      {poseSource === 'detected' ? '✓ Pose detected' : '⬡ Proportions estimated'}
                    </div>
                  )}
                  <button
                    onClick={handleReset}
                    className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity bg-ink-800/90 hover:bg-ink-700 border border-ink-500 rounded-lg p-1.5 focus-ring"
                    title="Remove character"
                  >
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                      <path d="M2 2l8 8M10 2l-8 8" stroke="#8a92a6" strokeWidth="1.5" strokeLinecap="round" />
                    </svg>
                  </button>
                </div>
              ) : (
                <div className="mt-2"><UploadZone onUpload={handleUpload} /></div>
              )}
            </section>

            {/* Step indicator */}
            {imageUrl && (
              <section>
                <SectionLabel>Workflow</SectionLabel>
                <div className="mt-2 flex flex-col gap-1.5">
                  <StepBadge step={1} label="Setup joints" active={mode === 'setup'} done={mode === 'animate'} />
                  <StepBadge step={2} label="Animate"      active={mode === 'animate'} done={false} />
                </div>
                {mode === 'animate' && (
                  <button
                    onClick={handleBackToSetup}
                    className="mt-3 w-full text-xs text-mist-400 hover:text-mist-200 border border-ink-600 hover:border-ink-400 rounded-lg py-2 transition-colors font-mono"
                  >
                    ← Back to joint setup
                  </button>
                )}
              </section>
            )}

            {/* Animation picker — only during animate mode */}
            {mode === 'animate' && (
              <section>
                <SectionLabel>Animation</SectionLabel>
                <div className="mt-2">
                  <AnimationPicker
                    animations={ANIMATION_LIST}
                    active={activeAnim}
                    onSelect={setActiveAnim}
                  />
                </div>
              </section>
            )}

            {/* Playback controls */}
            {mode === 'animate' && (
              <section>
                <SectionLabel>Playback</SectionLabel>
                <div className="mt-2 flex gap-2">
                  <button
                    onClick={() => setIsPlaying(p => !p)}
                    className="flex-1 flex items-center justify-center gap-2 bg-ink-700 hover:bg-ink-600 border border-ink-500 text-mist-300 text-sm font-medium rounded-lg py-2.5 transition-colors focus-ring"
                  >
                    {isPlaying ? (
                      <>
                        <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
                          <rect x="1" y="1" width="4" height="10" rx="1" />
                          <rect x="7" y="1" width="4" height="10" rx="1" />
                        </svg>
                        Pause
                      </>
                    ) : (
                      <>
                        <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
                          <path d="M2 1l9 5-9 5V1z" />
                        </svg>
                        Play
                      </>
                    )}
                  </button>
                </div>
              </section>
            )}
          </div>

          {/* Export — pinned to sidebar bottom */}
          {mode === 'animate' && pixiApp && (
            <div className="border-t border-ink-600 p-4">
              <ExportBar pixiApp={pixiApp} activeAnim={activeAnim} projectId={projectId} />
            </div>
          )}
        </aside>

        {/* Main area */}
        <main className="flex-1 flex flex-col items-center justify-center p-6 bg-ink-950">
          {mode === 'upload' && <EmptyState />}

          {mode === 'setup' && imageUrl && (
            <JointEditor
              imageUrl={imageUrl}
              file={uploadFile}
              onConfirm={handleJointConfirm}
              onPoseSource={setPoseSource}
              onBackendReady={handleBackendReady}
            />
          )}

          {mode === 'animate' && imageUrl && rigBones && (
            <AnimationCanvas
              imageUrl={cutoutImageUrl || imageUrl}
              usingBackendCutout={!!cutoutImageUrl}
              bones={rigBones}
              animation={activeAnim}
              isPlaying={isPlaying}
              onPixiApp={setPixiApp}
            />
          )}
        </main>
      </div>
    </div>
  )
}

function SectionLabel({ children }) {
  return <p className="text-[11px] font-mono font-500 text-mist-500 uppercase tracking-widest">{children}</p>
}

function StepBadge({ step, label, active, done }) {
  return (
    <div className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-xs font-mono transition-colors ${
      active ? 'bg-signal-violet/15 border border-signal-violet/40 text-mist-200' :
      done   ? 'bg-ink-700 border border-ink-600 text-mist-500' :
               'bg-ink-800 border border-ink-700 text-mist-600'
    }`}>
      <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold flex-shrink-0 ${
        active ? 'bg-signal-violet text-white' :
        done   ? 'bg-signal-teal text-ink-900' :
                 'bg-ink-600 text-mist-500'
      }`}>
        {done ? '✓' : step}
      </span>
      {label}
    </div>
  )
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center gap-4 text-center max-w-xs">
      <div className="w-20 h-20 rounded-2xl border-2 border-dashed border-ink-500 flex items-center justify-center">
        <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
          <circle cx="16" cy="9" r="4" stroke="#3a4257" strokeWidth="2" />
          <rect x="13" y="14" width="6" height="9" rx="2" stroke="#3a4257" strokeWidth="2" />
          <path d="M13 17L8 20M19 17L24 20" stroke="#3a4257" strokeWidth="2" strokeLinecap="round" />
          <path d="M16 23L13 29M16 23L19 29" stroke="#3a4257" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </div>
      <div>
        <p className="text-mist-300 font-medium">No character loaded</p>
        <p className="text-mist-500 text-sm mt-1">Upload a 2D character image to get started. PNG with transparent background works best.</p>
      </div>
    </div>
  )
}

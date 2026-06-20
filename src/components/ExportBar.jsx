import React, { useState, useCallback } from 'react'
import { exportUrl } from '../api.js'

const FPS = 24

export default function ExportBar({ pixiApp, activeAnim, projectId }) {
  const [exporting, setExporting] = useState(null) // null | 'webm'
  const [progress, setProgress] = useState(0)

  const exportWebM = useCallback(async () => {
    if (exporting) return

    const canvas = pixiApp?.view
    if (!canvas) return

    // Check MediaRecorder support
    if (!window.MediaRecorder || !MediaRecorder.isTypeSupported('video/webm')) {
      alert('WebM export is not supported in your browser. Try Chrome or Edge.')
      return
    }

    setExporting('webm')
    setProgress(0)

    try {
      const stream = canvas.captureStream(FPS)
      const recorder = new MediaRecorder(stream, { mimeType: 'video/webm; codecs=vp9' })
      const chunks = []

      recorder.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data) }
      recorder.onstop = () => {
        const blob = new Blob(chunks, { type: 'video/webm' })
        download(blob, `rigit-${activeAnim?.id ?? 'anim'}.webm`, 'video/webm')
        setExporting(null)
        setProgress(0)
      }

      const loopMs = activeAnim?.loopMs ?? 1000
      const captureDuration = Math.max(loopMs * 3, 3000) // capture at least 3 loops

      recorder.start()

      let elapsed = 0
      const interval = 200
      const timer = setInterval(() => {
        elapsed += interval
        setProgress(Math.min(95, Math.round((elapsed / captureDuration) * 100)))
        if (elapsed >= captureDuration) {
          clearInterval(timer)
          recorder.stop()
          setProgress(100)
        }
      }, interval)
    } catch (err) {
      console.error('WebM export failed:', err)
      setExporting(null)
      setProgress(0)
    }
  }, [exporting, pixiApp, activeAnim])

  return (
    <div className="flex flex-col gap-2">
      <p className="text-[11px] font-mono text-mist-500 uppercase tracking-widest">Export</p>
      {exporting ? (
        <div className="space-y-1.5">
          <div className="h-1.5 rounded-full bg-ink-600 overflow-hidden">
            <div
              className="h-full bg-signal-violet transition-all duration-200 rounded-full"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="text-xs text-mist-500 font-mono text-center">
            {progress < 100 ? `Exporting ${exporting.toUpperCase()}… ${progress}%` : 'Done!'}
          </p>
        </div>
      ) : (
        <div className="flex gap-2">
          <ExportButton label="WebM" icon="🎬" onClick={exportWebM} disabled={!!exporting} />
          {projectId && (
            <ExportButton
              label="Project"
              icon="📦"
              onClick={() => window.open(exportUrl(projectId), '_blank')}
              disabled={!!exporting}
            />
          )}
        </div>
      )}
    </div>
  )
}

function ExportButton({ label, icon, onClick, disabled }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-ink-700 hover:bg-ink-600 border border-ink-500 disabled:opacity-40 disabled:cursor-not-allowed text-sm text-mist-300 font-medium transition-colors focus-ring"
    >
      <span className="text-base leading-none">{icon}</span>
      {label}
    </button>
  )
}

function download(blob, filename, type) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

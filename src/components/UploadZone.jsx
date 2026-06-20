import React, { useCallback, useRef, useState } from 'react'

const ACCEPTED = ['image/png', 'image/jpeg', 'image/webp']

export default function UploadZone({ onUpload }) {
  const inputRef = useRef(null)
  const [dragging, setDragging] = useState(false)
  const [error, setError] = useState(null)

  const process = useCallback((file) => {
    setError(null)
    if (!file) return
    if (!ACCEPTED.includes(file.type)) {
      setError('PNG, JPG, or WebP only')
      return
    }
    if (file.size > 10 * 1024 * 1024) {
      setError('File too large (max 10 MB)')
      return
    }
    const reader = new FileReader()
    reader.onload = (e) => onUpload(file, e.target.result)
    reader.readAsDataURL(file)
  }, [onUpload])

  const onDrop = useCallback((e) => {
    e.preventDefault()
    setDragging(false)
    process(e.dataTransfer.files[0])
  }, [process])

  const onDragOver = useCallback((e) => {
    e.preventDefault()
    setDragging(true)
  }, [])

  const onDragLeave = useCallback(() => setDragging(false), [])

  const onFileChange = useCallback((e) => {
    process(e.target.files[0])
    e.target.value = ''
  }, [process])

  return (
    <div>
      <button
        onClick={() => inputRef.current?.click()}
        onDrop={onDrop}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        className={`w-full rounded-xl border-2 border-dashed transition-all duration-150 p-6 flex flex-col items-center gap-3 cursor-pointer focus-ring ${
          dragging
            ? 'border-signal-violet bg-signal-violet/10'
            : 'border-ink-500 hover:border-ink-400 hover:bg-ink-800/40 bg-ink-800/20'
        }`}
      >
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center transition-colors ${
          dragging ? 'bg-signal-violet/30' : 'bg-ink-700'
        }`}>
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <path d="M10 3v10M6 7l4-4 4 4" stroke={dragging ? '#7c5cff' : '#8a92a6'} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M3 14v1a2 2 0 002 2h10a2 2 0 002-2v-1" stroke={dragging ? '#7c5cff' : '#8a92a6'} strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </div>
        <div className="text-center">
          <p className="text-sm font-medium text-mist-300">
            {dragging ? 'Drop to upload' : 'Upload character'}
          </p>
          <p className="text-xs text-mist-500 mt-0.5">PNG · JPG · WebP — drag or click</p>
        </div>
      </button>
      {error && (
        <p className="mt-2 text-xs text-signal-rose font-mono">{error}</p>
      )}
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED.join(',')}
        onChange={onFileChange}
        className="hidden"
      />
    </div>
  )
}

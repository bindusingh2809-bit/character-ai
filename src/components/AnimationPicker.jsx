import React from 'react'

const ICONS = {
  walk: (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <circle cx="9" cy="3" r="1.5" fill="currentColor" />
      <path d="M9 5v4M7 7l-2 3M11 7l2 3M7 9l-1 5M11 9l1 5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  ),
  run: (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <circle cx="10" cy="3" r="1.5" fill="currentColor" />
      <path d="M10 5l-1 3M9 8L6 10M9 8l3 2M7 14l1-4M13 10l-1 4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  ),
  jump: (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <circle cx="9" cy="3" r="1.5" fill="currentColor" />
      <path d="M9 5v3M6 6l-1 2M12 6l1 2M7 8l-2 5M11 8l2 5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      <path d="M5 16h8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeDasharray="2 1.5" />
    </svg>
  ),
  wave: (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <circle cx="9" cy="3.5" r="1.5" fill="currentColor" />
      <path d="M9 5.5v4M7 8L5 7M9 9l2.5-2.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      <path d="M7 9.5l-1 5M11 9.5l1 5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  ),
  dance: (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <circle cx="9" cy="3" r="1.5" fill="currentColor" />
      <path d="M9 5l1 4M10 9l3 2M10 9l-1 5M8 7L5 9M8 9l2 5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  ),
}

export default function AnimationPicker({ animations, active, onSelect }) {
  return (
    <div className="flex flex-col gap-1.5">
      {animations.map((anim) => {
        const isActive = active?.id === anim.id
        return (
          <button
            key={anim.id}
            onClick={() => onSelect(anim)}
            className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-all focus-ring ${
              isActive
                ? 'bg-signal-violet/20 border border-signal-violet/50 text-mist-100 shadow-glow'
                : 'border border-transparent text-mist-500 hover:text-mist-300 hover:bg-ink-700'
            }`}
          >
            <span className={isActive ? 'text-signal-violet' : 'text-mist-500'}>
              {ICONS[anim.id] ?? null}
            </span>
            <div className="min-w-0">
              <p className="text-sm font-medium leading-none">{anim.label}</p>
              <p className="text-xs mt-0.5 truncate opacity-70">{anim.description}</p>
            </div>
            {isActive && (
              <div className="ml-auto w-1.5 h-1.5 rounded-full bg-signal-violet animate-pulseDot flex-shrink-0" />
            )}
          </button>
        )
      })}
    </div>
  )
}

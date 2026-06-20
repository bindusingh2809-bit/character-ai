/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        ink: {
          950: '#0a0d12',
          900: '#0b0e14',
          800: '#12161f',
          700: '#1a1f2b',
          600: '#252b3a',
          500: '#3a4257',
        },
        mist: {
          500: '#8a92a6',
          300: '#b7bdcc',
          100: '#e7e9ee',
        },
        signal: {
          violet: '#7c5cff',
          violetDim: '#5a3fd9',
          teal: '#36e2c4',
          amber: '#ffb454',
          rose: '#ff6b8b',
        },
      },
      fontFamily: {
        display: ['"Space Grotesk"', 'sans-serif'],
        sans: ['"Inter"', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'monospace'],
      },
      boxShadow: {
        glow: '0 0 0 1px rgba(124,92,255,0.25), 0 0 24px rgba(124,92,255,0.18)',
        tealGlow: '0 0 0 1px rgba(54,226,196,0.3), 0 0 18px rgba(54,226,196,0.25)',
      },
      keyframes: {
        scan: {
          '0%': { transform: 'translateY(-100%)' },
          '100%': { transform: 'translateY(100%)' },
        },
        pulseDot: {
          '0%, 100%': { opacity: 1, transform: 'scale(1)' },
          '50%': { opacity: 0.5, transform: 'scale(0.85)' },
        },
      },
      animation: {
        scan: 'scan 2.2s linear infinite',
        pulseDot: 'pulseDot 1.6s ease-in-out infinite',
      },
    },
  },
  plugins: [],
}

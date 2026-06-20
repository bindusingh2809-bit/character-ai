import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Everything in this app runs entirely in the browser — pose detection,
// rigging, rendering, and export all happen client-side. No backend.
export default defineConfig({
  plugins: [react()],
  server: {
    allowedHosts: true,
  },
  optimizeDeps: {
    include: ['long', 'seedrandom', 'regenerator-runtime'],
    exclude: ['@tensorflow/tfjs-backend-webgl'],
  },
  build: {
    rollupOptions: {
      external: ['@mediapipe/pose', '@mediapipe/hands', '@mediapipe/selfie_segmentation'],
    },
  },
})

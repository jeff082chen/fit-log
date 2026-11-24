import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// GitHub Pages 網址為 https://jeff082chen.github.io/fit-log/
export default defineConfig({
  base: '/fit-log/',
  plugins: [react()],
  build: { chunkSizeWarningLimit: 1200 },
})

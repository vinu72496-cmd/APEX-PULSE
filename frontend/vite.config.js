import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: '0.0.0.0',
    allowedHosts: true,
    proxy: {
      '/ws': {
        target: 'ws://127.0.0.1:8000',
        ws: true,
        changeOrigin: true,
      },
      '/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
      '/laps': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
      '/kaggle-overtakes': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
      '/latest': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
    },
  },
  resolve: {
    preserveSymlinks: true,
  },
})


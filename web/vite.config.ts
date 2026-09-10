import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': { target: 'https://cnb.992498.xyz/', changeOrigin: true },
      '/ws':  { target: 'wss://cnb.992498.xyz/',  changeOrigin: true, ws: true },
    },
  },
})

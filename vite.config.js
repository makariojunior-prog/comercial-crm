import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  // GitHub Pages serves this app under /comercial-crm/; Vercel serves it at
  // the domain root, so the base path must differ per platform.
  base: process.env.VERCEL ? '/' : '/comercial-crm/',
})

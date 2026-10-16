import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // GitHub Pages serves this app under /comercial-crm/; Vercel serves it at
  // the domain root, so the base path must differ per platform.
  base: process.env.VERCEL ? '/' : '/comercial-crm/',
  build: {
    rollupOptions: {
      output: {
        // Bibliotecas mudam pouco: em chunks próprios continuam no cache (immutable, ver
        // vercel.json) quando só o código do app muda a cada deploy.
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
          supabase: ['@supabase/supabase-js', '@supabase/ssr'],
        },
      },
    },
  },
})

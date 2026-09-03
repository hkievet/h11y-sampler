import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// Static build; `base` is relative so the same bundle works on GitHub Pages
// under a repo path and on Cloudflare Pages at the root.
export default defineConfig({
  plugins: [react()],
  base: './',
  test: {
    include: ['src/**/*.test.ts'],
  },
})

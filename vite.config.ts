import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { execSync } from 'node:child_process'

const build = (() => {
  try { return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim() } catch { return 'dev' }
})()

// Static build; `base` is relative so the same bundle works on GitHub Pages
// under a repo path and on Cloudflare Pages at the root.
export default defineConfig({
  plugins: [react()],
  base: './',
  define: { __BUILD__: JSON.stringify(build) },
  test: {
    include: ['src/**/*.test.ts'],
  },
})

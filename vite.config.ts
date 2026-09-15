import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  // GitHub Pages serves this app from a repo subpath (https://<user>.github.io/<repo>/), not the
  // domain root, and there's no client-side router here relying on absolute paths, so a relative
  // base keeps every built asset URL working from whatever subpath it's served under.
  base: './',
  plugins: [react(), tailwindcss()],
})

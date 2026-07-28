import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  // GitHub Pages serves a project site from https://<user>.github.io/<repo>/,
  // so every asset URL needs that repo name prefixed. If the repo is ever
  // renamed, this string has to change with it.
  base: '/renshuu-dashboard/',
  plugins: [react(), tailwindcss()],
})

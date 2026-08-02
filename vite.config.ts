import { fileURLToPath } from 'node:url'

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
  build: {
    rollupOptions: {
      // Two pages, two entries. A client-side router would be the alternative,
      // but with exactly two independent pages it would add a dependency and
      // pull the kanji wall's data into the dashboard's bundle for no gain.
      input: {
        main: fileURLToPath(new URL('./index.html', import.meta.url)),
        kanji: fileURLToPath(new URL('./kanji.html', import.meta.url)),
      },
    },
  },
})

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
      // One entry per page. A client-side router would be the alternative, but
      // the pages share no state, and separate entries keep each page's code
      // and data out of the others' bundles.
      input: {
        main: fileURLToPath(new URL('./index.html', import.meta.url)),
        kanji: fileURLToPath(new URL('./kanji.html', import.meta.url)),
        worksheet: fileURLToPath(new URL('./worksheet.html', import.meta.url)),
        kanjiPath: fileURLToPath(new URL('./kanji-path.html', import.meta.url)),
      },
    },
  },
})

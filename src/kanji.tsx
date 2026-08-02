/**
 * Entry point for the kanji wall page.
 *
 * A second Vite entry rather than a client-side router: there are exactly two
 * pages, they share no state, and the wall's data should not be pulled into the
 * dashboard's bundle. Vite builds `kanji.html` alongside `index.html`, and
 * GitHub Pages serves it as a plain file.
 */

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { KanjiPage } from './components/KanjiPage.tsx'
import './index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <KanjiPage />
  </StrictMode>,
)

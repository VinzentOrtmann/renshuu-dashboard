/**
 * Entry point for the Kanji path page. Only mounts React; the page lives in
 * components/kanjiPath/KanjiPathPage.tsx so fast refresh keeps working in development.
 */

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { KanjiPathPage } from './components/kanjiPath/KanjiPathPage.tsx'
import './index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <KanjiPathPage />
  </StrictMode>,
)

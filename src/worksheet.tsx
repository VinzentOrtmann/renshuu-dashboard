/**
 * Entry point for the worksheet page. Only mounts React; the page lives in
 * components/WorksheetPage.tsx so fast refresh keeps working in development.
 */

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { WorksheetPage } from './components/WorksheetPage.tsx'
import './index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <WorksheetPage />
  </StrictMode>,
)

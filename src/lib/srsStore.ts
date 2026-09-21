/**
 * Saving Kanji path progress in this browser, with file backup.
 *
 * Progress lives in localStorage: nothing to set up, but it's tied to this
 * browser on this computer, and clearing site data erases it. Export and import
 * exist for exactly that reason — a JSON file you can keep, and restore from.
 */

import { INITIAL_STATE } from './srs.ts'
import type { SrsState } from './srs.ts'

const STORAGE_KEY = 'kanji-path-progress'

/** Whether a value has the shape of saved progress. */
function isState(value: unknown): value is SrsState {
  const v = value as SrsState
  return (
    typeof v === 'object' &&
    v !== null &&
    v.version === 1 &&
    typeof v.level === 'number' &&
    typeof v.progress === 'object' &&
    v.progress !== null
  )
}

/**
 * Saved progress, or a fresh start.
 *
 * Storage can throw — private windows, blocked site data — and a corrupt entry
 * shouldn't wedge the page, so any failure falls back to a fresh start. The
 * caller can tell the two apart, and warns before anything overwrites a save
 * that exists but couldn't be read.
 */
export function loadProgress(): { state: SrsState; unreadable: boolean } {
  let raw: string | null = null
  try {
    raw = localStorage.getItem(STORAGE_KEY)
  } catch {
    return { state: INITIAL_STATE, unreadable: false }
  }
  if (raw === null) return { state: INITIAL_STATE, unreadable: false }
  try {
    const parsed: unknown = JSON.parse(raw)
    return isState(parsed)
      ? { state: parsed, unreadable: false }
      : { state: INITIAL_STATE, unreadable: true }
  } catch {
    return { state: INITIAL_STATE, unreadable: true }
  }
}

/** Saves progress. Returns false if the browser refused. */
export function saveProgress(state: SrsState): boolean {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
    return true
  } catch {
    return false
  }
}

/** Downloads progress as a dated JSON file. */
export function exportProgress(state: SrsState): void {
  const blob = new Blob([JSON.stringify(state, null, 2)], {
    type: 'application/json',
  })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `kanji-path-${new Date().toISOString().slice(0, 10)}.json`
  link.click()
  URL.revokeObjectURL(url)
}

/** Reads a backup file. Rejects anything that isn't saved progress. */
export async function importProgress(file: File): Promise<SrsState> {
  const parsed: unknown = JSON.parse(await file.text())
  if (!isState(parsed)) {
    throw new Error("That file isn't a Kanji path backup.")
  }
  return parsed
}

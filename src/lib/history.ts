/**
 * Loading and reading the archive.
 *
 * The dashboard has no backend: it fetches the same `data/history.json` that
 * the daily GitHub Action commits, straight off GitHub Pages.
 */

import { useEffect, useState } from 'react'

import type { DailySnapshot, History } from '../types/history.ts'

/**
 * Where the archive is served from.
 *
 * `import.meta.env.BASE_URL` is Vite's build-time value for the `base` option —
 * `/renshuu-dashboard/` in production, `/` during local development. Hardcoding
 * either one would break the other, which is a genuinely confusing 404 to debug.
 */
const HISTORY_URL = `${import.meta.env.BASE_URL}data/history.json`

/** Fetches and lightly validates the archive. */
export async function loadHistory(): Promise<History> {
  // `no-cache` asks the browser to revalidate rather than serve a stale copy.
  // It matters here: the file changes daily but sits at a fixed URL, so without
  // this a visitor could see yesterday's dashboard from cache.
  const response = await fetch(HISTORY_URL, { cache: 'no-cache' })

  if (!response.ok) {
    throw new Error(
      `Could not load the study archive (HTTP ${response.status}). ` +
        `Expected it at ${HISTORY_URL}.`,
    )
  }

  const data = (await response.json()) as History

  if (!Array.isArray(data?.snapshots)) {
    throw new Error('The archive loaded but has no "snapshots" array.')
  }

  return data
}

/** What {@link useHistory} is currently doing. */
export type HistoryState =
  | { status: 'loading' }
  | { status: 'error'; error: Error }
  | { status: 'ready'; snapshots: DailySnapshot[] }

/**
 * React hook that loads the archive once when the dashboard mounts.
 *
 * Returns a single state value rather than separate `data`/`loading`/`error`
 * variables, because those can contradict each other (loading *and* an error?)
 * whereas this can only ever be in one state at a time.
 */
export function useHistory(): HistoryState {
  const [state, setState] = useState<HistoryState>({ status: 'loading' })

  useEffect(() => {
    // React can unmount a component before a fetch finishes; setting state
    // afterwards would be a memory leak and a React warning.
    let cancelled = false

    loadHistory()
      .then((history) => {
        if (cancelled) return
        // Sort defensively. The snapshot script already writes them in order,
        // but a hand-edited file shouldn't be able to scramble a chart's x-axis.
        const snapshots = [...history.snapshots].sort((a, b) =>
          a.date.localeCompare(b.date),
        )
        setState({ status: 'ready', snapshots })
      })
      .catch((error: unknown) => {
        if (cancelled) return
        setState({
          status: 'error',
          error: error instanceof Error ? error : new Error(String(error)),
        })
      })

    return () => {
      cancelled = true
    }
  }, [])

  return state
}

/**
 * Formats a YYYY-MM-DD date for display, e.g. "29 Jul".
 *
 * The `T00:00:00` suffix forces the string to be read as *local* time. Without
 * it, `new Date('2026-07-29')` is parsed as UTC midnight, which in any timezone
 * behind UTC renders as the 28th — an off-by-one-day bug that only shows up for
 * some readers.
 */
export function formatShortDate(date: string): string {
  return new Date(`${date}T00:00:00`).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
  })
}

/** Formats a YYYY-MM-DD date in full, e.g. "Wednesday, 29 July 2026". */
export function formatLongDate(date: string): string {
  return new Date(`${date}T00:00:00`).toLocaleDateString(undefined, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

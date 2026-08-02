/**
 * Loading and grouping the kanji collection.
 *
 * Mirrors src/lib/history.ts, but this file is fetched only when the wall is
 * opened — it's roughly 67 KB against the archive's few KB, and most visits to
 * the dashboard never need it.
 */

import { useEffect, useState } from 'react'

import type { KanjiCollection, KanjiEntry } from '../types/kanji.ts'

const KANJI_URL = `${import.meta.env.BASE_URL}data/kanji.json`

/** JLPT levels in the order the wall presents them: hardest first. */
export const JLPT_LEVELS = ['N1', 'N2', 'N3', 'N4', 'N5'] as const

/**
 * Mastery bands.
 *
 * `unstudied` is deliberately its own band rather than "mastery 0". A kanji you
 * have never been shown and one you keep getting wrong are different situations,
 * and the wall would be misleading if it painted them the same.
 */
export const MASTERY_BANDS = [
  { id: 'unstudied', label: 'Not studied', level: 0 },
  { id: 'weak', label: 'Under 25%', level: 1 },
  { id: 'fair', label: '25–49%', level: 2 },
  { id: 'good', label: '50–74%', level: 3 },
  { id: 'strong', label: '75%+', level: 4 },
] as const

export type MasteryBandId = (typeof MASTERY_BANDS)[number]['id']

/** Which band a kanji falls into. */
export function masteryBand(entry: KanjiEntry): MasteryBandId {
  if (entry.mastery === undefined) return 'unstudied'
  if (entry.mastery < 25) return 'weak'
  if (entry.mastery < 50) return 'fair'
  if (entry.mastery < 75) return 'good'
  return 'strong'
}

/** Ramp step for a band, matching the activity heatmap's scale. */
export function bandLevel(band: MasteryBandId): number {
  return MASTERY_BANDS.find((b) => b.id === band)?.level ?? 0
}

export type KanjiState =
  | { status: 'loading' }
  | { status: 'error'; error: Error }
  | { status: 'ready'; collection: KanjiCollection }

/** Loads the collection once when the wall mounts. */
export function useKanji(): KanjiState {
  const [state, setState] = useState<KanjiState>({ status: 'loading' })

  useEffect(() => {
    let cancelled = false

    fetch(KANJI_URL, { cache: 'no-cache' })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(
            `Could not load the kanji collection (HTTP ${response.status}). ` +
              `Expected it at ${KANJI_URL}.`,
          )
        }
        return (await response.json()) as KanjiCollection
      })
      .then((collection) => {
        if (cancelled) return
        if (!Array.isArray(collection?.kanji)) {
          throw new Error('The collection loaded but has no "kanji" array.')
        }
        setState({ status: 'ready', collection })
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

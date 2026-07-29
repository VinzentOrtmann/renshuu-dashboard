/**
 * JLPT level helpers, shared by the dashboard and the badge generator.
 *
 * Kept free of React and of anything browser-only, because scripts/badge.ts
 * runs this under Node with no DOM.
 */

import type { SeriesCategory } from './palette.ts'
import type { DailySnapshot } from '../types/history.ts'

/**
 * JLPT levels from easiest to hardest.
 *
 * renshuu also reports `n6`, `kana` and `kata` for vocabulary. Those are its
 * own below-N5 groupings rather than real JLPT levels, so they're left out of
 * the "next level" search — otherwise the headline could read "next: kana" for
 * someone who finished the syllabaries years ago.
 */
export const LEVELS_EASIEST_FIRST = ['n5', 'n4', 'n3', 'n2', 'n1'] as const

export type Level = (typeof LEVELS_EASIEST_FIRST)[number]

/** The level a category is working through: the easiest one not yet at 100%. */
export function nextLevel(
  snapshot: DailySnapshot,
  category: SeriesCategory,
): Level | null {
  const progress = snapshot.jlptProgress[category] ?? {}
  return (
    LEVELS_EASIEST_FIRST.find((level) => (progress[level] ?? 0) < 100) ?? null
  )
}

/** Percentage complete for one category/level pair, defaulting to 0. */
export function levelPercent(
  snapshot: DailySnapshot,
  category: SeriesCategory,
  level: Level,
): number {
  return snapshot.jlptProgress[category]?.[level] ?? 0
}

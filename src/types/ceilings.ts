/**
 * The shape of `public/data/ceilings.json`.
 *
 * Some terms can never be studied. renshuu's sentence decks contain set phrases
 * — はじめまして, ありがとう！ — whose "Structure" study vector can't be
 * quizzed, because a fixed greeting has no grammatical structure to analyse.
 * They stay in the denominator of the level percentage forever, so the level
 * can never reach 100%.
 *
 * Without this file the dashboard projects toward a target that does not exist,
 * and reports a finished level as permanently in progress. With it, a level is
 * complete once everything studiable has been studied.
 *
 * Refreshed weekly: it changes only when decks are added or renshuu fixes its
 * content, and computing it costs one API call per schedule.
 */

/** Bumped only if the shape changes incompatibly. */
export const CEILINGS_VERSION = 1

/** The reachable maximum for one category at one JLPT level. */
export interface Ceiling {
  /** Terms in the level, including ones that can't be studied. */
  total: number
  /** Terms that can never be studied. */
  blocked: number
  /**
   * Highest percentage reachable, floored.
   *
   * Floored rather than rounded because it is compared with `>=` against
   * renshuu's own reported percentage, whose rounding is not consistent —
   * 672/689 (97.5%) is reported as 97, while 158/160 (98.8%) is reported as 99.
   * Flooring makes the comparison hold in both directions.
   */
  ceilingPercent: number
  /** Schedules the figures were summed from, for the UI to name. */
  sources: string[]
}

/** The top level of `public/data/ceilings.json`. */
export interface CeilingCollection {
  version: number
  generatedAt: string
  /** Keyed by category, then by JLPT level: `ceilings.sent.n5`. */
  ceilings: Record<string, Record<string, Ceiling>>
}

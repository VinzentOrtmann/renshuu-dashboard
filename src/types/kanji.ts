/**
 * The shape of `public/data/kanji.json` — the kanji wall's data.
 *
 * Kept separate from `history.json` on purpose. The archive is small, changes
 * several times a day, and is fetched on every visit. This file is the
 * opposite: large, slow-moving, and only worth downloading if you actually open
 * the wall.
 *
 * Field names are short because they repeat ~700 times. Raw API entries average
 * 1,130 bytes each, which would make this file around 800 KB; trimmed to the
 * fields the wall actually renders it lands near 80 KB.
 */

/** Bumped only if the entry shape changes incompatibly. */
export const KANJI_VERSION = 1

/** One kanji, as the wall needs it. */
export interface KanjiEntry {
  /** The character itself. */
  c: string
  /** JLPT level, e.g. "N3". Absent for kanji outside the JLPT sets. */
  jlpt?: string
  /** Stroke count. */
  s: number
  /** English meanings, comma separated. */
  m: string
  /** On'yomi readings, comma separated. */
  on: string
  /** Kun'yomi readings, comma separated. */
  kun: string
  /**
   * Average mastery 0-100, or `undefined` when never studied.
   *
   * Undefined and 0 mean different things — "never seen" versus "seen and not
   * retained" — and the wall colours them differently, so this must not be
   * defaulted to zero.
   */
  mastery?: number
}

/** The top level of `public/data/kanji.json`. */
export interface KanjiCollection {
  version: number
  /** ISO 8601 UTC timestamp of the last refresh. */
  generatedAt: string
  /** Names of the schedules this was collected from. */
  sources: string[]
  /** Sorted by JLPT level, hardest last, then by stroke count. */
  kanji: KanjiEntry[]
}

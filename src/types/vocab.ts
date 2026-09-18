/**
 * The shape of `public/data/vocab.json` — readings and meanings for the words
 * in your vocabulary schedules, so worksheets can label a word like renshuu's
 * own sheets do.
 *
 * Collected weekly alongside the kanji data. Keyed by the written form, which
 * makes lookup a single property access while typing. Only what a worksheet
 * label needs is kept: raw API entries carry example sentences, pitch accent
 * and study records, which would make this file several megabytes.
 */

/** Bumped only if the shape changes incompatibly. */
export const VOCAB_VERSION = 1

/** One written form. */
export interface VocabEntry {
  /**
   * Readings in kana. Usually one; more when the same spelling is two words,
   * as with 生物 (せいぶつ, living thing / なまもの, raw food).
   */
  r: string[]
  /** The first few English meanings, already cleaned of dictionary tags. */
  m: string
}

/** The top level of `public/data/vocab.json`. */
export interface VocabCollection {
  version: number
  generatedAt: string
  /** Names of the schedules this was collected from. */
  sources: string[]
  /** Written form -> entry. Kana-only words are keyed by their kana. */
  words: Record<string, VocabEntry>
}

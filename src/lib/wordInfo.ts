/**
 * The meaning-and-reading line printed above each word on a worksheet.
 *
 * Pure: lookups are passed in, so this runs the same in the browser and in
 * unit tests, and the rules for what goes on the line are tested rather than
 * checked by eye in a print preview.
 *
 * Everything comes from your own renshuu data — the weekly vocabulary and kanji
 * collections — so the labels match what renshuu itself shows you.
 */

import type { KanjiEntry } from '../types/kanji.ts'
import type { VocabEntry } from '../types/vocab.ts'

export interface InfoSources {
  /** Look up a whole word in the vocabulary collection. */
  word: (written: string) => VocabEntry | undefined
  /** Look up a single kanji in the kanji collection. */
  kanji: (char: string) => KanjiEntry | undefined
  /** Stroke count from the stroke-order data, when it has loaded. */
  strokes: (char: string) => number | undefined
}

/**
 * Cleans one dictionary gloss for printing.
 *
 * renshuu's definitions come from JMdict and carry tags in braces — "{col}"
 * for colloquial, "{arch}" for archaic. They're useful in a dictionary and
 * noise on a practice sheet.
 */
export function cleanGloss(gloss: string): string {
  return gloss
    .replace(/\{[^}]*\}/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Joins the parts that exist with a middle dot. */
function join(parts: (string | undefined)[]): string {
  return parts.filter((part) => part && part.trim()).join(' · ')
}

/**
 * The info line for a word, or undefined when there's nothing to say.
 *
 *   single kanji   カン · あや.うい · 13 strokes — dangerous, fear
 *   known word     ひこうき — aeroplane, airplane
 *   unknown word   飛 fly · 行 go · 機 machine
 *
 * A known word shows its reading and meaning rather than the characters,
 * which are already written in the boxes below. A word not in your vocabulary
 * falls back to the meaning of each kanji, which still tells you what you're
 * writing.
 */
export function infoLine(
  word: string[],
  sources: InfoSources,
): string | undefined {
  const written = word.join('')

  if (word.length === 1) {
    const kanji = sources.kanji(written)
    if (kanji) {
      const strokes = sources.strokes(written) ?? kanji.s
      return `${join([
        kanji.on,
        kanji.kun,
        strokes ? `${strokes} strokes` : undefined,
      ])} — ${kanji.m}`
    }
  }

  const entry = sources.word(written)
  if (entry) {
    // For a kana-only word the reading is the word itself; don't repeat it.
    const readings = entry.r.filter((reading) => reading !== written)
    return readings.length > 0
      ? `${readings.join(' / ')} — ${entry.m}`
      : entry.m
  }

  const perKanji = word
    .map((char) => {
      const meaning = sources.kanji(char)?.m.split(',')[0]?.trim()
      return meaning ? `${char} ${meaning}` : undefined
    })
    .filter((part): part is string => part !== undefined)

  return perKanji.length > 0 ? perKanji.join(' · ') : undefined
}

/**
 * Whether a character is full width. Kanji, kana and full-width punctuation
 * take a whole em; Latin letters take roughly half of one.
 */
function isWide(char: string): boolean {
  const code = char.codePointAt(0) ?? 0
  return (
    (code >= 0x2e80 && code <= 0x9fff) || // CJK radicals .. unified ideographs
    (code >= 0xf900 && code <= 0xfaff) || // compatibility ideographs
    (code >= 0xff00 && code <= 0xff60) || // full-width forms
    code >= 0x20000 // supplementary ideographs
  )
}

/** Approximate printed width of a string, in multiples of the font size. */
export function textWidthEm(text: string): number {
  let width = 0
  for (const char of text) width += isWide(char) ? 1 : 0.55
  return width
}

/**
 * Shortens text to fit a width, ending in an ellipsis when cut.
 *
 * An estimate rather than a measurement: there's no text-layout engine in the
 * layout code, and a label that clips mid-letter at the page edge is worse
 * than one trimmed a word early. The 0.55 em for Latin letters errs slightly
 * wide for that reason.
 */
export function fitText(
  text: string,
  maxWidthMm: number,
  fontSizeMm: number,
): string {
  const maxEm = maxWidthMm / fontSizeMm
  if (textWidthEm(text) <= maxEm) return text

  let result = ''
  let width = 0
  const ellipsis = '…'
  const room = maxEm - textWidthEm(ellipsis)
  for (const char of text) {
    const next = width + (isWide(char) ? 1 : 0.55)
    if (next > room) break
    result += char
    width = next
  }
  // Don't leave a dangling separator or space right before the ellipsis.
  return `${result.replace(/[\s,·—;]+$/, '')}${ellipsis}`
}

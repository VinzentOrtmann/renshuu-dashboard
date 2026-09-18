/**
 * Parsing KANJIDIC2 into the compact entries the worksheet labels use.
 *
 * KANJIDIC2 is the Electronic Dictionary Research and Development Group's kanji
 * dictionary (https://www.edrdg.org/wiki/index.php/KANJIDIC_Project), licensed
 * CC BY-SA 4.0. It covers about 13,000 kanji — far more than any one learner's
 * decks — and renshuu's own kanji meanings appear to be drawn from it, so
 * labels from either source read alike.
 *
 * Pure: no network, no filesystem, so the generator script and the unit tests
 * share it. The file format is regular enough that targeted regular
 * expressions are clearer here than pulling in an XML library for one job.
 */

import type { KanjiEntry } from '../types/kanji.ts'

/** Decodes the handful of XML entities that appear in the dictionary text. */
function decodeEntities(text: string): string {
  return text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
}

/** Every text value of a tag within a block, optionally filtered by attributes. */
function allOf(block: string, pattern: RegExp): string[] {
  return [...block.matchAll(pattern)].map((m) => decodeEntities(m[1].trim()))
}

/** Keeps the first few items, joined the way the kanji collection joins them. */
function firstFew(items: string[], max: number): string {
  return items.slice(0, max).join(', ')
}

/**
 * One `<character>` block to an entry, or null for a block without a literal.
 *
 * Trimmed to match the kanji collection: four meanings, three readings of each
 * kind. English meanings are the `<meaning>` elements with no `m_lang`
 * attribute; the others are French, Spanish and Portuguese.
 */
export function parseKanjidicCharacter(block: string): KanjiEntry | null {
  const literal = /<literal>([^<]+)<\/literal>/.exec(block)?.[1]
  if (!literal) return null

  const strokes = /<stroke_count>(\d+)<\/stroke_count>/.exec(block)?.[1]

  return {
    c: literal,
    s: strokes ? Number(strokes) : 0,
    m: firstFew(allOf(block, /<meaning>([^<]+)<\/meaning>/g), 4),
    on: firstFew(allOf(block, /<reading r_type="ja_on">([^<]+)<\/reading>/g), 3),
    kun: firstFew(allOf(block, /<reading r_type="ja_kun">([^<]+)<\/reading>/g), 3),
    // KANJIDIC2's JLPT field uses the pre-2010 four-level scale, which doesn't
    // map onto N1-N5, so it is left out rather than mislabelled.
  }
}

/** Every character in a KANJIDIC2 document. */
export function parseKanjidic(xml: string): KanjiEntry[] {
  const entries: KanjiEntry[] = []
  for (const match of xml.matchAll(/<character>([\s\S]*?)<\/character>/g)) {
    const entry = parseKanjidicCharacter(match[1])
    // A character with no English meaning can't produce a useful label.
    if (entry && entry.m) entries.push(entry)
  }
  return entries
}

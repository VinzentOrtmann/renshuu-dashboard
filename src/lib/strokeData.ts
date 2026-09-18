/**
 * Pure helpers for KanjiVG stroke data, shared by the generator script (Node)
 * and the worksheet page (browser). Nothing here touches the network or Vite,
 * so it can be imported and unit tested from either side.
 *
 * KanjiVG (https://kanjivg.tagaini.net) by Ulrich Apel is licensed CC BY-SA
 * 3.0. It describes each character as its strokes, in writing order, as SVG
 * paths on a 109×109 grid.
 */

/** Side length of KanjiVG's coordinate grid. */
export const KANJIVG_SIZE = 109

/**
 * The file a character's strokes live in, e.g. "98" for 飛 (U+98DB).
 *
 * Characters are grouped by code-point block, 256 per file, so a worksheet
 * downloads only the few blocks its characters fall in — rather than one 6 MB
 * file, or thousands of tiny ones cluttering the repository.
 */
export function bucketFor(char: string): string {
  const codePoint = char.codePointAt(0) ?? 0
  return (codePoint >> 8).toString(16)
}

/**
 * Extracts a character's stroke paths, in writing order, from a KanjiVG SVG.
 *
 * Each stroke is a `<path>` whose id ends in `-s<number>`. Sorting by that
 * number rather than trusting document order keeps the result right even if a
 * file nests groups unusually. Attributes are read one at a time, so their
 * order within the tag doesn't matter.
 */
export function parseKanjiVgStrokes(svg: string): string[] {
  const strokes: { order: number; d: string }[] = []

  for (const tag of svg.match(/<path\b[^>]*>/g) ?? []) {
    const id = /\bid="[^"]*-s(\d+)"/.exec(tag)
    const d = /\bd="([^"]+)"/.exec(tag)
    if (id && d) strokes.push({ order: Number(id[1]), d: d[1] })
  }

  return strokes.sort((a, b) => a.order - b.order).map((s) => s.d)
}

/** A bucket file: character -> stroke paths in writing order. */
export type StrokeBucket = Record<string, string[]>

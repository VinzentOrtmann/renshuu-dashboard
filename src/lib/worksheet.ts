/**
 * Layout for the writing-practice worksheet.
 *
 * Pure geometry: words and options in, pages of positioned boxes out. No React
 * and no DOM, so the rules that decide what goes where are unit tested in
 * worksheet.test.ts rather than checked by eye in a print preview.
 *
 * All measurements are millimetres. The page component draws them into an SVG
 * whose viewBox is in millimetres too, so a 12 mm box prints as 12 mm.
 */

export type PaperSize = 'a4' | 'letter'

/** Paper dimensions in millimetres. */
export const PAPER: Record<PaperSize, { width: number; height: number }> = {
  a4: { width: 210, height: 297 },
  letter: { width: 215.9, height: 279.4 },
}

/** Which rows get grey tracing characters. */
export type TracingMode = 'first-row' | 'all-rows' | 'none'

export interface WorksheetOptions {
  paper: PaperSize
  /** Side length of one square box. */
  boxMm: number
  /** Blank border around the printable area, on every side. */
  marginMm: number
  /** Grey copies after the solid model, per row that has tracing. */
  tracedCopies: number
  /** Rows of practice for each word. */
  rowsPerWord: number
  tracing: TracingMode
}

export const DEFAULT_OPTIONS: WorksheetOptions = {
  paper: 'a4',
  boxMm: 12,
  marginMm: 12,
  tracedCopies: 3,
  rowsPerWord: 2,
  tracing: 'first-row',
}

/**
 * What a box contains.
 *
 * `model` is the solid reference character, `trace` a grey one to write over,
 * `blank` an empty box to write from memory.
 */
export type CellKind = 'model' | 'trace' | 'blank'

export interface Cell {
  char: string
  kind: CellKind
}

/**
 * One copy of a word: its characters in adjacent boxes, drawn as a single
 * outlined unit so a word reads as a word rather than as loose kanji.
 */
export interface Group {
  /** Left edge, in mm from the page's left edge. */
  x: number
  cells: Cell[]
}

export interface Row {
  /** Top edge, in mm from the page's top edge. */
  y: number
  groups: Group[]
}

export interface Page {
  rows: Row[]
}

/**
 * Splits the input into words, each an array of characters.
 *
 * Words are separated by whitespace, commas, or the Japanese comma 、, so
 * pasting a list in either language's style works. `Array.from` splits by code
 * point rather than UTF-16 unit, so rare kanji outside the Basic Multilingual
 * Plane stay whole instead of turning into two broken halves.
 */
export function parseWords(input: string): string[][] {
  return input
    .split(/[\s,、，]+/)
    .map((word) => Array.from(word.trim()))
    .filter((chars) => chars.length > 0)
}

/** How many boxes fit across the printable width. */
export function columnsFor(options: WorksheetOptions): number {
  const width = PAPER[options.paper].width - 2 * options.marginMm
  return Math.max(1, Math.floor(width / options.boxMm))
}

/** Splits a word too long for one row into row-sized pieces. */
function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = []
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size))
  }
  return chunks
}

/** What goes in a given copy of a word on a given row. */
function kindFor(
  row: number,
  copy: number,
  options: WorksheetOptions,
): CellKind {
  // The first copy on the first row is always the solid model to copy from.
  if (row === 0 && copy === 0) return 'model'
  if (options.tracing === 'none') return 'blank'
  if (options.tracing === 'first-row' && row > 0) return 'blank'

  // On traced rows the model's slot is already used on row 0, so the grey
  // copies start one position later there than on later rows.
  const tracedEnd = row === 0 ? options.tracedCopies : options.tracedCopies - 1
  return copy <= tracedEnd ? 'trace' : 'blank'
}

/**
 * Lays words out onto pages.
 *
 * Each word gets `rowsPerWord` rows. A row repeats the word as many times as
 * fits, so short words fill the width with practice space instead of leaving
 * it empty. A word's rows are kept together on one page — splitting a word's
 * practice across a page break means turning the sheet over mid-exercise.
 */
export function layoutWorksheet(
  words: string[][],
  options: WorksheetOptions,
): Page[] {
  const paper = PAPER[options.paper]
  const columns = columnsFor(options)
  const box = options.boxMm

  // Centre the grid, so the unusable sliver left over after whole boxes is
  // split evenly between both sides instead of all landing on the right.
  const left = (paper.width - columns * box) / 2
  const top = options.marginMm
  const bottom = paper.height - options.marginMm

  // Breathing room between different words, so each block reads as a unit.
  const wordGap = box * 0.35

  const pages: Page[] = []
  let page: Page = { rows: [] }
  let y = top

  for (const word of words) {
    for (const piece of chunk(word, columns)) {
      const blockHeight = options.rowsPerWord * box

      // Start a new page if this word's block won't fit, unless the page is
      // still empty — a block taller than a whole page has to go somewhere.
      if (y + blockHeight > bottom && page.rows.length > 0) {
        pages.push(page)
        page = { rows: [] }
        y = top
      }

      const copies = Math.max(1, Math.floor(columns / piece.length))

      for (let row = 0; row < options.rowsPerWord; row++) {
        const groups: Group[] = []
        for (let copy = 0; copy < copies; copy++) {
          const kind = kindFor(row, copy, options)
          groups.push({
            x: left + copy * piece.length * box,
            cells: piece.map((char) => ({ char, kind })),
          })
        }
        page.rows.push({ y, groups })
        y += box
      }

      y += wordGap
    }
  }

  if (page.rows.length > 0) pages.push(page)
  return pages
}

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

import { fitText } from './wordInfo.ts'

export type PaperSize = 'a4' | 'letter'
export type Orientation = 'portrait' | 'landscape'

/** Paper dimensions in millimetres, portrait. */
export const PAPER: Record<PaperSize, { width: number; height: number }> = {
  a4: { width: 210, height: 297 },
  letter: { width: 215.9, height: 279.4 },
}

/** Which rows get grey tracing characters. */
export type TracingMode = 'first-row' | 'all-rows' | 'none'

/**
 * How much of a traced row is grey characters: a fixed number of copies, half
 * the row, or all of it.
 */
export type TracedAmount = number | 'half' | 'all'

export interface WorksheetOptions {
  paper: PaperSize
  orientation: Orientation
  /** Side length of one square box. */
  boxMm: number
  /** Blank border around the printable area, on every side. */
  marginMm: number
  tracedCopies: TracedAmount
  /** Rows of practice for each word, before any page filling. */
  rowsPerWord: number
  tracing: TracingMode
  /** Add rows to the words on the last page until it is full. */
  fillPage: boolean
  /** Show each character built up stroke by stroke, above its practice rows. */
  strokeOrder: boolean
  /** Print a meaning-and-reading line above each word. */
  showInfo: boolean
  /**
   * Practise each kanji on its own before a word that uses it: 緊張 becomes
   * 緊, 張, 緊張 on a page of its own. See {@link expandWords}.
   */
  expandKanji: boolean
}

/**
 * Defaults: every row half traced, so a page filled out from a single kanji is
 * rows *of that kanji* — grey to trace on the left, blank to write from memory
 * on the right — rather than a model at the top and a page of empty boxes.
 */
export const DEFAULT_OPTIONS: WorksheetOptions = {
  paper: 'a4',
  orientation: 'portrait',
  boxMm: 12,
  marginMm: 12,
  tracedCopies: 'half',
  rowsPerWord: 2,
  tracing: 'all-rows',
  fillPage: true,
  strokeOrder: true,
  showInfo: true,
  expandKanji: true,
}

/**
 * What a box contains.
 *
 * `model` is the solid reference character, `trace` a grey one to write over,
 * `blank` an empty box, and `stroke` one step of the stroke-order build-up.
 */
export type CellKind = 'model' | 'trace' | 'blank' | 'stroke'

export interface Cell {
  char: string
  kind: CellKind
  /** For `stroke` cells: how many strokes are drawn, 1-based. */
  step?: number
}

/**
 * Adjacent boxes drawn as one outlined unit: one copy of a word, or one
 * character's stroke-order sequence.
 */
export interface Group {
  /** Left edge, in mm from the page's left edge. */
  x: number
  cells: Cell[]
}

export interface Row {
  /** Top edge, in mm from the page's top edge. */
  y: number
  /** Height in mm. A box's size for box rows; less for an info line. */
  height: number
  groups: Group[]
  /** Index of the word this row belongs to. */
  word: number
  /**
   * For an info row: the meaning-and-reading line, already shortened to fit.
   * Info rows have no groups.
   */
  text?: string
}

export interface Page {
  rows: Row[]
}

/**
 * Stroke count per character, or undefined when there's no stroke data (the
 * data is still loading, or KanjiVG doesn't cover the character).
 */
export type StrokeCounts = (char: string) => number | undefined

/** The info line for a word, or undefined when there's nothing to print. */
export type InfoFor = (word: string[]) => string | undefined

/**
 * Size of the info line's text, and the height of the row it sits in.
 *
 * Fixed rather than scaled with the box: at 9 mm boxes a proportional label
 * would be too small to read, and at 20 mm it would shout. About 9 pt.
 */
export const INFO_FONT_MM = 3.2
export const INFO_ROW_MM = 5.5

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

/**
 * A line of three or more hyphens, and nothing else: a manual page break.
 *
 * ASCII hyphens only. The katakana long-vowel mark ー looks similar but is part
 * of real words (コーヒー), so treating it as a break would split words apart.
 */
const PAGE_BREAK = /^\s*-{3,}\s*$/m

/** The text a page break is written as, for inserting one into the input. */
export const PAGE_BREAK_TEXT = '---'

/**
 * Whether a character is a kanji.
 *
 * 々 is excluded: it's the repetition mark in words like 人々, written as part
 * of the word but not a character you'd practise on its own.
 */
export function isKanji(char: string): boolean {
  return char !== '々' && /\p{Script=Han}/u.test(char)
}

/**
 * Groups each word containing kanji with its kanji: the kanji one by one, then
 * the word, kept together on one page.
 *
 *   緊張   ->  [緊 / 張 / 緊張]
 *   結果       [結 / 果 / 結果]
 *
 * Groups share pages — several fit on one sheet — but a group is never split
 * across a page break. For a fresh page, use a manual `---` break.
 *
 * - Only kanji are split out. 食べる gives 食 then 食べる, not rows for the kana.
 * - A kanji is practised once per sheet. With 結果 then 結論, the second group
 *   is just 論 and 結論, since 結 already had its rows.
 * - Words without kanji, and single characters, are groups of one.
 * - Typing the group out by hand (緊, 張, 緊張) gives the same result as typing
 *   the word alone: single kanji typed just before a word that contains them
 *   are taken into that word's group.
 *
 * Returns sections of groups of words. Manual page breaks are kept: groups
 * never cross one.
 */
export function expandWords(sections: string[][][]): string[][][][] {
  const practised = new Set<string>()

  return sections.map((section) => {
    const groups: string[][][] = []

    for (const word of section) {
      const kanji = [...new Set(word.filter(isKanji))]

      if (word.length < 2 || kanji.length === 0) {
        groups.push([word])
        for (const char of kanji) practised.add(char)
        continue
      }

      // Take back single kanji typed by hand right before this word, if they
      // belong to it. They've already been counted as practised, so remember
      // them to put them back in the group.
      const takenBack = new Set<string>()
      while (groups.length > 0) {
        const last = groups[groups.length - 1]
        if (last.length !== 1 || last[0].length !== 1) break
        if (!kanji.includes(last[0][0])) break
        takenBack.add(last[0][0])
        groups.pop()
      }

      // Kanji in the word's own order, each once, skipping any already
      // practised earlier on the sheet.
      const group: string[][] = []
      for (const char of kanji) {
        if (takenBack.has(char) || !practised.has(char)) {
          group.push([char])
          practised.add(char)
        }
      }
      group.push(word)
      groups.push(group)
    }

    return groups
  })
}

/**
 * Splits the input at page-break lines into sections, each a list of words.
 *
 * Sections that end up empty — a break at the very start, or two breaks in a
 * row — are dropped, so a stray break never produces a blank page.
 */
export function parseSections(input: string): string[][][] {
  return input
    .split(new RegExp(PAGE_BREAK.source, 'gm'))
    .map(parseWords)
    .filter((words) => words.length > 0)
}

/** Page dimensions for the chosen paper and orientation. */
export function pageSize(options: WorksheetOptions): {
  width: number
  height: number
} {
  const { width, height } = PAPER[options.paper]
  return options.orientation === 'landscape'
    ? { width: height, height: width }
    : { width, height }
}

/** How many boxes fit across the printable width. */
export function columnsFor(options: WorksheetOptions): number {
  const width = pageSize(options).width - 2 * options.marginMm
  return Math.max(1, Math.floor(width / options.boxMm))
}

/** Splits a list into pieces of at most `size`. */
function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = []
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size))
  }
  return chunks
}

/**
 * How many copies at the start of a row are filled (model or grey) rather than
 * blank, given how many copies fit on the row.
 */
function filledCopies(
  row: number,
  copies: number,
  amount: TracedAmount,
): number {
  if (amount === 'all') return copies
  if (amount === 'half') return Math.max(1, Math.round(copies / 2))
  // A fixed count means that many grey copies. On the first row the model
  // takes the first slot, so one extra copy is filled there.
  return Math.min(copies, row === 0 ? amount + 1 : amount)
}

/** What goes in a given copy of a word on a given row. */
function kindFor(
  row: number,
  copy: number,
  copies: number,
  options: WorksheetOptions,
): CellKind {
  // The first copy on the first row is always the solid model to copy from.
  if (row === 0 && copy === 0) return 'model'
  if (options.tracing === 'none') return 'blank'
  if (options.tracing === 'first-row' && row > 0) return 'blank'
  return copy < filledCopies(row, copies, options.tracedCopies)
    ? 'trace'
    : 'blank'
}

/**
 * Rows showing each character built up one stroke at a time.
 *
 * Box k of a character holds its first k strokes, so reading along the row
 * shows the order they're written in. Each character's sequence is outlined as
 * a unit, and wraps to the next row if it's longer than a row.
 *
 * Each character's stroke order is shown once per section. `shown` carries the
 * characters already drawn: in the group 緊 / 張 / 緊張, the word's own stroke
 * row would repeat all 26 boxes directly beneath the kanji rows that already
 * showed them. A new section starts fresh, so every page group stands alone.
 *
 * In a word that contains kanji, the kana get no stroke row: in 食べる the
 * point is 食, and a row for べ and る is noise at the level of anyone writing
 * kanji. A word that is only kana keeps its stroke order.
 */
function strokeRows(
  piece: string[],
  columns: number,
  strokeCounts: StrokeCounts,
  shown: Set<string>,
  wordHasKanji: boolean,
): Cell[][] {
  const cells: Cell[] = []
  for (const char of piece) {
    if (shown.has(char)) continue
    if (wordHasKanji && !isKanji(char)) continue
    shown.add(char)
    const count = strokeCounts(char) ?? 0
    for (let step = 1; step <= count; step++) {
      cells.push({ char, kind: 'stroke', step })
    }
  }
  return chunk(cells, columns)
}

/** Groups a row's cells into runs of the same character, as outlined units. */
function groupByChar(cells: Cell[], left: number, box: number): Group[] {
  const groups: Group[] = []
  cells.forEach((cell, index) => {
    const last = groups.at(-1)
    if (last && last.cells[0].char === cell.char && cell.step !== 1) {
      last.cells.push(cell)
    } else {
      groups.push({ x: left + index * box, cells: [cell] })
    }
  })
  return groups
}

/** One piece of a word, laid out with rows positioned from its own top. */
interface Block {
  rows: Row[]
  height: number
}

/**
 * One pass of layout, with a given number of extra rows per word.
 *
 * Works in groups: words that must stay on the same page, like 緊 / 張 / 緊張.
 * Each group is measured whole before it's placed, and moves to a new page
 * rather than splitting across one. Groups otherwise share pages, so a list of
 * short words fills a page instead of taking one each. A plain word is simply a
 * group of one.
 */
function layoutOnce(
  groups: string[][][],
  options: WorksheetOptions,
  strokeCounts: StrokeCounts,
  infoFor: InfoFor,
  extraRows: number[],
): Page[] {
  const paper = pageSize(options)
  const columns = columnsFor(options)
  const box = options.boxMm

  // Centre the grid, so the unusable sliver left after whole boxes is split
  // evenly between both sides instead of all landing on the right.
  const left = (paper.width - columns * box) / 2
  const top = options.marginMm
  const bottom = paper.height - options.marginMm

  // Breathing room between different words, so each block reads as a unit.
  const wordGap = box * 0.35

  // Characters whose stroke order this section has already shown. Created per
  // pass, because page filling calls this function repeatedly.
  const strokesShown = new Set<string>()

  /** A word's rows, as one block per piece, each positioned from y = 0. */
  function blocksFor(word: string[], wordIndex: number): Block[] {
    const pieces = chunk(word, columns)
    const wordHasKanji = word.some(isKanji)

    // The label describes the whole word, so it goes above the first piece
    // only, and is shortened to fit the grid's width.
    const rawInfo = options.showInfo ? infoFor(word) : undefined
    const info = rawInfo
      ? fitText(rawInfo, columns * box, INFO_FONT_MM)
      : undefined

    return pieces.map((piece, pieceIndex) => {
      const rows: Row[] = []
      let y = 0

      if (pieceIndex === 0 && info !== undefined) {
        rows.push({
          y,
          height: INFO_ROW_MM,
          groups: [],
          word: wordIndex,
          text: info,
        })
        y += INFO_ROW_MM
      }

      const strokes = options.strokeOrder
        ? strokeRows(piece, columns, strokeCounts, strokesShown, wordHasKanji)
        : []
      for (const cells of strokes) {
        rows.push({
          y,
          height: box,
          groups: groupByChar(cells, left, box),
          word: wordIndex,
        })
        y += box
      }

      // Extra rows from page filling go on the word's last piece, so a long
      // word that wraps doesn't get them interleaved between its halves.
      const practiceRows =
        options.rowsPerWord +
        (pieceIndex === pieces.length - 1 ? extraRows[wordIndex] : 0)
      const copies = Math.max(1, Math.floor(columns / piece.length))
      for (let row = 0; row < practiceRows; row++) {
        const cells: Group[] = []
        for (let copy = 0; copy < copies; copy++) {
          const kind = kindFor(row, copy, copies, options)
          cells.push({
            x: left + copy * piece.length * box,
            cells: piece.map((char) => ({ char, kind })),
          })
        }
        rows.push({ y, height: box, groups: cells, word: wordIndex })
        y += box
      }

      return { rows, height: y }
    })
  }

  const pages: Page[] = []
  let page: Page = { rows: [] }
  let y = top
  const newPage = () => {
    pages.push(page)
    page = { rows: [] }
    y = top
  }

  let wordIndex = 0
  for (const group of groups) {
    const blocks = group.flatMap((word) => blocksFor(word, wordIndex++))
    const groupHeight =
      blocks.reduce((sum, block) => sum + block.height, 0) +
      wordGap * (blocks.length - 1)

    // Keep the group together: start a new page if it won't fit on this one,
    // unless this page is still empty — then it's taller than any page and has
    // to be split wherever it runs out.
    if (y + groupHeight > bottom && page.rows.length > 0) newPage()

    for (const block of blocks) {
      // Only reached mid-group when the group is taller than a whole page.
      if (y + block.height > bottom && page.rows.length > 0) newPage()
      for (const row of block.rows) page.rows.push({ ...row, y: y + row.y })
      y += block.height + wordGap
    }
  }

  if (page.rows.length > 0) pages.push(page)
  return pages
}

/**
 * Wraps each word as a group of its own, for input that hasn't been grouped.
 */
export function ungrouped(sections: string[][][]): string[][][][] {
  return sections.map((words) => words.map((word) => [word]))
}

/**
 * Lays out several sections, each starting on a fresh page.
 *
 * Every section is laid out on its own, so page filling applies to each
 * section's last page separately. Within a section, groups share pages but are
 * never split across one.
 */
export function layoutSections(
  sections: string[][][][],
  options: WorksheetOptions,
  strokeCounts: StrokeCounts = () => undefined,
  infoFor: InfoFor = () => undefined,
): Page[] {
  return sections.flatMap((groups) =>
    layoutGroups(groups, options, strokeCounts, infoFor),
  )
}

/**
 * Lays words out onto pages, each word kept together on its own.
 *
 * The same as {@link layoutGroups} with every word a group of one.
 */
export function layoutWorksheet(
  words: string[][],
  options: WorksheetOptions,
  strokeCounts: StrokeCounts = () => undefined,
  infoFor: InfoFor = () => undefined,
): Page[] {
  return layoutGroups(
    words.map((word) => [word]),
    options,
    strokeCounts,
    infoFor,
  )
}

/**
 * Lays groups of words out onto pages.
 *
 * Each word gets `rowsPerWord` practice rows, preceded by its stroke-order rows
 * when enabled. A row repeats the word as many times as fits, so short words
 * fill the width instead of leaving it empty. Each group's rows are kept
 * together on one page — splitting 緊 / 張 / 緊張 across a page break means
 * turning the sheet over mid-exercise — but groups share pages otherwise.
 *
 * With `fillPage`, the words on the last page are given extra practice rows,
 * round-robin, until another row would spill onto a new page. So a single
 * kanji makes a full page of practice rather than two rows and blank paper.
 */
export function layoutGroups(
  groups: string[][][],
  options: WorksheetOptions,
  strokeCounts: StrokeCounts = () => undefined,
  infoFor: InfoFor = () => undefined,
): Page[] {
  const extraRows = groups.flat().map(() => 0)
  let pages = layoutOnce(groups, options, strokeCounts, infoFor, extraRows)
  if (!options.fillPage || pages.length === 0) return pages

  const pageCount = pages.length
  const lastPageWords = [
    ...new Set(pages[pageCount - 1].rows.map((r) => r.word)),
  ]
  const bottom = pageSize(options).height - options.marginMm

  /**
   * Whether a trial layout still fits: no extra page, and nothing past the
   * bottom margin.
   *
   * The second check is not redundant. A block that starts at the top of an
   * empty page is placed even if it's too tall, because it has nowhere better
   * to go — so a lone word never spills onto a new page, it just runs off the
   * bottom of its own. Checking only the page count let a single kanji gain
   * rows forever.
   */
  const fits = (trial: Page[]): boolean => {
    if (trial.length > pageCount) return false
    const lastRow = trial[trial.length - 1].rows.at(-1)
    return !lastRow || lastRow.y + lastRow.height <= bottom + 1e-9
  }

  // Try each last-page word in turn. A word whose extra row would not fit drops
  // out; the rest keep going, so leftover space goes to whichever blocks still
  // fit rather than stopping at the first that doesn't.
  let candidates = lastPageWords
  while (candidates.length > 0) {
    const stillFitting: number[] = []
    for (const word of candidates) {
      extraRows[word]++
      const trial = layoutOnce(
        groups,
        options,
        strokeCounts,
        infoFor,
        extraRows,
      )
      if (fits(trial)) {
        pages = trial
        stillFitting.push(word)
      } else {
        extraRows[word]--
      }
    }
    candidates = stillFitting
  }

  return pages
}

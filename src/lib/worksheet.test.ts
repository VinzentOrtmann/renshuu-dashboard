/**
 * Tests for worksheet layout.
 *
 * These pin down the things you'd otherwise only notice once a sheet was
 * printed: a word split across boxes wrongly, a block cut in half by a page
 * break, or the wrong number of grey copies to trace.
 */

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  DEFAULT_OPTIONS,
  PAPER,
  INFO_ROW_MM,
  columnsFor,
  layoutSections,
  layoutWorksheet,
  pageSize,
  parseSections,
  parseWords,
} from './worksheet.ts'
import type { WorksheetOptions } from './worksheet.ts'

/**
 * Test options: a fixed baseline rather than whatever the app's defaults happen
 * to be, so changing a default can't silently change what a test measures.
 * Page filling and stroke order are off unless a test turns them on, so each
 * test measures one behaviour instead of all of them at once.
 */
const opts = (overrides: Partial<WorksheetOptions> = {}): WorksheetOptions => ({
  ...DEFAULT_OPTIONS,
  tracing: 'first-row',
  tracedCopies: 3,
  fillPage: false,
  strokeOrder: false,
  ...overrides,
})

describe('parseWords', () => {
  it('splits on whitespace, newlines and both kinds of comma', () => {
    assert.deepEqual(parseWords('飛行機 漢字\n日本、東京,大阪'), [
      ['飛', '行', '機'],
      ['漢', '字'],
      ['日', '本'],
      ['東', '京'],
      ['大', '阪'],
    ])
  })

  it('ignores empty entries', () => {
    assert.deepEqual(parseWords('  \n\n 漢 \n'), [['漢']])
  })

  it('keeps a character outside the Basic Multilingual Plane whole', () => {
    // 𠮟 is U+20B9F; splitting by UTF-16 unit would give two broken halves.
    assert.deepEqual(parseWords('𠮟る'), [['𠮟', 'る']])
  })
})

describe('columnsFor', () => {
  it('fits whole boxes inside the margins', () => {
    // A4: 210 - 2*12 = 186 mm, / 12 mm boxes = 15.5 -> 15.
    assert.equal(columnsFor(opts()), 15)
  })

  it('never returns zero', () => {
    assert.equal(columnsFor(opts({ boxMm: 500 })), 1)
  })
})

describe('layoutWorksheet', () => {
  it('keeps a word in adjacent boxes', () => {
    const [page] = layoutWorksheet([['飛', '行', '機']], opts())
    const [first] = page.rows[0].groups
    assert.deepEqual(
      first.cells.map((c) => c.char),
      ['飛', '行', '機'],
    )
  })

  it('repeats a word as many times as fits across the row', () => {
    // 15 columns / 3 characters = 5 copies.
    const [page] = layoutWorksheet([['飛', '行', '機']], opts())
    assert.equal(page.rows[0].groups.length, 5)
  })

  it('puts copies edge to edge with no wasted gap', () => {
    const [page] = layoutWorksheet([['漢', '字']], opts({ boxMm: 10 }))
    const [a, b] = page.rows[0].groups
    assert.equal(b.x - a.x, 20)
  })

  it('starts each row with a solid model and then grey tracing', () => {
    const [page] = layoutWorksheet([['漢']], opts({ tracedCopies: 3 }))
    const kinds = page.rows[0].groups.map((g) => g.cells[0].kind)
    assert.deepEqual(kinds.slice(0, 5), [
      'model',
      'trace',
      'trace',
      'trace',
      'blank',
    ])
  })

  it('leaves later rows blank when tracing is first-row only', () => {
    const [page] = layoutWorksheet([['漢']], opts({ rowsPerWord: 2 }))
    const second = page.rows[1].groups.map((g) => g.cells[0].kind)
    assert.ok(second.every((kind) => kind === 'blank'))
  })

  it('traces every row when asked, with one model only', () => {
    const [page] = layoutWorksheet(
      [['漢']],
      opts({ rowsPerWord: 3, tracing: 'all-rows', tracedCopies: 2 }),
    )
    const all = page.rows.flatMap((r) => r.groups.map((g) => g.cells[0].kind))
    assert.equal(all.filter((k) => k === 'model').length, 1)
    for (const row of page.rows) {
      const traced = row.groups.filter((g) => g.cells[0].kind === 'trace')
      assert.equal(traced.length, 2)
    }
  })

  it('draws no tracing at all when tracing is off, but keeps the model', () => {
    const [page] = layoutWorksheet([['漢']], opts({ tracing: 'none' }))
    const kinds = page.rows.flatMap((r) => r.groups.map((g) => g.cells[0].kind))
    assert.equal(kinds[0], 'model')
    assert.ok(!kinds.includes('trace'))
  })

  it('wraps a word longer than a row onto the next row', () => {
    const long = Array.from('あいうえおかきくけこさしすせそたちつ') // 18 > 15
    const [page] = layoutWorksheet([long], opts({ rowsPerWord: 1 }))
    assert.equal(page.rows.length, 2)
    assert.equal(page.rows[0].groups[0].cells.length, 15)
    assert.equal(page.rows[1].groups[0].cells.length, 3)
  })

  it('flows onto more pages instead of stopping at one', () => {
    const words = Array.from({ length: 60 }, () => ['漢'])
    const pages = layoutWorksheet(words, opts())
    assert.ok(pages.length > 1, `expected several pages, got ${pages.length}`)
  })

  it('never splits one word across a page break', () => {
    const words = Array.from({ length: 60 }, (_, i) => [String(i)])
    const pages = layoutWorksheet(words, opts({ rowsPerWord: 3 }))
    for (const page of pages) {
      // Every word contributes exactly rowsPerWord rows, so a page holding a
      // partial block would have a row count that isn't a multiple of 3.
      assert.equal(page.rows.length % 3, 0)
    }
  })

  it('keeps every row inside the bottom margin', () => {
    const o = opts()
    const words = Array.from({ length: 80 }, () => ['漢', '字'])
    const bottom = PAPER.a4.height - o.marginMm
    for (const page of layoutWorksheet(words, o)) {
      for (const row of page.rows) {
        assert.ok(row.y + o.boxMm <= bottom + 1e-9)
      }
    }
  })

  it('returns no pages for no words', () => {
    assert.deepEqual(layoutWorksheet([], opts()), [])
  })
})

describe('tracing amount', () => {
  const kindsOfFirstRow = (o: WorksheetOptions) =>
    layoutWorksheet([['漢']], o)[0].rows[0].groups.map((g) => g.cells[0].kind)

  it('fills half the row with "half"', () => {
    // 15 copies fit; half of 15 rounds to 8 filled: the model plus 7 grey.
    const kinds = kindsOfFirstRow(opts({ tracedCopies: 'half' }))
    assert.equal(kinds.filter((k) => k !== 'blank').length, 8)
    assert.equal(kinds[0], 'model')
  })

  it('fills the whole row with "all"', () => {
    const kinds = kindsOfFirstRow(opts({ tracedCopies: 'all' }))
    assert.ok(!kinds.includes('blank'))
    assert.equal(kinds.filter((k) => k === 'model').length, 1)
  })

  it('traces whole later rows with "all" on every row', () => {
    const [page] = layoutWorksheet(
      [['漢']],
      opts({ tracedCopies: 'all', tracing: 'all-rows', rowsPerWord: 2 }),
    )
    assert.ok(page.rows[1].groups.every((g) => g.cells[0].kind === 'trace'))
  })

  it('never asks for more grey copies than fit', () => {
    const kinds = kindsOfFirstRow(opts({ tracedCopies: 99 }))
    assert.equal(kinds.length, 15)
  })
})

describe('orientation', () => {
  it('swaps the page dimensions for landscape', () => {
    assert.deepEqual(pageSize(opts({ orientation: 'landscape' })), {
      width: 297,
      height: 210,
    })
  })

  it('fits more boxes across a landscape page', () => {
    // 297 - 24 = 273 mm / 12 = 22 columns, against 15 in portrait.
    assert.equal(columnsFor(opts({ orientation: 'landscape' })), 22)
  })

  it('keeps landscape rows inside the shorter page height', () => {
    const o = opts({ orientation: 'landscape' })
    const words = Array.from({ length: 40 }, () => ['漢'])
    for (const page of layoutWorksheet(words, o)) {
      for (const row of page.rows) {
        assert.ok(row.y + o.boxMm <= 210 - o.marginMm + 1e-9)
      }
    }
  })
})

describe('fill page', () => {
  it('turns a single kanji into a full page of practice', () => {
    const o = opts({ fillPage: true })
    const pages = layoutWorksheet([['漢']], o)
    assert.equal(pages.length, 1)

    const last = pages[0].rows.at(-1)!
    const bottom = PAPER.a4.height - o.marginMm
    // Full means exactly this: the last row fits and one more would not.
    assert.ok(last.y + o.boxMm <= bottom)
    assert.ok(last.y + 2 * o.boxMm > bottom, `page not full: last row at ${last.y}`)
  })

  it('never adds a page', () => {
    const words = Array.from({ length: 30 }, (_, i) => [String(i)])
    const without = layoutWorksheet(words, opts())
    const withFill = layoutWorksheet(words, opts({ fillPage: true }))
    assert.equal(withFill.length, without.length)
  })

  it('leaves earlier pages exactly as they were', () => {
    const words = Array.from({ length: 30 }, (_, i) => [String(i)])
    const without = layoutWorksheet(words, opts())
    const withFill = layoutWorksheet(words, opts({ fillPage: true }))
    assert.deepEqual(withFill.slice(0, -1), without.slice(0, -1))
  })

  it('shares the extra rows between the words on the last page', () => {
    const [page] = layoutWorksheet([['漢'], ['字']], opts({ fillPage: true }))
    const rowsFor = (w: number) => page.rows.filter((r) => r.word === w).length
    assert.ok(Math.abs(rowsFor(0) - rowsFor(1)) <= 1)
    assert.ok(rowsFor(0) > DEFAULT_OPTIONS.rowsPerWord)
  })
})

describe('stroke order', () => {
  // 飛 has 9 strokes, 行 has 6; anything else has no data.
  const STROKES: Record<string, number> = { 飛: 9, 行: 6 }
  const counts = (char: string): number | undefined => STROKES[char]

  it('builds each character up one stroke per box', () => {
    const [page] = layoutWorksheet([['飛']], opts({ strokeOrder: true }), counts)
    const cells = page.rows[0].groups.flatMap((g) => g.cells)
    assert.deepEqual(
      cells.map((c) => c.step),
      [1, 2, 3, 4, 5, 6, 7, 8, 9],
    )
    assert.ok(cells.every((c) => c.kind === 'stroke'))
  })

  it('puts stroke order above the practice rows', () => {
    const [page] = layoutWorksheet([['飛']], opts({ strokeOrder: true }), counts)
    assert.equal(page.rows[0].groups[0].cells[0].kind, 'stroke')
    assert.equal(page.rows[1].groups[0].cells[0].kind, 'model')
  })

  it('outlines each character of a word as its own sequence', () => {
    const [page] = layoutWorksheet(
      [['飛', '行']],
      opts({ strokeOrder: true }),
      counts,
    )
    // 9 + 6 = 15 strokes fill exactly one 15-column row, as two groups.
    assert.deepEqual(
      page.rows[0].groups.map((g) => [g.cells[0].char, g.cells.length]),
      [
        ['飛', 9],
        ['行', 6],
      ],
    )
  })

  it('wraps a long sequence onto the next row', () => {
    const [page] = layoutWorksheet(
      [['飛']],
      opts({ strokeOrder: true, boxMm: 20 }), // 9 columns
      (c) => (c === '飛' ? 12 : undefined),
    )
    assert.equal(page.rows[0].groups[0].cells.length, 9)
    assert.equal(page.rows[1].groups[0].cells.length, 3)
  })

  it('keeps a repeated character as two separate sequences', () => {
    const [page] = layoutWorksheet(
      [['行', '行']],
      opts({ strokeOrder: true }),
      counts,
    )
    assert.equal(page.rows[0].groups.length, 2)
  })

  it('skips characters with no stroke data', () => {
    const [page] = layoutWorksheet([['漢']], opts({ strokeOrder: true }), counts)
    assert.equal(page.rows[0].groups[0].cells[0].kind, 'model')
  })

  it('adds nothing when turned off', () => {
    const [page] = layoutWorksheet([['飛']], opts({ strokeOrder: false }), counts)
    assert.equal(page.rows[0].groups[0].cells[0].kind, 'model')
  })
})

describe('info line', () => {
  const info = (word: string[]) =>
    word.join('') === '飛行機' ? 'ひこうき — airplane, aeroplane' : undefined

  it('puts the label above the word, in a shorter row', () => {
    const [page] = layoutWorksheet([['飛', '行', '機']], opts(), undefined, info)
    assert.equal(page.rows[0].text, 'ひこうき — airplane, aeroplane')
    assert.equal(page.rows[0].height, INFO_ROW_MM)
    assert.equal(page.rows[0].groups.length, 0)
    assert.equal(page.rows[1].y, page.rows[0].y + INFO_ROW_MM)
  })

  it('adds no row for a word with nothing to say', () => {
    const [page] = layoutWorksheet([['漢']], opts(), undefined, info)
    assert.equal(page.rows[0].text, undefined)
  })

  it('adds no row when turned off', () => {
    const [page] = layoutWorksheet(
      [['飛', '行', '機']],
      opts({ showInfo: false }),
      undefined,
      info,
    )
    assert.equal(page.rows[0].text, undefined)
  })

  it('labels a wrapped word once, not per piece', () => {
    const long = Array.from('あいうえおかきくけこさしすせそたちつ')
    const [page] = layoutWorksheet(
      [long],
      opts({ rowsPerWord: 1 }),
      undefined,
      () => 'label',
    )
    assert.equal(page.rows.filter((r) => r.text).length, 1)
  })

  it('shortens a label to the width of the grid', () => {
    const [page] = layoutWorksheet(
      [['漢']],
      opts({ boxMm: 20, orientation: 'portrait' }), // 9 columns = 180 mm
      undefined,
      () => 'x'.repeat(500),
    )
    const label = page.rows[0].text ?? ''
    assert.ok(label.endsWith('…'))
    assert.ok(label.length < 500)
  })

  it('still fills the page exactly with labels present', () => {
    const o = opts({ fillPage: true })
    const [page] = layoutWorksheet([['飛', '行', '機']], o, undefined, info)
    const last = page.rows.at(-1)!
    const bottom = PAPER.a4.height - o.marginMm
    assert.ok(last.y + last.height <= bottom + 1e-9)
    assert.ok(last.y + last.height + o.boxMm > bottom)
  })
})

describe('page breaks', () => {
  it('splits the input into sections at a line of hyphens', () => {
    assert.deepEqual(parseSections('緊\n張\n緊張\n---\n緊'), [
      [['緊'], ['張'], ['緊', '張']],
      [['緊']],
    ])
  })

  it('accepts longer runs of hyphens and surrounding spaces', () => {
    assert.equal(parseSections('漢\n  -----  \n字').length, 2)
  })

  it('never treats hyphens as a word to practise', () => {
    const words = parseSections('漢\n---\n字').flat().flat()
    assert.ok(!words.includes('-'))
  })

  it('does not break on the katakana long-vowel mark', () => {
    // ー is part of words like コーヒー; only ASCII hyphens are a break.
    assert.deepEqual(parseSections('ーーー'), [[['ー', 'ー', 'ー']]])
  })

  it('drops empty sections instead of making blank pages', () => {
    assert.equal(parseSections('---\n漢\n---\n---\n字\n---').length, 2)
  })

  it('without a break, is exactly the ordinary layout', () => {
    const o = opts({ fillPage: true })
    assert.deepEqual(
      layoutSections(parseSections('緊\n張'), o),
      layoutWorksheet(parseWords('緊\n張'), o),
    )
  })

  it('starts each section on a new page', () => {
    const pages = layoutSections(parseSections('緊\n張\n---\n緊'), opts())
    assert.equal(pages.length, 2)
    const firstRowOf = (page: (typeof pages)[number]) =>
      page.rows[0].groups[0].cells.map((c) => c.char).join('')
    assert.equal(firstRowOf(pages[1]), '緊')
  })

  it('fills each section on its own, so a lone kanji gets a whole page', () => {
    const o = opts({ fillPage: true })
    const pages = layoutSections(parseSections('緊\n張\n緊張\n---\n緊'), o)
    const bottom = PAPER.a4.height - o.marginMm
    for (const page of pages) {
      const last = page.rows.at(-1)!
      // Each page is full: its last row fits and one more would not.
      assert.ok(last.y + last.height <= bottom + 1e-9)
      assert.ok(last.y + last.height + o.boxMm > bottom)
    }
    // The second page is all 緊.
    assert.ok(
      pages[1].rows.every((r) =>
        r.groups.every((g) => g.cells.every((c) => c.char === '緊')),
      ),
    )
  })
})

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
  columnsFor,
  layoutWorksheet,
  parseWords,
} from './worksheet.ts'
import type { WorksheetOptions } from './worksheet.ts'

const opts = (overrides: Partial<WorksheetOptions> = {}): WorksheetOptions => ({
  ...DEFAULT_OPTIONS,
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

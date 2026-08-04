/**
 * Tests for archive merging.
 *
 * The important case is `rejects a reading that would lower a day's count` —
 * that is the exact failure that destroyed 2 and 3 August 2026, and it is the
 * reason this module exists separately from the snapshot script.
 */

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { mergeSnapshot, sameExceptCapturedAt } from './archive.ts'
import type { DailySnapshot } from '../types/history.ts'

/** Minimal snapshot; only the fields the merge logic looks at need to be real. */
function snap(
  date: string,
  todayAll: number,
  extra: Partial<DailySnapshot> = {},
): DailySnapshot {
  return {
    date,
    capturedAt: `${date}T12:00:00.000Z`,
    adventureLevel: 140,
    studiedToday: {
      all: todayAll,
      vocab: todayAll,
      kanji: 0,
      grammar: 0,
      sent: 0,
      conj: 0,
      aconj: 0,
    },
    studiedTotal: { all: 4000, vocab: 2700, kanji: 300, grammar: 240, sent: 760 },
    jlptProgress: { vocab: {}, kanji: {}, grammar: {}, sent: {} },
    dayStreaks: {},
    schedules: [],
    ...extra,
  }
}

describe('sameExceptCapturedAt', () => {
  it('ignores the capture timestamp', () => {
    const a = snap('2026-08-02', 255)
    const b = { ...snap('2026-08-02', 255), capturedAt: '2026-08-02T20:00:00Z' }
    assert.equal(sameExceptCapturedAt(a, b), true)
  })

  it('notices a real difference', () => {
    assert.equal(
      sameExceptCapturedAt(snap('2026-08-02', 255), snap('2026-08-02', 256)),
      false,
    )
  })
})

describe('mergeSnapshot', () => {
  it('appends a new date', () => {
    const result = mergeSnapshot([snap('2026-08-01', 100)], snap('2026-08-02', 20))
    assert.equal(result.action, 'appended')
    assert.equal(result.snapshots.length, 2)
  })

  it('keeps the archive sorted when a day arrives late', () => {
    const result = mergeSnapshot(
      [snap('2026-08-01', 10), snap('2026-08-03', 30)],
      snap('2026-08-02', 20),
    )
    assert.deepEqual(
      result.snapshots.map((s) => s.date),
      ['2026-08-01', '2026-08-02', '2026-08-03'],
    )
  })

  it('replaces with a higher count as the day goes on', () => {
    const result = mergeSnapshot([snap('2026-08-02', 95)], snap('2026-08-02', 215))
    assert.equal(result.action, 'replaced')
    assert.equal(result.snapshots[0].studiedToday.all, 215)
  })

  it('writes nothing when only the timestamp changed', () => {
    const stored = snap('2026-08-02', 255)
    const again = { ...snap('2026-08-02', 255), capturedAt: '2026-08-02T22:00:00Z' }
    const result = mergeSnapshot([stored], again)
    assert.equal(result.action, 'unchanged')
    assert.equal(result.snapshots[0].capturedAt, stored.capturedAt)
  })

  it('rejects a reading that would lower a day count', () => {
    // The real failure: 2 August had reached 255 when a run captured just after
    // midnight reported 0 for that same date. Refusing it is what stops a
    // completed day being destroyed.
    const result = mergeSnapshot([snap('2026-08-02', 255)], snap('2026-08-02', 0))
    assert.equal(result.action, 'rejected-lower')
    assert.equal(result.snapshots[0].studiedToday.all, 255)
  })

  it('rejects any decrease, not only a drop to zero', () => {
    const result = mergeSnapshot([snap('2026-08-03', 362)], snap('2026-08-03', 119))
    assert.equal(result.action, 'rejected-lower')
    assert.equal(result.snapshots[0].studiedToday.all, 362)
  })

  it('accepts an equal count that carries other new data', () => {
    // Study count flat but lifetime totals moved — that is a real update and
    // must not be mistaken for a reset.
    const stored = snap('2026-08-03', 362)
    const incoming = snap('2026-08-03', 362, {
      studiedTotal: {
        all: 4100,
        vocab: 2800,
        kanji: 300,
        grammar: 240,
        sent: 760,
      },
    })
    const result = mergeSnapshot([stored], incoming)
    assert.equal(result.action, 'replaced')
    assert.equal(result.snapshots[0].studiedTotal.all, 4100)
  })

  it('does not disturb other dates when rejecting', () => {
    const archive = [snap('2026-08-01', 466), snap('2026-08-02', 255)]
    const result = mergeSnapshot(archive, snap('2026-08-02', 0))
    assert.equal(result.action, 'rejected-lower')
    assert.deepEqual(
      result.snapshots.map((s) => s.studiedToday.all),
      [466, 255],
    )
  })

  it('appends into an empty archive', () => {
    const result = mergeSnapshot([], snap('2026-08-02', 5))
    assert.equal(result.action, 'appended')
    assert.equal(result.snapshots.length, 1)
  })
})

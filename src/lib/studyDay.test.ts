/**
 * Tests for study-day attribution.
 *
 * The cases that matter are the boundaries — just before and just after the
 * 03:00 rollover, and across a daylight-saving change. Those are exactly the
 * ones that were wrong in production, and none of them are obvious by reading
 * the code.
 */

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { formatDateInZone, studyDate } from './studyDay.ts'

const BERLIN = 'Europe/Berlin'

/** Builds an instant from a Berlin wall-clock time, given the UTC offset. */
function berlin(iso: string, offsetHours: number): Date {
  return new Date(`${iso}${offsetHours >= 0 ? '+' : '-'}0${Math.abs(offsetHours)}:00`)
}

describe('formatDateInZone', () => {
  it('reads the date in the target zone, not UTC', () => {
    // 22:30 UTC is already the next day in Berlin.
    const instant = new Date('2026-07-30T22:30:00Z')
    assert.equal(formatDateInZone(instant, BERLIN), '2026-07-31')
    assert.equal(formatDateInZone(instant, 'UTC'), '2026-07-30')
  })
})

describe('studyDate', () => {
  it('treats 02:59 local as still the previous study day', () => {
    // This is the case that was wrong: renshuu is still reporting the 30th's
    // counters here, so the snapshot must not be filed under the 31st.
    assert.equal(
      studyDate(berlin('2026-07-31T02:59:00', 2), BERLIN),
      '2026-07-30',
    )
  })

  it('rolls over exactly at 03:00 local', () => {
    assert.equal(
      studyDate(berlin('2026-07-31T03:00:00', 2), BERLIN),
      '2026-07-31',
    )
  })

  it('files a late-evening capture under that same day', () => {
    assert.equal(
      studyDate(berlin('2026-07-31T22:10:00', 2), BERLIN),
      '2026-07-31',
    )
  })

  it('files a just-before-midnight capture under that same day', () => {
    assert.equal(
      studyDate(berlin('2026-07-31T23:59:00', 2), BERLIN),
      '2026-07-31',
    )
  })

  it('files a just-after-midnight capture under the previous day', () => {
    assert.equal(
      studyDate(berlin('2026-08-01T00:47:00', 2), BERLIN),
      '2026-07-31',
    )
  })

  it('handles the winter offset too', () => {
    // CET is UTC+1; the rollover is still 03:00 local.
    assert.equal(
      studyDate(berlin('2026-12-01T02:30:00', 1), BERLIN),
      '2026-11-30',
    )
    assert.equal(
      studyDate(berlin('2026-12-01T03:30:00', 1), BERLIN),
      '2026-12-01',
    )
  })

  it('does not drift across the spring daylight-saving change', () => {
    // Europe/Berlin springs forward 02:00 -> 03:00 on 29 March 2026, so 02:30
    // local does not exist that night. 01:30 CET is before the jump.
    assert.equal(
      studyDate(new Date('2026-03-29T00:30:00Z'), BERLIN),
      '2026-03-28',
    )
  })

  it('respects a custom rollover hour', () => {
    // With a midnight boundary the same instant belongs to the next day.
    assert.equal(
      studyDate(berlin('2026-07-31T02:59:00', 2), BERLIN, 0),
      '2026-07-31',
    )
  })

  it('is stable across a whole day of captures', () => {
    // Every capture from 03:00 through 02:59 the next morning must agree.
    const expected = '2026-07-31'
    const samples = [
      berlin('2026-07-31T03:00:00', 2),
      berlin('2026-07-31T09:50:00', 2),
      berlin('2026-07-31T17:50:00', 2),
      berlin('2026-07-31T23:50:00', 2),
      berlin('2026-08-01T01:15:00', 2),
      berlin('2026-08-01T02:59:00', 2),
    ]
    for (const sample of samples) {
      assert.equal(studyDate(sample, BERLIN), expected, `failed for ${sample.toISOString()}`)
    }
  })
})

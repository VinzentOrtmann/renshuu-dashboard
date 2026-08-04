/**
 * Tests for study-day attribution.
 *
 * The boundary cases are the ones that matter — they are exactly what was wrong
 * in production twice, and neither failure was visible by reading the code.
 *
 * Note the default is midnight, established by observation: a run at 00:40
 * Berlin found renshuu's counters already reset, so the day cannot roll over
 * later than that. The offset mechanism is still tested with an explicit hour,
 * because it stays configurable.
 */

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { DEFAULT_DAY_START_HOUR, formatDateInZone, studyDate } from './studyDay.ts'

const BERLIN = 'Europe/Berlin'

/** Builds an instant from a Berlin wall-clock time, given the UTC offset. */
function berlin(iso: string, offsetHours: number): Date {
  return new Date(
    `${iso}${offsetHours >= 0 ? '+' : '-'}0${Math.abs(offsetHours)}:00`,
  )
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
  it('defaults to a midnight boundary', () => {
    assert.equal(DEFAULT_DAY_START_HOUR, 0)
  })

  it('files a late-evening capture under that same day', () => {
    assert.equal(
      studyDate(berlin('2026-08-02T21:58:00', 2), BERLIN),
      '2026-08-02',
    )
  })

  it('files a just-after-midnight capture under the new day', () => {
    // The case that broke the archive when it was attributed to the old day:
    // renshuu's counters have already reset by here, so this reading describes
    // the new day, not the one that just ended.
    assert.equal(
      studyDate(berlin('2026-08-03T00:40:00', 2), BERLIN),
      '2026-08-03',
    )
  })

  it('uses local time, not UTC', () => {
    // 22:40 UTC is still 2 August in UTC but already 3 August in Berlin.
    assert.equal(studyDate(new Date('2026-08-02T22:40:00Z'), BERLIN), '2026-08-03')
    assert.equal(studyDate(new Date('2026-08-02T22:40:00Z'), 'UTC'), '2026-08-02')
  })

  it('is stable across a day of captures', () => {
    const samples = [
      berlin('2026-08-02T00:10:00', 2),
      berlin('2026-08-02T11:01:00', 2),
      berlin('2026-08-02T18:39:00', 2),
      berlin('2026-08-02T23:59:00', 2),
    ]
    for (const sample of samples) {
      assert.equal(studyDate(sample, BERLIN), '2026-08-02')
    }
  })

  it('handles the winter offset', () => {
    assert.equal(
      studyDate(berlin('2026-12-01T00:30:00', 1), BERLIN),
      '2026-12-01',
    )
    assert.equal(
      studyDate(berlin('2026-11-30T23:30:00', 1), BERLIN),
      '2026-11-30',
    )
  })

  it('does not drift across the spring daylight-saving change', () => {
    // Europe/Berlin springs forward 02:00 -> 03:00 on 29 March 2026.
    assert.equal(
      studyDate(new Date('2026-03-29T00:30:00Z'), BERLIN),
      '2026-03-29',
    )
  })

  describe('with a non-midnight boundary', () => {
    it('maps the pre-dawn window onto the previous day', () => {
      assert.equal(
        studyDate(berlin('2026-07-31T02:59:00', 2), BERLIN, 3),
        '2026-07-30',
      )
    })

    it('rolls over exactly at the configured hour', () => {
      assert.equal(
        studyDate(berlin('2026-07-31T03:00:00', 2), BERLIN, 3),
        '2026-07-31',
      )
    })
  })
})

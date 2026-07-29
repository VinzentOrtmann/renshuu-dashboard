/**
 * Unit tests for the projection maths.
 *
 * Run with `npm test`. Uses Node's built-in test runner, so there's no test
 * framework to install — and because Node strips TypeScript types natively,
 * no build step either.
 *
 * The interesting tests here are the ones asserting that a projection is
 * *refused*. Getting a plausible number out of a straight-line fit is easy; the
 * failure mode this module has to defend against is producing a confident date
 * from data that can't support one.
 */

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  addDays,
  daysBetween,
  fitLinear,
  pacePerDay,
  projectToTarget,
  trailingWindow,
} from './projections.ts'
import type { DataPoint } from './projections.ts'

/** Builds a series starting at `start`, one point per day, rising by `perDay`. */
function series(
  start: string,
  count: number,
  from: number,
  perDay: number,
): DataPoint[] {
  return Array.from({ length: count }, (_, i) => ({
    date: addDays(start, i),
    value: from + perDay * i,
  }))
}

describe('daysBetween', () => {
  it('counts whole days', () => {
    assert.equal(daysBetween('2026-07-01', '2026-07-08'), 7)
  })

  it('is negative going backwards', () => {
    assert.equal(daysBetween('2026-07-08', '2026-07-01'), -7)
  })

  it('crosses month and year boundaries', () => {
    assert.equal(daysBetween('2026-01-31', '2026-02-01'), 1)
    assert.equal(daysBetween('2025-12-31', '2026-01-01'), 1)
  })

  it('crosses a daylight-saving change without drifting', () => {
    // Europe/Berlin springs forward on 29 March 2026. A local-time date diff
    // would come out as 30.958… days here and round to the wrong day.
    assert.equal(daysBetween('2026-03-01', '2026-04-01'), 31)
  })

  it('counts a leap day', () => {
    assert.equal(daysBetween('2028-02-28', '2028-03-01'), 2)
  })
})

describe('addDays', () => {
  it('adds within a month', () => {
    assert.equal(addDays('2026-07-01', 5), '2026-07-06')
  })

  it('rolls over a month end', () => {
    assert.equal(addDays('2026-01-31', 1), '2026-02-01')
  })

  it('handles a leap year', () => {
    assert.equal(addDays('2028-02-28', 1), '2028-02-29')
  })

  it('round-trips with daysBetween', () => {
    const start = '2026-07-29'
    assert.equal(daysBetween(start, addDays(start, 400)), 400)
  })
})

describe('fitLinear', () => {
  it('recovers the slope of a perfect line', () => {
    const fit = fitLinear(series('2026-07-01', 10, 100, 3))
    assert.ok(fit)
    assert.equal(fit.slopePerDay, 3)
    assert.equal(fit.rSquared, 1)
    assert.equal(fit.pointCount, 10)
    assert.equal(fit.spanDays, 9)
  })

  it('returns null below two points', () => {
    assert.equal(fitLinear([]), null)
    assert.equal(fitLinear([{ date: '2026-07-01', value: 1 }]), null)
  })

  it('returns null when every point is the same day', () => {
    // No time axis to regress against — this would otherwise divide by zero.
    assert.equal(
      fitLinear([
        { date: '2026-07-01', value: 1 },
        { date: '2026-07-01', value: 2 },
      ]),
      null,
    )
  })

  it('treats a flat series as slope zero, not as an error', () => {
    const fit = fitLinear(series('2026-07-01', 5, 50, 0))
    assert.ok(fit)
    assert.equal(fit.slopePerDay, 0)
    assert.equal(fit.rSquared, 1)
  })

  it('handles gaps in the series', () => {
    // A missed snapshot must not distort the slope: cumulative totals mean the
    // value still reflects the skipped day's work.
    const fit = fitLinear([
      { date: '2026-07-01', value: 0 },
      { date: '2026-07-02', value: 10 },
      { date: '2026-07-05', value: 40 },
      { date: '2026-07-06', value: 50 },
    ])
    assert.ok(fit)
    assert.equal(fit.slopePerDay, 10)
  })

  it('reports lower rSquared for a noisy series', () => {
    const noisy = fitLinear([
      { date: '2026-07-01', value: 0 },
      { date: '2026-07-02', value: 30 },
      { date: '2026-07-03', value: 5 },
      { date: '2026-07-04', value: 60 },
      { date: '2026-07-05', value: 20 },
    ])
    assert.ok(noisy)
    assert.ok(noisy.rSquared < 0.6, `expected noisy fit, got ${noisy.rSquared}`)
  })

  it('reports zero slope error with only two points', () => {
    // A line through two points is exact by construction; there is no residual
    // left to estimate uncertainty from.
    const fit = fitLinear(series('2026-07-01', 2, 0, 5))
    assert.ok(fit)
    assert.equal(fit.slopeStdError, 0)
  })
})

describe('trailingWindow', () => {
  it('keeps only points within the window of the latest', () => {
    const points = series('2026-06-01', 60, 0, 1)
    const window = trailingWindow(points, 30)
    assert.equal(window.length, 31) // inclusive of both ends
    assert.equal(window.at(-1)?.date, '2026-07-30')
    assert.equal(window[0].date, '2026-06-30')
  })

  it('returns everything when the history is shorter than the window', () => {
    const points = series('2026-07-01', 5, 0, 1)
    assert.equal(trailingWindow(points, 30).length, 5)
  })

  it('handles an empty series', () => {
    assert.deepEqual(trailingWindow([], 30), [])
  })
})

describe('projectToTarget', () => {
  it('refuses with too few points', () => {
    const result = projectToTarget(series('2026-07-01', 3, 0, 10), 100)
    assert.equal(result.status, 'insufficient-data')
    assert.equal(result.pointCount, 3)
    assert.equal(result.requiredPoints, 5)
  })

  it('refuses on a single snapshot — the day-one case', () => {
    const result = projectToTarget([{ date: '2026-07-29', value: 21 }], 100)
    assert.equal(result.status, 'insufficient-data')
  })

  it('reports completion when already at the target', () => {
    const result = projectToTarget(series('2026-07-01', 10, 95, 1), 100)
    assert.equal(result.status, 'complete')
  })

  it('refuses when the trend is flat', () => {
    const result = projectToTarget(series('2026-07-01', 10, 40, 0), 100)
    assert.equal(result.status, 'no-progress')
  })

  it('refuses when the trend is going backwards', () => {
    const result = projectToTarget(series('2026-07-01', 10, 80, -1), 100)
    assert.equal(result.status, 'no-progress')
    assert.ok(result.status === 'no-progress' && result.perDay < 0)
  })

  it('projects a clean arrival date', () => {
    // 10 days at 1%/day ends at 9%; 91 more to go at 1/day.
    const result = projectToTarget(series('2026-07-01', 10, 0, 1), 100)
    assert.equal(result.status, 'projected')
    assert.ok(result.status === 'projected')
    assert.equal(result.perDay, 1)
    assert.equal(result.daysRemaining, 91)
    assert.equal(result.date, addDays('2026-07-10', 91))
  })

  it('projects from the latest actual value, not the fitted line', () => {
    // The last point sits above the fitted line. The projection must start from
    // the real number, or the UI would show a date disagreeing with the value
    // printed beside it.
    const points: DataPoint[] = [
      { date: '2026-07-01', value: 0 },
      { date: '2026-07-02', value: 10 },
      { date: '2026-07-03', value: 20 },
      { date: '2026-07-04', value: 30 },
      { date: '2026-07-05', value: 50 },
    ]
    const result = projectToTarget(points, 100)
    assert.ok(result.status === 'projected')
    // Remaining is measured from 50, not from the line's endpoint (~41).
    assert.equal(result.daysRemaining, Math.ceil(50 / result.perDay))
  })

  it('brackets the date with a range on a noisy series', () => {
    const result = projectToTarget(
      [
        { date: '2026-07-01', value: 0 },
        { date: '2026-07-02', value: 4 },
        { date: '2026-07-03', value: 6 },
        { date: '2026-07-04', value: 14 },
        { date: '2026-07-05', value: 15 },
        { date: '2026-07-06', value: 24 },
      ],
      100,
    )
    assert.ok(result.status === 'projected')
    assert.ok(
      result.earliest <= result.date && result.date <= result.latest,
      `expected ${result.earliest} <= ${result.date} <= ${result.latest}`,
    )
  })

  it('gives a zero-width range on a perfectly linear series', () => {
    // No residual means no uncertainty, so there is nothing to widen by.
    const result = projectToTarget(series('2026-07-01', 8, 0, 2), 100)
    assert.ok(result.status === 'projected')
    assert.equal(result.earliest, result.date)
    assert.equal(result.latest, result.date)
  })

  it('does not emit a date before today when the slow bound is non-positive', () => {
    // A wide error band can push the pessimistic slope to zero or below. That
    // must not produce a nonsensical `latest` earlier than the central date.
    const result = projectToTarget(
      [
        { date: '2026-07-01', value: 0 },
        { date: '2026-07-02', value: 30 },
        { date: '2026-07-03', value: 1 },
        { date: '2026-07-04', value: 35 },
        { date: '2026-07-05', value: 2 },
        { date: '2026-07-06', value: 40 },
      ],
      100,
    )
    if (result.status === 'projected') {
      assert.ok(result.latest >= result.date)
    }
  })

  it('ignores history outside the window', () => {
    // An intense burst months ago must not prop up today's estimate.
    const old = series('2026-01-01', 10, 0, 100)
    const recent = series('2026-07-01', 10, 1000, 1)
    const result = projectToTarget([...old, ...recent], 2000, {
      windowDays: 30,
    })
    assert.ok(result.status === 'projected')
    assert.equal(result.perDay, 1)
  })

  it('honours a custom minimumPoints', () => {
    const result = projectToTarget(series('2026-07-01', 3, 0, 1), 100, {
      minimumPoints: 3,
    })
    assert.equal(result.status, 'projected')
  })
})

describe('pacePerDay', () => {
  it('returns the slope over the window', () => {
    assert.equal(pacePerDay(series('2026-07-01', 10, 0, 7)), 7)
  })

  it('returns null below the minimum', () => {
    assert.equal(pacePerDay(series('2026-07-01', 2, 0, 7)), null)
  })

  it('returns null for an empty series', () => {
    assert.equal(pacePerDay([]), null)
  })
})

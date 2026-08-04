/**
 * Deciding how a fresh snapshot merges into the archive.
 *
 * This is separated out and tested because it is where the archive can be
 * *destroyed* rather than merely wrong. A snapshot that misreads a number is a
 * bad data point; a snapshot that overwrites a completed day with zero loses
 * something no future run can recover.
 *
 * That is not hypothetical. On 2 and 3 August 2026 the archive recorded 255 and
 * 362 terms studied, built up correctly across the day, and then a run captured
 * at 00:40 the next morning was attributed to the day just ended and replaced
 * both with 0 — because renshuu's counters had already reset.
 */

import type { DailySnapshot } from '../types/history.ts'

/** What happened when a snapshot was merged in. */
export type MergeAction =
  /** No entry existed for that date. */
  | 'appended'
  /** An entry existed and this reading superseded it. */
  | 'replaced'
  /** Identical to what was stored, apart from the capture timestamp. */
  | 'unchanged'
  /**
   * Rejected: the reading showed *fewer* terms studied than what is already
   * stored for that date. See {@link mergeSnapshot} for why that is refused.
   */
  | 'rejected-lower'

export interface MergeResult {
  snapshots: DailySnapshot[]
  action: MergeAction
}

/** Structural equality, used to tell a real change from a fresh timestamp. */
export function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (
    typeof a !== 'object' ||
    typeof b !== 'object' ||
    a === null ||
    b === null
  ) {
    return false
  }
  if (Array.isArray(a) !== Array.isArray(b)) return false

  const aKeys = Object.keys(a)
  const bKeys = Object.keys(b)
  if (aKeys.length !== bKeys.length) return false

  return aKeys.every(
    (key) =>
      Object.hasOwn(b, key) &&
      deepEqual(
        (a as Record<string, unknown>)[key],
        (b as Record<string, unknown>)[key],
      ),
  )
}

/** True when two snapshots differ only by when they were captured. */
export function sameExceptCapturedAt(
  a: DailySnapshot,
  b: DailySnapshot,
): boolean {
  const { capturedAt: _a, ...restA } = a
  const { capturedAt: _b, ...restB } = b
  return deepEqual(restA, restB)
}

/**
 * Merges a snapshot into the archive, refusing anything that would lose data.
 *
 * Two rules beyond the obvious insert-or-replace:
 *
 * **A later reading may not lower a day's study count.** Within one study day
 * the counter only ever climbs, so a smaller number means the counter has
 * reset — which means the reading belongs to a *different* day than the one it
 * was labelled with. Refusing it makes the archive robust to getting the
 * day boundary wrong, rather than depending on that being exactly right.
 *
 * **A reading identical but for its timestamp writes nothing.** The script runs
 * every few hours and most runs find nothing new; without this the file would
 * churn on `capturedAt` alone.
 *
 * `snapshots` must be sorted oldest-first, and the result is kept that way.
 */
export function mergeSnapshot(
  snapshots: DailySnapshot[],
  incoming: DailySnapshot,
): MergeResult {
  const index = snapshots.findIndex((s) => s.date === incoming.date)

  if (index < 0) {
    const next = [...snapshots, incoming].sort((a, b) =>
      a.date.localeCompare(b.date),
    )
    return { snapshots: next, action: 'appended' }
  }

  const existing = snapshots[index]

  if (sameExceptCapturedAt(existing, incoming)) {
    return { snapshots, action: 'unchanged' }
  }

  if (incoming.studiedToday.all < existing.studiedToday.all) {
    return { snapshots, action: 'rejected-lower' }
  }

  const next = [...snapshots]
  next[index] = incoming
  // Re-sort so a day arriving late, after a failed run, still lands in order.
  next.sort((a, b) => a.date.localeCompare(b.date))
  return { snapshots: next, action: 'replaced' }
}

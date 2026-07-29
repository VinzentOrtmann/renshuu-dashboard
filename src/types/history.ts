/**
 * The shape of `data/history.json` — the permanent archive this project exists
 * to build.
 *
 * This is deliberately *our* format, not renshuu's. Two reasons:
 *
 *  1. It decouples years of accumulated history from renshuu's API. If they
 *     rename a field, we change the snapshot script; the archive and every
 *     chart reading it stay as they are.
 *  2. It only keeps what's worth keeping forever. Forward-looking data (the
 *     `upcoming` review forecast) is deliberately dropped — it describes a
 *     future that will have happened by tomorrow, and storing it daily would
 *     bloat the file for no benefit.
 *
 * Field names are camelCase here, versus the API's snake_case, precisely so
 * it's obvious at a glance which side of that boundary a value came from.
 */

import type { JlptLevel, StudyCategory } from './renshuu.ts'

/**
 * Bumped only if the entry shape changes incompatibly.
 *
 * Old snapshots are never rewritten — the archive is append-only — so a reader
 * encountering a lower version knows it may need to fill in gaps.
 */
export const HISTORY_VERSION = 1

/**
 * The categories we keep cumulative totals for.
 *
 * Narrower than {@link StudyCategory}: renshuu reports lifetime totals for
 * these four only, with no equivalent for conjugation practice.
 */
export type TotalledCategory = 'vocab' | 'kanji' | 'grammar' | 'sent'

/** Terms studied on the snapshot's day, per category. */
export type DailyStudyCounts = Record<StudyCategory | 'all', number>

/** Lifetime cumulative terms studied, per category. */
export type TotalStudyCounts = Record<TotalledCategory | 'all', number>

/** Percentage complete (0-100) per JLPT level, for one category. */
export type JlptProgress = Partial<Record<JlptLevel | 'n6' | 'kana' | 'kata', number>>

/** A study schedule as captured on one day. */
export interface ScheduleSnapshot {
  id: string
  name: string
  /** vocab / kanji / grammar / sent / conj. */
  booktype: StudyCategory
  /** True when the schedule is paused. */
  isFrozen: boolean
  /** Terms encountered at least once in this schedule. */
  studiedCount: number
  /** Total terms in the schedule, studied or not. */
  totalCount: number
  /** New terms introduced today. */
  newToday: number
  /** New terms introduced over the last 7 days. */
  newThisWeek: number
  /** Terms that were due for review on this day. */
  dueToday: number
}

/** Everything captured on a single day. */
export interface DailySnapshot {
  /**
   * Calendar date as YYYY-MM-DD, in the study timezone rather than UTC — see
   * `scripts/snapshot.ts` for why that distinction matters. This is the
   * archive's primary key: exactly one entry per date.
   */
  date: string
  /** Exact moment of capture, ISO 8601 UTC. Useful for spotting odd run times. */
  capturedAt: string
  /** renshuu's gamified level. */
  adventureLevel: number
  /** Terms studied on this date. Resets daily, so it is only ever captured here. */
  studiedToday: DailyStudyCounts
  /**
   * Lifetime totals as of this date.
   *
   * Cumulative rather than incremental on purpose: if a snapshot run is ever
   * missed, the next day's total still reflects the missed day's work, so the
   * long-run pace maths stay correct even with gaps in the archive.
   */
  studiedTotal: TotalStudyCounts
  /** Percentage progress through each JLPT level, per category. */
  jlptProgress: Record<TotalledCategory, JlptProgress>
  /** Consecutive days studied, per category. */
  dayStreaks: Partial<Record<StudyCategory, number>>
  /** Per-schedule progress. */
  schedules: ScheduleSnapshot[]
}

/** The top level of `data/history.json`. */
export interface History {
  version: number
  /** Always sorted oldest-first, one entry per date. */
  snapshots: DailySnapshot[]
}

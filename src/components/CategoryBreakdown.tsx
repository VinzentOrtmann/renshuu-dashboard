/**
 * How the four categories compare — both what you know and how fast each is
 * moving.
 *
 * Three sections, deliberately ordered by how much archive they need:
 *
 *   1. Composition — what you know right now. Works from a single snapshot.
 *   2. Pace — terms per day per category. Needs about a week.
 *   3. Schedules — per-deck detail, grouped by category. Works from one snapshot.
 *
 * So the card is useful on day one and gets richer, rather than being an empty
 * frame until enough history accumulates.
 */

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

import {
  BOOKTYPE_LABELS,
  CATEGORY_LABELS,
  SERIES_CATEGORIES,
  SERIES_COLOR_VARS,
} from '../lib/palette.ts'
import type { SeriesCategory } from '../lib/palette.ts'
import { pacePerDay } from '../lib/projections.ts'
import type { DataPoint } from '../lib/projections.ts'
import type { DailySnapshot, ScheduleSnapshot } from '../types/history.ts'
import { Card } from './ProgressChart.tsx'

/**
 * Schedules that are really the kana syllabaries.
 *
 * renshuu files Hiragana and Katakana under `booktype: vocab`, so they silently
 * inflate the vocabulary count — on a real account that's 208 terms of kana
 * counted as vocabulary. They're flagged rather than removed: dropping them
 * would make the numbers here disagree with renshuu's own, which is worse than
 * explaining the discrepancy.
 */
const KANA_SCHEDULE_NAMES = ['hiragana', 'katakana']

function isKanaSchedule(schedule: ScheduleSnapshot): boolean {
  return KANA_SCHEDULE_NAMES.includes(schedule.name.trim().toLowerCase())
}

interface CategoryBreakdownProps {
  snapshots: DailySnapshot[]
}

export function CategoryBreakdown({ snapshots }: CategoryBreakdownProps) {
  const latest = snapshots.at(-1)
  if (!latest) return null

  return (
    <Card
      title="Category breakdown"
      subtitle="What you know, and where the movement is"
    >
      <Composition latest={latest} />
      <PaceComparison snapshots={snapshots} />
      <ScheduleTable latest={latest} />
    </Card>
  )
}

/**
 * Part-to-whole of everything studied.
 *
 * A stacked bar rather than a pie: at these proportions (vocab is two-thirds of
 * the total) a pie makes the three small slices impossible to compare, and
 * comparing them is the entire point.
 */
function Composition({ latest }: { latest: DailySnapshot }) {
  const total = latest.studiedTotal.all
  if (total <= 0) return null

  return (
    <section>
      <h3 className="text-sm font-medium text-[var(--text-primary)]">
        Composition
      </h3>
      <p className="mt-0.5 text-sm text-[var(--text-muted)]">
        {total.toLocaleString()} terms studied, all time
      </p>

      {/* The 2px gaps are the surface showing through — that's what separates
          the segments. A border drawn around each one would add ink that isn't
          data. */}
      <div className="mt-3 flex h-6 gap-[2px] overflow-hidden rounded-md">
        {SERIES_CATEGORIES.map((category) => {
          const value = latest.studiedTotal[category]
          if (value <= 0) return null
          return (
            <div
              key={category}
              title={`${CATEGORY_LABELS[category]}: ${value.toLocaleString()} (${Math.round((value / total) * 100)}%)`}
              style={{
                width: `${(value / total) * 100}%`,
                background: SERIES_COLOR_VARS[category],
              }}
            />
          )
        })}
      </div>

      <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-2">
        {SERIES_CATEGORIES.map((category) => (
          <li
            key={category}
            className="flex items-center gap-2 text-sm text-[var(--text-secondary)]"
          >
            <span
              aria-hidden="true"
              className="h-2.5 w-2.5 rounded-[2px]"
              style={{ background: SERIES_COLOR_VARS[category] }}
            />
            {CATEGORY_LABELS[category]}
            {/* The value rides beside the swatch rather than inside the
                segment: the narrow segments here cannot fit a legible label,
                and a clipped label is worse than none. */}
            <span className="tabular-nums text-[var(--text-muted)]">
              {latest.studiedTotal[category].toLocaleString()}
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}

/** Terms gained per day, per category, over the trailing window. */
function PaceComparison({ snapshots }: { snapshots: DailySnapshot[] }) {
  const rows = SERIES_CATEGORIES.map((category) => {
    const points: DataPoint[] = snapshots.map((snapshot) => ({
      date: snapshot.date,
      value: snapshot.studiedTotal[category],
    }))
    return {
      category,
      label: CATEGORY_LABELS[category],
      pace: pacePerDay(points),
    }
  })

  const measurable = rows.filter(
    (row): row is typeof row & { pace: number } => row.pace !== null,
  )

  return (
    <section className="mt-8 border-t border-[var(--gridline)] pt-6">
      <h3 className="text-sm font-medium text-[var(--text-primary)]">Pace</h3>
      <p className="mt-0.5 text-sm text-[var(--text-muted)]">
        New terms per day, fitted over the last 30 days
      </p>

      {measurable.length === 0 ? (
        <p className="mt-3 text-sm text-[var(--text-muted)]">
          Not enough history yet — pace needs about five days of snapshots
          before it means anything.
        </p>
      ) : (
        <>
          <div className="mt-3 h-52 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={measurable}
                layout="vertical"
                margin={{ top: 4, right: 16, bottom: 4, left: 0 }}
              >
                <CartesianGrid
                  stroke="var(--gridline)"
                  strokeWidth={1}
                  horizontal={false}
                />
                <XAxis
                  type="number"
                  tick={{ fill: 'var(--text-muted)', fontSize: 12 }}
                  stroke="var(--axis)"
                  tickLine={false}
                />
                <YAxis
                  type="category"
                  dataKey="label"
                  width={92}
                  tick={{ fill: 'var(--text-muted)', fontSize: 12 }}
                  stroke="var(--axis)"
                  tickLine={false}
                />
                <Tooltip content={<PaceTooltip />} cursor={false} />
                <Bar
                  dataKey="pace"
                  // Capped rather than filling the band, so the leftover is air.
                  barSize={20}
                  // Rounded at the data end, square at the baseline.
                  radius={[0, 4, 4, 0]}
                  isAnimationActive={false}
                >
                  {/* Colour follows the entity, so vocabulary is the same blue
                      here as on every other chart. */}
                  {measurable.map((row) => (
                    <Cell
                      key={row.category}
                      fill={SERIES_COLOR_VARS[row.category]}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          <PaceTable rows={measurable} />
        </>
      )}
    </section>
  )
}

function PaceTooltip({
  active,
  payload,
}: {
  active?: boolean
  payload?: { payload?: { label?: string; pace?: number } }[]
}) {
  const row = payload?.[0]?.payload
  if (!active || !row) return null

  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-1)] px-3 py-2 text-sm shadow-lg">
      <p className="font-medium text-[var(--text-primary)]">{row.label}</p>
      <p className="text-[var(--text-secondary)]">
        {row.pace?.toFixed(2)} terms/day
      </p>
    </div>
  )
}

/** Plain-text twin of the pace bars. */
function PaceTable({
  rows,
}: {
  rows: { category: SeriesCategory; label: string; pace: number }[]
}) {
  return (
    <table className="mt-4 w-full text-left text-sm tabular-nums">
      <thead className="text-[var(--text-muted)]">
        <tr>
          <th scope="col" className="py-1 pr-4 font-medium">
            Category
          </th>
          <th scope="col" className="py-1 pr-4 font-medium">
            Terms/day
          </th>
          <th scope="col" className="py-1 font-medium">
            Per week
          </th>
        </tr>
      </thead>
      <tbody className="text-[var(--text-secondary)]">
        {rows.map((row) => (
          <tr key={row.category} className="border-t border-[var(--gridline)]">
            <th scope="row" className="py-1.5 pr-4 font-normal">
              {row.label}
            </th>
            <td className="py-1.5 pr-4">{row.pace.toFixed(2)}</td>
            <td className="py-1.5">{(row.pace * 7).toFixed(1)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

/** Per-schedule progress, grouped by the category the schedule drills. */
function ScheduleTable({ latest }: { latest: DailySnapshot }) {
  // Group by booktype. This is only possible because the API sends a booktype
  // per schedule — it isn't in renshuu's published spec, but it's always there.
  const groups = new Map<string, ScheduleSnapshot[]>()
  for (const schedule of latest.schedules) {
    const list = groups.get(schedule.booktype) ?? []
    list.push(schedule)
    groups.set(schedule.booktype, list)
  }

  const hasKana = latest.schedules.some(isKanaSchedule)

  return (
    <section className="mt-8 border-t border-[var(--gridline)] pt-6">
      <h3 className="text-sm font-medium text-[var(--text-primary)]">
        Schedules
      </h3>
      <p className="mt-0.5 text-sm text-[var(--text-muted)]">
        {latest.schedules.length} schedules, grouped by what they drill
      </p>

      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="text-[var(--text-muted)]">
            <tr>
              <th scope="col" className="py-1 pr-4 font-medium">
                Schedule
              </th>
              <th scope="col" className="py-1 pr-4 font-medium">
                Studied
              </th>
              <th scope="col" className="py-1 pr-4 font-medium">
                Total
              </th>
              <th scope="col" className="py-1 font-medium">
                Due today
              </th>
            </tr>
          </thead>
          {[...groups.entries()].map(([booktype, schedules]) => (
            <tbody key={booktype}>
              <tr>
                <th
                  scope="colgroup"
                  colSpan={4}
                  className="border-t border-[var(--gridline)] pt-3 pb-1 text-left text-xs font-semibold tracking-wide text-[var(--text-primary)] uppercase"
                >
                  {BOOKTYPE_LABELS[booktype] ?? booktype}
                </th>
              </tr>
              {schedules.map((schedule) => (
                <tr key={schedule.id} className="text-[var(--text-secondary)]">
                  <th scope="row" className="py-1 pr-4 font-normal">
                    {schedule.name}
                    {schedule.isFrozen && (
                      <span className="ml-2 text-xs text-[var(--text-muted)]">
                        frozen
                      </span>
                    )}
                    {isKanaSchedule(schedule) && (
                      <span className="ml-2 text-xs text-[var(--text-muted)]">
                        kana
                      </span>
                    )}
                  </th>
                  <td className="py-1 pr-4 tabular-nums">
                    {schedule.studiedCount.toLocaleString()}
                  </td>
                  <td className="py-1 pr-4 tabular-nums">
                    {schedule.totalCount.toLocaleString()}
                  </td>
                  <td className="py-1 tabular-nums">{schedule.dueToday}</td>
                </tr>
              ))}
            </tbody>
          ))}
        </table>
      </div>

      {hasKana && (
        <p className="mt-4 text-sm text-[var(--text-muted)]">
          Note: renshuu files the kana syllabaries under vocabulary, so the
          vocabulary figures above include hiragana and katakana.
        </p>
      )}

      <p className="mt-2 text-sm text-[var(--text-muted)]">
        These per-schedule counts sum higher than the lifetime total, because a
        term appearing in two schedules is counted in each. The composition
        figures above are the account-wide numbers.
      </p>
    </section>
  )
}

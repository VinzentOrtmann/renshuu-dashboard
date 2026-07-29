/**
 * GitHub-contributions-style grid of daily study activity.
 *
 * ## The distinction this component exists to preserve
 *
 * A day the archive never captured is NOT a day you studied nothing — and
 * conflating the two would quietly libel your study record. Since the archive
 * only starts the day the workflow first ran, most of the grid is genuinely
 * unknown rather than zero.
 *
 * So there are three visual states, not two:
 *   - no snapshot  -> an empty outline (we have no idea)
 *   - studied zero -> the ramp's lowest filled step (we know: nothing)
 *   - studied N    -> a step up the ramp
 */

import { useState } from 'react'

import { formatLongDate } from '../lib/history.ts'
import {
  HEATMAP_LEVEL_LABELS,
  HEATMAP_STEPS,
  heatmapColorVar,
  heatmapLevel,
} from '../lib/palette.ts'
import type { DailySnapshot } from '../types/history.ts'
import { Card } from './ProgressChart.tsx'

/** How many weeks of history the grid shows. */
const WEEKS_SHOWN = 26

/** Monday-first, matching the European convention. */
const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

/**
 * Formats a Date as YYYY-MM-DD using its *local* parts.
 *
 * `toISOString()` would convert to UTC first, shifting the date by a day for
 * anyone east of Greenwich for part of the day — which would silently misalign
 * every cell in the grid against the archive's dates.
 */
function toDateKey(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/** One cell of the grid. */
interface Day {
  key: string
  /** Undefined when the archive has no entry for this date. */
  count: number | undefined
  /** True for dates after today, which are rendered as blank spacers. */
  future: boolean
}

/**
 * Builds the grid as an array of weeks, each holding seven days (Mon-Sun).
 *
 * The grid always ends on the current week so "today" sits in the last column,
 * which is what makes the shape read as a calendar rather than a bar chart.
 */
function buildWeeks(snapshots: DailySnapshot[]): Day[][] {
  const byDate = new Map(snapshots.map((s) => [s.date, s.studiedToday.all]))

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const todayKey = toDateKey(today)

  // Walk back to the Monday of the current week. getDay() is 0 for Sunday, so
  // Sunday needs to go back 6 days rather than forward.
  const startOfThisWeek = new Date(today)
  const dayOfWeek = (today.getDay() + 6) % 7
  startOfThisWeek.setDate(today.getDate() - dayOfWeek)

  const firstDay = new Date(startOfThisWeek)
  firstDay.setDate(startOfThisWeek.getDate() - (WEEKS_SHOWN - 1) * 7)

  const weeks: Day[][] = []
  const cursor = new Date(firstDay)

  for (let week = 0; week < WEEKS_SHOWN; week++) {
    const days: Day[] = []
    for (let day = 0; day < 7; day++) {
      const key = toDateKey(cursor)
      days.push({ key, count: byDate.get(key), future: key > todayKey })
      cursor.setDate(cursor.getDate() + 1)
    }
    weeks.push(days)
  }

  return weeks
}

interface ActivityHeatmapProps {
  snapshots: DailySnapshot[]
}

export function ActivityHeatmap({ snapshots }: ActivityHeatmapProps) {
  const [showTable, setShowTable] = useState(false)

  const weeks = buildWeeks(snapshots)
  const recorded = snapshots.length

  return (
    <Card
      title="Study activity"
      subtitle={`Terms studied per day, last ${WEEKS_SHOWN} weeks`}
      action={
        <button
          type="button"
          onClick={() => setShowTable(!showTable)}
          className="rounded-md border border-[var(--border)] px-2.5 py-1 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
        >
          {showTable ? 'Show grid' : 'Show table'}
        </button>
      }
    >
      {showTable ? (
        <HeatmapTable snapshots={snapshots} />
      ) : (
        <>
          {/* The grid scrolls inside its own box on narrow screens, so the page
              itself never scrolls sideways. */}
          <div className="overflow-x-auto pb-1">
            <div className="flex gap-3">
              {/* Weekday labels. Only alternate ones are shown — seven stacked
                  3-letter labels beside 14px cells is denser than it is useful. */}
              <ul className="grid shrink-0 grid-rows-7 gap-[3px] pt-0.5 text-[10px] text-[var(--text-muted)]">
                {WEEKDAY_LABELS.map((label, index) => (
                  <li key={label} className="h-[14px] leading-[14px]">
                    {index % 2 === 0 ? label : ''}
                  </li>
                ))}
              </ul>

              <div className="flex gap-[3px]">
                {weeks.map((week) => (
                  <div key={week[0].key} className="grid grid-rows-7 gap-[3px]">
                    {week.map((day) => (
                      <Cell key={day.key} day={day} />
                    ))}
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-4">
            <RampLegend />
            <p className="text-sm text-[var(--text-muted)]">
              {recorded === 1
                ? 'Archive starts today — outlined days are before it began, not days off.'
                : `${recorded} days recorded.`}
            </p>
          </div>
        </>
      )}
    </Card>
  )
}

function Cell({ day }: { day: Day }) {
  // Future days in the current week are spacers, so the last column keeps its
  // shape without implying anything about days that haven't happened.
  if (day.future) {
    return <div className="h-[14px] w-[14px]" />
  }

  const known = day.count !== undefined

  const title = known
    ? `${formatLongDate(day.key)} — ${day.count} ${day.count === 1 ? 'term' : 'terms'}`
    : `${formatLongDate(day.key)} — no snapshot`

  return (
    <div
      title={title}
      className={
        known
          ? 'h-[14px] w-[14px] rounded-[3px]'
          : // Unknown days: an outline, never a fill. A filled cell at the
            // bottom of the ramp would read as a recorded zero.
            'h-[14px] w-[14px] rounded-[3px] border border-[var(--gridline)]'
      }
      style={
        known
          ? { background: heatmapColorVar(heatmapLevel(day.count ?? 0)) }
          : undefined
      }
    />
  )
}

function RampLegend() {
  return (
    <div className="flex items-center gap-2 text-sm text-[var(--text-muted)]">
      <span
        aria-hidden="true"
        className="h-[14px] w-[14px] rounded-[3px] border border-[var(--gridline)]"
      />
      <span className="mr-2">No data</span>
      <span>Less</span>
      {Array.from({ length: HEATMAP_STEPS }, (_, level) => (
        <span
          key={level}
          title={HEATMAP_LEVEL_LABELS[level]}
          aria-hidden="true"
          className="h-[14px] w-[14px] rounded-[3px]"
          style={{ background: heatmapColorVar(level) }}
        />
      ))}
      <span>More</span>
    </div>
  )
}

/** Plain-text twin of the grid, so no value is reachable only by hovering. */
function HeatmapTable({ snapshots }: { snapshots: DailySnapshot[] }) {
  if (snapshots.length === 0) return null

  return (
    <div className="max-h-72 overflow-auto">
      <table className="w-full text-left text-sm tabular-nums">
        <thead className="sticky top-0 bg-[var(--surface-1)] text-[var(--text-muted)]">
          <tr>
            <th scope="col" className="py-2 pr-4 font-medium">
              Date
            </th>
            <th scope="col" className="py-2 pr-4 font-medium">
              Terms studied
            </th>
          </tr>
        </thead>
        <tbody className="text-[var(--text-secondary)]">
          {[...snapshots].reverse().map((snapshot) => (
            <tr key={snapshot.date} className="border-t border-[var(--gridline)]">
              <th scope="row" className="py-2 pr-4 font-normal">
                {formatLongDate(snapshot.date)}
              </th>
              <td className="py-2 pr-4">{snapshot.studiedToday.all}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

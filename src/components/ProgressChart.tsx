/**
 * Cumulative terms studied over time, one line per category.
 *
 * ## Why this shape
 *
 * The brief called this "XP/level over time", but renshuu's API has no XP field
 * at all — only `adventure_level`, which moves rarely and in whole steps. The
 * lifetime `total_*` counts are the honest continuous measure of progress, and
 * they're already split by category, which makes the comparison in the brief
 * possible on one chart.
 *
 * One y-axis, always. It's tempting to put `adventureLevel` on a second axis so
 * both fit here — don't. Two scales on one plot means the reader sees a
 * relationship whose steepness you chose arbitrarily, which invents a
 * correlation the data doesn't contain. Level gets its own tile above instead.
 */

import { useState } from 'react'
import {
  CartesianGrid,
  Label,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

import { formatLongDate, formatShortDate } from '../lib/history.ts'
import {
  CATEGORY_LABELS,
  SERIES_CATEGORIES,
  SERIES_COLOR_VARS,
} from '../lib/palette.ts'
import type { DailySnapshot } from '../types/history.ts'

interface ProgressChartProps {
  snapshots: DailySnapshot[]
}

export function ProgressChart({ snapshots }: ProgressChartProps) {
  const [showTable, setShowTable] = useState(false)

  const latest = snapshots.at(-1)

  // A line needs two points to be a line. With one day of history there is no
  // trend to draw, so show the numbers themselves rather than a chart frame
  // containing a single invisible dot.
  if (!latest) return null
  if (snapshots.length < 2) {
    return (
      <Card
        title="Cumulative progress"
        subtitle="Total terms studied, all time"
      >
        <SingleDayTotals snapshot={latest} />
        <p className="mt-6 text-sm text-[var(--text-muted)]">
          The trend chart appears once there are at least two days in the
          archive — one point can&apos;t show a direction. The next snapshot
          runs tonight.
        </p>
      </Card>
    )
  }

  // Recharts wants one flat object per x-position, with a key per series.
  const rows = snapshots.map((snapshot) => ({
    date: snapshot.date,
    vocab: snapshot.studiedTotal.vocab,
    kanji: snapshot.studiedTotal.kanji,
    grammar: snapshot.studiedTotal.grammar,
    sent: snapshot.studiedTotal.sent,
  }))

  return (
    <Card
      title="Cumulative progress"
      subtitle="Total terms studied, all time"
      action={
        <TableToggle showTable={showTable} onToggle={() => setShowTable(!showTable)} />
      }
    >
      {showTable ? (
        <ProgressTable snapshots={snapshots} />
      ) : (
        <>
          {/* Height lives on the wrapper, not the chart, so the x-axis labels
              are inside the box. Sizing the plot alone leaves the axis to
              overflow and the card grows a tiny nested scrollbar. */}
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={rows}
                margin={{ top: 8, right: 56, bottom: 8, left: 0 }}
              >
                <CartesianGrid
                  stroke="var(--gridline)"
                  strokeWidth={1}
                  vertical={false}
                />
                <XAxis
                  dataKey="date"
                  tickFormatter={formatShortDate}
                  tick={{ fill: 'var(--text-muted)', fontSize: 12 }}
                  stroke="var(--axis)"
                  tickLine={false}
                />
                <YAxis
                  width={56}
                  tick={{ fill: 'var(--text-muted)', fontSize: 12 }}
                  stroke="var(--axis)"
                  tickLine={false}
                  tickFormatter={(value: number) => value.toLocaleString()}
                />
                <Tooltip
                  content={<ProgressTooltip />}
                  // Follow the x-position rather than requiring a direct hit on
                  // a 2px line, which is an unreasonably small target.
                  cursor={{ stroke: 'var(--axis)', strokeWidth: 1 }}
                />
                {SERIES_CATEGORIES.map((category) => (
                  <Line
                    key={category}
                    type="monotone"
                    dataKey={category}
                    stroke={SERIES_COLOR_VARS[category]}
                    strokeWidth={2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    // No dot per point: with months of data they merge into a
                    // dotted mess. The tooltip covers reading individual days.
                    dot={false}
                    activeDot={{ r: 4, strokeWidth: 2, stroke: 'var(--surface-1)' }}
                    isAnimationActive={false}
                  >
                    {/* Direct end-labels are not decoration here. Two of the
                        four series sit below 3:1 contrast on the light
                        surface, so identity must not rest on colour alone. */}
                    <Label
                      value={CATEGORY_LABELS[category]}
                      position="right"
                      fill="var(--text-secondary)"
                      fontSize={12}
                    />
                  </Line>
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
          <Legend />
        </>
      )}
    </Card>
  )
}

/** Tooltip listing every series for the hovered day. */
function ProgressTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean
  payload?: { dataKey?: string | number; value?: number }[]
  label?: string
}) {
  if (!active || !payload?.length || !label) return null

  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-1)] px-3 py-2 text-sm shadow-lg">
      <p className="font-medium text-[var(--text-primary)]">
        {formatLongDate(label)}
      </p>
      <ul className="mt-1 space-y-0.5">
        {payload.map((entry) => (
          <li
            key={String(entry.dataKey)}
            className="flex items-center justify-between gap-4 text-[var(--text-secondary)]"
          >
            <span>{CATEGORY_LABELS[entry.dataKey as keyof typeof CATEGORY_LABELS]}</span>
            <span className="tabular-nums">{entry.value?.toLocaleString()}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

/** Legend: a colour key that never asks the reader to match hues from memory. */
function Legend() {
  return (
    <ul className="mt-4 flex flex-wrap gap-x-5 gap-y-2">
      {SERIES_CATEGORIES.map((category) => (
        <li
          key={category}
          className="flex items-center gap-2 text-sm text-[var(--text-secondary)]"
        >
          <span
            aria-hidden="true"
            className="h-0.5 w-4 rounded-full"
            style={{ background: SERIES_COLOR_VARS[category] }}
          />
          {CATEGORY_LABELS[category]}
        </li>
      ))}
    </ul>
  )
}

/** The day-one view: the numbers, since there's no trend to plot yet. */
function SingleDayTotals({ snapshot }: { snapshot: DailySnapshot }) {
  return (
    <>
      <div className="flex flex-wrap items-baseline gap-x-3">
        {/* The one number the dashboard leads with. */}
        <span className="text-5xl font-semibold text-[var(--text-primary)]">
          {snapshot.studiedTotal.all.toLocaleString()}
        </span>
        <span className="text-[var(--text-secondary)]">terms studied so far</span>
      </div>
      <dl className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        {SERIES_CATEGORIES.map((category) => (
          <div key={category}>
            <dt className="text-sm text-[var(--text-muted)]">
              {CATEGORY_LABELS[category]}
            </dt>
            <dd className="mt-1 text-2xl font-semibold text-[var(--text-primary)]">
              {snapshot.studiedTotal[category].toLocaleString()}
            </dd>
          </div>
        ))}
      </dl>
    </>
  )
}

/** The chart's accessible twin — every plotted value as plain text. */
function ProgressTable({ snapshots }: { snapshots: DailySnapshot[] }) {
  return (
    // The wrapper scrolls, not the page, so a wide table can't push the whole
    // layout sideways on a phone.
    <div className="max-h-72 overflow-auto">
      <table className="w-full text-left text-sm tabular-nums">
        <thead className="sticky top-0 bg-[var(--surface-1)] text-[var(--text-muted)]">
          <tr>
            <th scope="col" className="py-2 pr-4 font-medium">
              Date
            </th>
            {SERIES_CATEGORIES.map((category) => (
              <th key={category} scope="col" className="py-2 pr-4 font-medium">
                {CATEGORY_LABELS[category]}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="text-[var(--text-secondary)]">
          {[...snapshots].reverse().map((snapshot) => (
            <tr key={snapshot.date} className="border-t border-[var(--gridline)]">
              <th scope="row" className="py-2 pr-4 font-normal">
                {formatShortDate(snapshot.date)}
              </th>
              {SERIES_CATEGORIES.map((category) => (
                <td key={category} className="py-2 pr-4">
                  {snapshot.studiedTotal[category].toLocaleString()}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function TableToggle({
  showTable,
  onToggle,
}: {
  showTable: boolean
  onToggle: () => void
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="rounded-md border border-[var(--border)] px-2.5 py-1 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
    >
      {showTable ? 'Show chart' : 'Show table'}
    </button>
  )
}

/** Shared card chrome, so every panel on the dashboard sits in the same box. */
export function Card({
  title,
  subtitle,
  action,
  children,
}: {
  title: string
  subtitle?: string
  action?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section className="rounded-xl border border-[var(--border)] bg-[var(--surface-1)] p-6">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-[var(--text-primary)]">
            {title}
          </h2>
          {subtitle && (
            <p className="mt-0.5 text-sm text-[var(--text-muted)]">{subtitle}</p>
          )}
        </div>
        {action}
      </div>
      {children}
    </section>
  )
}

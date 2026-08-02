/**
 * Terms studied over time, one line per category.
 *
 * ## Why this shape
 *
 * The brief called this "XP/level over time", but renshuu's API has no XP field
 * at all — only `adventure_level`, which moves rarely and in whole steps. The
 * lifetime `total_*` counts are the honest continuous measure of progress, and
 * they're already split by category, which makes the comparison possible on one
 * chart.
 *
 * One y-axis, always. It's tempting to give the small categories their own
 * scale so they're easier to read — don't. Two scales on one plot means the
 * reader sees a relationship whose steepness you chose arbitrarily. The
 * Absolute/Change toggle below is the honest way to solve the same problem.
 *
 *
 * ## Why there are no labels at the line ends
 *
 * There were, and they were broken: Recharts places a `<Label>` inside a
 * `<Line>` at one fixed spot rather than at that series' own endpoint, so all
 * four landed on the same pixel, stacked on top of each other.
 *
 * Rather than compute collision-avoiding positions against Recharts' internal
 * scales, the endpoint value now rides in the legend. That carries the same two
 * pieces of information — which colour is which, and where each series ended —
 * with no possibility of overlap, because the legend is laid out by the browser
 * rather than positioned by hand.
 */

import { useState } from 'react'
import {
  CartesianGrid,
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
import type { SeriesCategory } from '../lib/palette.ts'
import type { DailySnapshot } from '../types/history.ts'

/**
 * What the y-axis measures.
 *
 * `absolute` plots the running lifetime totals. It answers "how much do I
 * know", but the categories are orders of magnitude apart — around 2,700
 * vocabulary against 235 grammar — so a week of grammar study is a flat line
 * next to the vocabulary curve, and recent movement is invisible.
 *
 * `change` re-bases every series to zero at the start of the archive, so all
 * four start together and the chart shows what has actually happened since.
 * The disparity in *totals* stops crowding out the *movement*.
 */
type Mode = 'absolute' | 'change'

interface ProgressChartProps {
  snapshots: DailySnapshot[]
}

export function ProgressChart({ snapshots }: ProgressChartProps) {
  const [mode, setMode] = useState<Mode>('absolute')
  const [showTable, setShowTable] = useState(false)

  const latest = snapshots.at(-1)
  const first = snapshots[0]

  // A line needs two points to be a line. With one day of history there is no
  // trend to draw, so show the numbers themselves rather than a chart frame
  // containing a single invisible dot.
  if (!latest || !first) return null
  if (snapshots.length < 2) {
    return (
      <Card title="Cumulative progress" subtitle="Total terms studied, all time">
        <SingleDayTotals snapshot={latest} />
        <p className="mt-6 text-sm text-[var(--text-muted)]">
          The trend chart appears once there are at least two days in the
          archive — one point can&apos;t show a direction.
        </p>
      </Card>
    )
  }

  /** In change mode every series is measured from its own first value. */
  const valueFor = (snapshot: DailySnapshot, category: SeriesCategory) =>
    mode === 'absolute'
      ? snapshot.studiedTotal[category]
      : snapshot.studiedTotal[category] - first.studiedTotal[category]

  // Recharts wants one flat object per x-position, with a key per series.
  const rows = snapshots.map((snapshot) => ({
    date: snapshot.date,
    vocab: valueFor(snapshot, 'vocab'),
    kanji: valueFor(snapshot, 'kanji'),
    grammar: valueFor(snapshot, 'grammar'),
    sent: valueFor(snapshot, 'sent'),
  }))

  return (
    <Card
      title="Cumulative progress"
      subtitle={
        mode === 'absolute'
          ? 'Total terms studied, all time'
          : `Terms gained since ${formatShortDate(first.date)}`
      }
      action={
        <div className="flex items-center gap-2">
          <ModeToggle mode={mode} onChange={setMode} />
          <ToggleButton onClick={() => setShowTable(!showTable)}>
            {showTable ? 'Show chart' : 'Show table'}
          </ToggleButton>
        </div>
      }
    >
      {showTable ? (
        <ProgressTable snapshots={snapshots} valueFor={valueFor} mode={mode} />
      ) : (
        <>
          {/* Height lives on the wrapper, not the chart, so the x-axis labels
              are inside the box. Sizing the plot alone leaves the axis to
              overflow and the card grows a tiny nested scrollbar. */}
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={rows}
                margin={{ top: 8, right: 12, bottom: 8, left: 0 }}
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
                  content={<ProgressTooltip mode={mode} />}
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
                    activeDot={{
                      r: 4,
                      strokeWidth: 2,
                      stroke: 'var(--surface-1)',
                    }}
                    isAnimationActive={false}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>

          <Legend latest={latest} valueFor={valueFor} mode={mode} />
        </>
      )}
    </Card>
  )
}

/** Formats a value for display, signing it in change mode. */
function formatValue(value: number, mode: Mode): string {
  const formatted = Math.abs(value).toLocaleString()
  if (mode === 'absolute') return value.toLocaleString()
  if (value > 0) return `+${formatted}`
  if (value < 0) return `-${formatted}`
  return '0'
}

function ModeToggle({
  mode,
  onChange,
}: {
  mode: Mode
  onChange: (mode: Mode) => void
}) {
  return (
    // A two-option segmented control. `group` semantics keep it announced as a
    // set rather than as two unrelated buttons.
    <div
      role="group"
      aria-label="Chart scale"
      className="flex overflow-hidden rounded-md border border-[var(--border)]"
    >
      {(['absolute', 'change'] as const).map((option) => (
        <button
          key={option}
          type="button"
          onClick={() => onChange(option)}
          aria-pressed={mode === option}
          className={
            mode === option
              ? 'bg-[var(--meter-track)] px-2.5 py-1 text-sm text-[var(--text-primary)]'
              : 'px-2.5 py-1 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
          }
        >
          {option === 'absolute' ? 'Absolute' : 'Change'}
        </button>
      ))}
    </div>
  )
}

function ToggleButton({
  onClick,
  children,
}: {
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-md border border-[var(--border)] px-2.5 py-1 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
    >
      {children}
    </button>
  )
}

/** Tooltip listing every series for the hovered day. */
function ProgressTooltip({
  active,
  payload,
  label,
  mode,
}: {
  active?: boolean
  payload?: { dataKey?: string | number; value?: number }[]
  label?: string
  mode: Mode
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
            <span>
              {CATEGORY_LABELS[entry.dataKey as keyof typeof CATEGORY_LABELS]}
            </span>
            <span className="tabular-nums">
              {formatValue(entry.value ?? 0, mode)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

/**
 * Legend, carrying each series' latest value.
 *
 * This is the identity channel *and* the endpoint labels in one. Laid out by
 * the browser, so unlike labels positioned inside the plot it cannot overlap
 * however close the lines get.
 */
function Legend({
  latest,
  valueFor,
  mode,
}: {
  latest: DailySnapshot
  valueFor: (snapshot: DailySnapshot, category: SeriesCategory) => number
  mode: Mode
}) {
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
          <span className="tabular-nums text-[var(--text-primary)]">
            {formatValue(valueFor(latest, category), mode)}
          </span>
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
        <span className="text-[var(--text-secondary)]">
          terms studied so far
        </span>
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
function ProgressTable({
  snapshots,
  valueFor,
  mode,
}: {
  snapshots: DailySnapshot[]
  valueFor: (snapshot: DailySnapshot, category: SeriesCategory) => number
  mode: Mode
}) {
  return (
    // The wrapper scrolls, not the page, so a wide table can't push the whole
    // layout sideways on a phone.
    <div className="max-h-72 overflow-auto">
      <table className="w-full text-left text-sm tabular-nums">
        <caption className="sr-only">
          {mode === 'absolute'
            ? 'Total terms studied per category, by date'
            : 'Terms gained per category since the archive began, by date'}
        </caption>
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
            <tr
              key={snapshot.date}
              className="border-t border-[var(--gridline)]"
            >
              <th scope="row" className="py-2 pr-4 font-normal">
                {formatShortDate(snapshot.date)}
              </th>
              {SERIES_CATEGORIES.map((category) => (
                <td key={category} className="py-2 pr-4">
                  {formatValue(valueFor(snapshot, category), mode)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
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
    // Tighter padding on phones: 24px of padding each side costs a quarter of
    // a 375px screen before any content is drawn.
    <section className="rounded-xl border border-[var(--border)] bg-[var(--surface-1)] p-4 sm:p-6">
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

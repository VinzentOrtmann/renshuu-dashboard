/**
 * "At current pace, you'll finish N3 vocabulary on <date>."
 *
 * This is the clearest example of what the project is for. renshuu shows you
 * that you're 21% through N3 vocabulary; it does not tell you how fast that
 * number is moving or when it lands on 100, because it doesn't keep the daily
 * series needed to work it out. This archive does.
 *
 * The maths lives in lib/projections.ts and is unit-tested. This file only
 * decides what to show for each outcome — including the outcomes where the
 * honest answer is "not yet".
 */

import {
  formatLongDate,
  formatShortDate,
} from '../lib/history.ts'
import { ceilingFor, isLevelComplete, useCeilings } from '../lib/ceilings.ts'
import type { CeilingsState } from '../lib/ceilings.ts'
import { levelPercent, nextLevel } from '../lib/levels.ts'
import type { Level } from '../lib/levels.ts'
import { CATEGORY_LABELS, SERIES_CATEGORIES } from '../lib/palette.ts'
import { projectToTarget } from '../lib/projections.ts'
import type { DataPoint, ProjectionResult } from '../lib/projections.ts'
import type { SeriesCategory } from '../lib/palette.ts'
import type { DailySnapshot } from '../types/history.ts'
import { Card } from './ProgressChart.tsx'

/** Percentage series for one category/level pair, oldest first. */
function seriesFor(
  snapshots: DailySnapshot[],
  category: SeriesCategory,
  level: Level,
): DataPoint[] {
  return snapshots
    .map((snapshot) => ({
      date: snapshot.date,
      value: snapshot.jlptProgress[category]?.[level],
    }))
    // Drop days where the archive has no reading, rather than treating a
    // missing value as zero — which would invent a collapse and then a
    // dramatic recovery.
    .filter((point): point is DataPoint => typeof point.value === 'number')
}

interface ProjectionProps {
  snapshots: DailySnapshot[]
}

export function Projection({ snapshots }: ProjectionProps) {
  const ceilings = useCeilings()
  const latest = snapshots.at(-1)
  if (!latest) return null

  return (
    <Card
      title="Projected completion"
      subtitle="Where your current pace lands, per JLPT level"
    >
      <ul className="space-y-6">
        {SERIES_CATEGORIES.map((category) => (
          <li key={category}>
            <CategoryProjection
              category={category}
              snapshots={snapshots}
              latest={latest}
              ceilings={ceilings}
            />
          </li>
        ))}
      </ul>

      <p className="mt-6 border-t border-[var(--gridline)] pt-4 text-sm text-[var(--text-muted)]">
        Pace is fitted over the last 30 days, so this tracks how you&apos;re
        studying now rather than an all-time average. A projection is a straight
        line through past behaviour, not a prediction — it assumes you keep
        going exactly as you have been.
      </p>
    </Card>
  )
}

function CategoryProjection({
  category,
  snapshots,
  latest,
  ceilings,
}: {
  category: SeriesCategory
  snapshots: DailySnapshot[]
  latest: DailySnapshot
  ceilings: CeilingsState
}) {
  // A level counts as finished once everything studiable in it is studied,
  // which may be below 100%. Skipping those is what stops a finished level
  // hiding the one actually being worked on.
  const level = nextLevel(latest, category, (candidate, percent) =>
    isLevelComplete(percent, ceilingFor(ceilings, category, candidate)),
  )

  if (!level) {
    return (
      <Row title={`${CATEGORY_LABELS[category]} — all levels complete`}>
        <p className="text-sm text-[var(--text-secondary)]">
          Nothing left that can be studied.
        </p>
      </Row>
    )
  }

  const percent = levelPercent(latest, category, level)
  const ceiling = ceilingFor(ceilings, category, level)

  // Project toward what is actually reachable. Aiming at 100 when 3% of the
  // level can never be studied produces a date that never arrives.
  const target = ceiling && ceiling.blocked > 0 ? ceiling.ceilingPercent : 100
  const result = projectToTarget(seriesFor(snapshots, category, level), target)

  return (
    <Row title={`${CATEGORY_LABELS[category]} — ${level.toUpperCase()}`}>
      <Meter
        percent={percent}
        label={`${level.toUpperCase()} ${CATEGORY_LABELS[category].toLowerCase()}`}
      />
      <Outcome result={result} percent={percent} />
      {ceiling && ceiling.blocked > 0 && (
        <p className="text-sm text-[var(--text-muted)]">
          Tops out at {ceiling.ceilingPercent}%: {ceiling.blocked} of{' '}
          {ceiling.total} terms can&apos;t be studied.
        </p>
      )}
    </Row>
  )
}

function Row({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-sm font-medium text-[var(--text-primary)]">{title}</h3>
      <div className="mt-2 space-y-2">{children}</div>
    </div>
  )
}

/** A single ratio against a limit — the right form for "% of a level done". */
function Meter({ percent, label }: { percent: number; label: string }) {
  const clamped = Math.max(0, Math.min(100, percent))

  return (
    <div className="flex items-center gap-3">
      <div
        role="meter"
        aria-valuenow={clamped}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label}
        className="h-2 flex-1 overflow-hidden rounded-full"
        style={{ background: 'var(--meter-track)' }}
      >
        <div
          className="h-full rounded-full"
          style={{ width: `${clamped}%`, background: 'var(--meter-fill)' }}
        />
      </div>
      {/* The value is always visible as text, so the meter is never the only
          way to read it. */}
      <span className="w-12 shrink-0 text-right text-sm tabular-nums text-[var(--text-secondary)]">
        {clamped}%
      </span>
    </div>
  )
}

/** Renders whichever outcome the projection produced. */
function Outcome({
  result,
  percent,
}: {
  result: ProjectionResult
  percent: number
}) {
  switch (result.status) {
    case 'complete':
      return (
        <p className="text-sm text-[var(--text-secondary)]">Complete.</p>
      )

    case 'insufficient-data': {
      const needed = result.requiredPoints - result.pointCount
      return (
        <p className="text-sm text-[var(--text-muted)]">
          Not enough history to estimate a pace yet — {result.pointCount} of{' '}
          {result.requiredPoints} days needed
          {needed > 0 && `, about ${needed} more`}.
        </p>
      )
    }

    case 'no-progress':
      return (
        <p className="text-sm text-[var(--text-muted)]">
          No measurable movement at {percent}% over the last 30 days, so there
          is no arrival date to give.
        </p>
      )

    case 'projected':
      return (
        <div className="text-sm">
          <p className="text-[var(--text-secondary)]">
            On track for{' '}
            <strong className="font-semibold text-[var(--text-primary)]">
              {formatLongDate(result.date)}
            </strong>{' '}
            — {result.perDay.toFixed(2)}% per day.
          </p>
          <p className="mt-1 text-[var(--text-muted)]">
            {result.earliest === result.latest ? (
              <>Based on {result.pointCount} days of data.</>
            ) : (
              <>
                Somewhere between {formatShortDate(result.earliest)} and{' '}
                {formatShortDate(result.latest)}, based on {result.pointCount}{' '}
                days of data.
              </>
            )}
          </p>
        </div>
      )
  }
}

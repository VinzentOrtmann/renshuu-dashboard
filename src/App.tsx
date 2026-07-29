/**
 * The dashboard shell: loads the archive once, then hands it to each section.
 *
 * Data loading lives here rather than in each chart so the page has one loading
 * state and one error state, instead of several cards resolving at different
 * moments and shuffling the layout as they land.
 */

import { ActivityHeatmap } from './components/ActivityHeatmap.tsx'
import { ProgressChart } from './components/ProgressChart.tsx'
import { Projection } from './components/Projection.tsx'
import { formatLongDate, useHistory } from './lib/history.ts'

function App() {
  const history = useHistory()

  return (
    <div className="min-h-dvh">
      <main className="mx-auto max-w-5xl px-6 py-12 sm:py-16">
        <Header />

        {history.status === 'loading' && <LoadingState />}
        {history.status === 'error' && <ErrorState error={history.error} />}
        {history.status === 'ready' && (
          <Dashboard snapshots={history.snapshots} />
        )}
      </main>
    </div>
  )
}

function Header() {
  return (
    <header className="mb-10">
      <p className="text-sm font-medium tracking-widest text-[var(--text-muted)] uppercase">
        練習 · Renshuu
      </p>
      <h1 className="mt-3 text-4xl font-bold tracking-tight text-[var(--text-primary)] sm:text-5xl">
        Japanese Learning Dashboard
      </h1>
      <p className="mt-4 max-w-2xl text-lg text-[var(--text-secondary)]">
        A permanent archive of my Renshuu study history, with pace analysis and
        progress projections the native stats page doesn&apos;t compute.
      </p>
    </header>
  )
}

function Dashboard({
  snapshots,
}: {
  snapshots: Parameters<typeof ProgressChart>[0]['snapshots']
}) {
  const latest = snapshots.at(-1)

  // The archive exists but is empty — possible if the file were reset by hand.
  if (!latest) {
    return (
      <Panel>
        <p className="font-medium text-[var(--text-primary)]">
          No snapshots yet.
        </p>
        <p className="mt-2 text-sm text-[var(--text-muted)]">
          The daily workflow writes the first entry at 21:50 UTC.
        </p>
      </Panel>
    )
  }

  return (
    <div className="space-y-6">
      <StatusBar
        level={latest.adventureLevel}
        date={latest.date}
        days={snapshots.length}
      />
      <ProgressChart snapshots={snapshots} />
      <Projection snapshots={snapshots} />
      <ActivityHeatmap snapshots={snapshots} />
    </div>
  )
}

/**
 * Level and freshness, kept out of the charts.
 *
 * Level belongs here rather than on the progress chart because plotting it
 * against term counts would need a second y-axis, and two scales on one plot
 * imply a relationship whose slope was chosen arbitrarily.
 */
function StatusBar({
  level,
  date,
  days,
}: {
  level: number
  date: string
  days: number
}) {
  return (
    <section className="flex flex-wrap items-baseline gap-x-8 gap-y-3 rounded-xl border border-[var(--border)] bg-[var(--surface-1)] px-6 py-4">
      <div>
        <span className="text-sm text-[var(--text-muted)]">Level</span>{' '}
        <span className="text-lg font-semibold text-[var(--text-primary)]">
          {level}
        </span>
      </div>
      <div>
        <span className="text-sm text-[var(--text-muted)]">Days archived</span>{' '}
        <span className="text-lg font-semibold text-[var(--text-primary)]">
          {days}
        </span>
      </div>
      <p className="text-sm text-[var(--text-muted)]">
        Last snapshot {formatLongDate(date)}
      </p>
    </section>
  )
}

function LoadingState() {
  return (
    <Panel>
      <p className="text-[var(--text-secondary)]">Loading the archive…</p>
    </Panel>
  )
}

function ErrorState({ error }: { error: Error }) {
  return (
    <Panel>
      <p className="font-medium text-[var(--text-primary)]">
        Couldn&apos;t load the study archive.
      </p>
      {/* Show the real message. This page has one reader who is also its
          developer, so a vague "something went wrong" would just cost a trip
          to the console. */}
      <p className="mt-2 text-sm text-[var(--text-muted)]">{error.message}</p>
    </Panel>
  )
}

function Panel({ children }: { children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-dashed border-[var(--border)] bg-[var(--surface-1)] p-12 text-center">
      {children}
    </section>
  )
}

export default App

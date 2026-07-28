/**
 * App shell.
 *
 * Deliberately near-empty for now: the goal of this first step is to prove the
 * whole pipeline works end to end (Vite build -> GitHub Actions -> GitHub
 * Pages). The real dashboard sections get mounted here in later steps:
 *   - ProgressChart      (XP / level over time)
 *   - ActivityHeatmap    (GitHub-style daily study heatmap)
 *   - CategoryBreakdown  (kanji vs vocab vs grammar pace)
 *   - Projection         ("at current pace you'll hit X by <date>")
 *   - EmbedWidget        (compact public badge)
 */
function App() {
  return (
    // min-h-dvh = full viewport height, using the dynamic viewport unit so
    // mobile browser chrome (address bar) doesn't cause a jump.
    <div className="min-h-dvh bg-slate-50 text-slate-800 dark:bg-slate-950 dark:text-slate-200">
      <main className="mx-auto max-w-5xl px-6 py-16">
        <header className="border-b border-slate-200 pb-8 dark:border-slate-800">
          <p className="text-sm font-medium tracking-widest text-indigo-600 uppercase dark:text-indigo-400">
            練習 · Renshuu
          </p>
          <h1 className="mt-3 text-4xl font-bold tracking-tight text-slate-900 sm:text-5xl dark:text-white">
            Japanese Learning Dashboard
          </h1>
          <p className="mt-4 max-w-2xl text-lg text-slate-600 dark:text-slate-400">
            A permanent archive of my Renshuu study history, with pace analysis
            and progress projections that the native stats page doesn&apos;t
            compute.
          </p>
        </header>

        {/* Placeholder standing in for the dashboard sections. It gets replaced
            once data/history.json exists and the chart components are built. */}
        <section className="mt-12 rounded-xl border border-dashed border-slate-300 bg-white p-12 text-center dark:border-slate-700 dark:bg-slate-900">
          <p className="text-base font-medium text-slate-900 dark:text-slate-100">
            Deployment pipeline is live.
          </p>
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
            No snapshots collected yet — charts appear here once the daily
            GitHub Action starts writing to <code>data/history.json</code>.
          </p>
        </section>
      </main>
    </div>
  )
}

export default App

/**
 * Page shell for the kanji wall.
 *
 * Kept out of the entry file so that file only mounts React — an entry that
 * also defines components breaks fast refresh during development.
 */

import { KanjiWall } from './KanjiWall.tsx'

export function KanjiPage() {
  return (
    <div className="min-h-dvh">
      <main className="mx-auto max-w-5xl px-4 py-10 sm:px-6 sm:py-16">
        <header className="mb-8">
          <a
            href={import.meta.env.BASE_URL}
            className="text-sm text-[var(--text-muted)] underline underline-offset-2 hover:text-[var(--text-secondary)]"
          >
            ← Dashboard
          </a>
          <h1 className="mt-4 text-4xl font-bold tracking-tight text-[var(--text-primary)] sm:text-5xl">
            Kanji wall
          </h1>
          <p className="mt-3 max-w-2xl text-lg text-[var(--text-secondary)]">
            Every kanji in my study schedules, shaded by how well I know it.
            Outlined ones I haven&apos;t started.
          </p>
        </header>

        <KanjiWall />
      </main>
    </div>
  )
}

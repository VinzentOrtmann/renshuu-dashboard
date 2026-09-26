/**
 * Kanji path: learn components first, then the kanji built from them, on a
 * spaced-repetition schedule.
 *
 * Modelled on WaniKani's structure — components unlock kanji, levels unlock
 * each other — with content from open dictionaries in Japanese school order.
 * Progress is saved in this browser; see lib/srsStore.ts.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'

import { loadCourse, useUsedIn } from '../../lib/course.ts'
import type { Course } from '../../lib/courseData.ts'
import {
  BURNED,
  INITIAL_STATE,
  PACE_HOURS,
  afterLesson,
  answer,
  forecast,
  hoursToGuru,
  intervalHours,
  lessonQueue,
  levelProgress,
  levelUp,
  reviewQueue,
  setPace,
  skipToLevel,
  stageCounts,
  validHours,
} from '../../lib/srs.ts'
import type { ItemKey, Pace, SrsState } from '../../lib/srs.ts'
import {
  exportProgress,
  importProgress,
  loadProgress,
  saveProgress,
} from '../../lib/srsStore.ts'
import { BrowseView, LevelGrid } from './Browse.tsx'
import {
  Button,
  LESSON_BATCH,
  LessonSession,
  ReviewSession,
} from './Sessions.tsx'

type View =
  | { name: 'home' }
  | { name: 'browse' }
  | { name: 'lessons'; items: ItemKey[] }
  | { name: 'reviews'; items: ItemKey[] }

export function KanjiPathPage() {
  const [course, setCourse] = useState<Course | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    loadCourse()
      .then(setCourse)
      .catch((e: unknown) =>
        setError(e instanceof Error ? e.message : String(e)),
      )
  }, [])

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
            Kanji path
          </h1>
          <p className="mt-3 max-w-2xl text-lg text-[var(--text-secondary)]">
            Components first, then the kanji built from them, in school-grade
            order, on a spaced-repetition schedule.
          </p>
        </header>

        {error && <Note>{error}</Note>}
        {!error && !course && <Note>Loading the course…</Note>}
        {course && <Path course={course} />}
      </main>
    </div>
  )
}

function Path({ course }: { course: Course }) {
  const [{ state: loaded, unreadable }] = useState(loadProgress)
  const [srs, setSrs] = useState<SrsState>(loaded)
  // A save that exists but couldn't be read must not be silently overwritten.
  // Saving stays off until the learner chooses to start fresh or import.
  const [canSave, setCanSave] = useState(!unreadable)
  const [saveFailed, setSaveFailed] = useState(false)
  const [view, setView] = useState<View>({ name: 'home' })
  const [now, setNow] = useState(() => Date.now())
  const usedIn = useUsedIn(course)

  // Keep "now" current so due reviews appear without reloading.
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    if (canSave) setSaveFailed(!saveProgress(srs))
  }, [srs, canSave])

  /** Every change goes through here, so level-ups can't be missed. */
  const update = useCallback(
    (change: (state: SrsState) => SrsState) => {
      setSrs((state) => levelUp(course, change(state)))
    },
    [course],
  )

  const lessons = useMemo(() => lessonQueue(course, srs), [course, srs])
  const reviews = useMemo(() => reviewQueue(srs, now), [srs, now])

  const finishLessons = useCallback(
    (items: ItemKey[]) => {
      const at = Date.now()
      update((state) => {
        const hours = intervalHours(state)
        const progress = { ...state.progress }
        for (const item of items) progress[item] ??= afterLesson(at, hours)
        return { ...state, progress }
      })
      setView({ name: 'home' })
    },
    [update],
  )

  const recordAnswer = useCallback(
    (item: ItemKey, correct: boolean) => {
      const at = Date.now()
      update((state) => {
        const current = state.progress[item]
        if (!current) return state
        return {
          ...state,
          progress: {
            ...state.progress,
            [item]: answer(current, correct, at, intervalHours(state)),
          },
        }
      })
    },
    [update],
  )

  const home = () => {
    setNow(Date.now())
    setView({ name: 'home' })
  }

  if (view.name === 'browse') {
    return (
      <BrowseView course={course} srs={srs} usedIn={usedIn} onExit={home} />
    )
  }

  if (view.name === 'lessons') {
    return (
      <LessonSession
        course={course}
        usedIn={usedIn}
        items={view.items}
        firstReviewHours={intervalHours(srs)[1]}
        onFinish={finishLessons}
        onExit={home}
      />
    )
  }

  if (view.name === 'reviews') {
    return (
      <ReviewSession
        course={course}
        usedIn={usedIn}
        items={view.items}
        onAnswer={recordAnswer}
        onExit={home}
      />
    )
  }

  const { guru, total, needed } = levelProgress(course, srs)
  const counts = stageCounts(srs)
  const upcoming = forecast(srs, now, 24)

  return (
    <div className="space-y-6">
      {unreadable && !canSave && (
        <Warning>
          Saved progress exists in this browser but couldn&apos;t be read, so
          nothing is being saved over it. Import a backup, or{' '}
          <button
            type="button"
            className="underline"
            onClick={() => {
              setSrs(INITIAL_STATE)
              setCanSave(true)
            }}
          >
            start fresh
          </button>
          .
        </Warning>
      )}
      {saveFailed && (
        <Warning>
          This browser refused to save progress (private window, or site data
          blocked). Export a backup before closing the page.
        </Warning>
      )}

      <section className="grid gap-4 sm:grid-cols-2">
        {/* Snapshot the queues: sessions must not change under you as you
            answer, since answering itself changes what's due. */}
        <BigButton
          label="Lessons"
          count={lessons.length}
          detail={
            lessons.length > 0
              ? `Next batch of ${Math.min(LESSON_BATCH, lessons.length)}`
              : 'Nothing new unlocked yet'
          }
          onClick={() =>
            setView({ name: 'lessons', items: lessons.slice(0, LESSON_BATCH) })
          }
        />
        <BigButton
          label="Reviews"
          count={reviews.length}
          detail={reviews.length > 0 ? 'Due now' : nextReviewText(upcoming)}
          onClick={() => setView({ name: 'reviews', items: [...reviews] })}
        />
      </section>

      <section className="rounded-xl border border-[var(--border)] bg-[var(--surface-1)] p-4 sm:p-6">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 className="text-base font-semibold text-[var(--text-primary)]">
            Level {srs.level}{' '}
            <span className="font-normal text-[var(--text-muted)]">
              of {course.levels.length}
            </span>
          </h2>
          <p className="text-sm text-[var(--text-muted)]">
            {guru} of {total} kanji at Guru · {needed} to level up
          </p>
        </div>
        <div
          role="meter"
          aria-valuenow={guru}
          aria-valuemin={0}
          aria-valuemax={needed}
          aria-label="Progress to next level"
          className="mt-3 h-2 overflow-hidden rounded-full"
          style={{ background: 'var(--meter-track)' }}
        >
          <div
            className="h-full rounded-full"
            style={{
              width: `${Math.min(100, (guru / Math.max(1, needed)) * 100)}%`,
              background: 'var(--meter-fill)',
            }}
          />
        </div>

        <LevelGrid course={course} srs={srs} />

        <div className="mt-5">
          <Button onClick={() => setView({ name: 'browse' })}>
            Browse all levels →
          </Button>
        </div>
      </section>

      <section className="flex flex-wrap gap-x-8 gap-y-3 rounded-xl border border-[var(--border)] bg-[var(--surface-1)] px-4 py-4 sm:px-6">
        {Object.entries(counts).map(([name, count]) => (
          <div key={name}>
            <span className="text-sm text-[var(--text-muted)]">{name}</span>{' '}
            <span className="text-lg font-semibold text-[var(--text-primary)]">
              {count}
            </span>
          </div>
        ))}
      </section>

      <Settings
        course={course}
        srs={srs}
        onSkip={(level) => update((state) => skipToLevel(course, state, level))}
        onPace={(pace, hours) => update((state) => setPace(state, pace, hours))}
        onImport={(state) => {
          setSrs(levelUp(course, state))
          setCanSave(true)
        }}
        onReset={() => {
          setSrs(INITIAL_STATE)
          setCanSave(true)
        }}
      />
    </div>
  )
}

/** "Next review in 3 hours", from the hourly forecast. */
function nextReviewText(upcoming: number[]): string {
  const hour = upcoming.findIndex((count) => count > 0)
  if (hour === -1) return 'None in the next day'
  return hour === 0 ? 'Next within the hour' : `Next in about ${hour + 1} hours`
}

function Settings({
  course,
  srs,
  onSkip,
  onPace,
  onImport,
  onReset,
}: {
  course: Course
  srs: SrsState
  onSkip: (level: number) => void
  onPace: (pace: Pace, customHours?: number[]) => void
  onImport: (state: SrsState) => void
  onReset: () => void
}) {
  const [target, setTarget] = useState(String(srs.level))
  const [message, setMessage] = useState<string | null>(null)

  return (
    <details className="rounded-xl border border-[var(--border)] bg-[var(--surface-1)] px-4 py-4 sm:px-6">
      <summary className="cursor-pointer text-base font-semibold text-[var(--text-primary)]">
        Settings and backup
      </summary>
      <div className="mt-4 space-y-5 text-sm text-[var(--text-secondary)]">
        {/* Keyed on the saved pace, so an import or reset shows its pace. */}
        <PaceSetting
          key={`${srs.pace}:${srs.customHours}`}
          srs={srs}
          onPace={onPace}
        />

        <div>
          <p>
            <strong className="text-[var(--text-primary)]">
              Start further in.
            </strong>{' '}
            Marks every component and kanji below the chosen level as known
            (Burned). Level 5 ends first grade, 9 ends second, 15 ends third, 35
            ends sixth.
          </p>
          <div className="mt-2 flex items-center gap-2">
            <input
              type="number"
              min={1}
              max={course.levels.length}
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              className="w-20 rounded-md border border-[var(--border)] bg-[var(--surface-page)] px-2 py-1 text-[var(--text-primary)]"
              aria-label="Level to start at"
            />
            <Button
              onClick={() => {
                const level = Number(target)
                if (!Number.isInteger(level) || level < 1) return
                if (
                  window.confirm(
                    `Mark everything before level ${level} as known? This can't be undone except from a backup.`,
                  )
                ) {
                  onSkip(level)
                  setMessage(`Now at level ${Math.max(level, srs.level)}.`)
                }
              }}
            >
              Skip to level
            </Button>
          </div>
        </div>

        <div>
          <p>
            <strong className="text-[var(--text-primary)]">Backup.</strong>{' '}
            Progress is saved in this browser only. Export a file now and then,
            since clearing site data would erase it.
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Button onClick={() => exportProgress(srs)}>Export backup</Button>
            <label className="cursor-pointer rounded-md border border-[var(--border)] px-4 py-2 text-[var(--text-secondary)] hover:text-[var(--text-primary)]">
              Import backup
              <input
                type="file"
                accept="application/json,.json"
                className="sr-only"
                onChange={async (e) => {
                  const file = e.target.files?.[0]
                  e.target.value = ''
                  if (!file) return
                  try {
                    const state = await importProgress(file)
                    if (
                      window.confirm(
                        'Replace current progress with this backup?',
                      )
                    ) {
                      onImport(state)
                      setMessage('Backup restored.')
                    }
                  } catch (error) {
                    setMessage(
                      error instanceof Error ? error.message : String(error),
                    )
                  }
                }}
              />
            </label>
            <Button
              onClick={() => {
                if (
                  window.confirm('Erase all progress and start from level 1?')
                ) {
                  onReset()
                  setMessage('Progress reset.')
                }
              }}
            >
              Reset
            </Button>
          </div>
        </div>

        {message && <p className="text-[var(--text-muted)]">{message}</p>}
        <p className="text-xs text-[var(--text-muted)]">
          Course data from KANJIDIC2 and KRADFILE (EDRDG, CC BY-SA 4.0); stroke
          order from KanjiVG (CC BY-SA 3.0).
          {` ${Object.values(srs.progress).filter((p) => p.stage >= BURNED).length} items burned.`}
        </p>
      </div>
    </details>
  )
}

const PACE_OPTIONS: { pace: Pace; label: string }[] = [
  { pace: 'normal', label: 'Normal' },
  { pace: 'fast', label: 'Fast' },
  { pace: 'custom', label: 'Custom' },
]

/** "1.5 days" or "20 hours". */
function duration(hours: number): string {
  if (hours < 48) return `${Math.round(hours * 10) / 10} hours`
  return `${Math.round((hours / 24) * 10) / 10} days`
}

/**
 * Pace: how long the Apprentice stages wait. Normal and Fast apply at once;
 * Custom needs its four numbers first. Changing pace also moves reviews that
 * are already waiting (see setPace in lib/srs.ts).
 */
function PaceSetting({
  srs,
  onPace,
}: {
  srs: SrsState
  onPace: (pace: Pace, customHours?: number[]) => void
}) {
  const current = srs.pace ?? 'normal'
  const [choice, setChoice] = useState<Pace>(current)
  const [custom, setCustom] = useState<string[]>(
    (srs.customHours ?? PACE_HOURS.fast).map(String),
  )
  const customHours = custom.map(Number)
  const customValid = validHours(customHours)
  const customChanged =
    current !== 'custom' ||
    customHours.some((h, i) => h !== srs.customHours?.[i])

  // What the chosen settings would give, shown before applying them.
  const preview =
    choice === 'custom'
      ? customValid
        ? { pace: choice, customHours }
        : null
      : { pace: choice }
  const guru = preview ? hoursToGuru(preview) : null

  return (
    <div>
      <p>
        <strong className="text-[var(--text-primary)]">Pace.</strong> How long
        the four Apprentice stages wait before the next review. Guru and later
        keep their intervals (1 week, 2 weeks, 1 month, 4 months). Changing it
        also moves reviews that are already waiting.
      </p>
      <div
        role="radiogroup"
        aria-label="Pace"
        className="mt-2 flex flex-wrap gap-2"
      >
        {PACE_OPTIONS.map(({ pace, label }) => (
          <label
            key={pace}
            className={`cursor-pointer rounded-md border px-3 py-1.5 ${
              choice === pace
                ? 'border-[var(--axis)] text-[var(--text-primary)]'
                : 'border-[var(--border)] text-[var(--text-secondary)]'
            }`}
          >
            <input
              type="radio"
              name="pace"
              value={pace}
              checked={choice === pace}
              onChange={() => {
                setChoice(pace)
                if (pace !== 'custom') onPace(pace)
              }}
              className="sr-only"
            />
            {label}
            {pace !== 'custom' && (
              <span className="ml-1.5 text-[var(--text-muted)]">
                {PACE_HOURS[pace].join(' · ')} h
              </span>
            )}
          </label>
        ))}
      </div>

      {choice === 'custom' && (
        <div className="mt-3 flex flex-wrap items-end gap-2">
          {custom.map((value, i) => (
            <label key={i} className="flex flex-col gap-1">
              <span className="text-xs text-[var(--text-muted)]">
                Apprentice {i + 1}
              </span>
              <input
                type="number"
                min={0.5}
                step={0.5}
                value={value}
                onChange={(e) =>
                  setCustom((all) =>
                    all.map((v, j) => (j === i ? e.target.value : v)),
                  )
                }
                className="w-20 rounded-md border border-[var(--border)] bg-[var(--surface-page)] px-2 py-1 text-[var(--text-primary)]"
              />
            </label>
          ))}
          <span className="pb-1.5 text-[var(--text-muted)]">hours</span>
          <Button
            primary
            disabled={!customValid || !customChanged}
            onClick={() => onPace('custom', customHours)}
          >
            Apply
          </Button>
        </div>
      )}

      <p className="mt-2 text-[var(--text-muted)]">
        {guru === null
          ? 'Each wait must be a positive number of hours.'
          : `Lesson to Guru in ${duration(guru)} at best, so about ${duration(
              guru * 2,
            )} per level: components, then the kanji they unlock.`}
      </p>
    </div>
  )
}

function BigButton({
  label,
  count,
  detail,
  onClick,
}: {
  label: string
  count: number
  detail: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={count === 0}
      className="rounded-xl border border-[var(--border)] bg-[var(--surface-1)] p-5 text-left enabled:hover:border-[var(--axis)] disabled:opacity-60"
    >
      <div className="text-sm text-[var(--text-muted)]">{label}</div>
      <div className="mt-1 text-4xl font-semibold text-[var(--text-primary)]">
        {count}
      </div>
      <div className="mt-1 text-sm text-[var(--text-secondary)]">{detail}</div>
    </button>
  )
}

function Note({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-xl border border-dashed border-[var(--border)] p-8 text-center text-[var(--text-secondary)]">
      {children}
    </p>
  )
}

function Warning({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-xl border border-[var(--axis)] bg-[var(--surface-1)] p-4 text-sm text-[var(--text-primary)]">
      {children}
    </p>
  )
}

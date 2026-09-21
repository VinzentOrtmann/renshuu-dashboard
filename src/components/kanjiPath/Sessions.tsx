/**
 * Lesson and review sessions for the Kanji path page.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'

import type { Course } from '../../lib/courseData.ts'
import { parseKey } from '../../lib/srs.ts'
import type { ItemKey } from '../../lib/srs.ts'
import { Glyph, ItemDetails, KindBadge } from './ItemCard.tsx'

/**
 * Whether a key press belongs to a focused control rather than to the
 * session's shortcuts. After a mouse click the button keeps focus, and Enter
 * or Space on it already clicks it; handling the key here too would act twice.
 */
function aimedAtControl(event: KeyboardEvent): boolean {
  const target = event.target
  return (
    (event.key === 'Enter' || event.key === ' ') &&
    target instanceof Element &&
    !!target.closest('button, input, select, textarea, summary, a')
  )
}

/** Items per lesson batch, as in WaniKani. Small enough to hold in mind. */
export const LESSON_BATCH = 5

interface SessionProps {
  course: Course
  usedIn: Map<string, string[]>
  onExit: () => void
}

/**
 * A batch of new items, one at a time. Finishing hands the batch back, and
 * the page puts every item into reviews at stage 1.
 */
export function LessonSession({
  course,
  usedIn,
  items,
  onFinish,
  onExit,
}: SessionProps & { items: ItemKey[]; onFinish: (items: ItemKey[]) => void }) {
  const [index, setIndex] = useState(0)
  const item = items[index]
  const last = index === items.length - 1

  const next = useCallback(() => {
    if (last) onFinish(items)
    else setIndex((i) => i + 1)
  }, [last, items, onFinish])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (aimedAtControl(event)) return
      if (event.key === 'ArrowRight' || event.key === 'Enter') next()
      if (event.key === 'ArrowLeft') setIndex((i) => Math.max(0, i - 1))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [next])

  return (
    <SessionFrame
      title="Lesson"
      progress={`${index + 1} of ${items.length}`}
      onExit={onExit}
    >
      <div className="flex flex-wrap items-start gap-8">
        <div className="space-y-3">
          <KindBadge kind={parseKey(item).kind} />
          <Glyph itemKey={item} course={course} />
        </div>
        <div className="min-w-64 flex-1">
          <ItemDetails itemKey={item} course={course} usedIn={usedIn} />
        </div>
      </div>
      <div className="mt-8 flex gap-2">
        <Button
          onClick={() => setIndex((i) => Math.max(0, i - 1))}
          disabled={index === 0}
        >
          Back
        </Button>
        <Button primary onClick={next}>
          {last ? 'Add to reviews' : 'Next'}
        </Button>
      </div>
      <p className="mt-3 text-sm text-[var(--text-muted)]">
        Arrow keys move through the batch. They come up for review in four
        hours.
      </p>
    </SessionFrame>
  )
}

/** Shuffles a copy, so reviews don't always come in the same order. */
function shuffled<T>(items: T[]): T[] {
  const copy = [...items]
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy
}

/**
 * Self-graded reviews: see the item, recall it, reveal, then say honestly
 * whether you had it. Grading yourself is only as good as that honesty, but it
 * avoids the typo-and-synonym problems of typed answers.
 */
export function ReviewSession({
  course,
  usedIn,
  items,
  onAnswer,
  onExit,
}: SessionProps & {
  items: ItemKey[]
  onAnswer: (item: ItemKey, correct: boolean) => void
}) {
  // Fixed at the start: answering changes what's due, and the queue must not
  // shift underneath you mid-session.
  const queue = useMemo(() => shuffled(items), [items])
  const [index, setIndex] = useState(0)
  const [revealed, setRevealed] = useState(false)
  const [tally, setTally] = useState({ right: 0, wrong: 0 })

  const done = index >= queue.length
  const item = queue[index]

  const grade = useCallback(
    (correct: boolean) => {
      if (done || !revealed) return
      onAnswer(item, correct)
      setTally((t) => ({
        right: t.right + (correct ? 1 : 0),
        wrong: t.wrong + (correct ? 0 : 1),
      }))
      setRevealed(false)
      setIndex((i) => i + 1)
    },
    [done, revealed, item, onAnswer],
  )

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (aimedAtControl(event)) return
      if (done) return
      if (!revealed && (event.key === ' ' || event.key === 'Enter')) {
        event.preventDefault()
        setRevealed(true)
      } else if (revealed && event.key === '1') grade(false)
      else if (revealed && event.key === '2') grade(true)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [done, revealed, grade])

  if (done) {
    const total = tally.right + tally.wrong
    return (
      <SessionFrame title="Reviews done" onExit={onExit}>
        <p className="text-2xl text-[var(--text-primary)]">
          {tally.right} of {total} right
          {total > 0 && ` (${Math.round((tally.right / total) * 100)}%)`}
        </p>
        <div className="mt-6">
          <Button primary onClick={onExit}>
            Back to overview
          </Button>
        </div>
      </SessionFrame>
    )
  }

  return (
    <SessionFrame
      title="Review"
      progress={`${index + 1} of ${queue.length}`}
      onExit={onExit}
    >
      <div className="flex flex-wrap items-start gap-8">
        <div className="space-y-3">
          <KindBadge kind={parseKey(item).kind} />
          <Glyph itemKey={item} course={course} />
        </div>
        <div className="min-w-64 flex-1">
          {revealed ? (
            <ItemDetails itemKey={item} course={course} usedIn={usedIn} />
          ) : (
            <p className="text-[var(--text-secondary)]">
              {parseKey(item).kind === 'component'
                ? 'What is this component called?'
                : 'What does it mean, and how is it read?'}
            </p>
          )}
        </div>
      </div>
      <div className="mt-8 flex flex-wrap gap-2">
        {revealed ? (
          <>
            <Button onClick={() => grade(false)}>Missed it (1)</Button>
            <Button primary onClick={() => grade(true)}>
              Got it (2)
            </Button>
          </>
        ) : (
          <Button primary onClick={() => setRevealed(true)}>
            Show answer (space)
          </Button>
        )}
      </div>
    </SessionFrame>
  )
}

function SessionFrame({
  title,
  progress,
  onExit,
  children,
}: {
  title: string
  progress?: string
  onExit: () => void
  children: React.ReactNode
}) {
  return (
    <section className="rounded-xl border border-[var(--border)] bg-[var(--surface-1)] p-5 sm:p-8">
      <div className="mb-6 flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-[var(--text-primary)]">
          {title}
          {progress && (
            <span className="ml-3 font-normal text-[var(--text-muted)]">
              {progress}
            </span>
          )}
        </h2>
        <Button onClick={onExit}>End session</Button>
      </div>
      {children}
    </section>
  )
}

export function Button({
  onClick,
  children,
  primary,
  disabled,
}: {
  onClick: () => void
  children: React.ReactNode
  primary?: boolean
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`rounded-md border border-[var(--border)] px-4 py-2 text-sm disabled:opacity-40 ${
        primary
          ? 'bg-[var(--meter-track)] font-medium text-[var(--text-primary)]'
          : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
      }`}
    >
      {children}
    </button>
  )
}

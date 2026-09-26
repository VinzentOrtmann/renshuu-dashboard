/**
 * Lesson and review sessions for the Kanji path page.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import type { Course } from '../../lib/courseData.ts'
import { checkMeaning, checkReading } from '../../lib/answers.ts'
import { parseKey } from '../../lib/srs.ts'
import type { AnswerMode, ItemKey } from '../../lib/srs.ts'
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
  firstReviewHours,
  onFinish,
  onExit,
}: SessionProps & {
  items: ItemKey[]
  /** Wait before the first review, for the hint under the buttons. */
  firstReviewHours: number
  onFinish: (items: ItemKey[]) => void
}) {
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
        Arrow keys move through the batch. They come up for review in{' '}
        {firstReviewHours === 1 ? 'an hour' : `${firstReviewHours} hours`}.
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
export function ReviewSession(
  props: SessionProps & {
    items: ItemKey[]
    /** 'typed' asks for the answer; 'reveal' shows it and you grade yourself. */
    mode?: AnswerMode
    onAnswer: (item: ItemKey, correct: boolean) => void
  },
) {
  return props.mode === 'typed' ? (
    <TypedReviewSession {...props} />
  ) : (
    <RevealReviewSession {...props} />
  )
}

function RevealReviewSession({
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

/** The prompts one item asks: a component its name, a kanji both fields. */
function promptsFor(itemKey: ItemKey, course: Course) {
  const { kind, id } = parseKey(itemKey)
  if (kind === 'component') {
    const component = course.components[id]
    return [
      {
        label: 'Name',
        ask: 'What is this component called?',
        answer: component.name,
        check: (typed: string) => checkMeaning(typed, component.name),
      },
    ]
  }
  const kanji = course.kanji[id]
  return [
    {
      label: 'Meaning',
      ask: 'What does it mean?',
      answer: kanji.m,
      check: (typed: string) => checkMeaning(typed, kanji.m),
    },
    {
      label: 'Reading',
      ask: 'How is it read? (kana or romaji)',
      answer: [kanji.on, kanji.kun].filter(Boolean).join(' · '),
      check: (typed: string) => checkReading(typed, kanji.on, kanji.kun),
    },
  ]
}

/**
 * Typed reviews: answer the meaning, and for a kanji the reading too.
 *
 * An item counts as right only if every prompt was answered right first time.
 * A near-miss ("retier") is handed back to be retyped rather than marked
 * wrong, which is WaniKani's behaviour and keeps spelling out of the grade.
 */
function TypedReviewSession({
  course,
  usedIn,
  items,
  onAnswer,
  onExit,
}: SessionProps & {
  items: ItemKey[]
  onAnswer: (item: ItemKey, correct: boolean) => void
}) {
  const queue = useMemo(() => shuffled(items), [items])
  const [index, setIndex] = useState(0)
  const [step, setStep] = useState(0)
  const [typed, setTyped] = useState('')
  const [hint, setHint] = useState<string | null>(null)
  const [shown, setShown] = useState(false)
  const [missed, setMissed] = useState(false)
  const [tally, setTally] = useState({ right: 0, wrong: 0 })
  const field = useRef<HTMLInputElement>(null)

  const done = index >= queue.length
  const item = queue[index]
  const prompts = done ? [] : promptsFor(item, course)
  const prompt = prompts[step]

  /** Moves to the next prompt, or finishes the item and grades it. */
  const advance = useCallback(
    (wrong: boolean) => {
      const failed = missed || wrong
      setTyped('')
      setHint(null)
      setShown(false)
      if (step + 1 < prompts.length) {
        setMissed(failed)
        setStep(step + 1)
        return
      }
      onAnswer(item, !failed)
      setTally((t) => ({
        right: t.right + (failed ? 0 : 1),
        wrong: t.wrong + (failed ? 1 : 0),
      }))
      setMissed(false)
      setStep(0)
      setIndex((i) => i + 1)
    },
    [missed, step, prompts.length, onAnswer, item],
  )

  const submit = () => {
    if (shown) {
      advance(true)
      return
    }
    const verdict = prompt.check(typed)
    if (verdict === 'yes') {
      advance(false)
    } else if (verdict === 'close') {
      setHint('Close — check your spelling.')
    } else {
      setShown(true)
      setHint(null)
    }
  }

  // Focus follows the prompt, so answering never needs the mouse.
  useEffect(() => {
    if (!shown) field.current?.focus()
  }, [index, step, shown])

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
          <p className="text-[var(--text-secondary)]">{prompt.ask}</p>
          <form
            onSubmit={(event) => {
              event.preventDefault()
              submit()
            }}
          >
            <input
              ref={field}
              value={typed}
              onChange={(e) => {
                setTyped(e.target.value)
                setHint(null)
              }}
              readOnly={shown}
              aria-label={prompt.label}
              autoComplete="off"
              autoCapitalize="off"
              spellCheck={false}
              className={`mt-3 w-full rounded-md border px-3 py-2 text-xl text-[var(--text-primary)] ${
                shown
                  ? 'border-[var(--series-kanji)] bg-[var(--surface-1)]'
                  : 'border-[var(--border)] bg-[var(--surface-page)]'
              }`}
            />
            {hint && (
              <p className="mt-2 text-sm text-[var(--text-secondary)]">
                {hint}
              </p>
            )}
            {shown && (
              <p className="mt-2 text-sm text-[var(--text-primary)]">
                {prompt.label}: {prompt.answer}
              </p>
            )}
            <div className="mt-4 flex flex-wrap gap-2">
              <Button primary onClick={submit}>
                {shown ? 'Next (enter)' : 'Answer (enter)'}
              </Button>
              {!shown && (
                <Button
                  onClick={() => {
                    setShown(true)
                    setHint(null)
                  }}
                >
                  I don&apos;t know
                </Button>
              )}
            </div>
          </form>
        </div>
      </div>
      {shown && (
        <div className="mt-8 border-t border-[var(--border)] pt-6">
          <ItemDetails itemKey={item} course={course} usedIn={usedIn} />
        </div>
      )}
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

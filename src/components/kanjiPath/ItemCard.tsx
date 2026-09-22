/**
 * One component or kanji, as shown in lessons and on the answer side of a
 * review.
 *
 * The breakdown row is the point of the whole page: a kanji is shown as the
 * components you've already learned, so 休 reads as "person + tree" rather than
 * as six arbitrary strokes.
 */

import { useEffect, useState } from 'react'

import type { Course } from '../../lib/courseData.ts'
import { KANJIVG_SIZE } from '../../lib/strokeData.ts'
import { loadStrokes } from '../../lib/strokes.ts'
import { loadVocab } from '../../lib/vocab.ts'
import { parseKey } from '../../lib/srs.ts'
import type { ItemKey } from '../../lib/srs.ts'

/**
 * Glyph font. Klee One for handwriting shapes, then fonts that cover the few
 * components outside common Unicode blocks (𠆢, 𠂉) — Windows ships those in
 * its "ExtB" fonts — so they render instead of showing as empty boxes.
 */
export const GLYPH_FONT =
  "'Klee One', 'UD Digi Kyokasho N-R', 'Yu Mincho', 'SimSun-ExtB', 'MingLiU-ExtB', serif"

/** Kind colours: identity only, from the chart palette. Never used for text. */
const KIND_COLOR = {
  component: 'var(--series-grammar)',
  kanji: 'var(--series-vocab)',
}

export function KindBadge({ kind }: { kind: 'component' | 'kanji' }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium tracking-wide text-[var(--text-muted)] uppercase">
      <span
        aria-hidden="true"
        className="h-2 w-2 rounded-full"
        style={{ background: KIND_COLOR[kind] }}
      />
      {kind === 'component' ? 'Component' : 'Kanji'}
    </span>
  )
}

/** The big character at the top of a card. */
export function Glyph({
  itemKey,
  course,
}: {
  itemKey: ItemKey
  course: Course
}) {
  const { kind, id } = parseKey(itemKey)
  const text = kind === 'component' ? course.components[id]?.form : id
  return (
    <div
      className="text-8xl leading-none text-[var(--text-primary)]"
      style={{ fontFamily: GLYPH_FONT }}
    >
      {text}
    </div>
  )
}

interface ItemCardProps {
  itemKey: ItemKey
  course: Course
  /** Which kanji each component appears in, for "found in". */
  usedIn: Map<string, string[]>
}

/** Everything about an item. */
export function ItemDetails({ itemKey, course, usedIn }: ItemCardProps) {
  const { kind, id } = parseKey(itemKey)

  if (kind === 'component') {
    const component = course.components[id]
    const examples = (usedIn.get(id) ?? []).slice(0, 10)
    return (
      <div className="space-y-4">
        <Field label="Name">
          <span className="text-2xl text-[var(--text-primary)]">
            {component.name}
          </span>
        </Field>
        {examples.length > 0 && (
          <Field label="Found in">
            <span className="flex flex-wrap gap-1">
              {examples.map((char) => (
                <FoundInKanji key={char} char={char} course={course} />
              ))}
            </span>
          </Field>
        )}
      </div>
    )
  }

  const kanji = course.kanji[id]
  return (
    <div className="space-y-4">
      {kanji.parts.length > 0 && (
        <Field label="Built from">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            {kanji.parts.map((part, index) => (
              <span key={part} className="flex items-center gap-3">
                {index > 0 && (
                  <span className="text-[var(--text-muted)]">+</span>
                )}
                <span className="flex items-baseline gap-1.5">
                  <span
                    className="text-3xl text-[var(--text-primary)]"
                    style={{ fontFamily: GLYPH_FONT }}
                  >
                    {course.components[part]?.form ?? part}
                  </span>
                  <span className="text-sm text-[var(--text-secondary)]">
                    {course.components[part]?.name}
                  </span>
                </span>
              </span>
            ))}
          </div>
        </Field>
      )}
      <Field label="Meaning">
        <span className="text-2xl text-[var(--text-primary)]">{kanji.m}</span>
      </Field>
      <div className="flex flex-wrap gap-x-10 gap-y-4">
        <Field label="On'yomi">
          <span className="text-xl text-[var(--text-primary)]">
            {kanji.on || '—'}
          </span>
        </Field>
        <Field label="Kun'yomi">
          <span className="text-xl text-[var(--text-primary)]">
            {kanji.kun || '—'}
          </span>
        </Field>
      </div>
      <StrokeStrip char={id} />
      <ExampleWords char={id} />
    </div>
  )
}

/**
 * One kanji in a component's "found in" list, with its details in a popup on
 * hover or keyboard focus — enough to see how the component is used without
 * leaving the lesson. A custom popup rather than a title attribute, because
 * the native tooltip is slow to appear and can't lay out several lines.
 */
function FoundInKanji({ char, course }: { char: string; course: Course }) {
  const kanji = course.kanji[char]
  const parts = kanji.parts
    .map((part) => {
      const component = course.components[part]
      return `${component?.form ?? part} ${component?.name ?? ''}`.trim()
    })
    .join(' + ')

  return (
    <span
      tabIndex={0}
      aria-label={`${char}: ${kanji.m}`}
      className="group relative rounded px-0.5 text-2xl text-[var(--text-primary)] outline-none hover:bg-[var(--surface-page)] focus-visible:ring-2 focus-visible:ring-[var(--axis)]"
      style={{ fontFamily: GLYPH_FONT }}
    >
      {char}
      <span
        role="tooltip"
        className="invisible absolute bottom-full left-1/2 z-10 mb-2 w-60 -translate-x-1/2 rounded-lg border border-[var(--border)] bg-[var(--surface-1)] p-3 text-left font-sans text-sm shadow-lg group-hover:visible group-focus:visible"
      >
        <span className="block text-base text-[var(--text-primary)]">
          {kanji.m}
        </span>
        {kanji.on && (
          <span className="mt-1 block text-[var(--text-secondary)]">
            On: {kanji.on}
          </span>
        )}
        {kanji.kun && (
          <span className="block text-[var(--text-secondary)]">
            Kun: {kanji.kun}
          </span>
        )}
        {parts && (
          <span className="mt-1 block text-[var(--text-secondary)]">
            {parts}
          </span>
        )}
        <span className="mt-1 block text-xs text-[var(--text-muted)]">
          Level {kanji.level}
        </span>
      </span>
    </span>
  )
}

function Field({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div>
      <div className="text-xs font-medium tracking-wide text-[var(--text-muted)] uppercase">
        {label}
      </div>
      <div className="mt-1">{children}</div>
    </div>
  )
}

/** The kanji built up stroke by stroke, the same data the worksheets use. */
function StrokeStrip({ char }: { char: string }) {
  const [paths, setPaths] = useState<string[] | null>(null)

  useEffect(() => {
    let cancelled = false
    setPaths(null)
    loadStrokes([char]).then((loaded) => {
      if (!cancelled) setPaths(loaded.get(char) ?? [])
    })
    return () => {
      cancelled = true
    }
  }, [char])

  if (!paths || paths.length === 0) return null

  return (
    <Field label={`Stroke order · ${paths.length} strokes`}>
      <div className="flex flex-wrap gap-1">
        {paths.map((_, step) => (
          <svg
            key={step}
            viewBox={`0 0 ${KANJIVG_SIZE} ${KANJIVG_SIZE}`}
            className="h-11 w-11 rounded border border-[var(--gridline)] bg-[var(--surface-page)]"
            aria-hidden="true"
          >
            {paths.slice(0, step + 1).map((d, index) => (
              <path
                key={index}
                d={d}
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
                // The newest stroke is drawn in the primary ink; the ones
                // before it recede, so each box shows what was just added.
                stroke={
                  index === step ? 'var(--text-primary)' : 'var(--text-muted)'
                }
                strokeWidth={index === step ? 5 : 4}
              />
            ))}
          </svg>
        ))}
      </div>
    </Field>
  )
}

/**
 * Words from your own renshuu vocabulary that use this kanji. Shortest first,
 * which tends to put the basic words ahead of set phrases.
 */
function ExampleWords({ char }: { char: string }) {
  const [words, setWords] = useState<{ w: string; r: string; m: string }[]>([])

  useEffect(() => {
    let cancelled = false
    loadVocab().then((vocab) => {
      if (cancelled || !vocab) return
      const found = Object.entries(vocab.words)
        .filter(([written]) => written.includes(char) && written !== char)
        .sort(([a], [b]) => a.length - b.length || a.localeCompare(b))
        .slice(0, 5)
        .map(([w, entry]) => ({ w, r: entry.r.join(' / '), m: entry.m }))
      setWords(found)
    })
    return () => {
      cancelled = true
    }
  }, [char])

  if (words.length === 0) return null

  return (
    <Field label="In your vocabulary">
      <ul className="space-y-1">
        {words.map((word) => (
          <li key={word.w} className="flex flex-wrap items-baseline gap-x-3">
            <span
              className="text-xl text-[var(--text-primary)]"
              style={{ fontFamily: GLYPH_FONT }}
            >
              {word.w}
            </span>
            <span className="text-sm text-[var(--text-secondary)]">
              {word.r}
            </span>
            <span className="text-sm text-[var(--text-muted)]">{word.m}</span>
          </li>
        ))}
      </ul>
    </Field>
  )
}

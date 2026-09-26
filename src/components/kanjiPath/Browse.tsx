/**
 * Browsing the course: any level, any item, whether or not you've reached it.
 *
 * The tiles here are also what the home page shows for the current level, so
 * an item looks the same everywhere: shaded by how well you know it.
 */

import { useMemo, useState } from 'react'

import type { Course } from '../../lib/courseData.ts'
import { heatmapColorVar } from '../../lib/palette.ts'
import {
  BURNED,
  GURU,
  componentKey,
  kanjiKey,
  parseKey,
  stageName,
  unlockedItems,
} from '../../lib/srs.ts'
import type { ItemKey, SrsState } from '../../lib/srs.ts'
import { GLYPH_FONT, ItemDetails, KindBadge } from './ItemCard.tsx'
import { Button } from './Sessions.tsx'

/** How far along an item is, in words, for tile titles and the detail panel. */
function statusOf(
  itemKey: ItemKey,
  srs: SrsState,
  unlocked: Set<ItemKey>,
): string {
  const stage = srs.progress[itemKey]?.stage ?? 0
  if (stage > 0) return stageName(stage)
  return unlocked.has(itemKey) ? 'lesson waiting' : 'locked'
}

/**
 * One component or kanji as a square tile, shaded by its stage on the same
 * ramp as the dashboard's heatmap. Locked items are outlines: not yet
 * available is a different fact from not yet learned.
 */
export function ItemTile({
  itemKey,
  course,
  srs,
  unlocked,
  onSelect,
  selected,
}: {
  itemKey: ItemKey
  course: Course
  srs: SrsState
  unlocked: Set<ItemKey>
  onSelect?: (itemKey: ItemKey) => void
  selected?: boolean
}) {
  const { kind, id } = parseKey(itemKey)
  const component = kind === 'component' ? course.components[id] : undefined
  const text = component ? component.form : id
  const label = component ? component.name : course.kanji[id].m.split(',')[0]

  const stage = srs.progress[itemKey]?.stage ?? 0
  const step =
    stage === 0 ? 0 : stage >= 8 ? 4 : stage === 7 ? 3 : stage >= GURU ? 2 : 1
  const locked = stage === 0 && !unlocked.has(itemKey)

  const className = [
    'flex h-11 min-w-11 items-center justify-center rounded-md px-1 text-2xl',
    locked
      ? 'border border-dashed border-[var(--gridline)] text-[var(--text-muted)]'
      : '',
    stage === 0 && !locked
      ? 'border border-[var(--axis)] text-[var(--text-primary)]'
      : '',
    selected ? 'ring-2 ring-[var(--meter-fill)]' : '',
    onSelect ? 'cursor-pointer hover:opacity-80' : '',
  ].join(' ')

  const style = {
    fontFamily: GLYPH_FONT,
    ...(stage > 0
      ? { background: heatmapColorVar(step), color: `var(--heat-${step}-ink)` }
      : {}),
  }
  const title = `${label} — ${statusOf(itemKey, srs, unlocked)}`

  if (!onSelect) {
    return (
      <span className={className} style={style} title={title}>
        {text}
      </span>
    )
  }
  return (
    <button
      type="button"
      className={className}
      style={style}
      title={title}
      aria-label={`${text}: ${label}`}
      onClick={() => onSelect(itemKey)}
    >
      {text}
    </button>
  )
}

/** A level's components and kanji as tiles. */
export function LevelGrid({
  course,
  srs,
  level = srs.level,
  onSelect,
  selected,
}: {
  course: Course
  srs: SrsState
  level?: number
  onSelect?: (itemKey: ItemKey) => void
  selected?: ItemKey
}) {
  const unlocked = useMemo(
    () => new Set(unlockedItems(course, srs)),
    [course, srs],
  )
  const { components, kanji } = course.levels[level - 1]

  const row = (keys: ItemKey[]) => (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {keys.map((key) => (
        <ItemTile
          key={key}
          itemKey={key}
          course={course}
          srs={srs}
          unlocked={unlocked}
          onSelect={onSelect}
          selected={selected === key}
        />
      ))}
    </div>
  )

  return (
    <div className="mt-5 space-y-4">
      {components.length > 0 && (
        <div>
          <Label>Components</Label>
          {row(components.map(componentKey))}
        </div>
      )}
      <div>
        <Label>Kanji</Label>
        {row(kanji.map(kanjiKey))}
      </div>
      <p className="text-xs text-[var(--text-muted)]">
        Dashed: locked until its components reach Guru. Outlined: lesson
        waiting. Shaded darker as it moves from Apprentice to Burned.
      </p>
    </div>
  )
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs font-medium tracking-wide text-[var(--text-muted)] uppercase">
      {children}
    </p>
  )
}

const MAX_RESULTS = 60

/**
 * Items matching a search: the character itself, a meaning, a component name
 * or a reading. Kana readings are matched as typed, since anyone searching by
 * reading has a way to type kana.
 */
function search(course: Course, query: string): ItemKey[] {
  const q = query.trim().toLowerCase()
  if (!q) return []
  const hits: ItemKey[] = []

  for (const [id, component] of Object.entries(course.components)) {
    if (component.form === q || component.name.toLowerCase().includes(q)) {
      hits.push(componentKey(id))
    }
  }
  for (const [char, kanji] of Object.entries(course.kanji)) {
    if (
      char === q ||
      kanji.m.toLowerCase().includes(q) ||
      kanji.on.includes(q) ||
      kanji.kun.includes(q)
    ) {
      hits.push(kanjiKey(char))
    }
  }
  return hits.slice(0, MAX_RESULTS)
}

/** Search and level browsing, with the selected item's full card below. */
export function BrowseView({
  course,
  srs,
  usedIn,
  onExit,
}: {
  course: Course
  srs: SrsState
  usedIn: Map<string, string[]>
  onExit: () => void
}) {
  const [level, setLevel] = useState(srs.level)
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<ItemKey | null>(null)

  const results = useMemo(() => search(course, query), [course, query])
  const unlocked = useMemo(
    () => new Set(unlockedItems(course, srs)),
    [course, srs],
  )
  const progress = selected ? srs.progress[selected] : undefined

  return (
    <section className="rounded-xl border border-[var(--border)] bg-[var(--surface-1)] p-5 sm:p-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-[var(--text-primary)]">
          Browse
        </h2>
        <Button onClick={onExit}>Back to overview</Button>
      </div>

      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search a kanji, a meaning, a component name or a reading"
        aria-label="Search the course"
        className="w-full rounded-md border border-[var(--border)] bg-[var(--surface-page)] px-3 py-2 text-[var(--text-primary)]"
      />

      {query.trim() ? (
        <div className="mt-5">
          <Label>
            {results.length === 0
              ? 'Nothing found'
              : `${results.length}${results.length === MAX_RESULTS ? '+' : ''} found`}
          </Label>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {results.map((key) => (
              <ItemTile
                key={key}
                itemKey={key}
                course={course}
                srs={srs}
                unlocked={unlocked}
                onSelect={setSelected}
                selected={selected === key}
              />
            ))}
          </div>
        </div>
      ) : (
        <>
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <Button
              onClick={() => setLevel((l) => Math.max(1, l - 1))}
              disabled={level === 1}
            >
              ← Previous
            </Button>
            <label className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
              Level
              <select
                value={level}
                onChange={(e) => setLevel(Number(e.target.value))}
                className="rounded-md border border-[var(--border)] bg-[var(--surface-page)] px-2 py-1 text-[var(--text-primary)]"
              >
                {course.levels.map((_, index) => (
                  <option key={index} value={index + 1}>
                    {index + 1}
                    {index + 1 === srs.level ? ' (current)' : ''}
                  </option>
                ))}
              </select>
              of {course.levels.length}
            </label>
            <Button
              onClick={() =>
                setLevel((l) => Math.min(course.levels.length, l + 1))
              }
              disabled={level === course.levels.length}
            >
              Next →
            </Button>
          </div>
          <LevelGrid
            course={course}
            srs={srs}
            level={level}
            onSelect={setSelected}
            selected={selected ?? undefined}
          />
        </>
      )}

      {selected && (
        <div className="mt-8 border-t border-[var(--border)] pt-6">
          <div className="mb-3 flex flex-wrap items-center gap-3">
            <KindBadge kind={parseKey(selected).kind} />
            <span className="text-sm text-[var(--text-muted)]">
              {statusOf(selected, srs, unlocked)}
              {progress &&
                progress.stage < BURNED &&
                progress.next !== undefined &&
                ` · next review ${new Date(progress.next).toLocaleString()}`}
              {progress &&
                ` · ${progress.correct} right, ${progress.incorrect} wrong`}
            </span>
          </div>
          <ItemDetails itemKey={selected} course={course} usedIn={usedIn} />
        </div>
      )}
    </section>
  )
}

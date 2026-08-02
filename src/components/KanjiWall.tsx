/**
 * A wall of every kanji in your schedules, shaded by how well you know it.
 *
 * The point of showing unstudied kanji alongside studied ones is that the gaps
 * are the informative part — a grid of only what you already know can't tell
 * you what's left of a JLPT level.
 *
 * Colour uses the same sequential ramp as the activity heatmap, and keeps the
 * same convention: never-studied is an outline, not the bottom of the scale.
 * "I have never seen this" and "I see it and keep failing it" are different
 * facts and must not look alike.
 */

import { useMemo, useState } from 'react'

import {
  JLPT_LEVELS,
  MASTERY_BANDS,
  bandLevel,
  masteryBand,
  useKanji,
} from '../lib/kanji.ts'
import type { MasteryBandId } from '../lib/kanji.ts'
import { heatmapColorVar } from '../lib/palette.ts'
import type { KanjiEntry } from '../types/kanji.ts'

type LevelFilter = 'all' | (typeof JLPT_LEVELS)[number] | 'other'
type BandFilter = 'all' | MasteryBandId
type SortKey = 'level' | 'strokes' | 'mastery'

/**
 * Stable empty array for the pre-load state.
 *
 * A `[]` literal written inline would be a new array on every render, so the
 * filtering `useMemo` below would see a changed dependency every time and
 * re-run — re-sorting 660 entries on each keystroke and defeating the point of
 * memoizing at all.
 */
const NO_KANJI: KanjiEntry[] = []

export function KanjiWall() {
  const state = useKanji()
  const [level, setLevel] = useState<LevelFilter>('all')
  const [band, setBand] = useState<BandFilter>('all')
  const [sort, setSort] = useState<SortKey>('level')
  const [asList, setAsList] = useState(false)
  const [selected, setSelected] = useState<KanjiEntry | null>(null)

  const all = state.status === 'ready' ? state.collection.kanji : NO_KANJI

  const visible = useMemo(() => {
    const filtered = all.filter((entry) => {
      const entryLevel = entry.jlpt ?? 'other'
      if (level !== 'all' && entryLevel !== level) return false
      if (band !== 'all' && masteryBand(entry) !== band) return false
      return true
    })

    // Sorting a copy: the collection arrives pre-sorted by level, and mutating
    // it would make the "level" option stop working after any other sort.
    return [...filtered].sort((a, b) => {
      if (sort === 'strokes') return a.s - b.s || a.c.localeCompare(b.c)
      if (sort === 'mastery') {
        // Unstudied last, so the sort surfaces what you know best first.
        return (b.mastery ?? -1) - (a.mastery ?? -1)
      }
      return 0
    })
  }, [all, level, band, sort])

  if (state.status === 'loading') {
    return <Note>Loading the kanji collection…</Note>
  }

  if (state.status === 'error') {
    return (
      <>
        <Note>Couldn&apos;t load the kanji collection.</Note>
        <p className="mt-2 text-sm text-[var(--text-muted)]">
          {state.error.message}
        </p>
      </>
    )
  }

  const studied = all.filter((k) => k.mastery !== undefined).length

  return (
    <>
      <p className="text-sm text-[var(--text-secondary)]">
        {all.length.toLocaleString()} kanji from{' '}
        {state.collection.sources.length} schedules, {studied.toLocaleString()}{' '}
        studied. Collected{' '}
        {new Date(state.collection.generatedAt).toLocaleDateString(undefined, {
          day: 'numeric',
          month: 'long',
          year: 'numeric',
        })}
        .
      </p>

      {/* One filter row above everything it scopes, rather than controls
          scattered per-section. */}
      <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-3">
        <Filter
          label="Level"
          value={level}
          onChange={(v) => setLevel(v as LevelFilter)}
          options={[
            { value: 'all', label: 'All' },
            ...JLPT_LEVELS.map((l) => ({ value: l, label: l })),
            { value: 'other', label: 'Other' },
          ]}
        />
        <Filter
          label="Mastery"
          value={band}
          onChange={(v) => setBand(v as BandFilter)}
          options={[
            { value: 'all', label: 'All' },
            ...MASTERY_BANDS.map((b) => ({ value: b.id, label: b.label })),
          ]}
        />
        <Filter
          label="Sort"
          value={sort}
          onChange={(v) => setSort(v as SortKey)}
          options={[
            { value: 'level', label: 'JLPT level' },
            { value: 'strokes', label: 'Stroke count' },
            { value: 'mastery', label: 'Mastery' },
          ]}
        />
        <button
          type="button"
          onClick={() => setAsList(!asList)}
          className="rounded-md border border-[var(--border)] px-2.5 py-1 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
        >
          {asList ? 'Show grid' : 'Show list'}
        </button>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-4">
        <MasteryLegend />
        <p className="text-sm text-[var(--text-muted)]">
          Showing {visible.length.toLocaleString()} of{' '}
          {all.length.toLocaleString()}
        </p>
      </div>

      {selected && (
        <KanjiDetail entry={selected} onClose={() => setSelected(null)} />
      )}

      {visible.length === 0 ? (
        <Note>No kanji match these filters.</Note>
      ) : asList ? (
        <KanjiList entries={visible} />
      ) : (
        <div className="mt-6 flex flex-wrap gap-1.5">
          {visible.map((entry) => (
            <Tile
              key={entry.c}
              entry={entry}
              selected={selected?.c === entry.c}
              onSelect={() => setSelected(entry)}
            />
          ))}
        </div>
      )}
    </>
  )
}

function Tile({
  entry,
  selected,
  onSelect,
}: {
  entry: KanjiEntry
  selected: boolean
  onSelect: () => void
}) {
  const band = masteryBand(entry)
  const studied = band !== 'unstudied'
  const level = bandLevel(band)

  const title = studied
    ? `${entry.c} — ${entry.m} (${entry.jlpt ?? 'no level'}, ${entry.mastery}% mastery)`
    : `${entry.c} — ${entry.m} (${entry.jlpt ?? 'no level'}, not studied)`

  return (
    <button
      type="button"
      onClick={onSelect}
      title={title}
      aria-label={title}
      // 40px square: comfortably above the ~24px minimum hit target, and large
      // enough that a dense kanji is still legible.
      className={`flex h-10 w-10 items-center justify-center rounded-md text-xl leading-none ${
        selected ? 'ring-2 ring-[var(--text-primary)]' : ''
      } ${studied ? '' : 'border border-[var(--gridline)]'}`}
      style={
        studied
          ? {
              background: heatmapColorVar(level),
              color: `var(--heat-${level}-ink)`,
            }
          : { color: 'var(--text-muted)' }
      }
    >
      {entry.c}
    </button>
  )
}

function KanjiDetail({
  entry,
  onClose,
}: {
  entry: KanjiEntry
  onClose: () => void
}) {
  return (
    <div className="mt-6 flex flex-wrap items-start gap-5 rounded-xl border border-[var(--border)] bg-[var(--surface-1)] p-5">
      <span className="text-5xl leading-none text-[var(--text-primary)]">
        {entry.c}
      </span>
      <dl className="min-w-48 flex-1 space-y-1 text-sm">
        <Row label="Meaning" value={entry.m} />
        <Row label="On'yomi" value={entry.on || '—'} />
        <Row label="Kun'yomi" value={entry.kun || '—'} />
        <Row label="Strokes" value={String(entry.s)} />
        <Row label="JLPT" value={entry.jlpt ?? 'Not in a JLPT set'} />
        <Row
          label="Mastery"
          value={
            entry.mastery === undefined ? 'Not studied yet' : `${entry.mastery}%`
          }
        />
      </dl>
      <button
        type="button"
        onClick={onClose}
        className="rounded-md border border-[var(--border)] px-2.5 py-1 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
      >
        Close
      </button>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-3">
      <dt className="w-20 shrink-0 text-[var(--text-muted)]">{label}</dt>
      <dd className="text-[var(--text-secondary)]">{value}</dd>
    </div>
  )
}

/** Plain-text twin of the grid, so nothing is reachable only by hovering. */
function KanjiList({ entries }: { entries: KanjiEntry[] }) {
  return (
    <div className="mt-6 max-h-[32rem] overflow-auto">
      <table className="w-full text-left text-sm">
        <thead className="sticky top-0 bg-[var(--surface-1)] text-[var(--text-muted)]">
          <tr>
            <th scope="col" className="py-2 pr-4 font-medium">
              Kanji
            </th>
            <th scope="col" className="py-2 pr-4 font-medium">
              Meaning
            </th>
            <th scope="col" className="py-2 pr-4 font-medium">
              JLPT
            </th>
            <th scope="col" className="py-2 pr-4 font-medium">
              Strokes
            </th>
            <th scope="col" className="py-2 font-medium">
              Mastery
            </th>
          </tr>
        </thead>
        <tbody className="text-[var(--text-secondary)]">
          {entries.map((entry) => (
            <tr key={entry.c} className="border-t border-[var(--gridline)]">
              <th scope="row" className="py-1.5 pr-4 text-lg font-normal">
                {entry.c}
              </th>
              <td className="py-1.5 pr-4">{entry.m}</td>
              <td className="py-1.5 pr-4">{entry.jlpt ?? '—'}</td>
              <td className="py-1.5 pr-4 tabular-nums">{entry.s}</td>
              <td className="py-1.5 tabular-nums">
                {entry.mastery === undefined ? 'Not studied' : `${entry.mastery}%`}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function MasteryLegend() {
  return (
    <ul className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-[var(--text-muted)]">
      {MASTERY_BANDS.map((band) => (
        <li key={band.id} className="flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className={`h-3.5 w-3.5 rounded-[3px] ${
              band.id === 'unstudied' ? 'border border-[var(--gridline)]' : ''
            }`}
            style={
              band.id === 'unstudied'
                ? undefined
                : { background: heatmapColorVar(band.level) }
            }
          />
          {band.label}
        </li>
      ))}
    </ul>
  )
}

function Filter({
  label,
  value,
  onChange,
  options,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  options: { value: string; label: string }[]
}) {
  const id = `filter-${label.toLowerCase()}`
  return (
    <div className="flex items-center gap-2">
      <label htmlFor={id} className="text-sm text-[var(--text-muted)]">
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="rounded-md border border-[var(--border)] bg-[var(--surface-1)] px-2 py-1 text-sm text-[var(--text-primary)]"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  )
}

function Note({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-6 rounded-xl border border-dashed border-[var(--border)] p-8 text-center text-[var(--text-secondary)]">
      {children}
    </p>
  )
}

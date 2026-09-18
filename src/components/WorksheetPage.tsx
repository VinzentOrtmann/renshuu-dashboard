/**
 * Kanji writing-practice worksheets.
 *
 * Built because renshuu's own worksheet creator has three limits: small boxes
 * only work for a single kanji, a multi-kanji word can't be written in
 * connected boxes on a full page, and it produces one page at a time.
 *
 * The PDF comes from the browser's own Print → Save as PDF. The sheets are SVG
 * sized in millimetres, and CSS page rules split them onto real pages — so a
 * 40-word sheet is one click, the output is vector, and the browser embeds the
 * font. Generating the PDF in JavaScript instead would mean shipping a
 * multi-megabyte Japanese font inside the site.
 */

import { useEffect, useMemo, useState } from 'react'

import { loadKanji, masteryBand } from '../lib/kanji.ts'
import {
  DEFAULT_OPTIONS,
  PAPER,
  layoutWorksheet,
  parseWords,
} from '../lib/worksheet.ts'
import type {
  Page,
  PaperSize,
  TracingMode,
  WorksheetOptions,
} from '../lib/worksheet.ts'

/**
 * A textbook-style (kyōkashotai) font, drawn the way characters are handwritten.
 *
 * This matters more than it looks. The gothic fonts most sites use draw some
 * shapes differently from handwriting — hooks, and strokes that are joined or
 * separate — so tracing them would drill the wrong forms. Klee One is loaded in
 * worksheet.html; the fallbacks are the textbook fonts Windows and macOS ship.
 */
const WORKSHEET_FONT =
  "'Klee One', 'UD Digi Kyokasho N-R', 'YuKyokasho', 'Yu Mincho', serif"

/** Box sizes offered, in millimetres. */
const BOX_SIZES = [
  { mm: 9, label: 'Extra small (9 mm)' },
  { mm: 12, label: 'Small (12 mm)' },
  { mm: 15, label: 'Medium (15 mm)' },
  { mm: 20, label: 'Large (20 mm)' },
]

const STORAGE_KEY = 'worksheet-settings'

interface Settings {
  text: string
  options: WorksheetOptions
  cross: boolean
}

const DEFAULT_SETTINGS: Settings = {
  text: '飛行機\n漢字\n練習',
  options: DEFAULT_OPTIONS,
  cross: true,
}

/**
 * Initial settings: a `?words=` link wins (that's how the kanji wall hands over
 * a selection), then whatever was last used, then the defaults.
 *
 * Every storage access is wrapped: private windows and blocked site data throw,
 * and the page must still work — remembering settings is a convenience only.
 */
function initialSettings(): Settings {
  let saved: Partial<Settings> = {}
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) saved = JSON.parse(raw) as Partial<Settings>
  } catch {
    // Ignore: fall through to defaults.
  }

  const fromLink = new URLSearchParams(window.location.search).get('words')

  return {
    text: fromLink ?? saved.text ?? DEFAULT_SETTINGS.text,
    options: { ...DEFAULT_OPTIONS, ...saved.options },
    cross: saved.cross ?? DEFAULT_SETTINGS.cross,
  }
}

export function WorksheetPage() {
  const [settings, setSettings] = useState<Settings>(initialSettings)
  const [status, setStatus] = useState<string | null>(null)

  const { text, options, cross } = settings

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
    } catch {
      // Ignore: see initialSettings.
    }
  }, [settings])

  const pages = useMemo(
    () => layoutWorksheet(parseWords(text), options),
    [text, options],
  )

  const setOption = <K extends keyof WorksheetOptions>(
    key: K,
    value: WorksheetOptions[K],
  ) => setSettings((s) => ({ ...s, options: { ...s.options, [key]: value } }))

  /** Fills the word list from the kanji collection. */
  async function prefill(pick: 'weakest' | 'unstarted') {
    setStatus('Loading your kanji…')
    try {
      const { kanji } = await loadKanji()
      const chosen =
        pick === 'weakest'
          ? kanji
              .filter((k) => k.mastery !== undefined)
              .sort((a, b) => (a.mastery ?? 0) - (b.mastery ?? 0))
              .slice(0, 20)
          : kanji.filter((k) => masteryBand(k) === 'unstudied').slice(0, 40)

      if (chosen.length === 0) {
        setStatus('Nothing matched.')
        return
      }
      setSettings((s) => ({ ...s, text: chosen.map((k) => k.c).join('\n') }))
      setStatus(`Added ${chosen.length} kanji.`)
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error))
    }
  }

  async function print() {
    // Wait for the font. Printing before it loads silently substitutes a
    // fallback, and the traced shapes would be wrong on paper.
    await document.fonts.ready
    window.print()
  }

  const paper = PAPER[options.paper]

  return (
    <div className="min-h-dvh">
      {/* The page size has to be set in CSS, and depends on the chosen paper.
          Margin 0: the layout draws its own margins, and a zero print margin
          also stops the browser adding its date/URL header and footer. */}
      <style>{`@page { size: ${options.paper === 'a4' ? 'A4' : 'letter'}; margin: 0; }`}</style>

      <main className="mx-auto max-w-5xl px-4 py-10 sm:px-6 sm:py-16 print:m-0 print:max-w-none print:p-0">
        <header className="mb-8 print:hidden">
          <a
            href={import.meta.env.BASE_URL}
            className="text-sm text-[var(--text-muted)] underline underline-offset-2 hover:text-[var(--text-secondary)]"
          >
            ← Dashboard
          </a>
          <h1 className="mt-4 text-4xl font-bold tracking-tight text-[var(--text-primary)] sm:text-5xl">
            Writing worksheets
          </h1>
          <p className="mt-3 max-w-2xl text-lg text-[var(--text-secondary)]">
            One word or kanji per line. Words are written in connected boxes,
            and the sheet runs onto as many pages as it needs.
          </p>
        </header>

        <section className="grid gap-6 rounded-xl border border-[var(--border)] bg-[var(--surface-1)] p-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] sm:p-6 print:hidden">
          <div>
            <label
              htmlFor="words"
              className="text-sm font-medium text-[var(--text-primary)]"
            >
              Words and kanji
            </label>
            <textarea
              id="words"
              value={text}
              onChange={(e) =>
                setSettings((s) => ({ ...s, text: e.target.value }))
              }
              rows={9}
              className="mt-2 w-full rounded-md border border-[var(--border)] bg-[var(--surface-page)] p-3 text-lg text-[var(--text-primary)]"
              style={{ fontFamily: WORKSHEET_FONT }}
            />
            <div className="mt-2 flex flex-wrap gap-2">
              <SmallButton onClick={() => prefill('weakest')}>
                My 20 weakest kanji
              </SmallButton>
              <SmallButton onClick={() => prefill('unstarted')}>
                Kanji I haven&apos;t started
              </SmallButton>
            </div>
            {status && (
              <p className="mt-2 text-sm text-[var(--text-muted)]">{status}</p>
            )}
          </div>

          <div className="space-y-3">
            <Select
              label="Paper"
              value={options.paper}
              onChange={(v) => setOption('paper', v as PaperSize)}
              options={[
                { value: 'a4', label: 'A4' },
                { value: 'letter', label: 'US Letter' },
              ]}
            />
            <Select
              label="Box size"
              value={String(options.boxMm)}
              onChange={(v) => setOption('boxMm', Number(v))}
              options={BOX_SIZES.map((b) => ({
                value: String(b.mm),
                label: b.label,
              }))}
            />
            <Select
              label="Rows per word"
              value={String(options.rowsPerWord)}
              onChange={(v) => setOption('rowsPerWord', Number(v))}
              options={[1, 2, 3, 4, 5].map((n) => ({
                value: String(n),
                label: String(n),
              }))}
            />
            <Select
              label="Tracing"
              value={options.tracing}
              onChange={(v) => setOption('tracing', v as TracingMode)}
              options={[
                { value: 'first-row', label: 'First row only' },
                { value: 'all-rows', label: 'Every row' },
                { value: 'none', label: 'None' },
              ]}
            />
            <Select
              label="Traced copies"
              value={String(options.tracedCopies)}
              onChange={(v) => setOption('tracedCopies', Number(v))}
              options={[1, 2, 3, 4, 5, 6].map((n) => ({
                value: String(n),
                label: String(n),
              }))}
            />
            <label className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
              <input
                type="checkbox"
                checked={cross}
                onChange={(e) =>
                  setSettings((s) => ({ ...s, cross: e.target.checked }))
                }
              />
              Centre cross guides
            </label>

            <div className="border-t border-[var(--gridline)] pt-3">
              <button
                type="button"
                onClick={print}
                disabled={pages.length === 0}
                className="rounded-md border border-[var(--border)] bg-[var(--meter-track)] px-4 py-2 text-sm font-medium text-[var(--text-primary)] disabled:opacity-50"
              >
                Print or save as PDF
              </button>
              <p className="mt-2 text-sm text-[var(--text-muted)]">
                {pages.length === 0
                  ? 'Add at least one word.'
                  : `${pages.length} ${pages.length === 1 ? 'page' : 'pages'}. `}
                {pages.length > 0 &&
                  'In the print dialog, choose "Save as PDF" as the printer.'}
              </p>
            </div>
          </div>
        </section>

        <div className="mt-8 flex flex-col items-center gap-6 print:mt-0 print:gap-0">
          {pages.map((page, index) => (
            <Sheet
              // Pages are regenerated wholesale on every edit, so the index is
              // a stable enough key and there is no per-page state to lose.
              key={index}
              page={page}
              options={options}
              cross={cross}
              width={paper.width}
              height={paper.height}
              last={index === pages.length - 1}
            />
          ))}
        </div>
      </main>
    </div>
  )
}

/** One printed page, drawn as an SVG in millimetre units. */
function Sheet({
  page,
  options,
  cross,
  width,
  height,
  last,
}: {
  page: Page
  options: WorksheetOptions
  cross: boolean
  width: number
  height: number
  last: boolean
}) {
  const box = options.boxMm

  return (
    <div
      // White regardless of theme: this is paper, not UI.
      className={`bg-white shadow-md print:shadow-none ${last ? '' : 'break-after-page'}`}
      style={{
        width: `${width}mm`,
        maxWidth: '100%',
        aspectRatio: `${width} / ${height}`,
      }}
    >
      <svg
        viewBox={`0 0 ${width} ${height}`}
        width="100%"
        height="100%"
        role="img"
        aria-label="Writing practice sheet"
        style={{ display: 'block' }}
      >
        {page.rows.map((row, r) =>
          row.groups.map((group, g) => (
            <g key={`${r}-${g}`}>
              {group.cells.map((cell, c) => {
                const x = group.x + c * box
                return (
                  <g key={c}>
                    <rect
                      x={x}
                      y={row.y}
                      width={box}
                      height={box}
                      fill="none"
                      stroke="#a8a8a8"
                      strokeWidth={0.2}
                    />
                    {cross && (
                      // Dashed centre guides help place the character and its
                      // parts, like the cross on genkō yōshi practice paper.
                      <path
                        d={`M${x + box / 2} ${row.y} v${box} M${x} ${row.y + box / 2} h${box}`}
                        stroke="#d4d4d4"
                        strokeWidth={0.15}
                        strokeDasharray="0.8 0.8"
                      />
                    )}
                    {cell.kind !== 'blank' && (
                      <text
                        x={x + box / 2}
                        y={row.y + box / 2}
                        fontSize={box * 0.78}
                        fontFamily={WORKSHEET_FONT}
                        textAnchor="middle"
                        dominantBaseline="central"
                        // Light enough to write over and still see your own
                        // stroke; the model is near-black to copy from.
                        fill={cell.kind === 'model' ? '#1a1a1a' : '#c4c4c4'}
                      >
                        {cell.char}
                      </text>
                    )}
                  </g>
                )
              })}
              {/* A darker outline around the whole copy, so a multi-kanji
                  word reads as one unit rather than as loose characters. */}
              <rect
                x={group.x}
                y={row.y}
                width={group.cells.length * box}
                height={box}
                fill="none"
                stroke="#555"
                strokeWidth={0.35}
              />
            </g>
          )),
        )}
      </svg>
    </div>
  )
}

function Select({
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
  const id = `ws-${label.toLowerCase().replace(/\s+/g, '-')}`
  return (
    <div className="flex items-center justify-between gap-3">
      <label htmlFor={id} className="text-sm text-[var(--text-secondary)]">
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-md border border-[var(--border)] bg-[var(--surface-1)] px-2 py-1 text-sm text-[var(--text-primary)]"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  )
}

function SmallButton({
  onClick,
  children,
}: {
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-md border border-[var(--border)] px-2.5 py-1 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
    >
      {children}
    </button>
  )
}

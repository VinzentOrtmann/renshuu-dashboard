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

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'

import { loadKanji, masteryBand } from '../lib/kanji.ts'
import { loadKanjidic } from '../lib/kanjidic.ts'
import { KANJIVG_SIZE } from '../lib/strokeData.ts'
import { loadStrokes } from '../lib/strokes.ts'
import { loadVocab } from '../lib/vocab.ts'
import { infoLine } from '../lib/wordInfo.ts'
import {
  DEFAULT_OPTIONS,
  INFO_FONT_MM,
  INFO_ROW_MM,
  columnsFor,
  expandWords,
  PAGE_BREAK_TEXT,
  layoutSections,
  pageSize,
  parseSections,
  ungrouped,
} from '../lib/worksheet.ts'
import type { KanjiEntry } from '../types/kanji.ts'
import type { VocabEntry } from '../types/vocab.ts'
import type {
  Orientation,
  Page,
  PaperSize,
  TracedAmount,
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

/** Ink colours for the printed sheet. Fixed, not themed: this is paper. */
const INK = {
  model: '#1a1a1a',
  trace: '#c4c4c4',
  box: '#a8a8a8',
  outline: '#555555',
  guide: '#d4d4d4',
  /** Strokes already drawn in a stroke-order box, behind the new one. */
  earlierStroke: '#bdbdbd',
}

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
  /**
   * Print KanjiVG's credit at the foot of each page. Off by default: for sheets
   * you print for yourself nothing requires it, since CC BY-SA's attribution
   * applies when material is shared or published. Turn it on before giving a
   * PDF to someone else.
   */
  printCredit: boolean
}

const DEFAULT_SETTINGS: Settings = {
  text: '飛行機\n漢字\n練習',
  options: DEFAULT_OPTIONS,
  cross: true,
  printCredit: false,
}

/**
 * Initial settings: a `?words=` link wins (that's how the kanji wall hands over
 * a selection), then whatever was last used, then the defaults.
 *
 * Saved options are merged over the defaults, so settings saved before an
 * option existed pick up that option's default instead of coming back
 * undefined. Every storage access is wrapped: private windows and blocked site
 * data throw, and the page must still work — remembering settings is only a
 * convenience.
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
    printCredit: saved.printCredit ?? DEFAULT_SETTINGS.printCredit,
  }
}

/** Reads the traced-copies select, whose values are numbers or keywords. */
function parseTracedAmount(value: string): TracedAmount {
  return value === 'half' || value === 'all' ? value : Number(value)
}

export function WorksheetPage() {
  const [settings, setSettings] = useState<Settings>(initialSettings)
  const [status, setStatus] = useState<string | null>(null)
  const [strokes, setStrokes] = useState<Map<string, string[]>>(new Map())
  const [loadingStrokes, setLoadingStrokes] = useState(false)
  const [labels, setLabels] = useState<{
    kanji: Map<string, KanjiEntry>
    words: Record<string, VocabEntry>
  } | null>(null)
  // KANJIDIC2 entries for kanji your own data doesn't cover.
  const [dictionary, setDictionary] = useState<Map<string, KanjiEntry>>(
    new Map(),
  )
  const [loadingDictionary, setLoadingDictionary] = useState(false)

  const { text, options, cross, printCredit } = settings
  // Sections (separated by page-break lines) hold groups of words that are kept
  // together on a page. `words` is every word across them, for the loaders
  // that only care which characters are on the sheet.
  const sections = useMemo(() => {
    const parsed = parseSections(text)
    return options.expandKanji ? expandWords(parsed) : ungrouped(parsed)
  }, [text, options.expandKanji])
  const words = useMemo(() => sections.flat(2), [sections])
  const textarea = useRef<HTMLTextAreaElement>(null)
  /** Where to put the cursor once an inserted page break has rendered. */
  const pendingCursor = useRef<number | null>(null)

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
    } catch {
      // Ignore: see initialSettings.
    }
  }, [settings])

  // Fetch stroke data for whatever characters are on the sheet. Loaded files are
  // cached in lib/strokes.ts, so typing only fetches blocks not seen before.
  useEffect(() => {
    const chars = options.strokeOrder
      ? words.flat().filter((char) => !strokes.has(char))
      : []
    if (chars.length === 0) {
      // Clear the flag here too. A load cancelled by an edit never reaches its
      // own `finally`, and if this run has nothing to fetch the flag would
      // otherwise stay set — leaving the print button disabled for good.
      setLoadingStrokes(false)
      return
    }

    let cancelled = false
    setLoadingStrokes(true)
    loadStrokes(chars)
      .then((loaded) => {
        if (cancelled || loaded.size === 0) return
        setStrokes((previous) => new Map([...previous, ...loaded]))
      })
      .finally(() => {
        if (!cancelled) setLoadingStrokes(false)
      })

    return () => {
      cancelled = true
    }
    // `strokes` is left out on purpose: adding it would re-run this after every
    // load, only to find nothing new to fetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [words, options.strokeOrder])

  // Label data: the kanji and vocabulary collections, both from your own
  // renshuu schedules, so labels read the way renshuu shows them. Loaded once,
  // the first time labels are switched on.
  const loadingLabels = options.showInfo && labels === null
  useEffect(() => {
    if (!options.showInfo || labels !== null) return
    let cancelled = false
    Promise.all([loadKanji().catch(() => null), loadVocab()]).then(
      ([kanji, vocab]) => {
        if (cancelled) return
        setLabels({
          kanji: new Map((kanji?.kanji ?? []).map((k) => [k.c, k])),
          words: vocab?.words ?? {},
        })
      },
    )
    return () => {
      cancelled = true
    }
  }, [options.showInfo, labels])

  // Fallback labels: any kanji on the sheet that isn't in your kanji decks is
  // looked up in KANJIDIC2. Only kanji are fetched — kana have no entries — and
  // only once your own data has loaded, so it always takes precedence.
  useEffect(() => {
    const chars =
      options.showInfo && labels
        ? words
            .flat()
            .filter(
              (char) =>
                /\p{Script=Han}/u.test(char) &&
                !labels.kanji.has(char) &&
                !dictionary.has(char),
            )
        : []
    if (chars.length === 0) {
      // Reset here as well as in `finally`, for the same reason as the stroke
      // loader above: a cancelled load never reaches its own reset.
      setLoadingDictionary(false)
      return
    }

    let cancelled = false
    setLoadingDictionary(true)
    loadKanjidic(chars)
      .then((loaded) => {
        if (cancelled || loaded.size === 0) return
        setDictionary((previous) => new Map([...previous, ...loaded]))
      })
      .finally(() => {
        if (!cancelled) setLoadingDictionary(false)
      })

    return () => {
      cancelled = true
    }
    // `dictionary` is left out on purpose, as with `strokes` above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [words, options.showInfo, labels])

  const pages = useMemo(
    () =>
      layoutSections(
        sections,
        options,
        (char) => strokes.get(char)?.length,
        (word) =>
          labels
            ? infoLine(word, {
                word: (written) => labels.words[written],
                // Your renshuu data first; the dictionary only fills gaps.
                kanji: (char) => labels.kanji.get(char) ?? dictionary.get(char),
                strokes: (char) => strokes.get(char)?.length,
              })
            : undefined,
      ),
    [sections, options, strokes, labels, dictionary],
  )

  // Printing waits for every load, so a sheet can't go to paper with labels or
  // stroke order that simply hadn't arrived yet.
  const busy = loadingStrokes || loadingLabels || loadingDictionary

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

  /**
   * Inserts a page break at the cursor, always on a line of its own — a `---`
   * typed onto the end of a word's line would be read as part of that word.
   */
  function insertPageBreak() {
    const field = textarea.current
    const at = field?.selectionStart ?? text.length
    const before = text.slice(0, at)
    const after = text.slice(at)
    const lead = before === '' || before.endsWith('\n') ? '' : '\n'
    const trail = after.startsWith('\n') ? '' : '\n'
    const inserted = `${lead}${PAGE_BREAK_TEXT}${trail}`

    setSettings((s) => ({ ...s, text: before + inserted + after }))

    // Cursor goes to the start of the line after the break, ready for the next
    // word. When a newline already followed, that's one character further on.
    pendingCursor.current = at + inserted.length + (trail === '' ? 1 : 0)
  }

  // Applied after React has committed the new text. Setting it straight away
  // doesn't stick: the re-render replaces the textarea's value, which moves the
  // cursor to the end.
  useLayoutEffect(() => {
    const cursor = pendingCursor.current
    if (cursor === null) return
    pendingCursor.current = null
    textarea.current?.focus()
    textarea.current?.setSelectionRange(cursor, cursor)
  }, [text])

  async function print() {
    // Wait for the font. Printing before it loads silently substitutes a
    // fallback, and the traced shapes would be wrong on paper.
    await document.fonts.ready
    window.print()
  }

  const paper = pageSize(options)
  const pageRule = `${options.paper === 'a4' ? 'A4' : 'letter'} ${options.orientation}`

  return (
    <div className="min-h-dvh">
      {/* The page size has to be set in CSS, and depends on the chosen paper
          and orientation. Margin 0: the layout draws its own margins, and a
          zero print margin also stops the browser adding its date/URL header
          and footer. */}
      <style>{`@page { size: ${pageRule}; margin: 0; }`}</style>

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
              ref={textarea}
              value={text}
              onChange={(e) =>
                setSettings((s) => ({ ...s, text: e.target.value }))
              }
              rows={11}
              className="mt-2 w-full rounded-md border border-[var(--border)] bg-[var(--surface-page)] p-3 text-lg text-[var(--text-primary)]"
              style={{ fontFamily: WORKSHEET_FONT }}
            />
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              With &ldquo;practise each kanji&rdquo; on, typing just 緊張 gives
              緊, 張, 緊張, kept together on one page. A line of{' '}
              <code>{PAGE_BREAK_TEXT}</code> starts a new page.
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <SmallButton onClick={insertPageBreak}>
                Insert page break
              </SmallButton>
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
              label="Orientation"
              value={options.orientation}
              onChange={(v) => setOption('orientation', v as Orientation)}
              options={[
                { value: 'portrait', label: 'Portrait (upright)' },
                { value: 'landscape', label: 'Landscape (horizontal)' },
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
              onChange={(v) => setOption('tracedCopies', parseTracedAmount(v))}
              options={[
                ...[1, 2, 3, 4, 5, 6].map((n) => ({
                  value: String(n),
                  label: String(n),
                })),
                { value: 'half', label: 'Half the row' },
                { value: 'all', label: 'Whole row' },
              ]}
            />
            <Checkbox
              label="Stroke order"
              checked={options.strokeOrder}
              onChange={(checked) => setOption('strokeOrder', checked)}
            />
            <Checkbox
              label="Practise each kanji before its word"
              checked={options.expandKanji}
              onChange={(checked) => setOption('expandKanji', checked)}
            />
            <Checkbox
              label="Meaning and reading"
              checked={options.showInfo}
              onChange={(checked) => setOption('showInfo', checked)}
            />
            <Checkbox
              label="Fill the rest of the last page"
              checked={options.fillPage}
              onChange={(checked) => setOption('fillPage', checked)}
            />
            <Checkbox
              label="Centre cross guides"
              checked={cross}
              onChange={(checked) =>
                setSettings((s) => ({ ...s, cross: checked }))
              }
            />
            <Checkbox
              label="Print stroke-data credit (for sharing)"
              checked={printCredit}
              onChange={(checked) =>
                setSettings((s) => ({ ...s, printCredit: checked }))
              }
            />

            <div className="border-t border-[var(--gridline)] pt-3">
              <button
                type="button"
                onClick={print}
                disabled={pages.length === 0 || busy}
                className="rounded-md border border-[var(--border)] bg-[var(--meter-track)] px-4 py-2 text-sm font-medium text-[var(--text-primary)] disabled:opacity-50"
              >
                Print or save as PDF
              </button>
              <p className="mt-2 text-sm text-[var(--text-muted)]">
                {pages.length === 0
                  ? 'Add at least one word.'
                  : busy
                    ? 'Loading stroke order and labels…'
                    : `${pages.length} ${pages.length === 1 ? 'page' : 'pages'}. ` +
                      'In the print dialog, choose "Save as PDF" and keep the scale at 100%.'}
              </p>
            </div>
          </div>
        </section>

        {options.strokeOrder && (
          <p className="mt-3 text-sm text-[var(--text-muted)] print:hidden">
            Stroke order from{' '}
            <a
              href="https://kanjivg.tagaini.net"
              className="underline underline-offset-2"
            >
              KanjiVG
            </a>{' '}
            by Ulrich Apel, CC BY-SA 3.0. Kanji labels outside your decks from{' '}
            <a
              href="https://www.edrdg.org/wiki/index.php/KANJIDIC_Project"
              className="underline underline-offset-2"
            >
              KANJIDIC2
            </a>{' '}
            (EDRDG), CC BY-SA 4.0.
          </p>
        )}

        <div className="mt-8 flex flex-col items-center gap-6 print:mt-0 print:gap-0">
          {pages.map((page, index) => (
            <Sheet
              // Pages are regenerated wholesale on every edit, so the index is
              // a stable enough key and there is no per-page state to lose.
              key={index}
              page={page}
              options={options}
              cross={cross}
              printCredit={printCredit}
              strokes={strokes}
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
  printCredit,
  strokes,
  width,
  height,
  last,
}: {
  page: Page
  options: WorksheetOptions
  cross: boolean
  printCredit: boolean
  strokes: Map<string, string[]>
  width: number
  height: number
  last: boolean
}) {
  const box = options.boxMm
  // Left edge of the grid, matching the layout's centring, so labels line up
  // with the boxes beneath them.
  const gridLeft = (width - columnsFor(options) * box) / 2
  const hasStrokeOrder = page.rows.some((row) =>
    row.groups.some((group) => group.cells[0]?.kind === 'stroke'),
  )

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
          row.text !== undefined ? (
            <text
              key={r}
              x={gridLeft}
              y={row.y + INFO_ROW_MM / 2}
              fontSize={INFO_FONT_MM}
              fontFamily={WORKSHEET_FONT}
              dominantBaseline="central"
              fill="#3a3a3a"
            >
              {row.text}
            </text>
          ) : (
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
                        stroke={INK.box}
                        strokeWidth={0.2}
                      />
                      {cross && (
                        // Dashed centre guides help place the character and its
                        // parts, like the cross on genkō yōshi practice paper.
                        <path
                          d={`M${x + box / 2} ${row.y} v${box} M${x} ${row.y + box / 2} h${box}`}
                          stroke={INK.guide}
                          strokeWidth={0.15}
                          strokeDasharray="0.8 0.8"
                        />
                      )}
                      {cell.kind === 'stroke' ? (
                        <StrokeStep
                          paths={strokes.get(cell.char) ?? []}
                          step={cell.step ?? 0}
                          x={x}
                          y={row.y}
                          box={box}
                        />
                      ) : (
                        cell.kind !== 'blank' && (
                          <text
                            x={x + box / 2}
                            y={row.y + box / 2}
                            fontSize={box * 0.78}
                            fontFamily={WORKSHEET_FONT}
                            textAnchor="middle"
                            dominantBaseline="central"
                            // Light enough to write over and still see your own
                            // stroke; the model is near-black to copy from.
                            fill={cell.kind === 'model' ? INK.model : INK.trace}
                          >
                            {cell.char}
                          </text>
                        )
                      )}
                    </g>
                  )
                })}
                {/* A darker outline around the whole unit, so a multi-kanji word
                  or a stroke sequence reads as one thing rather than as loose
                  boxes. */}
                <rect
                  x={group.x}
                  y={row.y}
                  width={group.cells.length * box}
                  height={box}
                  fill="none"
                  stroke={INK.outline}
                  strokeWidth={0.35}
                />
              </g>
            ))
          ),
        )}

        {hasStrokeOrder && printCredit && (
          // Only when asked for: the credit is needed when a sheet is shared,
          // not for one printed for your own use. See Settings.printCredit.
          <text
            x={width / 2}
            y={height - options.marginMm / 2}
            fontSize={2.2}
            textAnchor="middle"
            dominantBaseline="central"
            fill="#9a9a9a"
            fontFamily="system-ui, sans-serif"
          >
            Stroke order: KanjiVG by Ulrich Apel, CC BY-SA 3.0
          </text>
        )}
      </svg>
    </div>
  )
}

/**
 * One box of the stroke-order build-up: the first `step` strokes, with the
 * newest dark and the ones before it grey, so reading along the row shows the
 * order and each new stroke stands out against what's already there.
 */
function StrokeStep({
  paths,
  step,
  x,
  y,
  box,
}: {
  paths: string[]
  step: number
  x: number
  y: number
  box: number
}) {
  const scale = box / KANJIVG_SIZE
  return (
    <g
      transform={`translate(${x} ${y}) scale(${scale})`}
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {paths.slice(0, step).map((d, index) => {
        const current = index === step - 1
        return (
          <path
            key={index}
            d={d}
            stroke={current ? INK.model : INK.earlierStroke}
            // In KanjiVG's 109-unit grid; scaled with the box.
            strokeWidth={current ? 3.6 : 3}
          />
        )
      })}
    </g>
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

function Checkbox({
  label,
  checked,
  onChange,
}: {
  label: string
  checked: boolean
  onChange: (checked: boolean) => void
}) {
  return (
    <label className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      {label}
    </label>
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

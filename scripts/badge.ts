/**
 * Renders the embeddable progress badge as a self-contained SVG.
 *
 * The daily workflow writes these next to the archive, so the badge updates
 * itself with no action from you.
 *
 *
 * ## Why this is generated server-side rather than being a React component
 *
 * GitHub strips <script> and <iframe> from README markdown and serves images
 * through its Camo proxy. Nothing that executes can run there — the only thing
 * that renders is a plain image. So every number here is baked into the SVG as
 * literal text at generation time: no fetching, no scripting, no external
 * references of any kind (an <img>-embedded SVG cannot load them anyway).
 *
 *
 * ## Why the colours are duplicated from index.css
 *
 * This runs under Node, where there is no DOM and no CSS custom properties to
 * read, so `var(--series-vocab)` would resolve to nothing. The palette below is
 * therefore a second copy of the values in src/index.css.
 *
 * That duplication is deliberate but it is still duplication: if you change a
 * colour in index.css, change it here too. The alternative — generating the CSS
 * from TypeScript at build time — would remove the risk but adds a build step
 * that isn't worth it for eight hex values.
 */

import { heatmapLevel } from '../src/lib/palette.ts'
import { levelPercent, nextLevel } from '../src/lib/levels.ts'
import type { DailySnapshot, History } from '../src/types/history.ts'

/** Colours for one theme. Must stay in step with src/index.css. */
interface BadgeTheme {
  surface: string
  border: string
  textPrimary: string
  textSecondary: string
  textMuted: string
  meterTrack: string
  meterFill: string
  /** Heatmap ramp, index 0 = studied nothing. */
  ramp: readonly string[]
  /** Outline for a day the archive never captured. */
  noData: string
}

const LIGHT: BadgeTheme = {
  surface: '#fcfcfb',
  border: '#e1e0d9',
  textPrimary: '#0b0b0b',
  textSecondary: '#52514e',
  textMuted: '#898781',
  meterTrack: '#cde2fb',
  meterFill: '#2a78d6',
  ramp: ['#eceae2', '#cde2fb', '#86b6ef', '#3987e5', '#1c5cab'],
  noData: '#e1e0d9',
}

const DARK: BadgeTheme = {
  surface: '#1a1a19',
  border: '#2c2c2a',
  textPrimary: '#ffffff',
  textSecondary: '#c3c2b7',
  textMuted: '#898781',
  meterTrack: '#184f95',
  meterFill: '#3987e5',
  ramp: ['#242423', '#184f95', '#256abf', '#3987e5', '#6da7ec'],
  noData: '#383835',
}

export const BADGE_THEMES = { light: LIGHT, dark: DARK }

export type BadgeThemeName = keyof typeof BADGE_THEMES

/** Days of activity shown in the strip along the bottom. */
const STRIP_DAYS = 14

const WIDTH = 420
const HEIGHT = 112

/**
 * Escapes text for safe inclusion in SVG.
 *
 * Everything rendered here is a number or a formatted date, so this is belt and
 * braces — but the badge is published publicly, and an unescaped `&` alone is
 * enough to make the whole file fail to parse as XML.
 */
function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** Formats a YYYY-MM-DD date as e.g. "29 Jul 2026", without locale surprises. */
function formatDate(date: string): string {
  const months = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
  ]
  const [year, month, day] = date.split('-').map(Number)
  return `${day} ${months[month - 1]} ${year}`
}

/** Subtracts whole days from a YYYY-MM-DD date. */
function subtractDays(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d - days)).toISOString().slice(0, 10)
}

/**
 * The last STRIP_DAYS days ending on the latest snapshot.
 *
 * `undefined` marks a day the archive has no entry for, which is drawn as an
 * outline rather than a filled cell — a day we never captured is not a day of
 * no study, and the badge shouldn't claim otherwise.
 */
function activityStrip(snapshots: DailySnapshot[]): (number | undefined)[] {
  const byDate = new Map(snapshots.map((s) => [s.date, s.studiedToday.all]))
  const end = snapshots.at(-1)!.date

  return Array.from({ length: STRIP_DAYS }, (_, i) =>
    byDate.get(subtractDays(end, STRIP_DAYS - 1 - i)),
  )
}

/** A `<text>` element. */
function text(
  x: number,
  y: number,
  content: string | number,
  options: { size: number; fill: string; weight?: number; anchor?: string; spacing?: number },
): string {
  const attrs = [
    `x="${x}"`,
    `y="${y}"`,
    `font-family="system-ui, -apple-system, Segoe UI, sans-serif"`,
    `font-size="${options.size}"`,
    `fill="${options.fill}"`,
    options.weight ? `font-weight="${options.weight}"` : '',
    options.anchor ? `text-anchor="${options.anchor}"` : '',
    options.spacing ? `letter-spacing="${options.spacing}"` : '',
  ].filter(Boolean)

  return `<text ${attrs.join(' ')}>${escapeXml(String(content))}</text>`
}

/** A big number with a small caption underneath. */
function stat(x: number, value: string, label: string, theme: BadgeTheme): string {
  return [
    // Proportional figures, not tabular: at this size tabular digits make a
    // number like 135 look loosely spaced.
    text(x, 58, value, { size: 26, fill: theme.textPrimary, weight: 500 }),
    text(x, 74, label, { size: 11, fill: theme.textSecondary }),
  ].join('')
}

/**
 * Renders the badge.
 *
 * Returns an empty-state badge when the archive has no snapshots, rather than
 * throwing — a broken image on someone's profile is a worse failure than a
 * badge that honestly says there's no data yet.
 */
export function renderBadge(history: History, themeName: BadgeThemeName): string {
  const theme = BADGE_THEMES[themeName]
  const latest = history.snapshots.at(-1)

  const frame =
    `<rect x="0.5" y="0.5" width="${WIDTH - 1}" height="${HEIGHT - 1}" rx="8" ` +
    `fill="${theme.surface}" stroke="${theme.border}"/>`

  const heading = text(16, 26, '練習  RENSHUU', {
    size: 11,
    fill: theme.textMuted,
    spacing: 1.2,
  })

  const open =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" ` +
    `viewBox="0 0 ${WIDTH} ${HEIGHT}" role="img" aria-label="Renshuu study progress">`

  if (!latest) {
    return [
      open,
      frame,
      heading,
      text(16, 62, 'No snapshots yet', { size: 16, fill: theme.textSecondary }),
      '</svg>',
    ].join('')
  }

  // Vocabulary is the headline category: it's the largest by a wide margin, so
  // it's the number that moves most visibly.
  const level = nextLevel(latest, 'vocab')
  const percent = level ? levelPercent(latest, 'vocab', level) : 100
  const meterWidth = 118
  const filled = Math.round((Math.max(0, Math.min(100, percent)) / 100) * meterWidth)

  const meter = [
    text(286, 44, level ? `${level.toUpperCase()} vocabulary` : 'Vocabulary complete', {
      size: 11,
      fill: theme.textSecondary,
    }),
    `<rect x="286" y="52" width="${meterWidth}" height="7" rx="3.5" fill="${theme.meterTrack}"/>`,
    // Skip a zero-width bar entirely: a rounded rect of width 0 still paints a
    // small blob in some renderers, which would misread as progress.
    filled > 0
      ? `<rect x="286" y="52" width="${filled}" height="7" rx="3.5" fill="${theme.meterFill}"/>`
      : '',
    text(286, 74, `${percent}%`, { size: 11, fill: theme.textMuted }),
  ].join('')

  const cells = activityStrip(history.snapshots)
    .map((count, i) => {
      const x = 16 + i * 12
      if (count === undefined) {
        return (
          `<rect x="${x + 0.5}" y="88.5" width="8" height="8" rx="2" ` +
          `fill="none" stroke="${theme.noData}"/>`
        )
      }
      return `<rect x="${x}" y="88" width="9" height="9" rx="2" fill="${theme.ramp[heatmapLevel(count)]}"/>`
    })
    .join('')

  return [
    open,
    frame,
    heading,
    stat(16, latest.studiedTotal.all.toLocaleString('en-GB'), 'terms studied', theme),
    stat(132, String(latest.adventureLevel), 'level', theme),
    stat(206, String(latest.studiedToday.all), 'today', theme),
    meter,
    cells,
    text(192, 96, `last ${STRIP_DAYS} days`, { size: 10, fill: theme.textMuted }),
    text(WIDTH - 16, 96, formatDate(latest.date), {
      size: 10,
      fill: theme.textMuted,
      anchor: 'end',
    }),
    '</svg>',
  ].join('')
}

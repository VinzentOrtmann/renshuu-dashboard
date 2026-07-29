/**
 * Chart colour roles and the buckets the heatmap uses.
 *
 * The actual colour values are NOT here — they live as CSS custom properties in
 * src/index.css, together with the note recording how they were validated. This
 * file only maps a category to the *name* of its colour role.
 *
 * That split is deliberate. Charts reference `var(--series-vocab)`, which the
 * browser resolves even inside an SVG presentation attribute, so light and dark
 * are handled entirely by CSS. Keeping hexes here as well would mean two
 * sources of truth for the same colour, and the JavaScript copy would be the
 * one that silently failed to follow the theme.
 */

/**
 * The four categories renshuu reports lifetime totals for, in fixed order.
 *
 * The order matters and must not be rearranged casually: colours are assigned
 * by slot, and the slot ordering is what keeps adjacent pairs distinguishable
 * under colour-vision deficiency. It's a safety property, not decoration.
 */
export const SERIES_CATEGORIES = ['vocab', 'kanji', 'grammar', 'sent'] as const

export type SeriesCategory = (typeof SERIES_CATEGORIES)[number]

/** Human-readable names. `sent` is renshuu's abbreviation for sentences. */
export const CATEGORY_LABELS: Record<SeriesCategory, string> = {
  vocab: 'Vocabulary',
  kanji: 'Kanji',
  grammar: 'Grammar',
  sent: 'Sentences',
}

/**
 * Labels for every schedule `booktype`, which is a wider set than the four
 * series above: schedules can also be conjugation drills, for which renshuu
 * reports no lifetime total.
 */
export const BOOKTYPE_LABELS: Record<string, string> = {
  vocab: 'Vocabulary',
  kanji: 'Kanji',
  grammar: 'Grammar',
  sent: 'Sentences',
  conj: 'Conjugation',
  aconj: 'Adjective conjugation',
}

/** CSS colour reference for each series, for both SVG marks and HTML swatches. */
export const SERIES_COLOR_VARS: Record<SeriesCategory, string> = {
  vocab: 'var(--series-vocab)',
  kanji: 'var(--series-kanji)',
  grammar: 'var(--series-grammar)',
  sent: 'var(--series-sent)',
}

/** How many steps the heatmap ramp has, including the "studied nothing" step. */
export const HEATMAP_STEPS = 5

/** CSS colour reference for a heatmap step. */
export function heatmapColorVar(level: number): string {
  return `var(--heat-${level})`
}

/**
 * Picks a heatmap step for a day's study count.
 *
 * Thresholds are fixed rather than derived from the data's own maximum, so a
 * colour means the same thing every time you look. With a relative scale, one
 * unusually big day would silently re-shade every other day on the chart.
 */
export function heatmapLevel(count: number): number {
  if (count <= 0) return 0
  if (count < 25) return 1
  if (count < 75) return 2
  if (count < 150) return 3
  return 4
}

/** Human-readable bounds for each heatmap step, used by the legend and tooltip. */
export const HEATMAP_LEVEL_LABELS = [
  'nothing',
  '1–24 terms',
  '25–74 terms',
  '75–149 terms',
  '150+ terms',
]

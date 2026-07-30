/**
 * Captures today's renshuu stats and appends them to data/history.json.
 *
 * Run daily by .github/workflows/snapshot.yml, which commits the updated file
 * back to the repo. That accumulating file is the permanent archive — the whole
 * point of this project, since renshuu itself doesn't retain the daily series.
 *
 * Locally:
 *   npm run snapshot            # write the snapshot
 *   npm run snapshot -- --dry-run   # print what would be written, change nothing
 *
 * Needs RENSHUU_API_KEY, from `.env` locally or the repo secret in CI.
 *
 *
 * ## Why the timezone handling below isn't over-engineering
 *
 * `studied.today_*` resets at midnight in *renshuu's* idea of your day. GitHub
 * Actions runners are on UTC. Get this wrong and the archive is quietly
 * garbage: a cron at 00:00 UTC is 02:00 in Berlin, so it would capture a day
 * that is two hours old and record ~0 terms studied for every single day, while
 * the day that actually just ended is never captured at all.
 *
 * So: date-stamp entries in the study timezone, and schedule the cron to land
 * shortly *before* local midnight, when the day is as complete as it will get.
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { createRenshuuClient, RenshuuApiError } from '../src/api/renshuu.ts'
import { BADGE_THEMES, renderBadge } from './badge.ts'
import type { BadgeThemeName } from './badge.ts'
import { HISTORY_VERSION } from '../src/types/history.ts'
import type {
  DailySnapshot,
  History,
  ScheduleSnapshot,
} from '../src/types/history.ts'
import type { RenshuuProfile, RenshuuSchedule } from '../src/types/renshuu.ts'

/** Resolve paths relative to this file, so the script works from any cwd. */
const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')

/**
 * The archive lives under `public/` rather than a top-level `data/`.
 *
 * Vite only ships two kinds of file to the built site: modules that something
 * imports, and the contents of `public/`. Importing the archive would bundle it
 * into the JavaScript, which gets worse every day it grows. Putting it in
 * `public/` means it's copied to `dist/` untouched and the dashboard can fetch
 * it at runtime as `<base>/data/history.json` — one small JSON request, no
 * effect on bundle size.
 */
const HISTORY_PATH = resolve(projectRoot, 'public/data/history.json')

/**
 * Where the embeddable badges are written.
 *
 * Two files rather than one because GitHub renders README images through a
 * caching proxy where CSS media queries inside an SVG are unreliable. Shipping
 * a light and a dark file and selecting between them with a <picture> element
 * is the approach GitHub actually documents.
 */
const BADGE_PATHS: Record<BadgeThemeName, string> = {
  light: resolve(projectRoot, 'public/badge-light.svg'),
  dark: resolve(projectRoot, 'public/badge-dark.svg'),
}

/**
 * Timezone whose midnight defines a "study day".
 *
 * Override with SNAPSHOT_TIMEZONE if you move or if your renshuu account is set
 * to a different zone. Must match renshuu's own reset boundary, otherwise
 * today's counts get filed under the wrong date.
 */
const TIMEZONE = process.env.SNAPSHOT_TIMEZONE ?? 'Europe/Berlin'

/**
 * Formats an instant as YYYY-MM-DD in the given timezone.
 *
 * Built from parts rather than string-slicing an ISO date, because
 * `toISOString()` is always UTC and would give the wrong date for anyone not on
 * UTC for part of the day.
 */
function formatDate(instant: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(instant)

  const find = (type: string) =>
    parts.find((part) => part.type === type)?.value ?? '00'

  return `${find('year')}-${find('month')}-${find('day')}`
}

/** Converts one API schedule into the leaner archive form. */
function toScheduleSnapshot(schedule: RenshuuSchedule): ScheduleSnapshot {
  return {
    id: schedule.id,
    name: schedule.name,
    booktype: schedule.booktype,
    // The API uses 0/1; a real boolean is friendlier to read and to chart.
    isFrozen: schedule.is_frozen === 1,
    studiedCount: schedule.terms.studied_count,
    totalCount: schedule.terms.total_count,
    newToday: schedule.new_terms.today_count,
    newThisWeek: schedule.new_terms.rolling_week_count,
    dueToday: schedule.today.review,
    // `upcoming` is deliberately dropped — see src/types/history.ts.
  }
}

/** Builds a full day's entry from the two API responses. */
function buildSnapshot(
  profile: RenshuuProfile,
  schedules: RenshuuSchedule[],
  date: string,
  capturedAt: Date,
): DailySnapshot {
  const studied = profile.studied
  const levels = profile.level_progress_percs

  return {
    date,
    capturedAt: capturedAt.toISOString(),
    adventureLevel: profile.adventure_level,
    studiedToday: {
      all: studied.today_all,
      vocab: studied.today_vocab,
      kanji: studied.today_kanji,
      grammar: studied.today_grammar,
      sent: studied.today_sent,
      conj: studied.today_conj,
      aconj: studied.today_aconj,
    },
    studiedTotal: {
      all: studied.total,
      vocab: studied.total_vocab,
      kanji: studied.total_kanji,
      grammar: studied.total_grammar,
      sent: studied.total_sent,
    },
    jlptProgress: {
      vocab: levels.vocab,
      kanji: levels.kanji,
      grammar: levels.grammar,
      sent: levels.sent,
    },
    // Only the day-streak is archived. The correct-answers streak is a
    // within-session number that says little a day later.
    dayStreaks: {
      vocab: profile.streaks.vocab.days_studied_in_a_row,
      kanji: profile.streaks.kanji.days_studied_in_a_row,
      grammar: profile.streaks.grammar.days_studied_in_a_row,
      sent: profile.streaks.sent.days_studied_in_a_row,
      conj: profile.streaks.conj.days_studied_in_a_row,
      aconj: profile.streaks.aconj.days_studied_in_a_row,
    },
    schedules: schedules.map(toScheduleSnapshot),
  }
}

/**
 * Reads the existing archive, or returns an empty one on first run.
 *
 * A missing file is normal (day one). A *corrupt* file is not, and throws
 * rather than being silently replaced — overwriting would destroy exactly the
 * history this project exists to preserve.
 */
async function readHistory(): Promise<History> {
  let raw: string
  try {
    raw = await readFile(HISTORY_PATH, 'utf8')
  } catch (error) {
    const isMissing =
      error instanceof Error && 'code' in error && error.code === 'ENOENT'
    if (isMissing) {
      console.log('No history file yet — starting a new archive.')
      return { version: HISTORY_VERSION, snapshots: [] }
    }
    throw error
  }

  let parsed: History
  try {
    // Strip a leading byte-order mark. We never write one, but a Windows editor
    // (Notepad, PowerShell's Set-Content) will happily add one if the file is
    // ever touched by hand — and JSON.parse rejects it, which would otherwise
    // block every future snapshot until someone worked out why.
    parsed = JSON.parse(raw.replace(/^﻿/, '')) as History
  } catch (cause) {
    throw new Error(
      `${HISTORY_PATH} exists but is not valid JSON. Refusing to overwrite it — ` +
        `fix or restore the file first. (${String(cause)})`,
    )
  }

  if (!Array.isArray(parsed.snapshots)) {
    throw new Error(
      `${HISTORY_PATH} is missing a "snapshots" array. Refusing to overwrite it.`,
    )
  }

  return parsed
}

/** Structural equality, used to tell a real change from a fresh timestamp. */
function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) {
    return false
  }
  if (Array.isArray(a) !== Array.isArray(b)) return false

  const aKeys = Object.keys(a)
  const bKeys = Object.keys(b)
  if (aKeys.length !== bKeys.length) return false

  return aKeys.every(
    (key) =>
      Object.hasOwn(b, key) &&
      deepEqual(
        (a as Record<string, unknown>)[key],
        (b as Record<string, unknown>)[key],
      ),
  )
}

/**
 * True when two snapshots differ only by when they were captured.
 *
 * The script runs several times a day, and most runs find nothing new — you
 * weren't studying in that particular three-hour window. Without this check
 * every run would rewrite the file, because `capturedAt` is always new, and the
 * archive would collect eight empty commits a day.
 */
function sameExceptCapturedAt(a: DailySnapshot, b: DailySnapshot): boolean {
  const { capturedAt: _a, ...restA } = a
  const { capturedAt: _b, ...restB } = b
  return deepEqual(restA, restB)
}

/**
 * Inserts a snapshot, replacing any existing entry for the same date.
 *
 * Replace rather than skip on a same-day re-run: a later run has seen more of
 * the day, so its `studiedToday` counts are strictly better. Skipping would
 * permanently freeze the day at whatever the first run happened to catch —
 * which is exactly how 29 July 2026 ended up recorded as an afternoon total.
 */
function upsertSnapshot(
  snapshots: DailySnapshot[],
  snapshot: DailySnapshot,
): { snapshots: DailySnapshot[]; replaced: boolean; unchanged: boolean } {
  const existingIndex = snapshots.findIndex((s) => s.date === snapshot.date)
  const next = [...snapshots]

  const unchanged =
    existingIndex >= 0 &&
    sameExceptCapturedAt(snapshots[existingIndex], snapshot)

  if (existingIndex >= 0) {
    next[existingIndex] = snapshot
  } else {
    next.push(snapshot)
  }

  // Keep the archive oldest-first so charts can read it without sorting, and
  // so a day arriving late (after a failed run) still lands in order.
  next.sort((a, b) => a.date.localeCompare(b.date))

  return { snapshots: next, replaced: existingIndex >= 0, unchanged }
}

async function main() {
  const dryRun = process.argv.includes('--dry-run')
  const apiKey = process.env.RENSHUU_API_KEY

  if (!apiKey) {
    console.error('RENSHUU_API_KEY is not set.')
    console.error('Locally: copy .env.example to .env and add your key.')
    console.error('In CI: set the RENSHUU_API_KEY repository secret.')
    process.exit(1)
  }

  const capturedAt = new Date()
  const date = formatDate(capturedAt, TIMEZONE)
  console.log(`Snapshot for ${date} (timezone ${TIMEZONE})`)

  const client = createRenshuuClient(apiKey)

  // Fetch both endpoints together — they're independent, so there's no reason
  // to wait for one before starting the other.
  const [profile, scheduleList] = await Promise.all([
    client.getProfile(),
    client.getSchedules(),
  ])

  const snapshot = buildSnapshot(
    profile,
    scheduleList.schedules,
    date,
    capturedAt,
  )

  console.log(
    `  level ${snapshot.adventureLevel}, ` +
      `${snapshot.studiedToday.all} studied today, ` +
      `${snapshot.studiedTotal.all} lifetime, ` +
      `${snapshot.schedules.length} schedules`,
  )

  const history = await readHistory()
  const { snapshots, replaced, unchanged } = upsertSnapshot(
    history.snapshots,
    snapshot,
  )

  const updated = { version: HISTORY_VERSION, snapshots }

  if (dryRun) {
    console.log('\n--dry-run: nothing written. Entry would be:')
    console.log(JSON.stringify(snapshot, null, 2))
    return
  }

  // Nothing studied since the last run in this window. Leave the file alone so
  // the workflow sees a clean tree and skips the commit and the redeploy.
  if (unchanged) {
    console.log(`No change since the last run — ${date} left as it was.`)
    return
  }

  // Pretty-printed with a trailing newline: this file is committed daily, so
  // readable one-value-per-line diffs are worth the extra bytes.
  const contents = `${JSON.stringify(updated, null, 2)}\n`
  await mkdir(dirname(HISTORY_PATH), { recursive: true })
  await writeFile(HISTORY_PATH, contents, 'utf8')

  console.log(
    replaced
      ? `Replaced the existing entry for ${date} (${snapshots.length} days archived).`
      : `Appended ${date} (${snapshots.length} days archived).`,
  )

  // Regenerate the badges from the archive we just wrote, so the embeddable
  // image can never disagree with the dashboard.
  for (const name of Object.keys(BADGE_THEMES) as BadgeThemeName[]) {
    await writeFile(BADGE_PATHS[name], `${renderBadge(updated, name)}\n`, 'utf8')
  }
  console.log('Wrote badge-light.svg and badge-dark.svg.')
}

main().catch((error: unknown) => {
  if (error instanceof RenshuuApiError) {
    console.error(`\nAPI request failed: ${error.message}`)
    if (error.body) console.error(`Response body: ${error.body}`)
  } else {
    console.error('\nSnapshot failed:', error)
  }
  process.exit(1)
})

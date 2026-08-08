/**
 * Collects every kanji from your kanji schedules into public/data/kanji.json.
 *
 * Run weekly by .github/workflows/kanji.yml. Weekly rather than with each
 * snapshot because mastery moves slowly, and this file is two orders of
 * magnitude larger than the daily archive — rewriting it every three hours
 * would bloat the repository for no benefit.
 *
 * Locally:
 *   npm run kanji
 *   npm run kanji -- --dry-run
 *
 *
 * ## What "every kanji" means here
 *
 * It means every kanji in the schedules you have, fetched with `group=all` so
 * unstudied ones are included too — a wall showing only what you already know
 * can't show you what's left.
 *
 * It does NOT mean all 2,136 jouyou kanji. renshuu has no endpoint that hands
 * over a global dictionary, so the coverage is exactly the JLPT sets you've
 * added. If N2 and N1 are missing from the wall, the fix is to add those
 * schedules in renshuu, not to change this script.
 */

import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { createRenshuuClient, RenshuuApiError } from '../src/api/renshuu.ts'
import { KANJI_VERSION } from '../src/types/kanji.ts'
import type { KanjiCollection, KanjiEntry } from '../src/types/kanji.ts'
import type { RenshuuKanjiTerm } from '../src/types/renshuu.ts'

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const KANJI_PATH = resolve(projectRoot, 'public/data/kanji.json')

/** Hardest first, so the wall reads from "furthest to go" to "done". */
const JLPT_ORDER = ['N1', 'N2', 'N3', 'N4', 'N5']

/** Keeps long comma-separated reading lists from dominating the file size. */
function trimList(value: string | undefined, max: number): string {
  if (!value) return ''
  const parts = value
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
  return parts.slice(0, max).join(', ')
}

/** Converts an API term into the compact archive form. */
function toEntry(term: RenshuuKanjiTerm): KanjiEntry {
  return {
    c: term.kanji,
    jlpt: term.jlpt,
    s: term.scount,
    // Definitions can run to a dozen glosses; the first few identify the kanji.
    m: trimList(term.definition, 4),
    on: trimList(term.onyomi, 3),
    kun: trimList(term.kunyomi, 3),
    // Left undefined when never studied — see the note in src/types/kanji.ts.
    mastery: term.user_data?.mastery_avg_perc,
  }
}

/** Sort key: JLPT hardest first, then more strokes last within a level. */
function sortKanji(a: KanjiEntry, b: KanjiEntry): number {
  const levelA = a.jlpt ? JLPT_ORDER.indexOf(a.jlpt) : JLPT_ORDER.length
  const levelB = b.jlpt ? JLPT_ORDER.indexOf(b.jlpt) : JLPT_ORDER.length
  if (levelA !== levelB) return levelA - levelB
  if (a.s !== b.s) return a.s - b.s
  return a.c.localeCompare(b.c)
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

  const client = createRenshuuClient(apiKey)

  const { schedules } = await client.getSchedules()
  const kanjiSchedules = schedules.filter((s) => s.booktype === 'kanji')

  if (kanjiSchedules.length === 0) {
    console.error('No kanji schedules found — nothing to collect.')
    process.exit(1)
  }

  console.log(`Collecting from ${kanjiSchedules.length} kanji schedule(s):`)

  // Keyed by the character so a kanji appearing in two schedules is stored once.
  const byCharacter = new Map<string, KanjiEntry>()
  let requests = 0

  for (const schedule of kanjiSchedules) {
    // Fetch page 1 first, since only the response says how many pages exist.
    let page = await client.getSchedulePage(schedule.id, 1)
    requests++
    const totalPages = Math.max(1, page.total_pg)

    for (let pageNumber = 1; pageNumber <= totalPages; pageNumber++) {
      if (pageNumber > 1) {
        page = await client.getSchedulePage(schedule.id, pageNumber)
        requests++
      }

      for (const term of page.terms) {
        if (!term.kanji) continue
        const entry = toEntry(term)
        const existing = byCharacter.get(entry.c)

        // The same kanji can sit in several schedules with different study
        // records. Keep whichever shows the most progress, so a duplicate can
        // never make the wall understate what you know.
        if (
          !existing ||
          (entry.mastery ?? -1) > (existing.mastery ?? -1)
        ) {
          byCharacter.set(entry.c, entry)
        }
      }
    }

    console.log(`  ${schedule.name}: ${page.result_count} kanji`)
  }

  const kanji = [...byCharacter.values()].sort(sortKanji)
  const studied = kanji.filter((k) => k.mastery !== undefined).length

  const collection: KanjiCollection = {
    version: KANJI_VERSION,
    generatedAt: new Date().toISOString(),
    sources: kanjiSchedules.map((s) => s.name),
    kanji,
  }

  // Compact rather than pretty-printed: this file is machine-read only, and at
  // this size the readable-diff argument that applies to history.json is
  // outweighed by shipping half the bytes to every visitor.
  const contents = `${JSON.stringify(collection)}\n`

  // Byte length, not string length: the file is mostly Japanese, and those
  // characters are three bytes each in UTF-8, so counting characters would
  // understate the real download by around a fifth.
  const kilobytes = Math.round(Buffer.byteLength(contents, 'utf8') / 1024)

  console.log(
    `\n${kanji.length} unique kanji (${studied} studied), ` +
      `${requests} API requests, ${kilobytes} KB`,
  )

  const byLevel = new Map<string, number>()
  for (const entry of kanji) {
    const key = entry.jlpt ?? 'other'
    byLevel.set(key, (byLevel.get(key) ?? 0) + 1)
  }
  console.log(
    '  by level: ' +
      [...byLevel.entries()].map(([k, v]) => `${k} ${v}`).join(', '),
  )

  if (dryRun) {
    console.log('\n--dry-run: nothing written. First entry would be:')
    console.log(JSON.stringify(kanji[0], null, 2))
    return
  }

  await mkdir(dirname(KANJI_PATH), { recursive: true })
  await writeFile(KANJI_PATH, contents, 'utf8')
  console.log(`\nWrote ${KANJI_PATH}`)
}

main().catch((error: unknown) => {
  if (error instanceof RenshuuApiError) {
    console.error(`\nAPI request failed: ${error.message}`)
    if (error.body) console.error(`Response body: ${error.body}`)
  } else {
    console.error('\nKanji collection failed:', error)
  }
  process.exit(1)
})

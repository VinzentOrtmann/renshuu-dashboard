/**
 * Works out the highest percentage each JLPT level can actually reach.
 *
 * Run weekly by .github/workflows/kanji.yml. See src/types/ceilings.ts for why
 * a ceiling below 100% exists at all.
 *
 * Locally:
 *   npm run ceilings
 *   npm run ceilings -- --dry-run
 *
 *
 * ## Mapping a schedule to a JLPT level
 *
 * The API doesn't say which level a schedule covers, so the level is read from
 * the schedule's name — "Beginner Sentences (N5)" is N5. That's fragile in
 * general, and deliberately fails safe: a schedule with no level in its name
 * contributes no ceiling, so nothing is ever claimed complete on a guess.
 *
 * It's sufficient here because only the two sentence decks have blocked terms
 * at all, and both are named with their level. If a future deck has blocked
 * terms and an unlabelled name, its level simply keeps projecting toward 100%
 * as it does today — wrong, but no more wrong than before this existed.
 */

import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { createRenshuuClient, RenshuuApiError } from '../src/api/renshuu.ts'
import { CEILINGS_VERSION } from '../src/types/ceilings.ts'
import type { Ceiling, CeilingCollection } from '../src/types/ceilings.ts'

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const CEILINGS_PATH = resolve(projectRoot, 'public/data/ceilings.json')

/** Reads a JLPT level out of a schedule name, or null if it doesn't say. */
function levelFromName(name: string): string | null {
  const match = /\bN\s?([1-5])\b/i.exec(name)
  return match ? `n${match[1]}` : null
}

async function main() {
  const dryRun = process.argv.includes('--dry-run')
  const apiKey = process.env.RENSHUU_API_KEY

  if (!apiKey) {
    console.error('RENSHUU_API_KEY is not set.')
    process.exit(1)
  }

  const client = createRenshuuClient(apiKey)
  const { schedules } = await client.getSchedules()

  const ceilings: Record<string, Record<string, Ceiling>> = {}
  let requests = 1

  for (const schedule of schedules) {
    const level = levelFromName(schedule.name)
    if (!level) {
      console.log(`  skipped, no level in name: ${schedule.name}`)
      continue
    }

    // One page each; only `result_count` is needed, not the terms themselves.
    const all = await client.getSchedulePage(schedule.id, 1, 'all')
    const blocked = await client.getSchedulePage(schedule.id, 1, 'cannot_study')
    requests += 2

    const category = schedule.booktype
    const bucket = (ceilings[category] ??= {})
    const existing = bucket[level]

    // Several schedules can cover the same category and level; sum them.
    const total = (existing?.total ?? 0) + all.result_count
    const blockedCount = (existing?.blocked ?? 0) + blocked.result_count

    bucket[level] = {
      total,
      blocked: blockedCount,
      ceilingPercent:
        total > 0 ? Math.floor(((total - blockedCount) / total) * 100) : 100,
      sources: [...(existing?.sources ?? []), schedule.name],
    }

    const note =
      blocked.result_count > 0 ? `  <- ${blocked.result_count} blocked` : ''
    console.log(
      `  ${category}/${level}: ${schedule.name}, ${all.result_count} terms${note}`,
    )
  }

  const collection: CeilingCollection = {
    version: CEILINGS_VERSION,
    generatedAt: new Date().toISOString(),
    ceilings,
  }

  console.log(`\n${requests} API requests. Ceilings below 100%:`)
  let anyBelow = false
  for (const [category, levels] of Object.entries(ceilings)) {
    for (const [level, ceiling] of Object.entries(levels)) {
      if (ceiling.ceilingPercent < 100) {
        anyBelow = true
        console.log(
          `  ${category} ${level.toUpperCase()}: ${ceiling.ceilingPercent}% ` +
            `(${ceiling.blocked} of ${ceiling.total} cannot be studied)`,
        )
      }
    }
  }
  if (!anyBelow) console.log('  none')

  if (dryRun) {
    console.log('\n--dry-run: nothing written.')
    console.log(JSON.stringify(collection, null, 2))
    return
  }

  await mkdir(dirname(CEILINGS_PATH), { recursive: true })
  await writeFile(
    CEILINGS_PATH,
    `${JSON.stringify(collection, null, 2)}\n`,
    'utf8',
  )
  console.log(`\nWrote ${CEILINGS_PATH}`)
}

main().catch((error: unknown) => {
  if (error instanceof RenshuuApiError) {
    console.error(`\nAPI request failed: ${error.message}`)
    if (error.body) console.error(`Response body: ${error.body}`)
  } else {
    console.error('\nCeiling collection failed:', error)
  }
  process.exit(1)
})

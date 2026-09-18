/**
 * Collects readings and meanings for every word in your vocabulary schedules
 * into public/data/vocab.json, for labelling words on worksheets.
 *
 * Run weekly by .github/workflows/kanji.yml, alongside the kanji collection:
 * the words in your schedules change when you add a deck, not by the hour.
 *
 * Locally:
 *   npm run vocab
 *   npm run vocab -- --dry-run
 *
 * Fetches every word, studied or not, so a sheet for a word you haven't reached
 * yet still gets its label.
 */

import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { createRenshuuClient, RenshuuApiError } from '../src/api/renshuu.ts'
import { cleanGloss } from '../src/lib/wordInfo.ts'
import { VOCAB_VERSION } from '../src/types/vocab.ts'
import type { VocabCollection, VocabEntry } from '../src/types/vocab.ts'

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const VOCAB_PATH = resolve(projectRoot, 'public/data/vocab.json')

/**
 * Longest meaning kept, in characters.
 *
 * The worksheet prints one line per word, which fits roughly sixty Latin
 * letters at the default box size. Keeping only the first sense, trimmed to a
 * comma boundary near this length, holds everything that will actually print
 * and roughly halves the file.
 */
const MEANING_MAX = 70

/** Shortens a meaning to whole comma-separated glosses within the limit. */
function trimMeaning(meaning: string): string {
  if (meaning.length <= MEANING_MAX) return meaning
  const glosses = meaning.split(', ')
  let result = glosses[0]
  for (const gloss of glosses.slice(1)) {
    if (result.length + 2 + gloss.length > MEANING_MAX) break
    result += `, ${gloss}`
  }
  return result
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
  const vocabSchedules = schedules.filter((s) => s.booktype === 'vocab')

  const words: Record<string, VocabEntry> = {}
  let requests = 1

  for (const schedule of vocabSchedules) {
    let page = await client.getWordPage(schedule.id, 1)
    requests++
    const totalPages = Math.max(1, page.total_pg)

    for (let pageNumber = 1; pageNumber <= totalPages; pageNumber++) {
      if (pageNumber > 1) {
        page = await client.getWordPage(schedule.id, pageNumber)
        requests++
      }

      for (const term of page.terms) {
        // Kana-only words have no kanji spelling; they're keyed by their kana.
        const written = term.kanji_full || term.hiragana_full
        if (!written) continue

        // Each entry in `def` is one sense; the first is the most common.
        const meaning = trimMeaning(term.def.map(cleanGloss).find(Boolean) ?? '')

        const existing = words[written]
        if (!existing) {
          words[written] = { r: [term.hiragana_full], m: meaning }
        } else if (!existing.r.includes(term.hiragana_full)) {
          // Same spelling, different reading: a genuinely different word, like
          // 生物 as せいぶつ and なまもの. Keep both readings, and both meanings.
          existing.r.push(term.hiragana_full)
          existing.m = `${existing.m}; ${meaning}`
        }
      }
    }

    console.log(`  ${schedule.name}: ${page.result_count} words`)
  }

  const collection: VocabCollection = {
    version: VOCAB_VERSION,
    generatedAt: new Date().toISOString(),
    sources: vocabSchedules.map((s) => s.name),
    words,
  }

  // Compact: machine-read only, and fetched by the worksheet page.
  const contents = `${JSON.stringify(collection)}\n`
  const kilobytes = Math.round(Buffer.byteLength(contents, 'utf8') / 1024)

  console.log(
    `\n${Object.keys(words).length} distinct words, ` +
      `${requests} API requests, ${kilobytes} KB`,
  )

  if (dryRun) {
    console.log('\n--dry-run: nothing written. Sample:')
    console.log(JSON.stringify(Object.entries(words).slice(0, 3), null, 2))
    return
  }

  await mkdir(dirname(VOCAB_PATH), { recursive: true })
  await writeFile(VOCAB_PATH, contents, 'utf8')
  console.log(`Wrote ${VOCAB_PATH}`)
}

main().catch((error: unknown) => {
  if (error instanceof RenshuuApiError) {
    console.error(`\nAPI request failed: ${error.message}`)
    if (error.body) console.error(`Response body: ${error.body}`)
  } else {
    console.error('\nVocabulary collection failed:', error)
  }
  process.exit(1)
})

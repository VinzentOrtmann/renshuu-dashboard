/**
 * Builds public/data/course.json, the kanji course for the Kanji path page.
 *
 * Run by hand; the course only changes when the source dictionaries do.
 *
 *   npm run course
 *
 * Downloads KANJIDIC2 (meanings, readings, grade, frequency) and KRADFILE
 * (components), both from the Electronic Dictionary Research and Development
 * Group, CC BY-SA 4.0. See src/lib/courseData.ts for how they're combined.
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'

import {
  buildCourse,
  parseCourseEntry,
  parseKradfile,
} from '../src/lib/courseData.ts'
import type { KanjidicCourseEntry } from '../src/lib/courseData.ts'
import type { VocabCollection } from '../src/types/vocab.ts'

const KANJIDIC = 'http://www.edrdg.org/kanjidic/kanjidic2.xml.gz'
const KRADFILE = 'http://ftp.edrdg.org/pub/Nihongo/kradfile.gz'

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = resolve(projectRoot, 'public/data/course.json')
const VOCAB = resolve(projectRoot, 'public/data/vocab.json')

async function download(url: string): Promise<Buffer> {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`)
  return gunzipSync(Buffer.from(await response.arrayBuffer()))
}

/** The words from public/data/vocab.json, or none if it isn't there yet. */
async function readVocabulary(): Promise<
  Record<string, { r: string[]; m: string }>
> {
  try {
    const raw = await readFile(VOCAB, 'utf8')
    return (JSON.parse(raw) as VocabCollection).words
  } catch {
    console.warn(`No vocabulary at ${VOCAB}; run npm run vocab first.`)
    return {}
  }
}

async function main() {
  console.log('Downloading KANJIDIC2 and KRADFILE...')
  const [kanjidic, kradfile] = await Promise.all([
    download(KANJIDIC),
    download(KRADFILE),
  ])

  const entries: KanjidicCourseEntry[] = []
  for (const match of kanjidic
    .toString('utf8')
    .matchAll(/<character>([\s\S]*?)<\/character>/g)) {
    const entry = parseCourseEntry(match[1])
    if (entry) entries.push(entry)
  }

  // KRADFILE is EUC-JP, not UTF-8: it dates from before Unicode was the norm
  // for Japanese text. Decoded as UTF-8 every component would come out garbled.
  const krad = parseKradfile(new TextDecoder('euc-jp').decode(kradfile))

  // Vocabulary comes from your own renshuu schedules, collected weekly by
  // npm run vocab. Without it the course is still complete, just kanji only.
  const vocabulary = await readVocabulary()

  const course = buildCourse(entries, krad, undefined, vocabulary)
  const contents = `${JSON.stringify(course)}\n`

  await mkdir(dirname(OUT), { recursive: true })
  await writeFile(OUT, contents, 'utf8')

  const kanjiCount = Object.keys(course.kanji).length
  const withoutParts = Object.values(course.kanji).filter(
    (k) => k.parts.length === 0,
  ).length
  console.log(
    `${kanjiCount} kanji in ${course.levels.length} levels, ` +
      `${Object.keys(course.components).length} components, ` +
      `${Object.keys(course.words).length} words, ` +
      `${Math.round(Buffer.byteLength(contents, 'utf8') / 1024)} KB` +
      (withoutParts ? ` (${withoutParts} kanji have no component data)` : ''),
  )
}

main().catch((error: unknown) => {
  console.error('Course generation failed:', error)
  process.exit(1)
})

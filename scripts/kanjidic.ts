/**
 * Builds public/data/kanjidic/ from KANJIDIC2, as the fallback for worksheet
 * labels on kanji that aren't in your renshuu kanji decks.
 *
 * Run by hand, not by a workflow: kanji meanings barely change, so the output
 * is committed and only needs regenerating occasionally.
 *
 *   npm run kanjidic
 *
 * Why this exists: your kanji collection only holds kanji from your kanji
 * schedules. Of the 1,615 kanji used in your vocabulary, 929 weren't in it, so
 * a sheet for any of those — 緊, 誰, 嫌 — printed without a label.
 *
 * KANJIDIC2 is from the Electronic Dictionary Research and Development Group,
 * CC BY-SA 4.0. The output is a derivative and carries the same licence.
 */

import { mkdir, rm, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'

import { parseKanjidic } from '../src/lib/kanjidicData.ts'
import { bucketFor } from '../src/lib/strokeData.ts'
import type { KanjiEntry } from '../src/types/kanji.ts'

const SOURCE = 'http://www.edrdg.org/kanjidic/kanjidic2.xml.gz'

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const OUT_DIR = resolve(projectRoot, 'public/data/kanjidic')

async function main() {
  console.log('Downloading KANJIDIC2...')
  const response = await fetch(SOURCE)
  if (!response.ok) {
    throw new Error(`Download failed: HTTP ${response.status} for ${SOURCE}`)
  }
  const xml = gunzipSync(Buffer.from(await response.arrayBuffer())).toString('utf8')

  // The dictionary is updated continuously rather than released in versions,
  // so record which edition this was built from.
  const edition =
    /<database_version>([^<]+)<\/database_version>/.exec(xml)?.[1] ?? 'unknown'
  const created =
    /<date_of_creation>([^<]+)<\/date_of_creation>/.exec(xml)?.[1] ?? 'unknown'

  const entries = parseKanjidic(xml)

  // Grouped by code-point block like the stroke data, so a worksheet fetches
  // only the blocks its characters fall in.
  const buckets = new Map<string, Record<string, KanjiEntry>>()
  for (const entry of entries) {
    const bucket = bucketFor(entry.c)
    const group = buckets.get(bucket) ?? {}
    group[entry.c] = entry
    buckets.set(bucket, group)
  }

  await rm(OUT_DIR, { recursive: true, force: true })
  await mkdir(OUT_DIR, { recursive: true })

  let bytes = 0
  for (const [bucket, group] of buckets) {
    const contents = JSON.stringify(group)
    bytes += Buffer.byteLength(contents, 'utf8')
    await writeFile(join(OUT_DIR, `${bucket}.json`), contents, 'utf8')
  }

  await writeFile(
    join(OUT_DIR, 'LICENSE'),
    `Kanji meanings and readings in this directory are derived from KANJIDIC2
(https://www.edrdg.org/wiki/index.php/KANJIDIC_Project), database version
${edition}, created ${created}.

KANJIDIC2 is the property of the Electronic Dictionary Research and
Development Group, and is used in conformance with the Group's licence
(https://www.edrdg.org/edrdg/licence.html), which applies the Creative Commons
Attribution-ShareAlike 4.0 International licence:
https://creativecommons.org/licenses/by-sa/4.0/

These files are a derivative work (only the first few meanings and readings
are kept, regrouped by code point) and are distributed under the same
licence. The rest of this repository is not covered by this notice.
`,
    'utf8',
  )

  console.log(
    `${entries.length} kanji in ${buckets.size} files, ` +
      `${(bytes / 1024 / 1024).toFixed(2)} MB (edition ${edition}, ${created})`,
  )
}

main().catch((error: unknown) => {
  console.error('KANJIDIC2 generation failed:', error)
  process.exit(1)
})

/**
 * Builds public/data/strokes/ from a pinned KanjiVG release.
 *
 * Run by hand, not by a workflow: stroke order doesn't change, so the output is
 * committed and only needs regenerating to pick up a new KanjiVG release.
 *
 *   npm run strokes
 *
 * It downloads the release tarball (~6 MB), extracts it with the system `tar`,
 * keeps only each character's stroke paths, and writes them grouped into files
 * of 256 code points. See src/lib/strokes.ts for why the site serves this data
 * itself rather than loading from a CDN.
 *
 * KanjiVG by Ulrich Apel, https://kanjivg.tagaini.net, CC BY-SA 3.0. The output
 * is a derivative and carries the same licence.
 */

import { execFileSync } from 'node:child_process'
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { bucketFor, parseKanjiVgStrokes } from '../src/lib/strokeData.ts'
import type { StrokeBucket } from '../src/lib/strokeData.ts'

/** Pinned so the output is reproducible. Bump deliberately. */
const RELEASE = 'r20260714'

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const OUT_DIR = resolve(projectRoot, 'public/data/strokes')

const LICENSE_TEXT = `Stroke-order data in this directory is derived from KanjiVG
(https://kanjivg.tagaini.net), release ${RELEASE}.

KanjiVG is copyright (C) 2009-2026 Ulrich Apel and is released under the
Creative Commons Attribution-Share Alike 3.0 licence:
https://creativecommons.org/licenses/by-sa/3.0/

These files are a derivative work (only the stroke paths are kept, regrouped
by code point) and are distributed under the same licence. The rest of this
repository is not covered by this notice.
`

async function main() {
  const work = await mkdtemp(join(tmpdir(), 'kanjivg-'))

  try {
    const url = `https://codeload.github.com/KanjiVG/kanjivg/tar.gz/refs/tags/${RELEASE}`
    console.log(`Downloading KanjiVG ${RELEASE}...`)
    const response = await fetch(url)
    if (!response.ok) {
      throw new Error(`Download failed: HTTP ${response.status} for ${url}`)
    }
    const archive = join(work, 'kanjivg.tar.gz')
    await writeFile(archive, Buffer.from(await response.arrayBuffer()))

    // The system tar handles .tar.gz on Linux, macOS, Git Bash and Windows 10+,
    // which avoids pulling in an archive library for a one-off job.
    execFileSync('tar', ['-xzf', 'kanjivg.tar.gz'], { cwd: work })

    const kanjiDir = join(work, `kanjivg-${RELEASE}`, 'kanji')
    // Main files only: variants such as 098db-Kaisho.svg are alternative
    // forms, and the standard form is the one to practise.
    const files = (await readdir(kanjiDir)).filter((name) =>
      /^[0-9a-f]{5}\.svg$/.test(name),
    )

    const buckets = new Map<string, StrokeBucket>()
    let characters = 0
    let skipped = 0

    for (const file of files) {
      const char = String.fromCodePoint(parseInt(file.slice(0, 5), 16))
      const strokes = parseKanjiVgStrokes(await readFile(join(kanjiDir, file), 'utf8'))
      if (strokes.length === 0) {
        skipped++
        continue
      }
      const bucket = bucketFor(char)
      const entries = buckets.get(bucket) ?? {}
      entries[char] = strokes
      buckets.set(bucket, entries)
      characters++
    }

    // Start from an empty directory so buckets from an older release that no
    // longer exist don't linger.
    await rm(OUT_DIR, { recursive: true, force: true })
    await mkdir(OUT_DIR, { recursive: true })

    let bytes = 0
    for (const [bucket, entries] of buckets) {
      const contents = JSON.stringify(entries)
      bytes += Buffer.byteLength(contents, 'utf8')
      await writeFile(join(OUT_DIR, `${bucket}.json`), contents, 'utf8')
    }
    await writeFile(join(OUT_DIR, 'LICENSE'), LICENSE_TEXT, 'utf8')

    console.log(
      `${characters} characters in ${buckets.size} files, ` +
        `${(bytes / 1024 / 1024).toFixed(1)} MB` +
        (skipped ? ` (${skipped} files had no strokes and were skipped)` : ''),
    )
  } finally {
    await rm(work, { recursive: true, force: true })
  }
}

main().catch((error: unknown) => {
  console.error('Stroke data generation failed:', error)
  process.exit(1)
})

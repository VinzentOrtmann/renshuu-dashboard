/**
 * Loads per-character data split into files by code-point block.
 *
 * The stroke-order and kanji-dictionary data are each thousands of characters,
 * served as one JSON file per block of 256 code points (see bucketFor). A
 * worksheet downloads only the blocks its characters fall in, and each block is
 * fetched once per page load however many characters need it.
 */

import { bucketFor } from './strokeData.ts'

/** Pending or finished requests, keyed by full URL. */
const cache = new Map<string, Promise<Record<string, unknown>>>()

function loadFile(url: string): Promise<Record<string, unknown>> {
  let pending = cache.get(url)
  if (!pending) {
    pending = fetch(url)
      // A missing block means no character in it has data (Latin letters,
      // say). That's an empty result, not an error.
      .then((response) => (response.ok ? response.json() : {}))
      .catch(() => ({}))
    cache.set(url, pending)
  }
  return pending
}

/**
 * Entries for every character given, from the data set in `directory` under
 * `public/data/`. Characters the data doesn't cover are absent from the result.
 */
export async function loadByCharacter<T>(
  directory: string,
  chars: Iterable<string>,
): Promise<Map<string, T>> {
  const base = `${import.meta.env.BASE_URL}data/${directory}/`
  const unique = [...new Set(chars)]
  const blocks = [...new Set(unique.map(bucketFor))]
  const files = await Promise.all(
    blocks.map((block) => loadFile(`${base}${block}.json`)),
  )
  const byBlock = new Map(blocks.map((block, i) => [block, files[i]]))

  const result = new Map<string, T>()
  for (const char of unique) {
    const entry = byBlock.get(bucketFor(char))?.[char]
    if (entry !== undefined) result.set(char, entry as T)
  }
  return result
}

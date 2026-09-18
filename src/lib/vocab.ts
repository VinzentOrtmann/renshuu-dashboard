/**
 * Loads the vocabulary collection for worksheet labels.
 *
 * Fetched only when the worksheet page needs labels — it's a few hundred KB,
 * and no other page uses it. The request is shared, so toggling labels off and
 * on again doesn't download it twice.
 */

import type { VocabCollection } from '../types/vocab.ts'

const VOCAB_URL = `${import.meta.env.BASE_URL}data/vocab.json`

let pending: Promise<VocabCollection | null> | undefined

/**
 * The collection, or null if it isn't available. Labels are a nicety: a
 * missing file means words print without one, never a broken page.
 */
export function loadVocab(): Promise<VocabCollection | null> {
  pending ??= fetch(VOCAB_URL, { cache: 'no-cache' })
    .then((response) => (response.ok ? response.json() : null))
    .then((data: VocabCollection | null) => (data?.words ? data : null))
    .catch(() => null)
  return pending
}

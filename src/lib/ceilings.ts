/**
 * Loading the reachable-ceiling data, and deciding what counts as complete.
 *
 * See src/types/ceilings.ts for why a level can be finished at 97%.
 */

import { useEffect, useState } from 'react'

import type { Ceiling, CeilingCollection } from '../types/ceilings.ts'

const CEILINGS_URL = `${import.meta.env.BASE_URL}data/ceilings.json`

export type CeilingsState =
  /**
   * Loading, or unavailable.
   *
   * Both are treated the same by callers: without ceiling data every level is
   * assumed to top out at 100%, which is how the dashboard behaved before this
   * existed. A missing file must degrade, never break the page.
   */
  | { status: 'unavailable' }
  | { status: 'ready'; collection: CeilingCollection }

/** Loads the ceiling data once. Failure is silent and non-fatal by design. */
export function useCeilings(): CeilingsState {
  const [state, setState] = useState<CeilingsState>({ status: 'unavailable' })

  useEffect(() => {
    let cancelled = false

    fetch(CEILINGS_URL, { cache: 'no-cache' })
      .then((response) => (response.ok ? response.json() : null))
      .then((collection: CeilingCollection | null) => {
        if (cancelled || !collection?.ceilings) return
        setState({ status: 'ready', collection })
      })
      .catch(() => {
        // Deliberately ignored: the dashboard is fully usable without this.
      })

    return () => {
      cancelled = true
    }
  }, [])

  return state
}

/** The ceiling for one category and level, if one is known. */
export function ceilingFor(
  state: CeilingsState,
  category: string,
  level: string,
): Ceiling | undefined {
  if (state.status !== 'ready') return undefined
  return state.collection.ceilings[category]?.[level]
}

/**
 * Whether a level should be treated as finished.
 *
 * Complete at 100%, or on reaching its ceiling when some of its terms can never
 * be studied. Without a known ceiling this is just "is it 100 yet", so a level
 * is never declared done on missing data.
 */
export function isLevelComplete(
  percent: number,
  ceiling: Ceiling | undefined,
): boolean {
  if (percent >= 100) return true
  if (!ceiling || ceiling.blocked === 0) return false
  return percent >= ceiling.ceilingPercent
}

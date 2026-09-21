/**
 * The spaced-repetition engine for the Kanji path page.
 *
 * Pure: state and a timestamp in, new state out. Nothing here reads the clock,
 * storage or the network, so every scheduling rule is unit tested in
 * srs.test.ts rather than discovered by waiting four hours for a review.
 *
 * The schedule follows WaniKani's published intervals and unlock rules. Those
 * are facts about how it works, not its content; the course itself comes from
 * open dictionary data (see courseData.ts).
 */

import type { Course } from './courseData.ts'

/** What kind of thing is being learned. */
export type ItemKind = 'component' | 'kanji'

/** Identifies an item across both kinds: `c:<id>` or `k:<kanji>`. */
export type ItemKey = string

export const componentKey = (id: string): ItemKey => `c:${id}`
export const kanjiKey = (kanji: string): ItemKey => `k:${kanji}`

/** Splits an item key back into its kind and id. */
export function parseKey(key: ItemKey): { kind: ItemKind; id: string } {
  return {
    kind: key.startsWith('c:') ? 'component' : 'kanji',
    id: key.slice(2),
  }
}

/**
 * SRS stages, 1-9. 1-4 are Apprentice, 5-6 Guru, 7 Master, 8 Enlightened and
 * 9 Burned — learned for good and no longer reviewed.
 */
export const GURU = 5
export const BURNED = 9

/** Hours until the next review after reaching each stage. Index = stage. */
const INTERVAL_HOURS = [0, 4, 8, 23, 47, 167, 335, 730, 2922]

const HOUR = 60 * 60 * 1000

export function stageName(stage: number): string {
  if (stage >= BURNED) return 'Burned'
  if (stage === 8) return 'Enlightened'
  if (stage === 7) return 'Master'
  if (stage >= GURU) return 'Guru'
  return 'Apprentice'
}

/** Progress on one item that has been through its lesson. */
export interface ItemProgress {
  stage: number
  /** When it's next due, epoch ms. Absent once burned. */
  next?: number
  correct: number
  incorrect: number
}

/** Everything saved about the learner. */
export interface SrsState {
  version: 1
  /** The highest level unlocked. */
  level: number
  progress: Record<ItemKey, ItemProgress>
}

export const INITIAL_STATE: SrsState = { version: 1, level: 1, progress: {} }

/** Progress for an item right after its lesson: stage 1, due in 4 hours. */
export function afterLesson(now: number): ItemProgress {
  return { stage: 1, next: now + INTERVAL_HOURS[1] * HOUR, correct: 0, incorrect: 0 }
}

/**
 * Applies a review answer.
 *
 * Right moves up a stage. Wrong moves down one stage, or two from Guru and
 * above — forgetting something you'd supposedly learned well is the stronger
 * signal — but never below stage 1. Either way the next review is scheduled
 * from the new stage's interval.
 */
export function answer(
  progress: ItemProgress,
  correct: boolean,
  now: number,
): ItemProgress {
  const stage = correct
    ? Math.min(BURNED, progress.stage + 1)
    : Math.max(1, progress.stage - (progress.stage >= GURU ? 2 : 1))

  return {
    stage,
    next: stage >= BURNED ? undefined : now + INTERVAL_HOURS[stage] * HOUR,
    correct: progress.correct + (correct ? 1 : 0),
    incorrect: progress.incorrect + (correct ? 0 : 1),
  }
}

/** Stage of an item, or 0 when it hasn't had its lesson yet. */
function stageOf(state: SrsState, key: ItemKey): number {
  return state.progress[key]?.stage ?? 0
}

/**
 * Items available to learn or review, in course order.
 *
 * Components unlock with their level. A kanji unlocks at its level once every
 * component it's built from has reached Guru — WaniKani's central rule, and the
 * point of the whole exercise: you meet a kanji only after its parts are
 * familiar, so it arrives as a combination of known pieces rather than as an
 * arbitrary tangle of strokes.
 */
export function unlockedItems(course: Course, state: SrsState): ItemKey[] {
  const keys: ItemKey[] = []
  for (let level = 1; level <= state.level && level <= course.levels.length; level++) {
    const { components, kanji } = course.levels[level - 1]
    for (const id of components) keys.push(componentKey(id))
    for (const char of kanji) {
      const parts = course.kanji[char].parts
      if (parts.every((part) => stageOf(state, componentKey(part)) >= GURU)) {
        keys.push(kanjiKey(char))
      }
    }
  }
  return keys
}

/** Unlocked items that haven't had their lesson yet: components first. */
export function lessonQueue(course: Course, state: SrsState): ItemKey[] {
  const pending = unlockedItems(course, state).filter(
    (key) => !state.progress[key],
  )
  // Components before kanji, so a kanji's parts are always taught first.
  return [
    ...pending.filter((key) => key.startsWith('c:')),
    ...pending.filter((key) => key.startsWith('k:')),
  ]
}

/** Items due for review now. */
export function reviewQueue(state: SrsState, now: number): ItemKey[] {
  return Object.entries(state.progress)
    .filter(([, p]) => p.stage < BURNED && p.next !== undefined && p.next <= now)
    .map(([key]) => key)
}

/** How far the current level is toward the next: kanji at Guru or beyond. */
export function levelProgress(
  course: Course,
  state: SrsState,
): { guru: number; total: number; needed: number } {
  const kanji = course.levels[state.level - 1]?.kanji ?? []
  const guru = kanji.filter((char) => stageOf(state, kanjiKey(char)) >= GURU).length
  return { guru, total: kanji.length, needed: Math.ceil(kanji.length * 0.9) }
}

/**
 * Advances the level once 90% of its kanji are at Guru, as WaniKani does.
 *
 * 90% rather than all: one stubborn kanji shouldn't hold back a whole level,
 * and the stragglers keep coming back in reviews anyway.
 */
export function levelUp(course: Course, state: SrsState): SrsState {
  let next = state
  while (next.level < course.levels.length) {
    const { guru, needed } = levelProgress(course, next)
    if (guru < needed) break
    next = { ...next, level: next.level + 1 }
  }
  return next
}

/**
 * Marks every item below `level` as burned and unlocks `level`.
 *
 * For starting partway through: someone who already reads N4 doesn't need to
 * work through first-grade kanji to reach anything useful.
 */
export function skipToLevel(course: Course, state: SrsState, level: number): SrsState {
  const target = Math.max(1, Math.min(level, course.levels.length))
  const progress = { ...state.progress }
  for (let l = 1; l < target; l++) {
    const { components, kanji } = course.levels[l - 1]
    for (const key of [...components.map(componentKey), ...kanji.map(kanjiKey)]) {
      progress[key] = {
        stage: BURNED,
        correct: progress[key]?.correct ?? 0,
        incorrect: progress[key]?.incorrect ?? 0,
      }
    }
  }
  return { ...state, level: Math.max(state.level, target), progress }
}

/** How many items sit in each stage group, for the summary. */
export function stageCounts(state: SrsState): Record<string, number> {
  const counts: Record<string, number> = {
    Apprentice: 0,
    Guru: 0,
    Master: 0,
    Enlightened: 0,
    Burned: 0,
  }
  for (const { stage } of Object.values(state.progress)) counts[stageName(stage)]++
  return counts
}

/** Reviews coming due in each of the next `hours` hours (not counting now). */
export function forecast(state: SrsState, now: number, hours = 24): number[] {
  const buckets = Array.from({ length: hours }, () => 0)
  for (const p of Object.values(state.progress)) {
    if (p.next === undefined || p.stage >= BURNED || p.next <= now) continue
    const hour = Math.floor((p.next - now) / HOUR)
    if (hour < hours) buckets[hour]++
  }
  return buckets
}

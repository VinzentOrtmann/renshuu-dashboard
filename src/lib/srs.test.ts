/**
 * Tests for the SRS engine: scheduling, unlocking and levelling.
 */

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  BURNED,
  GURU,
  INITIAL_STATE,
  afterLesson,
  answer,
  componentKey,
  forecast,
  kanjiKey,
  lessonQueue,
  levelProgress,
  levelUp,
  parseKey,
  reviewQueue,
  skipToLevel,
  stageCounts,
  stageName,
  unlockedItems,
} from './srs.ts'
import type { SrsState } from './srs.ts'
import type { Course } from './courseData.ts'

const HOUR = 60 * 60 * 1000
const NOW = Date.UTC(2026, 8, 21, 12)

/**
 * A two-level course. Level 1: components 木 and 亻 (stand-in 化), kanji 木
 * (built from 木) and 休 (亻 + 木). Level 2: component 日, kanji 旦 (日).
 */
const COURSE: Course = {
  version: 1,
  generatedAt: '',
  levels: [
    { components: ['木', '化'], kanji: ['木', '休'] },
    { components: ['日'], kanji: ['旦'] },
  ],
  kanji: {
    木: { c: '木', level: 1, grade: 1, s: 4, m: 'tree', on: '', kun: '', parts: ['木'] },
    休: { c: '休', level: 1, grade: 1, s: 6, m: 'rest', on: '', kun: '', parts: ['化', '木'] },
    旦: { c: '旦', level: 2, grade: 8, s: 5, m: 'dawn', on: '', kun: '', parts: ['日'] },
  },
  components: {
    木: { id: '木', form: '木', name: 'tree', level: 1 },
    化: { id: '化', form: '亻', name: 'person', level: 1 },
    日: { id: '日', form: '日', name: 'sun', level: 2 },
  },
}

/** State with the given items at the given stages. */
function withStages(stages: Record<string, number>, level = 1): SrsState {
  const progress: SrsState['progress'] = {}
  for (const [key, stage] of Object.entries(stages)) {
    progress[key] = { stage, next: NOW, correct: 0, incorrect: 0 }
  }
  return { version: 1, level, progress }
}

describe('keys and names', () => {
  it('round-trips item keys', () => {
    assert.deepEqual(parseKey(componentKey('化')), { kind: 'component', id: '化' })
    assert.deepEqual(parseKey(kanjiKey('休')), { kind: 'kanji', id: '休' })
  })

  it('names the stage groups', () => {
    assert.deepEqual(
      [1, 4, 5, 6, 7, 8, 9].map(stageName),
      ['Apprentice', 'Apprentice', 'Guru', 'Guru', 'Master', 'Enlightened', 'Burned'],
    )
  })
})

describe('answer', () => {
  it('schedules the first review four hours after a lesson', () => {
    assert.equal(afterLesson(NOW).next, NOW + 4 * HOUR)
  })

  it('moves up a stage when right, with the interval of the new stage', () => {
    const next = answer({ stage: 4, next: NOW, correct: 3, incorrect: 0 }, true, NOW)
    assert.equal(next.stage, 5)
    assert.equal(next.next, NOW + 167 * HOUR) // one week
    assert.equal(next.correct, 4)
  })

  it('moves down one stage when wrong below Guru', () => {
    const next = answer({ stage: 3, next: NOW, correct: 0, incorrect: 0 }, false, NOW)
    assert.equal(next.stage, 2)
    assert.equal(next.incorrect, 1)
  })

  it('moves down two stages when wrong from Guru or above', () => {
    const next = answer({ stage: 7, next: NOW, correct: 0, incorrect: 0 }, false, NOW)
    assert.equal(next.stage, 5)
  })

  it('never drops below stage 1', () => {
    assert.equal(answer({ stage: 1, correct: 0, incorrect: 0 }, false, NOW).stage, 1)
  })

  it('burns an item after Enlightened, and stops scheduling it', () => {
    const burned = answer({ stage: 8, next: NOW, correct: 0, incorrect: 0 }, true, NOW)
    assert.equal(burned.stage, BURNED)
    assert.equal(burned.next, undefined)
  })
})

describe('unlocking', () => {
  it('offers level 1 components, but no kanji, at the start', () => {
    assert.deepEqual(unlockedItems(COURSE, INITIAL_STATE), [
      componentKey('木'),
      componentKey('化'),
    ])
  })

  it('unlocks a kanji once all its components reach Guru', () => {
    const state = withStages({ [componentKey('木')]: GURU, [componentKey('化')]: GURU - 1 })
    const unlocked = unlockedItems(COURSE, state)
    assert.ok(unlocked.includes(kanjiKey('木'))) // needs only 木
    assert.ok(!unlocked.includes(kanjiKey('休'))) // 亻 is still Apprentice
  })

  it('keeps later levels locked until reached', () => {
    const state = withStages({ [componentKey('木')]: BURNED, [componentKey('化')]: BURNED })
    assert.ok(!unlockedItems(COURSE, state).includes(componentKey('日')))
  })

  it('queues lessons for unlocked items not yet started, components first', () => {
    const state = withStages({ [componentKey('木')]: GURU })
    assert.deepEqual(lessonQueue(COURSE, state), [componentKey('化'), kanjiKey('木')])
  })
})

describe('reviews', () => {
  it('lists items that are due, and not ones that are not', () => {
    const state: SrsState = {
      version: 1,
      level: 1,
      progress: {
        a: { stage: 2, next: NOW - 1, correct: 0, incorrect: 0 },
        b: { stage: 2, next: NOW + HOUR, correct: 0, incorrect: 0 },
        c: { stage: BURNED, correct: 0, incorrect: 0 },
      },
    }
    assert.deepEqual(reviewQueue(state, NOW), ['a'])
  })

  it('forecasts upcoming reviews by hour', () => {
    const state: SrsState = {
      version: 1,
      level: 1,
      progress: {
        a: { stage: 1, next: NOW + 30 * 60 * 1000, correct: 0, incorrect: 0 },
        b: { stage: 1, next: NOW + 3.5 * HOUR, correct: 0, incorrect: 0 },
        c: { stage: 1, next: NOW - 1, correct: 0, incorrect: 0 }, // already due
      },
    }
    const hours = forecast(state, NOW, 6)
    assert.deepEqual(hours, [1, 0, 0, 1, 0, 0])
  })

  it('counts items by stage group', () => {
    const counts = stageCounts(withStages({ a: 1, b: 5, c: 9 }))
    assert.equal(counts.Apprentice, 1)
    assert.equal(counts.Guru, 1)
    assert.equal(counts.Burned, 1)
  })
})

describe('levels', () => {
  it('needs 90% of the level kanji at Guru', () => {
    assert.deepEqual(levelProgress(COURSE, INITIAL_STATE), { guru: 0, total: 2, needed: 2 })
  })

  it('does not level up short of the threshold', () => {
    const state = withStages({ [kanjiKey('木')]: GURU })
    assert.equal(levelUp(COURSE, state).level, 1)
  })

  it('levels up once the threshold is met', () => {
    const state = withStages({ [kanjiKey('木')]: GURU, [kanjiKey('休')]: GURU })
    assert.equal(levelUp(COURSE, state).level, 2)
  })

  it('never goes past the last level', () => {
    const state = withStages(
      { [kanjiKey('木')]: GURU, [kanjiKey('休')]: GURU, [kanjiKey('旦')]: GURU },
      2,
    )
    assert.equal(levelUp(COURSE, state).level, 2)
  })

  it('skipping ahead burns everything below the target and unlocks it', () => {
    const state = skipToLevel(COURSE, INITIAL_STATE, 2)
    assert.equal(state.level, 2)
    assert.equal(state.progress[kanjiKey('休')].stage, BURNED)
    assert.equal(state.progress[componentKey('化')].stage, BURNED)
    // Level 2's own items are untouched and ready to learn.
    assert.deepEqual(lessonQueue(COURSE, state), [componentKey('日')])
  })

  it('never lowers the level when skipping backwards', () => {
    const state = skipToLevel(COURSE, { ...INITIAL_STATE, level: 2 }, 1)
    assert.equal(state.level, 2)
  })
})

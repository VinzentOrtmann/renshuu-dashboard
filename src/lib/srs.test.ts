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
  hoursToGuru,
  intervalHours,
  kanjiKey,
  lessonQueue,
  levelProgress,
  levelUp,
  parseKey,
  reviewQueue,
  wordKey,
  setPace,
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
 * (built from 木) and 休 (亻 + 木), word 休み. Level 2: component 日, kanji 旦
 * (日), word 旦那.
 */
const COURSE: Course = {
  version: 1,
  generatedAt: '',
  levels: [
    { components: ['木', '化'], kanji: ['木', '休'], words: ['休み'] },
    { components: ['日'], kanji: ['旦'], words: ['旦那'] },
  ],
  words: {
    休み: { w: '休み', r: ['やすみ'], m: 'rest', kanji: ['休'], level: 1 },
    旦那: { w: '旦那', r: ['だんな'], m: 'husband', kanji: ['旦'], level: 2 },
  },
  kanji: {
    木: {
      c: '木',
      level: 1,
      grade: 1,
      s: 4,
      m: 'tree',
      on: '',
      kun: '',
      parts: ['木'],
    },
    休: {
      c: '休',
      level: 1,
      grade: 1,
      s: 6,
      m: 'rest',
      on: '',
      kun: '',
      parts: ['化', '木'],
    },
    旦: {
      c: '旦',
      level: 2,
      grade: 8,
      s: 5,
      m: 'dawn',
      on: '',
      kun: '',
      parts: ['日'],
    },
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
    assert.deepEqual(parseKey(componentKey('化')), {
      kind: 'component',
      id: '化',
    })
    assert.deepEqual(parseKey(kanjiKey('休')), { kind: 'kanji', id: '休' })
  })

  it('names the stage groups', () => {
    assert.deepEqual([1, 4, 5, 6, 7, 8, 9].map(stageName), [
      'Apprentice',
      'Apprentice',
      'Guru',
      'Guru',
      'Master',
      'Enlightened',
      'Burned',
    ])
  })
})

describe('answer', () => {
  it('schedules the first review four hours after a lesson', () => {
    assert.equal(afterLesson(NOW).next, NOW + 4 * HOUR)
  })

  it('moves up a stage when right, with the interval of the new stage', () => {
    const next = answer(
      { stage: 4, next: NOW, correct: 3, incorrect: 0 },
      true,
      NOW,
    )
    assert.equal(next.stage, 5)
    assert.equal(next.next, NOW + 167 * HOUR) // one week
    assert.equal(next.correct, 4)
  })

  it('moves down one stage when wrong below Guru', () => {
    const next = answer(
      { stage: 3, next: NOW, correct: 0, incorrect: 0 },
      false,
      NOW,
    )
    assert.equal(next.stage, 2)
    assert.equal(next.incorrect, 1)
  })

  it('moves down two stages when wrong from Guru or above', () => {
    const next = answer(
      { stage: 7, next: NOW, correct: 0, incorrect: 0 },
      false,
      NOW,
    )
    assert.equal(next.stage, 5)
  })

  it('never drops below stage 1', () => {
    assert.equal(
      answer({ stage: 1, correct: 0, incorrect: 0 }, false, NOW).stage,
      1,
    )
  })

  it('burns an item after Enlightened, and stops scheduling it', () => {
    const burned = answer(
      { stage: 8, next: NOW, correct: 0, incorrect: 0 },
      true,
      NOW,
    )
    assert.equal(burned.stage, BURNED)
    assert.equal(burned.next, undefined)
  })
})

describe('pace', () => {
  it('uses WaniKani intervals when no pace is saved', () => {
    assert.deepEqual(
      intervalHours(INITIAL_STATE),
      [0, 4, 8, 23, 47, 167, 335, 730, 2922],
    )
    assert.equal(hoursToGuru(INITIAL_STATE), 82)
  })

  it('shortens only the Apprentice stages when fast', () => {
    const hours = intervalHours({ pace: 'fast' })
    assert.deepEqual(hours.slice(1, 5), [2, 4, 8, 23])
    assert.deepEqual(hours.slice(5), [167, 335, 730, 2922])
    assert.equal(afterLesson(NOW, hours).next, NOW + 2 * HOUR)
    assert.equal(
      answer({ stage: 2, correct: 0, incorrect: 0 }, true, NOW, hours).next,
      NOW + 8 * HOUR,
    )
  })

  it('uses custom hours, and falls back to normal when they are invalid', () => {
    assert.deepEqual(
      intervalHours({ pace: 'custom', customHours: [1, 2, 3, 4] }).slice(1, 5),
      [1, 2, 3, 4],
    )
    assert.deepEqual(
      intervalHours({ pace: 'custom', customHours: [1, 0, 3, 4] }).slice(1, 5),
      [4, 8, 23, 47],
    )
    assert.throws(() => setPace(INITIAL_STATE, 'custom', [1, 2]))
  })

  it('reschedules waiting items as if they had always been on the new pace', () => {
    const state: SrsState = {
      ...INITIAL_STATE,
      progress: {
        // Answered to stage 3 now, so due in 23 hours on normal.
        a: { stage: 3, next: NOW + 23 * HOUR, correct: 2, incorrect: 0 },
        // Guru waits don't depend on pace.
        b: { stage: 5, next: NOW + 100 * HOUR, correct: 4, incorrect: 0 },
        c: { stage: BURNED, correct: 8, incorrect: 0 },
      },
    }
    const fast = setPace(state, 'fast')
    assert.equal(fast.pace, 'fast')
    assert.equal(fast.progress.a.next, NOW + 8 * HOUR)
    assert.equal(fast.progress.b.next, NOW + 100 * HOUR)
    assert.deepEqual(fast.progress.c, state.progress.c)

    const back = setPace(fast, 'normal')
    assert.equal(back.progress.a.next, NOW + 23 * HOUR)
    assert.equal(
      setPace(setPace(state, 'custom', [1, 1, 1, 1]), 'fast').customHours,
      undefined,
    )
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
    const state = withStages({
      [componentKey('木')]: GURU,
      [componentKey('化')]: GURU - 1,
    })
    const unlocked = unlockedItems(COURSE, state)
    assert.ok(unlocked.includes(kanjiKey('木'))) // needs only 木
    assert.ok(!unlocked.includes(kanjiKey('休'))) // 亻 is still Apprentice
  })

  it('keeps later levels locked until reached', () => {
    const state = withStages({
      [componentKey('木')]: BURNED,
      [componentKey('化')]: BURNED,
    })
    assert.ok(!unlockedItems(COURSE, state).includes(componentKey('日')))
  })

  it('queues lessons for unlocked items not yet started, components first', () => {
    const state = withStages({ [componentKey('木')]: GURU })
    assert.deepEqual(lessonQueue(COURSE, state), [
      componentKey('化'),
      kanjiKey('木'),
    ])
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

describe('words', () => {
  const guru = (keys: string[]): SrsState => ({
    ...INITIAL_STATE,
    progress: Object.fromEntries(
      keys.map((key) => [
        key,
        { stage: GURU, next: NOW, correct: 5, incorrect: 0 },
      ]),
    ),
  })

  it('stays locked until every kanji in it is at Guru', () => {
    const before = guru([componentKey('木'), componentKey('化')])
    assert.equal(unlockedItems(COURSE, before).includes(wordKey('休み')), false)

    const after = guru([componentKey('木'), componentKey('化'), kanjiKey('休')])
    assert.equal(unlockedItems(COURSE, after).includes(wordKey('休み')), true)
  })

  it('is left out entirely when vocabulary is switched off', () => {
    const state = { ...guru([kanjiKey('休')]), vocab: false }
    assert.equal(unlockedItems(COURSE, state).includes(wordKey('休み')), false)
  })

  it('comes after components and kanji in lessons', () => {
    const kinds = lessonQueue(COURSE, guru([kanjiKey('休')])).map(
      (key) => parseKey(key).kind,
    )
    assert.equal(kinds[kinds.length - 1], 'word')
    assert.equal(kinds.indexOf('word') > kinds.lastIndexOf('component'), true)
  })

  it('never gates a level, however far behind the words are', () => {
    // Both level 1 kanji at Guru, its word untouched: the level still passes.
    const state = guru([kanjiKey('木'), kanjiKey('休')])
    const { guru: atGuru, needed } = levelProgress(COURSE, state)
    assert.equal(atGuru, 2)
    assert.equal(needed, 2)
    assert.equal(levelUp(COURSE, state).level, 2)
  })

  it('is burned along with the rest when skipping past its level', () => {
    const skipped = skipToLevel(COURSE, INITIAL_STATE, 2)
    assert.equal(skipped.progress[wordKey('休み')].stage, BURNED)
    assert.equal(skipped.progress[wordKey('旦那')], undefined)
  })
})

describe('levels', () => {
  it('needs 90% of the level kanji at Guru', () => {
    assert.deepEqual(levelProgress(COURSE, INITIAL_STATE), {
      guru: 0,
      total: 2,
      needed: 2,
    })
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
      {
        [kanjiKey('木')]: GURU,
        [kanjiKey('休')]: GURU,
        [kanjiKey('旦')]: GURU,
      },
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

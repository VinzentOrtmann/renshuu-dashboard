/**
 * Tests for building the kanji course.
 */

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  buildCourse,
  directParts,
  orderCourse,
  parseCourseEntry,
  parseKradfile,
} from './courseData.ts'
import type { KanjidicCourseEntry } from './courseData.ts'

// Real KRADFILE lines, including its nested and mutual listings.
const KRAD = parseKradfile(`# comment line
緊 : 糸 幺 小 臣 又
糸 : 糸 幺 小
海 : 汁 母 毋 乞
母 : 母 毋
毋 : 母 毋
休 : 化 木
木 : 木
`)

const entry = (
  c: string,
  grade: number | undefined,
  freq?: number,
  s = 5,
): KanjidicCourseEntry => ({ c, grade, freq, s, m: `${c} meaning`, on: '', kun: '' })

describe('parseKradfile', () => {
  it('reads kanji and their listed components, skipping comments', () => {
    assert.deepEqual(KRAD.get('休'), ['化', '木'])
    assert.equal(KRAD.has('#'), false)
  })
})

describe('directParts', () => {
  it('drops parts that are nested inside another listed part', () => {
    // 幺 and 小 are what 糸 is made of; the direct parts are 糸, 臣, 又.
    assert.deepEqual(directParts('緊', KRAD, new Set()), ['糸', '臣', '又'])
  })

  it('keeps the course kanji of a pair that list each other', () => {
    // 母 and 毋 each contain the other; 母 is a school kanji, 毋 isn't.
    assert.deepEqual(directParts('海', KRAD, new Set(['母'])), ['汁', '母', '乞'])
  })

  it('keeps the first listed of a mutual pair when neither is in the course', () => {
    assert.deepEqual(directParts('海', KRAD, new Set()), ['汁', '母', '乞'])
  })

  it('returns nothing for a kanji KRADFILE does not cover', () => {
    assert.deepEqual(directParts('無', KRAD, new Set()), [])
  })
})

describe('orderCourse', () => {
  it('orders by school grade, then most common first', () => {
    const ordered = orderCourse([
      entry('C', 2, 10),
      entry('A', 1, 500),
      entry('B', 1, 20),
      entry('D', 8, 5),
    ])
    assert.deepEqual(
      ordered.map((e) => e.c),
      ['B', 'A', 'C', 'D'],
    )
  })

  it('puts kanji without a frequency rank last in their grade', () => {
    const ordered = orderCourse([entry('X', 1), entry('Y', 1, 900)])
    assert.deepEqual(
      ordered.map((e) => e.c),
      ['Y', 'X'],
    )
  })

  it('leaves out non-jōyō kanji (no grade, or name-use grades 9-10)', () => {
    const ordered = orderCourse([entry('A', 1), entry('N', undefined), entry('J', 9)])
    assert.deepEqual(
      ordered.map((e) => e.c),
      ['A'],
    )
  })
})

describe('buildCourse', () => {
  const krad = parseKradfile('休 : 化 木\n木 : 木\n林 : 木\n')
  const course = buildCourse(
    [entry('木', 1, 1), entry('休', 1, 2), entry('林', 1, 3)],
    krad,
    2,
  )

  it('splits the ordered kanji into levels of the given size', () => {
    assert.deepEqual(
      course.levels.map((l) => l.kanji),
      [['木', '休'], ['林']],
    )
  })

  it('introduces each component once, at the first level that needs it', () => {
    assert.deepEqual(course.levels[0].components, ['木', '化'])
    assert.deepEqual(course.levels[1].components, [])
    assert.equal(course.components['木'].level, 1)
  })

  it('shows a stand-in as the radical it stands for, with its proper name', () => {
    assert.equal(course.components['化'].form, '亻')
    assert.equal(course.components['化'].name, 'person')
  })

  it('names other components from the dictionary', () => {
    assert.equal(course.components['木'].name, '木 meaning')
  })

  it('records each kanji with its level and direct parts', () => {
    assert.deepEqual(course.kanji['休'].parts, ['化', '木'])
    assert.equal(course.kanji['林'].level, 2)
  })
})

describe('parseCourseEntry', () => {
  it('reads grade, frequency and the English fields', () => {
    const parsed = parseCourseEntry(`
      <literal>木</literal>
      <misc><grade>1</grade><stroke_count>4</stroke_count><freq>317</freq></misc>
      <reading r_type="ja_on">ボク</reading><reading r_type="ja_kun">き</reading>
      <meaning>tree</meaning><meaning>wood</meaning><meaning m_lang="fr">arbre</meaning>`)
    assert.deepEqual(parsed, {
      c: '木',
      grade: 1,
      freq: 317,
      s: 4,
      m: 'tree, wood',
      on: 'ボク',
      kun: 'き',
    })
  })
})

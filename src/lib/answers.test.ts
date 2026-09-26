/**
 * Tests for typed answer checking: kana, romaji and forgiving meanings.
 */

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  checkMeaning,
  checkReading,
  kanaToRomaji,
  meaningAnswers,
  normaliseRomaji,
  readingAnswers,
} from './answers.ts'

describe('kanaToRomaji', () => {
  it('converts hiragana and katakana alike', () => {
    assert.equal(kanaToRomaji('やすむ'), 'yasumu')
    assert.equal(kanaToRomaji('キュウ'), 'kyuu')
    assert.equal(kanaToRomaji('シャ'), 'sha')
    assert.equal(kanaToRomaji('ちょう'), 'chou')
    assert.equal(kanaToRomaji('じゃ'), 'ja')
  })

  it('doubles a consonant after small tsu, and stretches a long mark', () => {
    assert.equal(kanaToRomaji('がっこう'), 'gakkou')
    assert.equal(kanaToRomaji('ラーメン'), 'raamen')
  })

  it('handles n and wo', () => {
    assert.equal(kanaToRomaji('ほん'), 'hon')
    assert.equal(kanaToRomaji('を'), 'o')
  })
})

describe('normaliseRomaji', () => {
  it('folds romaji systems together', () => {
    assert.equal(normaliseRomaji('si'), normaliseRomaji('shi'))
    assert.equal(normaliseRomaji('tu'), normaliseRomaji('tsu'))
    assert.equal(normaliseRomaji('syou'), normaliseRomaji('shou'))
    assert.equal(normaliseRomaji('zyuu'), normaliseRomaji('juu'))
  })

  it('ignores vowel length, so kyu and kyuu are the same', () => {
    assert.equal(normaliseRomaji('kyuu'), normaliseRomaji('kyu'))
    assert.equal(normaliseRomaji('きゅう'), normaliseRomaji('kyu'))
    assert.equal(normaliseRomaji('ちょう'), normaliseRomaji('cho'))
  })

  it('keeps different readings apart', () => {
    assert.notEqual(normaliseRomaji('きょう'), normaliseRomaji('きよ'))
    assert.notEqual(normaliseRomaji('kan'), normaliseRomaji('ken'))
    assert.notEqual(normaliseRomaji('けい'), normaliseRomaji('け'))
  })
})

describe('splitting dictionary fields', () => {
  it('takes the stem and the whole word from an okurigana reading', () => {
    assert.deepEqual(readingAnswers('やす.む, やす.まる'), [
      'やすむ',
      'やす',
      'やすまる',
    ])
  })

  it('drops the hyphen from suffix readings', () => {
    assert.deepEqual(readingAnswers('くさ, -ぐさ'), ['くさ', 'ぐさ'])
  })

  it('drops notes in brackets from meanings', () => {
    assert.deepEqual(meaningAnswers('be (classical), other'), ['be', 'other'])
  })
})

describe('checkReading', () => {
  const on = 'キュウ'
  const kun = 'やす.む, やす.まる'

  it('accepts kana and romaji, on and kun', () => {
    for (const typed of ['キュウ', 'きゅう', 'kyuu', 'kyu', ' KYUU ']) {
      assert.equal(checkReading(typed, on, kun), 'yes', typed)
    }
    assert.equal(checkReading('yasumu', on, kun), 'yes')
    assert.equal(checkReading('やす', on, kun), 'yes')
  })

  it('rejects a different reading', () => {
    assert.equal(checkReading('きょう', on, kun), 'no')
    assert.equal(checkReading('', on, kun), 'no')
    assert.equal(checkReading('rest', on, kun), 'no')
  })
})

describe('checkMeaning', () => {
  const meanings = 'rest, day off, retire'

  it('accepts any of the meanings, in any obvious form', () => {
    for (const typed of ['rest', 'Rest', ' to rest ', 'day off', 'retire']) {
      assert.equal(checkMeaning(typed, meanings), 'yes', typed)
    }
  })

  it('calls a typo close rather than wrong', () => {
    assert.equal(checkMeaning('retier', meanings), 'close')
    assert.equal(checkMeaning('day of', meanings), 'close')
  })

  it('rejects a different meaning', () => {
    assert.equal(checkMeaning('tree', meanings), 'no')
    assert.equal(checkMeaning('', meanings), 'no')
  })

  it('does not forgive typos in short words, where they are other words', () => {
    assert.equal(checkMeaning('ten', 'ton'), 'no')
  })

  it('forgives swapped letters even in a short word', () => {
    assert.equal(checkMeaning('dya', 'day'), 'close')
  })
})

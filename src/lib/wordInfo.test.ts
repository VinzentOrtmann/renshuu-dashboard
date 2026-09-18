/**
 * Tests for the worksheet's meaning-and-reading line.
 */

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  cleanGloss,
  fitText,
  infoLine,
  textWidthEm,
} from './wordInfo.ts'
import type { InfoSources } from './wordInfo.ts'
import type { KanjiEntry } from '../types/kanji.ts'
import type { VocabEntry } from '../types/vocab.ts'

const KANJI: Record<string, KanjiEntry> = {
  漢: { c: '漢', jlpt: 'N3', s: 13, m: 'Sino-, China', on: 'カン', kun: '' },
  飛: { c: '飛', jlpt: 'N3', s: 9, m: 'fly, skip', on: 'ヒ', kun: 'と.ぶ, と.ばす' },
  行: { c: '行', jlpt: 'N5', s: 6, m: 'going, journey', on: 'コウ, ギョウ', kun: 'い.く' },
}

const WORDS: Record<string, VocabEntry> = {
  飛行機: { r: ['ひこうき'], m: 'aeroplane, airplane' },
  生物: { r: ['せいぶつ', 'なまもの'], m: 'living thing; raw food' },
  ありがとう: { r: ['ありがとう'], m: 'thank you' },
}

const sources: InfoSources = {
  word: (w) => WORDS[w],
  kanji: (c) => KANJI[c],
  strokes: () => undefined,
}

describe('cleanGloss', () => {
  it('strips dictionary tags in braces', () => {
    assert.equal(cleanGloss('{col} revenge, retaliation'), 'revenge, retaliation')
    assert.equal(cleanGloss('{exp} {joc} a fine thing'), 'a fine thing')
  })
})

describe('infoLine', () => {
  it('gives readings, stroke count and meaning for a single kanji', () => {
    assert.equal(
      infoLine(['飛'], sources),
      'ヒ · と.ぶ, と.ばす · 9 strokes — fly, skip',
    )
  })

  it('leaves out an empty reading rather than printing a gap', () => {
    assert.equal(infoLine(['漢'], sources), 'カン · 13 strokes — Sino-, China')
  })

  it('prefers the stroke data over the collection when it has loaded', () => {
    assert.match(
      infoLine(['漢'], { ...sources, strokes: () => 14 }) ?? '',
      /14 strokes/,
    )
  })

  it('gives reading and meaning for a known word', () => {
    assert.equal(
      infoLine(['飛', '行', '機'], sources),
      'ひこうき — aeroplane, airplane',
    )
  })

  it('lists every reading when one spelling is two words', () => {
    assert.equal(
      infoLine(['生', '物'], sources),
      'せいぶつ / なまもの — living thing; raw food',
    )
  })

  it('does not repeat a kana-only word as its own reading', () => {
    assert.equal(infoLine(Array.from('ありがとう'), sources), 'thank you')
  })

  it('falls back to per-kanji meanings for a word not in the vocabulary', () => {
    assert.equal(infoLine(['飛', '行'], sources), '飛 fly · 行 going')
  })

  it('returns nothing when nothing is known', () => {
    assert.equal(infoLine(['x'], sources), undefined)
  })
})

describe('fitText', () => {
  it('leaves text that fits alone', () => {
    assert.equal(fitText('ひこうき — airplane', 100, 3), 'ひこうき — airplane')
  })

  it('cuts long text and ends it with an ellipsis', () => {
    const long = 'aeroplane, airplane, aircraft, flying machine, glider'
    const fitted = fitText(long, 30, 3) // 10 em of room
    assert.ok(fitted.endsWith('…'))
    assert.ok(textWidthEm(fitted) <= 10 + 1e-9)
  })

  it('counts kanji and kana as wider than Latin letters', () => {
    assert.equal(textWidthEm('漢字'), 2)
    assert.ok(textWidthEm('ab') < 2)
  })

  it('does not leave a separator hanging before the ellipsis', () => {
    const fitted = fitText('one, two, three, four, five, six', 16.5, 3)
    assert.doesNotMatch(fitted, /[,·\s]…$/)
  })
})

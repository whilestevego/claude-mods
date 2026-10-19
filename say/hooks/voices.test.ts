import { test, expect } from 'claude-code/testing'

import { byGrade, claimVoice, gradePoints, matchVoice, parseCatalog, parseTable, weightedPick } from './voices'

const pool = ['a', 'b', 'c']

test('sessions get distinct voices and keep them', () => {
  let table = {}
  const voices = ['10', '20', '30'].map(me => {
    const r = claimVoice(table, me, new Set(Object.keys(table)), pool)
    table = r.table
    return r.voice
  })
  expect(voices).toEqual(['a', 'b', 'c'])
  expect(claimVoice(table, '20', new Set(['10', '20', '30']), pool).voice).toBe('b')
})

test('a closed session frees its voice', () => {
  const r = claimVoice({ 10: 'a', 20: 'b' }, '30', new Set(['20']), pool)
  expect(r.voice).toBe('a')
  expect(r.table).toEqual({ 20: 'b', 30: 'a' })
})

test('voices cycle once all are taken; an empty pool means the default mix', () => {
  expect(claimVoice({ 1: 'a', 2: 'b', 3: 'c' }, '4', new Set(['1', '2', '3']), pool).voice).toBe('a')
  expect(claimVoice({}, '1', new Set(), []).voice).toBe('af_heart')
})

test('parseTable tolerates junk', () => {
  expect(parseTable('{"1":"a","2":3}')).toEqual({ 1: 'a' })
  expect(parseTable('not json')).toEqual({})
  expect(parseTable('[1]')).toEqual({})
})

const LIST = `AMERICAN FEMALE
  · af_alloy      Alloy     C
  ✓ af_heart      Heart     A   default

BRITISH FEMALE
  ✓ bf_emma       Emma      B-
  ✓ bf_isabella   Isabella  C

13 installed, 15 not. Install with murmur voices install NAME… or --all, or just use one.`

test('parseCatalog reads murmur voices', () => {
  expect(parseCatalog(LIST)).toEqual([
    { id: 'af_alloy', name: 'Alloy', group: 'AMERICAN FEMALE', isInstalled: false, grade: 'C' },
    { id: 'af_heart', name: 'Heart', group: 'AMERICAN FEMALE', isInstalled: true, grade: 'A' },
    { id: 'bf_emma', name: 'Emma', group: 'BRITISH FEMALE', isInstalled: true, grade: 'B-' },
    { id: 'bf_isabella', name: 'Isabella', group: 'BRITISH FEMALE', isInstalled: true, grade: 'C' },
  ])
  expect(parseCatalog('')).toEqual([])
  expect(parseCatalog('  ✓ af_heart      Heart  default')[0]?.grade).toBe('')  // a murmur without grades
})

test('matchVoice: exact id or name first, else partial', () => {
  const all = parseCatalog(LIST)
  expect(matchVoice('Emma', all).map(v => v.id)).toEqual(['bf_emma'])
  expect(matchVoice('bf_emma', all).map(v => v.id)).toEqual(['bf_emma'])
  expect(matchVoice('isa', all).map(v => v.id)).toEqual(['bf_isabella'])
  expect(matchVoice('bf', all).map(v => v.id)).toEqual(['bf_emma', 'bf_isabella'])
  expect(matchVoice('nobody', all)).toEqual([])
  expect(matchVoice(' ', all)).toEqual([])
})

test('grades: best first, and random leans toward the best', () => {
  expect([gradePoints('A'), gradePoints('A-'), gradePoints('D+'), gradePoints('F+'), gradePoints('')]).toEqual([4, 3.7, 1.3, 0.3, 2])
  const all = parseCatalog(LIST)
  expect(byGrade(all)).toEqual(['af_heart', 'bf_emma', 'af_alloy', 'bf_isabella'])
  // weights: Alloy 4, Heart 16, Emma 7.29, Isabella 4 (31.29 in all)
  expect(weightedPick(all, () => 0)?.id).toBe('af_alloy')
  expect(weightedPick(all, () => 0.2)?.id).toBe('af_heart')
  expect(weightedPick(all, () => 0.8)?.id).toBe('bf_emma')
  expect(weightedPick(all, () => 0.99)?.id).toBe('bf_isabella')
  expect(weightedPick([])).toBeUndefined()
})

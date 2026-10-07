import { test, expect } from 'claude-code/testing'

import { cells, kTokens, shortName } from './bar'

const seg = (tokens: number) => ({ name: 'x', tokens, color: 'text', kind: 'used' as const })

test('cells always fill the width exactly', () => {
  for (const width of [1, 7, 40, 133]) {
    const counts = cells([seg(3), seg(1000), seg(17), seg(180000)], width)
    expect(counts.reduce((a, b) => a + b, 0)).toBe(width)
    expect(counts.every(c => c >= 0)).toBe(true)
  }
})

test('cells are proportional', () => {
  expect(cells([seg(25), seg(75)], 100)).toEqual([25, 75])
})

test('empty input draws nothing', () => {
  expect(cells([], 50)).toEqual([])
  expect(cells([seg(0)], 50)).toEqual([0])
})

test('kTokens', () => {
  expect(kTokens(950)).toBe('950')
  expect(kTokens(12345)).toBe('12.3k')
})

test('shortName', () => {
  expect(shortName('MCP server instructions')).toBe('MCP')
  expect(shortName('Memory files')).toBe('Memory')
  expect(shortName('System prompt')).toBe('Sys. prompt')
  expect(shortName('System tools')).toBe('Sys. tools')
  expect(shortName('Messages')).toBe('Messages')
})

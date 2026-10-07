import { test, expect } from 'claude-code/testing'

import { duration, fullLine, tail } from './receipt'

const r = { ms: 42000, tools: 1, files: [] as string[], usd: null, isAborted: false, doneAt: new Date(2026, 9, 3, 22, 21).getTime(), tokensIn: null, tokensOut: null }

test('tail', () => {
  expect(tail(r)).toBe(' · 1 tool')
  expect(tail({ ...r, tools: 7, files: ['/a/b.ts', '/c.ts'], usd: 0.123, tokensIn: 52140, tokensOut: 812 })).toBe(
    ' · 7 tools · 2 files edited: b.ts, c.ts · 52.1k in / 812 out · $0.12',
  )
})

test('duration', () => {
  expect(duration(2669)).toBe('3s')
  expect(duration(64000)).toBe('1m 4s')
})

test('fullLine', () => {
  expect(fullLine('Baked', r)).toBe('✻ Baked for 42s · done 10:21 PM · 1 tool')
})

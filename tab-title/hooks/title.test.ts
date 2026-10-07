import { test, expect } from 'claude-code/testing'

import { ask, clean } from './title'

test('clean', () => {
  expect(clean('Rate Limit Gauge')).toBe('Rate Limit Gauge')
  expect(clean('"Building Claude Mods." extra words')).toBe('Building Claude Mods')
  expect(clean('Evil\u001b]2;pwned\u0007 Title')).toBe('Evil ]2;pwned Title')
  expect(clean('')).toBe('')
})

test('ask keeps it short', () => {
  const q = ask(['x'.repeat(1000)], 'y'.repeat(1000))
  expect(q.length).toBeLessThan(1200)
  expect(q).toContain('exactly 3 words')
})

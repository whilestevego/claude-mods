import { test, expect } from 'claude-code/testing'

import { ask, bare, clean, context } from './title'

test('clean', () => {
  expect(clean('Rate Limit Gauge Fix')).toBe('Rate Limit Gauge Fix')
  expect(clean('"Building Claude Mods Today." extra words')).toBe('Building Claude Mods Today')
  expect(clean('Evil\u001b]2;pwned\u0007 Title')).toBe('Evil ]2;pwned Title')
  expect(clean('x'.repeat(30) + ' ' + 'y'.repeat(30)).length).toBe(48)
  expect(clean('')).toBe('')
})

test('ask keeps it short', () => {
  const q = ask(Array(10).fill('x'.repeat(1000)), 'y'.repeat(1000))
  expect(q.length).toBeLessThan(4000)
  expect(q).toContain('exactly 4 words')
})

test('context: the last 10 requests and the latest reply, skipping markup', () => {
  const messages = [
    ...Array.from({ length: 12 }, (_, i) => ({ role: 'user', text: `ask ${i}` })),
    { role: 'user', text: '<command-name>/title</command-name>' },
    { role: 'assistant', text: 'first answer' },
    { role: 'user', text: '' },
    { role: 'assistant', text: 'last answer' },
    { role: 'assistant', text: '' },
  ]
  const c = context(messages)
  expect(c.prompts).toEqual(Array.from({ length: 10 }, (_, i) => `ask ${i + 2}`))
  expect(c.answer).toBe('last answer')
  expect(context([])).toEqual({ prompts: [], answer: '' })
})

test('bare drops the badge and the default title', () => {
  expect(bare('✳ Feature Videos Page Fix')).toBe('Feature Videos Page Fix')
  expect(bare('❓ Feature Videos')).toBe('Feature Videos')
  expect(bare('✳ Claude Code')).toBe('')
  expect(bare('~/work')).toBe('~/work')
})

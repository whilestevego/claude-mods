import { test, expect } from 'claude-code/testing'
import type { On } from 'claude-code'

import { cleanLine, tldrPrompt } from './line'

const long = 'Long reply. '.repeat(80)
const done = (answer: string) => ({ answer, durationMs: 30_000, isAborted: false, turnId: 'turn-7', reason: 'answer' }) as never

test('cleanLine', () => {
  expect(cleanLine('TL;DR: Built the **tab** progress bar.\n')).toBe('Built the tab progress bar.')
  expect(cleanLine('x\x1b]2;y')).toBe('x ]2;y')
  expect(cleanLine('')).toBe('')
  expect(cleanLine('y'.repeat(300))).toBe('')
})

test('tldrPrompt bounds its inputs', () => {
  expect(tldrPrompt('a'.repeat(9000), 'b'.repeat(9000)).length).toBeLessThan(6000)
})

/** Captures what the mod publishes for other mods. */
function published(on: On) {
  const writes: unknown[] = []
  on('state.set', (_$, e) => (writes.push((e as unknown as { value: unknown }).value), { value: { isSet: true, version: writes.length } }) as never)
  return writes
}

test('a long reply gets a TL;DR under it, published for the voice mod', async ($, on) => {
  const writes = published(on)
  on('model.complete', () => ({ value: { isAnswered: true, text: 'TL;DR: Built the tab progress bar; restart to load it.', usage: {} } }) as never)
  on('turn.complete', (_$, e) => ({ text: e.answer }))
  const r = await $.turn.complete(done(long))
  expect(r.text).toBe('TL;DR: Built the tab progress bar; restart to load it.')
  expect(writes.at(-1)).toEqual({ turnId: 'turn-7', text: 'Built the tab progress bar; restart to load it.' })
})

test('a short reply gets none, and says so for anyone waiting', async ($, on) => {
  const writes = published(on)
  let calls = 0
  on('model.complete', () => (calls++, { value: { isAnswered: true, text: 'x', usage: {} } }) as never)
  on('turn.complete', (_$, e) => ({ text: e.answer }))
  const r = await $.turn.complete(done('Short.'))
  expect(r.text).toBe('Short.')
  expect(calls).toBe(0)
  expect(writes.at(-1)).toEqual({ turnId: 'turn-7', text: '' })
})

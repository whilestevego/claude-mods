import { test, expect } from 'claude-code/testing'
import type { On } from 'claude-code'

import { cleanLine, tldrPrompt } from './line'

const long = 'Long reply. '.repeat(80)
const done = (answer: string) => ({ answer, durationMs: 30_000, isAborted: false, turnId: 'turn-7', reason: 'answer' }) as never

/** A state store the test can see: what tldr publishes, by key. */
function store(on: On) {
  const values: Record<string, { value: unknown; version: number }> = {}
  const keyOf = (e: unknown) => (e as { ref: { key: string } }).ref?.key ?? (e as { key: string }).key
  on('state.get', (_$, e) => ({ value: values[keyOf(e)] ?? { value: undefined, version: 0 } }) as never)
  on('state.set', (_$, e) => {
    const key = keyOf(e)
    const version = (values[key]?.version ?? 0) + 1
    values[key] = { value: (e as unknown as { value: unknown }).value, version }
    return { value: { isSet: true, version } } as never
  })
  return values
}

test('cleanLine', () => {
  expect(cleanLine('TL;DR: Built the **tab** progress bar.\n')).toBe('Built the tab progress bar.')
  expect(cleanLine('x\x1b]2;y')).toBe('x ]2;y')
  expect(cleanLine('')).toBe('')
  expect(cleanLine('y'.repeat(300))).toBe('')
})

test('tldrPrompt bounds its inputs', () => {
  expect(tldrPrompt('a'.repeat(9000), 'b'.repeat(9000)).length).toBeLessThan(6000)
})

test('a long reply gets a TL;DR under its closing line, published for the voice mod', async ($, on) => {
  const values = store(on)
  on('model.complete', () => ({ value: { isAnswered: true, text: 'TL;DR: Built the tab progress bar.', usage: {} } }) as never)
  on('turn.complete', (_$, e) => ({ text: e.answer }))
  on('ui.render', () => ({ type: 'Text', children: ['✻ Cooked for 30s'] }) as never)
  const r = await $.turn.complete(done(long))
  expect(r.text).toBe(long)  // the reply itself is untouched
  expect(values.line?.value).toEqual({ turnId: 'turn-7', text: 'Built the tab progress bar.' })
  const ui = await $.ui.mount({ plugin: 'tldr', surface: 'terminal', component: 'TurnDuration', props: { word: 'Cooked', durationMs: 30_000 } as never })
  expect(await ui.find({ type: 'Text', text: /TL;DR: Built the tab progress bar\./ })).toBeDefined()
})

test('a short reply gets none, and says so for anyone waiting', async ($, on) => {
  const values = store(on)
  let calls = 0
  on('model.complete', () => (calls++, { value: { isAnswered: true, text: 'x', usage: {} } }) as never)
  on('turn.complete', (_$, e) => ({ text: e.answer }))
  await $.turn.complete(done('Short.'))
  expect(calls).toBe(0)
  expect(values.line?.value).toEqual({ turnId: 'turn-7', text: '' })
})

test('not added twice when the line beneath already has it (turn-receipt drew it)', async ($, on) => {
  store(on)
  on('model.complete', () => ({ value: { isAnswered: true, text: 'Once.', usage: {} } }) as never)
  on('turn.complete', (_$, e) => ({ text: e.answer }))
  on('ui.render', () => ({ type: 'Box', children: [{ type: 'Text', children: ['✻ Cooked'] }, { type: 'Text', children: ['  TL;DR: Once.'] }] }) as never)
  await $.turn.complete(done(long))
  const ui = await $.ui.mount({ plugin: 'tldr', surface: 'terminal', component: 'TurnDuration', props: { word: 'Cooked', durationMs: 30_000 } as never })
  expect(JSON.stringify(await ui.drawn()).match(/TL;DR/g)).toHaveLength(1)
})

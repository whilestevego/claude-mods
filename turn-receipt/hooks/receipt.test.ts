import { test, expect } from 'claude-code/testing'

declare function setTimeout(fn: (value?: unknown) => void, ms: number): unknown

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

test('the closing line carries the receipt, and the TL;DR under it', { options: { minChars: 1 } }, async ($, on) => {
  on('session.usage', () => ({ value: { cost: { usd: 1 } } }) as never)
  on('prompt.submit', (_$, e) => ({ text: e.text }) as never)
  on('tool.call', () => ({ result: {}, text: '' }) as never)
  on('turn.complete', (_$, e) => ({ text: e.answer }))
  on('model.complete', () => ({ value: { isAnswered: true, text: 'Built it.', usage: {} } }) as never)
  on('ui.render', () => ({ type: 'Text', children: ['✻ Baked for 30s'] }) as never)
  await $.prompt.submit({ text: 'Build it', origin: { kind: 'user' } } as never)
  await $.tool.call({ tool: 'Bash', command: 'ls' } as never)
  await $.turn.complete({ answer: 'Built.', durationMs: 30_000, isAborted: false, turnId: 't', reason: 'answer' } as never)
  await new Promise(r => setTimeout(r, 20))
  const ui = await $.ui.mount({ plugin: 'turn-receipt', surface: 'terminal', component: 'TurnDuration', props: { word: 'Baked', durationMs: 30_000 } as never })
  expect(await ui.find({ type: 'Text', text: /^✻ Baked for 30s · done .+ · 1 tool · \$0\.00$/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /TL;DR: Built it\./ })).toBeDefined()
})

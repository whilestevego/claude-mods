import { test, expect } from 'claude-code/testing'

import { conversationOf, parseSpot, placeOf, plan, readPs, resumeCommand, tabsOf } from './restore'
import type { Spot } from './restore'

const view = JSON.stringify({
  label: 'brilliant',
  windows: [
    { window_id: 'w1', label: 'Sass Warnings', layers: [{ blocks: [{ block_id: 'b1' }] }] },
    { window_id: 'w2', label: 'Menu Search', layers: [{ blocks: [{ block_id: 'b2' }, { block_id: 'b3' }] }] },
  ],
})

test('placeOf names the session, tab and tab position of a pane', () => {
  expect(placeOf(view, 'b3')).toEqual({ sessionLabel: 'brilliant', window: 'w2', tab: 'Menu Search', tabIndex: 1 })
  expect(placeOf(view, 'b9')).toBe(undefined)
  expect(placeOf('junk', 'b1')).toBe(undefined)
  expect(tabsOf(view)).toEqual([
    { window: 'w1', tab: 'Sass Warnings', blocks: ['b1'] },
    { window: 'w2', tab: 'Menu Search', blocks: ['b2', 'b3'] },
  ])
})

test('readPs finds panes at a prompt and every Claude', () => {
  const ps = [
    '101 Ss+  -zsh TERM=x REX_BLOCK=block:idle',
    '102 Ss   /bin/zsh REX_BLOCK=block:busy',
    '103 S+   claude --resume abc REX_BLOCK=block:busy',
    '104 S+   /bin/zsh REX_BLOCK=block:vim',
    '105 S+   nvim REX_BLOCK=block:vim',
    '106 S+   /usr/local/bin/claude HOME=/x',
    '',
  ].join('\n')
  const { idle, claudes } = readPs(ps)
  expect([...idle]).toEqual(['block:idle'])
  expect(claudes).toEqual([{ pid: '103', block: 'block:busy' }, { pid: '106', block: undefined }])
})

test('conversationOf and parseSpot reject junk', () => {
  expect(conversationOf('{"sessionId":"abc"}')).toBe('abc')
  expect(conversationOf('{}')).toBe(undefined)
  expect(parseSpot('nope')).toBe(undefined)
  expect(parseSpot('{"sessionId":"a"}')).toBe(undefined)
})

test('resumeCommand quotes the folder', () => {
  expect(resumeCommand({ root: "/it's here", sessionId: 'abc' })).toBe(`cd '/it'\\''s here' && claude --resume abc\r`)
})

const spot = (sessionId: string, o: Partial<Spot>): Spot => ({
  sessionId, root: '/r', rexSession: 's1', sessionLabel: 'brilliant', window: 'w1', tab: '', tabIndex: 0, block: 'b1', savedAt: 0, ...o,
})

test('plan prefers the old pane, then an idle pane in a tab of the same name, then a new pane', () => {
  const tabs = new Map([['s1', [{ window: 'w9', tab: 'Menu Search', blocks: ['b7', 'b8'] }]]])
  const out = plan(
    [
      spot('c', { tabIndex: 2, block: 'gone', tab: 'Other' }),
      spot('b', { tabIndex: 1, block: 'gone', tab: 'Menu Search' }),
      spot('a', { tabIndex: 0, block: 'b1' }),
      spot('d', { tabIndex: 3, block: 'b1' }),
    ],
    new Set(['b1', 'b8']),
    tabs,
  )
  expect(out.map(p => [p.spot.sessionId, p.target])).toEqual([
    ['a', { kind: 'pane', block: 'b1', rexSession: 's1' }],
    ['b', { kind: 'pane', block: 'b8', rexSession: 's1' }],
    ['c', { kind: 'new' }],
    ['d', { kind: 'new' }],
  ])
})

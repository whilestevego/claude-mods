import { test, expect } from 'claude-code/testing'

import {
  backgroundFrom, claudeSessions, matchSessions, mix, modeFromHint, notify, percentDone, progress, Progress,
  resetBackground, runningBar, safe, shortFolder, shouldNotify, tabTitle, tintSequence, title,
} from './term'

test('sequences', () => {
  expect(title('✳ Fix Login Bug')).toBe('\x1b]2;✳ Fix Login Bug\x07')
  expect(progress(Progress.value, 42.4)).toBe('\x1b]9;4;1;42\x07')
  expect(progress(Progress.busy)).toBe('\x1b]9;4;3\x07')
  expect(progress(Progress.hide)).toBe('\x1b]9;4;0\x07')
  expect(notify('Claude Code', 'Needs permission; for Bash')).toBe('\x1b]777;notify;Claude Code;Needs permission, for Bash\x07')
})

test('nothing can inject an escape sequence', () => {
  expect(safe('a\x1b]2;pwned\x07b')).toBe('a ]2;pwned b')
  expect(title('x\x07\x1b')).toBe('\x1b]2;x\x07')
})

test('tab title shows ❓ while waiting', () => {
  expect(tabTitle('Rate Limit Gauge', false)).toBe('✳ Rate Limit Gauge')
  expect(tabTitle('Rate Limit Gauge', true)).toBe('❓ Rate Limit Gauge')
  expect(tabTitle('', true)).toBe('❓ Claude Code')
})

test('the running bar follows the todo list and turns red on failure', () => {
  const todos = [{ status: 'completed' as const }, { status: 'in_progress' as const }, { status: 'pending' as const }, { status: 'pending' as const }]
  expect(percentDone([])).toBeUndefined()
  expect(runningBar([], false)).toBe('\x1b]9;4;3\x07')
  expect(runningBar(todos, false)).toBe('\x1b]9;4;1;25\x07')
  expect(runningBar(todos, true)).toBe('\x1b]9;4;2;25\x07')
  expect(runningBar([], true)).toBe('\x1b]9;4;2;100\x07')
})

test('notify unless the voice mod says it', () => {
  expect(shouldNotify('auto', false)).toBe(true)
  expect(shouldNotify('auto', true)).toBe(false)
  expect(shouldNotify('always', true)).toBe(true)
  expect(shouldNotify('never', false)).toBe(false)
})


test('mode from the hint line', () => {
  expect(modeFromHint('⏵⏵ accept edits on (shift+tab to cycle)')).toBe('acceptEdits')
  expect(modeFromHint('⏸ plan mode on (shift+tab to cycle)')).toBe('plan')
  expect(modeFromHint('⏵⏵ bypass permissions on')).toBe('bypassPermissions')
  expect(modeFromHint('? for shortcuts')).toBeUndefined()
})

test('tints mix toward the mode color; default resets', () => {
  expect(mix('#282c34', '#ef4444', 0)).toBe('#282c34')
  expect(mix('#282c34', '#ef4444', 100)).toBe('#ef4444')
  expect(mix('#000000', '#ffffff', 10)).toBe('#1a1a1a')
  expect(mix('nope', '#ffffff', 10)).toBeUndefined()
  expect(tintSequence('bypassPermissions', '#282c34', 10)).toBe('\x1b]11;#3c2e36\x07')
  expect(tintSequence('default', '#282c34', 10)).toBe(resetBackground)
})

test('background from ghostty +show-config', () => {
  expect(backgroundFrom('font-size = 13\nbackground = #1e1e2e\n', 'background = #282c34')).toBe('#1e1e2e')
  expect(backgroundFrom('', 'theme = \nbackground = #282c34\n')).toBe('#282c34')
  expect(backgroundFrom('', '')).toBe('#282c34')
})

test('Claude sessions from Ghostty terminals and ps', () => {
  const terms = 'A\t/dev/ttys000\t✳ Plan review\t/u/redouble\nB\t/dev/ttys001\t~/hobby\t/u/hobby\nC\t/dev/ttys004\t✳ Murmur Mods\t/u/.claude\n'
  const s = claudeSessions(terms, new Set(['/dev/ttys000', '/dev/ttys004']), '/dev/ttys004')
  expect(s.map(x => [x.id, x.isMe])).toEqual([['A', false], ['C', true]])
  expect(matchSessions(s, '1').map(x => x.id)).toEqual(['A'])
  expect(matchSessions(s, 'murmur').map(x => x.id)).toEqual(['C'])
  expect(matchSessions(s, 'redouble').map(x => x.id)).toEqual(['A'])
  expect(matchSessions(s, '9')).toEqual([])
  expect(shortFolder('/Users/me/work', '/Users/me')).toBe('~/work')
})

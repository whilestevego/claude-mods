import { test, expect } from 'claude-code/testing'

import { claudePidsFrom, cleanName, closable, conversationOf, fromWindow, namePrompt, openScript, sameWorkspace, slug, startCommand, summary } from './workspace'

const lines = [
  '1\t/dev/ttys002\t/u/work/brilliant\t✳ Feature videos',
  '1\t/dev/ttys009\t/u/work/brilliant\t~/work/brilliant',
  '2\t/dev/ttys003\t/u/work/brilliant\t✳ BRL-12583 "Admin" redesign',
  '',
].join('\n')
const pids = new Map([['/dev/ttys002', '51378'], ['/dev/ttys003', '51709']])
const conversations = new Map([['51378', 'd3708272-a610-4b17-a4b4-5dc31f820798']])

test('a window becomes tabs of Claude and shell panes', () => {
  const tabs = fromWindow(lines, pids, conversations)
  expect(tabs).toEqual([
    [
      { kind: 'claude', cwd: '/u/work/brilliant', title: 'Feature videos', sessionId: 'd3708272-a610-4b17-a4b4-5dc31f820798' },
      { kind: 'shell', cwd: '/u/work/brilliant', title: '~/work/brilliant' },
    ],
    [{ kind: 'claude', cwd: '/u/work/brilliant', title: 'BRL-12583 "Admin" redesign', sessionId: undefined }],
  ])
  expect(summary({ name: 'x', savedAt: 0, tabs })).toBe('2 tabs · 2 Claude')
})

test('resume the conversation, or start a new one when it isn\'t known', () => {
  expect(startCommand({ kind: 'claude', cwd: '/', title: '', sessionId: 'abc12345-0000' })).toBe('claude --resume abc12345-0000')
  expect(startCommand({ kind: 'claude', cwd: '/', title: '', sessionId: 'x; rm -rf /' })).toBe('claude')
  expect(startCommand({ kind: 'shell', cwd: '/', title: '' })).toBeUndefined()
})

test('the open script makes a window, tabs and splits, with quotes escaped', () => {
  const tabs = fromWindow(lines.replace('/u/work/brilliant\t✳ BRL', '/u/my "odd" dir\t✳ BRL'), pids, conversations)
  const script = openScript({ name: 'x', savedAt: 0, tabs })
  expect(script).toContain('set w to new window with configuration c1')
  expect(script).toContain('set initial input of c1 to "claude --resume d3708272-a610-4b17-a4b4-5dc31f820798" & linefeed')
  expect(script).toContain('set t to split t direction right with configuration c2')
  expect(script).not.toContain('initial input of c2')  // a shell pane runs nothing
  expect(script).toContain('set tb to new tab in w with configuration c3')
  expect(script).toContain('set initial working directory of c3 to "/u/my \\"odd\\" dir"')
  expect(script).toContain('set initial input of c3 to "claude" & linefeed')
})

test('names', () => {
  expect(slug('Brilliant Admin Work!')).toBe('brilliant-admin-work')
  expect(slug('***')).toBe('workspace')
  expect(cleanName('"Brilliant Admin Work."\n')).toBe('Brilliant Admin Work')
  expect(cleanName('')).toBe('')
  expect(namePrompt([[{ kind: 'shell', cwd: '/a', title: 't' }]])).toContain('- t in /a')
})

test('Claude tabs sharing a folder each keep their own conversation', () => {
  const window = '1\t/dev/ttys002\t/u/b\tA\n2\t/dev/ttys003\t/u/b\tB\n3\t/dev/ttys006\t/u/b\tC\n'
  const tabs = fromWindow(window, claudePidsFrom('/dev/ttys002 11\n/dev/ttys003 22\n/dev/ttys006 33\n'), new Map([['11', 'aaa11111'], ['22', 'bbb22222'], ['33', 'ccc33333']]))
  expect(tabs.flat().map(p => (p.kind === 'claude' ? p.sessionId : '-'))).toEqual(['aaa11111', 'bbb22222', 'ccc33333'])
})

test("Claude Code's session record", () => {
  expect(conversationOf('{"pid":36583,"sessionId":"e3771dab-d2f3","cwd":"/x"}')).toBe('e3771dab-d2f3')
  expect(conversationOf('junk')).toBeUndefined()
  expect(claudePidsFrom('/dev/ttys004 36583\n\n')).toEqual(new Map([['/dev/ttys004', '36583']]))
})

test('closing a reopened workspace updates it instead of making a new one', () => {
  const pane = (id: string) => ({ kind: 'claude' as const, cwd: '/', title: id, sessionId: id })
  const saved = [
    { name: 'Other', tabs: [[pane('x1')], [pane('x2')]] },
    { name: 'Brilliant', tabs: [[pane('a')], [pane('b')], [pane('c')], [pane('d')]] },
  ]
  expect(sameWorkspace([[pane('a')], [pane('b')], [pane('c')], [pane('me')]], saved)?.name).toBe('Brilliant')
  expect(sameWorkspace([[pane('a')], [pane('z1')], [pane('z2')], [pane('z3')]], saved)).toBeUndefined()
  expect(sameWorkspace([[{ kind: 'shell', cwd: '/', title: '' }]], saved)).toBeUndefined()
})

test('close every Claude pane but my own; shells stay', () => {
  const window = '1\t/dev/ttys004\t/u\tMe\tT4\n2\t/dev/ttys002\t/u\tA\tT2\n2\t/dev/ttys009\t/u\tshell\tT9\n3\t/dev/ttys003\t/u\tB\tT3\n'
  const pids = claudePidsFrom('/dev/ttys004 4\n/dev/ttys002 2\n/dev/ttys003 3\n')
  expect(closable(window, pids, '/dev/ttys004')).toEqual([
    { id: 'T2', tty: '/dev/ttys002', pid: '2' },
    { id: 'T3', tty: '/dev/ttys003', pid: '3' },
  ])
})

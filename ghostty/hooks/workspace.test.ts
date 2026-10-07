import { test, expect } from 'claude-code/testing'

import { cleanName, fromWindow, namePrompt, openScript, slug, startCommand, summary } from './workspace'
import type { Entry } from './registry'

const lines = [
  '1\t/dev/ttys002\t/u/work/brilliant\t✳ Feature videos',
  '1\t/dev/ttys009\t/u/work/brilliant\t~/work/brilliant',
  '2\t/dev/ttys003\t/u/work/brilliant\t✳ BRL-12583 "Admin" redesign',
  '',
].join('\n')
const entries = new Map<string, Entry>([['/dev/ttys002', { tty: '/dev/ttys002', pid: '1', sessionId: 'd3708272-a610-4b17-a4b4-5dc31f820798', cwd: '/u', status: 'idle', since: 0 }]])

test('a window becomes tabs of Claude and shell panes', () => {
  const tabs = fromWindow(lines, new Set(['/dev/ttys002', '/dev/ttys003']), entries)
  expect(tabs).toEqual([
    [
      { kind: 'claude', cwd: '/u/work/brilliant', title: '✳ Feature videos', sessionId: 'd3708272-a610-4b17-a4b4-5dc31f820798' },
      { kind: 'shell', cwd: '/u/work/brilliant', title: '~/work/brilliant' },
    ],
    [{ kind: 'claude', cwd: '/u/work/brilliant', title: '✳ BRL-12583 "Admin" redesign', sessionId: undefined }],
  ])
  expect(summary({ name: 'x', savedAt: 0, tabs })).toBe('2 tabs · 2 Claude')
})

test('resume the conversation, or the folder\'s latest without an ID', () => {
  expect(startCommand({ kind: 'claude', cwd: '/', title: '', sessionId: 'abc12345-0000' })).toBe('claude --resume abc12345-0000')
  expect(startCommand({ kind: 'claude', cwd: '/', title: '', sessionId: 'x; rm -rf /' })).toBe('claude --continue')
  expect(startCommand({ kind: 'shell', cwd: '/', title: '' })).toBeUndefined()
})

test('the open script makes a window, tabs and splits, with quotes escaped', () => {
  const tabs = fromWindow(lines.replace('/u/work/brilliant\t✳ BRL', '/u/my "odd" dir\t✳ BRL'), new Set(['/dev/ttys002', '/dev/ttys003']), entries)
  const script = openScript({ name: 'x', savedAt: 0, tabs })
  expect(script).toContain('set w to new window with configuration c1')
  expect(script).toContain('set initial input of c1 to "claude --resume d3708272-a610-4b17-a4b4-5dc31f820798" & linefeed')
  expect(script).toContain('set t to split t direction right with configuration c2')
  expect(script).not.toContain('initial input of c2')  // a shell pane runs nothing
  expect(script).toContain('set tb to new tab in w with configuration c3')
  expect(script).toContain('set initial working directory of c3 to "/u/my \\"odd\\" dir"')
  expect(script).toContain('set initial input of c3 to "claude --continue" & linefeed')
})

test('names', () => {
  expect(slug('Brilliant Admin Work!')).toBe('brilliant-admin-work')
  expect(slug('***')).toBe('workspace')
  expect(cleanName('"Brilliant Admin Work."\n')).toBe('Brilliant Admin Work')
  expect(cleanName('')).toBe('')
  expect(namePrompt([[{ kind: 'shell', cwd: '/a', title: 't' }]])).toContain('- t in /a')
})

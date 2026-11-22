import { test, expect, mock } from 'claude-code/testing'
import type { On } from 'claude-code'

import { fakeSessionInfo } from './fakes'

// The test environment has timers; the plugin typings (no DOM, no Node) just don't declare them.
declare function setTimeout(fn: (value?: unknown) => void, ms: number): unknown
const settle = () => new Promise(r => setTimeout(r, 20))

/** Fakes the machine: Claude on /dev/ttys004 among Ghostty's terminals; `written` collects what reaches the tab. */
function machine(on: On, opts: { toolFails?: boolean; term?: string } = {}) {
  const written: string[] = []
  const info = fakeSessionInfo(on, { sessionId: 's', title: 'Tab Progress Bar' })
  on('process.run', (_$, e) => {
    const argv = e.argv as string[]
    const script = argv[2] ?? ''
    const out = (stdout: string) => ({ value: { exitCode: 0, stdout, stderr: '' } }) as never
    if (script.includes('printf') || script.includes('perform action')) written.push(argv[4]!)
    return out('')
  })
  on('session.id', () => ({ value: 's' }) as never)
  on('command.register', () => ({ value: {} }) as never)
  on('command.run', () => ({ text: '' }))
  on('ui.open', () => ({ value: { isPlaced: true } }) as never)
  on('ui.close', () => ({ value: {} }) as never)
  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  on('env.get', (_$, e) => ({ value: ({ HOME: '/home/me', TERM_PROGRAM: opts.term ?? 'ghostty' } as Record<string, string>)[e.name] }) as never)
  on('session.end', () => ({ sessionId: 's' }) as never)
  on('prompt.submit', (_$, e) => ({ text: e.text }) as never)
  on('tool.call', () => ({ result: {}, text: '', isError: opts.toolFails === true }) as never)
  on('tool.check', () => ({ decision: 'ask' }) as never)
  on('ui.render', () => ({ type: 'Box', children: [] }) as never)
  on('turn.complete', (_$, e) => ({ text: e.answer }))
  on('ui.notify', (_$, e) => (written.push(`notify:${e.title};${e.text}`), { value: { isSent: true, channel: 'ghostty' } }) as never)
  return Object.assign(written, { openDialog: info.openDialog, finish: info.finish })
}

const start = { cwd: '/', surface: 'terminal' as const, isInteractive: true }
const submit = { text: 'Build the progress bar', origin: { kind: 'user' } } as never
/** A Bash call that asks permission (its check, then a wait in Claude Code), as `id`. */
const asks = ($: { tool: { check(e: never): Promise<unknown> } }, id: string) => $.tool.check({ tool: 'Bash', input: { command: 'ls' }, tool_use_id: id } as never)
const done = { answer: 'Done.', durationMs: 5000, isAborted: false, turnId: 't', reason: 'answer' } as never

test('a turn shows a busy bar and clears it at the end', async ($, on) => {
  const clock = mock.clock(on)
  const w = machine(on)
  await $.session.start(start)
  await $.prompt.submit(submit)
  await settle(); await clock.advance(200)
  expect(w).toContain('\x1b]9;4;3\x07')
  await $.turn.complete(done)
  await settle(); await clock.advance(200)
  expect(w).toContain('\x1b]9;4;0\x07')
  expect(w).toContain('set_surface_title:✳ Tab Progress Bar')  // the Haiku summary became the title
})

test('a failed tool call turns the bar red', async ($, on) => {
  const clock = mock.clock(on)
  const w = machine(on, { toolFails: true })
  await $.session.start(start)
  await $.prompt.submit(submit)
  await $.tool.call({ tool: 'Bash', command: 'false' } as never)
  await settle(); await clock.advance(200)
  expect(w).toContain('\x1b]9;4;2;100\x07')
})

test('waiting on you: ❓ in the title and a paused bar, and no notification (the notify mod sends that)', async ($, on) => {
  const clock = mock.clock(on)
  const w = machine(on)
  await $.session.start(start)
  await $.prompt.submit(submit)
  await asks($, 'u1')
  w.openDialog()
  await clock.advance(600)
  await settle(); await clock.advance(200)
  expect(w).toContain('set_surface_title:❓ Tab Progress Bar')
  expect(w).toContain('\x1b]9;4;4\x07')
  expect(w.some(s => s.startsWith('notify:'))).toBe(false)
  await $.tool.call({ tool: 'Bash', command: 'ls', tool_use_id: 'u1' } as never)  // you allowed it: the tool ran
  await settle(); await clock.advance(200)
  expect(w.at(-2) + w.at(-1)!).toContain('✳ Tab Progress Bar')
})

test('other calls finishing while a dialog is up leave the ❓; answering it clears it', async ($, on) => {
  const clock = mock.clock(on)
  const w = machine(on)
  await $.session.start(start)
  await $.prompt.submit(submit)
  await asks($, 'u1')
  w.openDialog()
  await clock.advance(600)
  await settle(); await clock.advance(200)
  const titles = () => w.filter(s => s.startsWith('set_surface_title:'))
  expect(titles().at(-1)).toBe('set_surface_title:❓ Tab Progress Bar')
  await $.tool.call({ tool: 'Read', file_path: '/a', tool_use_id: 'u2' } as never)                  // a parallel read
  await $.tool.call({ tool: 'Bash', command: 'ls', tool_use_id: 'u3', agentId: 'sub' } as never)  // a subagent's call
  await settle(); await clock.advance(200)
  expect(titles().at(-1)).toBe('set_surface_title:❓ Tab Progress Bar')
  await $.tool.call({ tool: 'Bash', command: 'ls', tool_use_id: 'u1' } as never)
  await settle(); await clock.advance(200)
  expect(titles().at(-1)).toBe('set_surface_title:✳ Tab Progress Bar')
})

test("a question keeps the ❓ until it's answered", async ($, on) => {
  const clock = mock.clock(on)
  const w = machine(on)
  await $.session.start(start)
  await $.prompt.submit(submit)
  const question = $.tool.call({ tool: 'AskUserQuestion', questions: [], tool_use_id: 'q1' } as never)
  await question
  await settle(); await clock.advance(200)
  expect(w.filter(s => s.startsWith('set_surface_title:')).at(-1)).toBe('set_surface_title:✳ Tab Progress Bar')
  expect(w).toContain('set_surface_title:❓ Tab Progress Bar')
})

test('/clear drops the old topic from the tab', async ($, on) => {
  const clock = mock.clock(on)
  const w = machine(on)
  await $.session.start(start)
  await settle(); await clock.advance(200)
  expect(w.filter(s => s.startsWith('set_surface_title:')).at(-1)).toBe('set_surface_title:✳ Tab Progress Bar')
  await $.session.end({ reason: 'clear' } as never)
  await settle()
  expect(w.filter(s => s.startsWith('set_surface_title:')).at(-1)).toBe('set_surface_title:✳ Claude Code')
})

test('auto mode approving a call that asks is not waiting on you', async ($, on) => {
  const clock = mock.clock(on)
  const w = machine(on)
  await $.session.start(start)
  await $.prompt.submit(submit)
  await asks($, 'u1')
  await clock.advance(1600)                                      // the checker thinks; no dialog
  await $.tool.call({ tool: 'Bash', command: 'ls', tool_use_id: 'u1' } as never)
  w.finish('u1')                                                 // session-info saw the call run
  w.openDialog()                                     // a later dialog is another call's
  await clock.advance(1000)
  await settle(); await clock.advance(200)
  expect(w.some(s => s.includes('❓') || s.startsWith('notify:'))).toBe(false)
})

test('everything off writes nothing', { options: { tabTitle: false, tabProgress: false, waitingBadge: false } }, async ($, on) => {
  const w = machine(on)
  await $.session.start(start)
  await $.prompt.submit(submit)
  await asks($, 'u1')
  await $.turn.complete(done)
  await settle()
  expect(w).toEqual([])
})

test('outside Ghostty it writes nothing', async ($, on) => {
  const clock = mock.clock(on)
  const w = machine(on, { term: 'rex' })
  await $.session.start(start)
  await $.prompt.submit(submit)
  await asks($, 'u1')
  await $.turn.complete(done)
  await settle(); await clock.advance(200)
  expect(w).toEqual([])
})

import { test, expect, mock } from 'claude-code/testing'
import type { On } from 'claude-code'

// The test environment has timers; the plugin typings (no DOM, no Node) just don't declare them.
declare function setTimeout(fn: (value?: unknown) => void, ms: number): unknown

/**
 * Fakes the machine: Claude on ttys004 (pid 4242) in Ghostty, `focused` deciding what osascript reports, `files`
 * the disk. What reached you comes back in order, as "banner:<title>|<text>" or "voice:<text>".
 */
function machine(on: On, focused: { tty: string }, files: Record<string, string> = {}, store: Record<string, unknown> = {}, hasVoice = true) {
  const told: string[] = []
  on('ui.notify', (_$, e) => (told.push(`banner:${e.title}|${e.text}`), { value: { isSent: true, channel: 'ghostty' } }) as never)
  // Stands in for the say mod: it provides $.voice and answers voice.say.
  if (hasVoice) {
    on('engine.create', async (_$, e, next) => ({ ...(await next(e)), voice: { say: async () => ({ isSpoken: false }) } }))
    on('voice.say', (_$, e) => (told.push(`voice:${e.text}`), { value: { isSpoken: true } }))
  }
  on('process.run', (_$, e) => {
    const argv = e.argv as string[]
    const out = (stdout: string) => ({ value: { exitCode: 0, stdout, stderr: '' } }) as never
    if (argv[0] === 'sh') return out('ttys004 4242\n')
    if (argv[0] === 'osascript') return out(focused.tty)
    return out('')
  })
  on('fs.read', (_$, e) => {
    const path = (e as unknown as { path: string }).path
    return (path in files ? { value: files[path] } : { deny: 'no such file' }) as never
  })
  on('env.get', (_$, e) => ({ value: ({ HOME: '/home/me', TERM_PROGRAM: 'ghostty' } as Record<string, string>)[e.name] }) as never)
  on('store.get', (_$, e) => ({ value: store[e.key] }) as never)
  on('store.set', (_$, e) => ((store[e.key] = e.value), { value: undefined }) as never)
  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  on('turn.complete', (_$, e) => ({ text: e.answer }))
  on('tool.check', () => ({ decision: 'ask' }) as never)
  on('tool.call', () => ({ result: {}, text: '' }) as never)
  on('prompt.submit', (_$, e) => ({ text: e.text }) as never)
  on('session.measure', (_$, e) => ({ changed: e.changed }) as never)
  return told
}

const start = { cwd: '/work/brilliant', surface: 'terminal' as const, isInteractive: true }
const TITLE = 'Claude Code · brilliant'
const turn = (durationMs: number, answer: string) =>
  ({ answer, durationMs, isAborted: false, turnId: 't', reason: 'answer' }) as never
const settle = () => new Promise(r => setTimeout(r, 20))

test('a long turn ends with a banner and a spoken summary; a short one with nothing', { options: { summaryStyle: 'first-sentence' } }, async ($, on) => {
  const told = machine(on, { tty: '' })
  await $.session.start(start)
  await $.turn.complete(turn(5_000, 'Quick one.'))
  await $.turn.complete(turn(60_000, 'Fixed the login bug. Details follow.'))
  await settle()
  expect(told.sort()).toEqual([`banner:${TITLE}|Fixed the login bug.`, 'voice:Fixed the login bug.'])
})

test('quiet by default: nothing while this terminal is focused', { options: { summaryStyle: 'first-sentence' } }, async ($, on) => {
  const focus = { tty: '/dev/ttys004' }
  const told = machine(on, focus)
  await $.session.start(start)
  await $.turn.complete(turn(60_000, 'Done here.'))
  await settle()
  expect(told).toHaveLength(0)
  focus.tty = '/dev/ttys009' // you switched to another tab
  await $.turn.complete(turn(60_000, 'Done here.'))
  await settle()
  expect(told).toHaveLength(2)
})

test('each event goes only where its setting sends it', { options: { needsYou: 'banner', turnDone: 'voice', summaryStyle: 'first-sentence' } }, async ($, on) => {
  const told = machine(on, { tty: '' })
  await $.session.start(start)
  await $.tool.call({ tool: 'AskUserQuestion', questions: [] } as never)
  await $.turn.complete(turn(60_000, 'All set.'))
  await settle()
  expect(told).toEqual([`banner:${TITLE}|Claude has a question for you.`, 'voice:All set.'])
})

test('off means off', { options: { turnDone: 'off' } }, async ($, on) => {
  const told = machine(on, { tty: '' })
  await $.session.start(start)
  await $.turn.complete(turn(60_000, 'Nobody hears this.'))
  await settle()
  expect(told).toEqual([])
})

test('a permission dialog is announced; auto mode approving a call is not', { options: { needsYou: 'banner' } }, async ($, on) => {
  const clock = mock.clock(on)
  const files: Record<string, string> = { '/home/me/.claude/sessions/4242.json': JSON.stringify({ status: 'busy' }) }
  const told = machine(on, { tty: '' }, files)
  await $.session.start(start)
  const asks = (id: string) => $.tool.check({ tool: 'Bash', input: { command: 'ls' }, tool_use_id: id } as never)
  await asks('u1')
  await clock.advance(1600) // the checker approves; no dialog
  await $.tool.call({ tool: 'Bash', command: 'ls', tool_use_id: 'u1' } as never)
  await asks('u2')
  files['/home/me/.claude/sessions/4242.json'] = JSON.stringify({ status: 'waiting', waitingFor: 'permission prompt' })
  await clock.advance(600)
  await settle()
  expect(told).toEqual([`banner:${TITLE}|Claude needs your permission to use Bash.`])
})

test('a turn an API error ended is announced in place of its summary', { options: { needsYou: 'voice' } }, async ($, on) => {
  const told = machine(on, { tty: '' })
  await $.session.start(start)
  await $.turn.complete({ ...(turn(60_000, 'API Error: Connection lost mid-response. The response above may be incomplete.') as object), reason: 'error' } as never)
  await settle()
  expect(told).toEqual(['voice:Claude hit an error: Connection lost mid-response.'])
})

test('a finished background task is spoken by default, not bannered', async ($, on) => {
  const told = machine(on, { tty: '' })
  await $.session.start(start)
  await $.prompt.submit({ text: '<task-notification><status>completed</status><summary>All 42 tests passed</summary></task-notification>', origin: { kind: 'task-notification' } } as never)
  await settle()
  expect(told).toEqual(['voice:Background task: All 42 tests passed'])
})

test('a rate limit is warned about once per window', { options: { rateLimit: 'banner' } }, async ($, on) => {
  const told = machine(on, { tty: '' })
  await $.session.start(start)
  const measure = (percentUsed: number) =>
    $.session.measure({ context: {}, rateLimits: [{ kind: 'five_hour', percentUsed, resetsAt: 'R1' }], changed: ['rateLimits'] } as never)
  await measure(85)
  await measure(91)
  await measure(95)
  await settle()
  expect(told).toEqual([`banner:${TITLE}|Heads up: you've used 91 percent of your five hour limit.`])
})

test('a limit another session already warned about is not told again', async ($, on) => {
  const told = machine(on, { tty: '' }, {}, { warnedLimits: ['five_hour@R1'] })
  await $.session.start(start)
  await $.session.measure({ context: {}, rateLimits: [{ kind: 'five_hour', percentUsed: 95, resetsAt: 'R1' }], changed: ['rateLimits'] } as never)
  await settle()
  expect(told).toHaveLength(0)
})

test('long turns check in every few minutes, by voice', { options: { checkinMinutes: 1 } }, async ($, on) => {
  const clock = mock.clock(on)
  const told = machine(on, { tty: '' })
  await $.session.start(start)
  await $.prompt.submit({ text: 'Build it', origin: { kind: 'user' } } as never)
  await clock.advance(60_000)
  await settle()
  expect(told.at(-1)).toMatch(/^voice:Still working, \d+ minutes? in\.$/)
})

test('with the tldr mod on, its line is the summary and no Haiku call is made', { options: { turnDone: 'voice' } }, async ($, on) => {
  let haikuCalls = 0
  on('config.list', () => ({ value: [{ key: 'tldr.minChars', value: 600 }] }) as never)
  on('state.get', () => ({ value: { value: { turnId: 't', text: 'Built the tab progress bar.' }, version: 1 } }) as never)
  on('model.complete', () => (haikuCalls++, { value: { isAnswered: true, text: 'Own line.', usage: {} } }) as never)
  const told = machine(on, { tty: '' })
  await $.session.start(start)
  await $.turn.complete(turn(60_000, 'A long answer.'))
  await settle()
  expect(told).toEqual(['voice:Built the tab progress bar.'])
  expect(haikuCalls).toBe(0)
})

test('when tldr has no line for the turn, Haiku writes one', { options: { turnDone: 'voice' } }, async ($, on) => {
  on('config.list', () => ({ value: [{ key: 'tldr.minChars', value: 600 }] }) as never)
  on('state.get', () => ({ value: { value: { turnId: 't', text: '' }, version: 1 } }) as never)
  on('model.complete', () => ({ value: { isAnswered: true, text: 'Own line.', usage: {} } }) as never)
  const told = machine(on, { tty: '' })
  await $.session.start(start)
  await $.turn.complete(turn(60_000, 'Short.'))
  await settle()
  expect(told).toEqual(['voice:Own line.'])
})

test('without the say mod, banners still go out and voice lines are dropped', { options: { summaryStyle: 'first-sentence' } }, async ($, on) => {
  const told = machine(on, { tty: '' }, {}, {}, false)
  await $.session.start(start)
  await $.turn.complete(turn(60_000, 'Shipped it.'))
  await settle()
  expect(told).toEqual([`banner:${TITLE}|Shipped it.`])
})

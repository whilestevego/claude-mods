import { test, expect, mock } from 'claude-code/testing'
import type { On } from 'claude-code'

// The test environment has timers; the plugin typings (no DOM, no Node) just don't declare them.
declare function setTimeout(fn: (value?: unknown) => void, ms: number): unknown

/**
 * Fakes the machine: Claude (pid 4242) on ttys004 in Ghostty, `focused` the terminal Ghostty has in front, `files`
 * the disk. What reached you comes back in order, as "banner:<title>|<text>" or "voice:<text>".
 */
function machine(on: On, focused: { tty: string }, files: Record<string, string> = {}, store: Record<string, unknown> = { hintedTest: true }, hasVoice = true, hasGhostty = true, buildError = '') {
  const told: string[] = []
  /** Where a click on each Claude Notify banner goes: its tty. */
  const clicksTo: string[] = []
  on('ui.notify', (_$, e) => (told.push(`banner:${e.title}|${e.text}`), { value: { isSent: true, channel: 'ghostty' } }) as never)
  // Stand-ins for the say mod ($.voice) and the ghostty mod ($.ghostty), each answered by a hook below.
  on('engine.create', async (_$, e, next) => ({
    ...(await next(e)),
    ...(hasVoice && { voice: { say: async () => ({ isSpoken: false }) } }),
    ...(hasGhostty && { ghostty: { isFocused: async () => false } }),
  }))
  if (hasVoice) {
    on('voice.say', (_$, e) => (told.push(`voice:${e.text}`), { value: { isSpoken: true } }))
  }
  // This session is in front when Ghostty's focused terminal is ttys004.
  if (hasGhostty) {
    on('ghostty.isFocused', () => ({ value: focused.tty === '/dev/ttys004' }))
  }
  on('process.run', (_$, e) => {
    const argv = e.argv as string[]
    const out = (stdout: string) => ({ value: { exitCode: 0, stdout, stderr: '' } }) as never
    if (argv[0] === 'sh' && argv[1]?.endsWith('build-notifier.sh')) return { value: { exitCode: buildError ? 1 : 0, stdout: '', stderr: buildError } } as never
    if (argv[0] === 'sh') return out('4242 ttys004\n')
    // Claude Notify: open -n <app> --args post <title> <text> <tty>
    if (argv[0] === 'open' && argv[4] === 'post') (told.push(`banner:${argv[5]}|${argv[6]}`), clicksTo.push(argv[7]!))
    else if (argv[0] === 'open') told.push(`open:${argv[1]}`)
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
  // A task Claude creates is task 7.
  on('tool.call', (_$, e) => ({ result: (e as { tool: string }).tool === 'TaskCreate' ? { task: { id: '7' } } : {}, text: '' }) as never)
  on('prompt.submit', (_$, e) => ({ text: e.text }) as never)
  on('session.measure', (_$, e) => ({ changed: e.changed }) as never)
  on('command.register', () => ({ value: {} }) as never)
  on('ui.toast', (_$, e) => (told.push(`toast:${e.text}`), { value: undefined }) as never)
  return Object.assign(told, { clicksTo })
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
  const told = machine(on, { tty: '' }, {}, { warnedLimits: ['five_hour@R1'], hintedTest: true })
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
  expect(told.at(-1)).toBe("voice:Still working, 1 minute in.")
})

test('a check-in names the task in progress, else the latest step', { options: { checkinMinutes: 1 } }, async ($, on) => {
  const clock = mock.clock(on)
  const told = machine(on, { tty: '' })
  on('classic.PermissionRequest', () => ({ decision: { behavior: 'allow' } }) as never) // you say yes
  await $.session.start(start)
  await $.prompt.submit({ text: 'Build it', origin: { kind: 'user' } } as never)
  await $.tool.call({ tool: 'Bash', command: 'bun test', description: 'Run the test suite' } as never)
  await clock.advance(60_000)
  await settle()
  expect(told.at(-1)).toBe('voice:Still working on running the test suite, 1 minute in.')
  await $.tool.call({ tool: 'TaskCreate', subject: 'Fix the click', description: '…', activeForm: 'Fixing the banner click' } as never)
  await $.tool.call({ tool: 'TaskUpdate', taskId: '7', status: 'in_progress' } as never)
  await $.tool.call({ tool: 'Bash', command: 'ls', description: 'List files' } as never)
  await clock.advance(60_000)
  await settle()
  expect(told.at(-1)).toBe('voice:Still working on fixing the banner click, 2 minutes in.')
  await $.tool.call({ tool: 'TaskUpdate', taskId: '7', status: 'completed' } as never)
  await clock.advance(60_000)
  await settle()
  expect(told.at(-1)).toBe('voice:Still working on listing files, 3 minutes in.')
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
  const told = machine(on, { tty: '' }, {}, { hintedTest: true }, false)
  await $.session.start(start)
  await $.turn.complete(turn(60_000, 'Shipped it.'))
  await settle()
  expect(told).toEqual([`banner:${TITLE}|Shipped it.`])
})

test('/notify test sends a banner at once, even while this terminal is focused', async ($, on) => {
  const told = machine(on, { tty: '/dev/ttys004' })
  await $.session.start(start)
  expect((await $.command.run({ command: 'notify', args: 'test' } as never)).text).toContain('/notify settings')
  expect(told).toEqual([`banner:${TITLE}|This is what notify alerts look like. Click it to come back to this tab.`])
})

test("a banner is Claude Notify's, and its click comes back to this session's tab", async ($, on) => {
  const told = machine(on, { tty: '' })
  await $.session.start(start)
  await $.command.run({ command: 'notify', args: 'test' } as never)
  expect(told.clicksTo).toEqual(['/dev/ttys004'])
})

test('/notify haiku sends a banner with the haiku Claude Haiku wrote', async ($, on) => {
  on('model.complete', () => ({ value: { isAnswered: true, text: 'A soft chime rings out\nthe tab across the Spaces\ncalls you home again', usage: {} } }) as never)
  const told = machine(on, { tty: '' })
  await $.session.start(start)
  expect((await $.command.run({ command: 'notify', args: 'haiku' } as never)).text).toContain('calls you home again')
  expect(told).toEqual([`banner:${TITLE}|A soft chime rings out\nthe tab across the Spaces\ncalls you home again`])
})

test("in Ghostty a banner is Claude Notify's or none: a failed build says why, and Ghostty's own isn't sent", async ($, on) => {
  const told = machine(on, { tty: '' }, {}, { hintedTest: true }, true, true, 'swiftc: command not found')
  await $.session.start(start)
  expect((await $.command.run({ command: 'notify', args: 'test' } as never)).text).toContain("Claude Notify couldn't be built: swiftc: command not found")
  expect(told).toEqual([])
})

test("/notify settings opens Claude Notify's notification settings", async ($, on) => {
  const told = machine(on, { tty: '' })
  await $.session.start(start)
  expect((await $.command.run({ command: 'notify', args: 'settings' } as never)).text).toContain('for Claude Notify')
  expect(told).toEqual(['open:x-apple.systempreferences:com.apple.Notifications-Settings.extension?id=com.whilestevego.claude-notify.app'])
})

test('the first start hints at /notify test, once across sessions', async ($, on) => {
  const store: Record<string, unknown> = {}
  const told = machine(on, { tty: '' }, {}, store)
  await $.session.start(start)
  await $.session.start(start)
  expect(told).toEqual(['toast:notify: run /notify test to check desktop notifications show up'])
})

test('no hint when no event sends banners', { options: { needsYou: 'voice', turnDone: 'voice', rateLimit: 'off' } }, async ($, on) => {
  const told = machine(on, { tty: '' }, {}, {})
  await $.session.start(start)
  expect(told).toEqual([])
})

test('without the ghostty mod nothing can tell whether you are looking, so every alert goes out', { options: { summaryStyle: 'first-sentence' } }, async ($, on) => {
  const told = machine(on, { tty: '/dev/ttys004' }, {}, { hintedTest: true }, true, false)
  await $.session.start(start)
  await $.turn.complete(turn(60_000, 'Done here.'))
  await settle()
  expect(told).toHaveLength(2)
})

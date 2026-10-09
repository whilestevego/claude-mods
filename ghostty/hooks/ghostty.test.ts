import { test, expect } from 'claude-code/testing'
import type { On } from 'claude-code'

// The test environment has timers; the plugin typings (no DOM, no Node) just don't declare them.
declare function setTimeout(fn: (value?: unknown) => void, ms: number): unknown
const settle = () => new Promise(r => setTimeout(r, 20))

/** Fakes the machine: Claude on /dev/ttys004 among Ghostty's terminals; `written` collects what reaches the tab. */
function machine(on: On, opts: { voiceNeedsYou?: boolean; toolFails?: boolean } = {}) {
  const written: string[] = []
  const focused: string[] = []
  on('process.run', (_$, e) => {
    const argv = e.argv as string[]
    const script = argv[2] ?? ''
    const out = (stdout: string) => ({ value: { exitCode: 0, stdout, stderr: '' } }) as never
    if (script.includes('printf')) written.push(argv[4]!)
    if (argv[0] === 'osascript' && script.includes('focus (first terminal')) focused.push(argv[3]!)
    if (argv[0] === 'osascript' && script.includes('repeat with t in terminals')) {
      return out('A\t/dev/ttys000\t✳ Plan review\t/home/me/hobby/redouble\nB\t/dev/ttys001\t~\t/home/me\nC\t/dev/ttys004\t✳ Murmur Mods\t/home/me/.claude\n')
    }
    if (script.includes('ps -ax')) return out('/dev/ttys000\n/dev/ttys004\n')
    return out(script.includes('ps -o tty') ? '/home/me\n/dev/ttys004\n' : '')
  })
  on('config.list', () => ({ value: opts.voiceNeedsYou ? [{ key: 'voice.needsYou', value: true }] : [] }) as never)
  on('model.complete', () => ({ value: { isAnswered: true, text: 'Tab Progress Bar', usage: {} } }) as never)
  on('command.register', () => ({ value: {} }) as never)
  on('command.run', () => ({ text: '' }))
  on('ui.open', () => ({ value: { isPlaced: true } }) as never)
  on('ui.close', () => ({ value: {} }) as never)
  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  on('session.end', () => ({ sessionId: 's' }) as never)
  on('prompt.submit', (_$, e) => ({ text: e.text }) as never)
  on('tool.call', () => ({ result: {}, text: '', isError: opts.toolFails === true }) as never)
  on('classic.Notification', () => ({}))
  on('ui.render', () => ({ type: 'Box', children: [] }) as never)
  on('turn.complete', (_$, e) => ({ text: e.answer }))
  return Object.assign(written, { focused })
}

const start = { cwd: '/', surface: 'terminal' as const, isInteractive: true }
const submit = { text: 'Build the progress bar', origin: { kind: 'user' } } as never
const done = { answer: 'Done.', durationMs: 5000, isAborted: false, turnId: 't', reason: 'answer' } as never

test('a turn shows a busy bar, follows the todo list, and clears at the end', async ($, on) => {
  const w = machine(on)
  await $.session.start(start)
  await $.prompt.submit(submit)
  await settle()
  expect(w).toContain('\x1b]9;4;3\x07')
  await $.tool.call({ tool: 'TodoWrite', todos: [
    { content: 'a', status: 'completed', activeForm: 'A' },
    { content: 'b', status: 'pending', activeForm: 'B' },
  ] } as never)
  await settle()
  expect(w).toContain('\x1b]9;4;1;50\x07')
  await $.turn.complete(done)
  await settle()
  expect(w).toContain('\x1b]9;4;0\x07')
  expect(w).toContain('\x1b]2;✳ Tab Progress Bar\x07')  // the Haiku summary became the title
})

test('a failed tool call turns the bar red', async ($, on) => {
  const w = machine(on, { toolFails: true })
  await $.session.start(start)
  await $.prompt.submit(submit)
  await $.tool.call({ tool: 'Bash', command: 'false' } as never)
  await settle()
  expect(w).toContain('\x1b]9;4;2;100\x07')
})

test('waiting on you: ❓ in the title, a paused bar and a notification', async ($, on) => {
  const w = machine(on)
  await $.session.start(start)
  await $.prompt.submit(submit)
  await $.classic.Notification({ message: 'Claude needs your permission to use Bash', notification_type: 'permission_prompt' } as never)
  await settle()
  expect(w).toContain('\x1b]2;❓ Claude Code\x07')
  expect(w).toContain('\x1b]9;4;4\x07')
  expect(w).toContain('\x1b]777;notify;Claude Code;Claude needs your permission to use Bash\x07')
  await $.tool.call({ tool: 'Bash', command: 'ls' } as never)  // you allowed it: the tool ran
  await settle()
  expect(w.at(-2) + w.at(-1)!).toContain('✳ Claude Code')
})

test('no notification when the voice mod says it out loud', async ($, on) => {
  const w = machine(on, { voiceNeedsYou: true })
  await $.session.start(start)
  await $.prompt.submit(submit)
  await $.classic.Notification({ message: 'Claude needs your permission to use Bash', notification_type: 'permission_prompt' } as never)
  await settle()
  expect(w).toContain('\x1b]2;❓ Claude Code\x07')
  expect(w.some(s => s.includes(']777;'))).toBe(false)
})

test('everything off writes nothing', { options: { tabTitle: false, tabProgress: false, waitingBadge: false, waitingNotification: 'never' } }, async ($, on) => {
  const w = machine(on)
  await $.session.start(start)
  await $.prompt.submit(submit)
  await $.classic.Notification({ message: 'x', notification_type: 'permission_prompt' } as never)
  await $.turn.complete(done)
  await settle()
  expect(w).toEqual([])
})

test('/goto <words> jumps straight to the one matching session', async ($, on) => {
  const w = machine(on)
  await $.session.start(start)
  const r = await $.command.run({ command: 'goto', args: 'redouble' } as never)
  expect(r.text).toBe('→ ✳ Plan review')
  expect(w.focused).toEqual(['A'])
})

test('/goto alone opens a picker; a press jumps there', async ($, on) => {
  const w = machine(on)
  await $.session.start(start)
  await $.command.run({ command: 'goto', args: '' } as never)
  const ui = await $.ui.mount({ plugin: 'ghostty', surface: 'terminal', component: 'Pane', requestId: 'claude-goto', props: { title: 'Claude sessions' } } as never)
  expect(await ui.find({ type: 'Text', text: /this session/ })).toBeDefined()
  await ui.press({ key: 'goto-0' })
  expect(w.focused).toEqual(['A'])
})

test('/goto reports a failing query instead of claiming there are no sessions', async ($, on) => {
  on('process.run', (_$, e) => {
    const script = (e.argv as string[])[2] ?? ''
    if (script.includes('ps -ax')) return { value: { exitCode: 2, stdout: '', stderr: 'awk: syntax error' } } as never
    return { value: { exitCode: 0, stdout: script.includes('ps -o tty') ? '/home/me\n/dev/ttys004\n' : '', stderr: '' } } as never
  })
  on('command.register', () => ({ value: {} }) as never)
  on('command.run', () => ({ text: '' }))
  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  await $.session.start(start)
  const r = await $.command.run({ command: 'goto', args: '' } as never)
  expect(r.text).toBe("/goto couldn't list sessions: ps query failed: awk: syntax error")
})

test('/keybind adds, refuses what Ghostty rejects, and removes', { options: { keybinds: false } }, async ($, on) => {
  const files: Record<string, string> = { '/home/me/Library/Application Support/com.mitchellh.ghostty/config': 'font-size = 13\n' }
  let valid = true
  on('process.run', (_$, e) => {
    const argv = e.argv as string[]
    const script = argv[2] ?? ''
    const out = (stdout: string, exitCode = 0) => ({ value: { exitCode, stdout, stderr: '' } }) as never
    if (script.includes('validate-config')) return out(valid ? '' : 'claude-keybinds:4:keybind: error.InvalidAction', valid ? 0 : 1)
    if (script.includes('[ -f')) return out('/home/me/Library/Application Support/com.mitchellh.ghostty\n')
    return out(script.includes('ps -o tty') ? '/home/me\n/dev/ttys004\n' : '')
  })
  on('fs.read', (_$, e) => {
    const path = (e as unknown as { path: string }).path
    return (path in files ? { value: files[path] } : { deny: 'missing' }) as never
  })
  on('fs.write', (_$, e) => {
    const { path, text } = e as unknown as { path: string; text: string }
    files[path] = text
    return { value: undefined } as never
  })
  on('command.register', () => ({ value: {} }) as never)
  on('command.run', () => ({ text: '' }))
  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  await $.session.start(start)
  const run = async (args: string) => (await $.command.run({ command: 'keybind', args } as never)).text
  const dir = '/home/me/Library/Application Support/com.mitchellh.ghostty'

  expect(await run('add super+ctrl+h /hush')).toBe('⌘⌃H now types /hush ⏎')
  expect(files[`${dir}/claude-keybinds`]).toContain('keybind = super+ctrl+h=text:/hush\\r')
  expect(files[`${dir}/config`]).toContain('config-file = ?claude-keybinds')
  valid = false
  expect(await run('add super+ctrl+j /read')).toContain("Ghostty didn't accept that")
  expect(files[`${dir}/claude-keybinds`]).not.toContain('super+ctrl+j')  // rolled back
  valid = true
  expect(await run('')).toContain('⌘⌃H')
  expect(await run('remove super+ctrl+h')).toBe('Removed ⌘⌃H.')
  expect(files[`${dir}/claude-keybinds`]).not.toContain('super+ctrl+h')
})

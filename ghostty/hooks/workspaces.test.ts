import { test, expect, mock } from 'claude-code/testing'
import type { On } from 'claude-code'
// The test environment has timers; the plugin typings just don't declare them.
declare function setTimeout(fn: (value?: unknown) => void, ms: number): unknown

const start = { cwd: '/home/me/work', surface: 'terminal' as const, isInteractive: true }
const STATUS = '/home/me/Library/Caches/claude-ghostty/sessions'
const WS = '/home/me/.claude/workspaces'
const TITLES = '/home/me/Library/Caches/claude-ghostty/titles'

/** A fake machine: three Claude tabs in Ghostty, a disk, and a record of every AppleScript run. */
const killed: string[] = []
const ran: string[] = []
const printed: string[] = []
let stillRunning: string[] = []

function machine(on: On, files: Record<string, string>) {
  const scripts: string[][] = []
  killed.length = 0
  ran.length = 0
  printed.length = 0
  stillRunning = []
  on('process.run', (_$, e) => {
    const argv = e.argv as string[]
    const script = argv[2] ?? ''
    const out = (stdout: string) => ({ value: { exitCode: 0, stdout, stderr: '' } }) as never
    if (script.includes('printf')) printed.push(argv[4]!)
    if (argv[0] === 'osascript') {
      scripts.push(argv)
      if (script.includes('repeat with t in terminals\n')) return out('A\t/dev/ttys000\t✳ Admin redesign\t/home/me/work\nB\t/dev/ttys001\t✳ Flag search\t/home/me/work\nC\t/dev/ttys004\t✳ Me\t/home/me/work\n')
      if (script.includes('set myTty')) return out('1\t/dev/ttys004\t/home/me/work\t✳ Me\tT4\n2\t/dev/ttys000\t/home/me/work\t✳ Admin redesign\tT0\n2\t/dev/ttys009\t/home/me/work\t~/work\tT9\n')
      return out('')
    }
    if (script.includes('pid=,comm=')) return out('/dev/ttys000 100\n/dev/ttys001 101\n/dev/ttys004 104\n')
    if (script.includes('ps -ax')) return out('/dev/ttys000\n/dev/ttys001\n/dev/ttys004\n')
    if (argv[0] === 'rm') delete files[argv[2]!]
    if (argv[0] === 'kill') killed.push(...argv.slice(1))
    if (script.includes('kill -0')) return out(stillRunning.join('\n'))
    return out(script.includes('ps -o tty') ? '/home/me\n/dev/ttys004 4242\n' : '')
  })
  const pathOf = (e: unknown) => (e as { path: string }).path
  on('fs.read', (_$, e) => (pathOf(e) in files ? { value: files[pathOf(e)] } : { deny: 'missing' }) as never)
  on('fs.write', (_$, e) => ((files[pathOf(e)] = (e as unknown as { text: string }).text), { value: undefined }) as never)
  on('fs.stat', (_$, e) => (pathOf(e) in files ? { value: {} } : { deny: 'missing' }) as never)
  on('fs.list', (_$, e) => {
    const dir = pathOf(e) + '/'
    const names = Object.keys(files).filter(f => f.startsWith(dir)).map(f => ({ name: f.slice(dir.length), kind: 'file', size: 1 }))
    return { value: names } as never
  })
  on('session.id', () => ({ value: 'aaaaaaaa-1111-2222-3333-444444444444' }) as never)
  on('session.cwd', () => ({ value: '/home/me/work' }) as never)
  on('session.messages', () => ({ value: [{ role: 'user', text: 'Redesign the admin', toolUses: [] }] }) as never)
  on('model.complete', () => ({ value: { isAnswered: true, text: 'Brilliant Admin Work', usage: {} } }) as never)
  on('command.register', () => ({ value: {} }) as never)
  on('command.run', (_$, e) => (ran.push((e as unknown as { command: string }).command), { text: '' }))
  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  on('ui.open', () => ({ value: { isPlaced: true } }) as never)
  on('ui.close', () => ({ value: {} }) as never)
  on('ui.toast', () => ({ value: undefined }) as never)
  return scripts
}

const entry = (tty: string, status: string, since: number, sessionId = 'bbbbbbbb-0000-0000-0000-000000000000') =>
  JSON.stringify({ tty, pid: '1', sessionId, cwd: '/home/me/work', status, since })

test('/goto next jumps to the session waiting on you longest', { options: { keybinds: false } }, async ($, on) => {
  const files = {
    [`${STATUS}/_dev_ttys000.json`]: entry('/dev/ttys000', 'waiting', 2000),
    [`${STATUS}/_dev_ttys001.json`]: entry('/dev/ttys001', 'waiting', 1000),
  }
  const scripts = machine(on, files)
  await $.session.start(start)
  const r = await $.command.run({ command: 'goto', args: 'next' } as never)
  expect(r.text).toMatch(/^→ ✳ Flag search \(❓ /)
  expect(scripts.at(-1)?.at(-1)).toBe('B')
})

test('/goto lists waiting sessions first', { options: { keybinds: false } }, async ($, on) => {
  const files = { [`${STATUS}/_dev_ttys001.json`]: entry('/dev/ttys001', 'waiting', 1000) }
  machine(on, files)
  await $.session.start(start)
  expect((await $.command.run({ command: 'goto', args: '' } as never)).text).toBe('2 other Claude sessions, 1 waiting on you: pick one above.')
  const ui = await $.ui.mount({ plugin: 'ghostty', surface: 'terminal', component: 'Pane', requestId: 'claude-goto', props: { title: 'x' } } as never)
  expect((await ui.find({ key: 'goto-0' }))?.text).toMatch(/^❓ .* ✳ Flag search/)
})

test('/workspace save names the window with Haiku and records each conversation from Claude Code', { options: { keybinds: false } }, async ($, on) => {
  const files: Record<string, string> = { '/home/me/.claude/sessions/100.json': JSON.stringify({ pid: 100, sessionId: 'bbbbbbbb-0000-0000-0000-000000000000' }) }
  machine(on, files)
  await $.session.start(start)
  const r = await $.command.run({ command: 'workspace', args: 'save' } as never)
  expect(r.text).toBe('Saved workspace "Brilliant Admin Work": 2 tabs · 2 Claude. Couldn\'t find the conversation for "Me": it will reopen as a new session.')
  const saved = JSON.parse(files[`${WS}/brilliant-admin-work.json`]!)
  expect(saved.tabs[1][0]).toEqual({ kind: 'claude', cwd: '/home/me/work', title: 'Admin redesign', sessionId: 'bbbbbbbb-0000-0000-0000-000000000000' })
  expect(saved.tabs[1][1]).toEqual({ kind: 'shell', cwd: '/home/me/work', title: '~/work' })
  expect((await $.command.run({ command: 'workspace', args: 'save' } as never)).text).toContain('Updated')
})

test('/workspace list picks one to open, or deletes it', { options: { keybinds: false } }, async ($, on) => {
  const ws = (name: string, at: number) => JSON.stringify({ name, savedAt: at, tabs: [[{ kind: 'shell', cwd: '/home/me', title: '' }]] })
  const files: Record<string, string> = { [`${WS}/old.json`]: ws('Old Work', 1), [`${WS}/new.json`]: ws('New Work', 2) }
  const scripts = machine(on, files)
  await $.session.start(start)
  expect((await $.command.run({ command: 'workspace', args: 'list' } as never)).text).toBe('2 saved workspaces: pick one above.')
  const ui = await $.ui.mount({ plugin: 'ghostty', surface: 'terminal', component: 'Pane', requestId: 'claude-workspaces', props: { title: 'x' } } as never)
  expect((await ui.find({ key: 'ws-open-0' }))?.text).toMatch(/^New Work · 1 tab · 0 Claude/)
  await ui.press({ key: 'ws-del-1' })
  expect(files[`${WS}/old.json`]).toBeUndefined()
  expect(await ui.find({ key: 'ws-open-1' })).toBeUndefined()
  await ui.press({ key: 'ws-open-0' })
  expect(scripts.at(-1)?.[2]).toContain('set w to new window with configuration c1')
})

test('/workspace close saves, exits the other Claude sessions and closes their panes; shells stay', { options: { keybinds: false } }, async ($, on) => {
  const clock = mock.clock(on)
  const files: Record<string, string> = {
    '/home/me/.claude/sessions/100.json': JSON.stringify({ sessionId: 'bbbbbbbb-0000-0000-0000-000000000000' }),
    '/home/me/.claude/sessions/104.json': JSON.stringify({ sessionId: 'aaaaaaaa-1111-2222-3333-444444444444' }),
    // the workspace this window was opened from: same conversations, so it keeps its name
    [`${WS}/sprint.json`]: JSON.stringify({ name: 'Sprint', savedAt: 1, tabs: [[{ kind: 'claude', cwd: '/', title: '', sessionId: 'bbbbbbbb-0000-0000-0000-000000000000' }], [{ kind: 'claude', cwd: '/', title: '', sessionId: 'aaaaaaaa-1111-2222-3333-444444444444' }]] }),
  }
  const scripts = machine(on, files)
  await $.session.start(start)
  const pending = $.command.run({ command: 'workspace', args: 'close' } as never)
  await clock.advance(500)
  const r = await pending
  expect(r.text).toBe('Updated workspace "Sprint": 2 tabs · 2 Claude. Closed 1 other Claude session. Exiting this session.')
  expect(killed).toEqual(['-TERM', '100'])                       // the other Claude, never this one (104)
  expect(scripts.at(-1)?.slice(-1)).toEqual(['T0'])               // its pane closed; the shell pane T9 stays
  expect(ran).not.toContain('exit')                               // not until this command has printed
  await clock.advance(500)
  expect(ran).toContain('exit')                                   // then this session quits as /exit does
})

test('/workspace close leaves a session that will not exit, and says so', { options: { keybinds: false } }, async ($, on) => {
  const clock = mock.clock(on)
  const files: Record<string, string> = { '/home/me/.claude/sessions/100.json': JSON.stringify({ sessionId: 'bbbbbbbb-0000-0000-0000-000000000000' }) }
  const scripts = machine(on, files)
  stillRunning = ['100']
  await $.session.start(start)
  const pending = $.command.run({ command: 'workspace', args: 'close Stubborn' } as never)
  await clock.advance(6000)
  expect((await pending).text).toContain("Closed 0 other Claude sessions. 1 didn't exit within 5 seconds and is still open. Exiting this session.")
  expect(scripts.some(a => a[2]?.includes('close (first terminal'))).toBe(false)
})

test('a resumed session gets its title back; /workspace open hands each tab its saved title; /title makes a new one', { options: { keybinds: false } }, async ($, on) => {
  const me = 'aaaaaaaa-1111-2222-3333-444444444444'
  const other = 'bbbbbbbb-0000-0000-0000-000000000000'
  const pane = (sessionId: string, title: string) => [{ kind: 'claude', cwd: '/home/me', title, sessionId }]
  const files: Record<string, string> = {
    [`${TITLES}/${me}`]: 'Saved Session Title Here',
    [`${WS}/sprint.json`]: JSON.stringify({ name: 'Sprint', savedAt: 1, tabs: [pane(me, 'Older Title'), pane(other, 'Admin redesign')] }),
  }
  machine(on, files)
  await $.session.start(start)
  await new Promise(r => setTimeout(r, 20))
  expect(printed).toContain('\x1b]2;✳ Saved Session Title Here\x07')
  await $.command.run({ command: 'workspace', args: 'open sprint' } as never)
  expect(files[`${TITLES}/${other}`]).toBe('Admin redesign')               // no title of its own yet: the saved one
  expect(files[`${TITLES}/${me}`]).toBe('Saved Session Title Here')        // its own, newer title wins
  expect((await $.command.run({ command: 'title', args: '' } as never)).text).toBe('Tab title: Brilliant Admin Work')
  expect(files[`${TITLES}/${me}`]).toBe('Brilliant Admin Work')
  expect(printed.at(-1)).toBe('\x1b]2;✳ Brilliant Admin Work\x07')
})

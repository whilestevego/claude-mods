import { test, expect } from 'claude-code/testing'
import type { On } from 'claude-code'

// The test environment has timers; the plugin typings (no DOM, no Node) just don't declare them.
declare function setTimeout(fn: (value?: unknown) => void, ms: number): unknown

/**
 * Fakes the machine: Claude on ttys004 (pid 4242) in Ghostty, `focused` deciding what osascript reports,
 * `files` the disk, `alive` which other sessions still run.
 */
/** The conversation this session is on; /clear starts a new one. */
const conversation = { id: '' }

function machine(on: On, focused: { tty: string }, files: Record<string, string> = {}, alive: string[] = [], store: Record<string, unknown> = {}) {
  const spoken: string[][] = []
  /** What reached the speakers, in order: 'chime' or 'speech'. */
  const heard: string[] = []
  on('process.run', (_$, e) => {
    const argv = e.argv as string[]
    const out = (stdout: string) => ({ value: { exitCode: 0, stdout, stderr: '' } }) as never
    if (argv[0] === 'sh' && argv[2]?.includes('kill -0')) return out(argv.slice(4).filter(p => alive.includes(p)).join('\n'))
    if (argv[0] === 'sh') return out('ttys004 4242\n')
    if (argv[0] === 'osascript') return out(focused.tty)
    if (argv[0] === 'murmur' && argv[1] === 'voices') return out(VOICES)
    if (argv[0] === 'murmur') spoken.push(argv), heard.push('speech')
    if (argv[0] === 'afplay') heard.push(argv[1]!.endsWith('/chime.wav') ? 'chime' : argv[1]!)
    return out('')
  })
  on('fs.read', (_$, e) => {
    const path = (e as unknown as { path: string }).path
    return (path in files ? { value: files[path] } : { deny: 'no such file' }) as never
  })
  on('fs.write', (_$, e) => {
    const { path, text } = e as unknown as { path: string; text: string }
    files[path] = text
    return { value: undefined } as never
  })
  on('env.get', (_$, e) => ({ value: ({ HOME: '/home/me', TERM_PROGRAM: 'ghostty' } as Record<string, string>)[e.name] }) as never)
  on('store.get', (_$, e) => ({ value: store[e.key] }) as never)
  on('store.set', (_$, e) => ((store[e.key] = e.value), { value: undefined }) as never)
  on('command.register', () => ({ value: {} }) as never)
  conversation.id = 'aaaaaaaa-1111-2222-3333-444444444444'
  on('session.id', () => ({ value: conversation.id }) as never)
  on('ui.open', () => ({ value: { isPlaced: true } }) as never)
  on('ui.close', () => ({ value: {} }) as never)
  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  on('turn.complete', (_$, e) => ({ text: e.answer }))
  on('command.run', () => ({ text: '' }))
  on('tool.check', () => ({ decision: 'ask' }) as never)
  on('tool.call', () => ({ result: {}, text: '' }) as never)
  on('prompt.submit', (_$, e) => ({ text: e.text }) as never)
  on('session.measure', (_$, e) => ({ changed: e.changed }) as never)
  on('session.end', () => ({ sessionId: conversation.id }) as never)
  return Object.assign(spoken, { heard })
}

const VOICES = `AMERICAN FEMALE
  ✓ af_heart      Heart     A   default

BRITISH FEMALE
  ✓ bf_emma       Emma      B-
  · bf_isabella   Isabella  C
`
const CHOSEN = '/home/me/Library/Caches/claude-say/chosen/aaaaaaaa-1111-2222-3333-444444444444'
const TABLE = '/home/me/Library/Caches/claude-say/voices.json'
const start = { cwd: '/', surface: 'terminal' as const, isInteractive: true }
const turn = (durationMs: number, answer: string) =>
  ({ answer, durationMs, isAborted: false, turnId: 't', reason: 'answer' }) as never
/** Speaks `text` the way /say read does: as the last answer, read aloud. */
const speak = async ($: { turn: { complete(e: never): Promise<unknown> }; command: { run(e: never): Promise<unknown> } }, text: string) => {
  await $.turn.complete(turn(1_000, text))
  await $.command.run({ command: 'say', args: 'read' } as never)
}
const settle = () => new Promise(r => setTimeout(r, 20))

test('/say hush mutes everything until run again', async ($, on) => {
  const spoken = machine(on, { tty: '' })
  await $.session.start(start)
  expect((await $.command.run({ command: 'say', args: 'hush' } as never)).text).toContain('muted')
  await speak($, 'Muted answer.')
  await settle()
  expect(spoken.filter(a => a[1] !== 'stop')).toHaveLength(0)
  await $.command.run({ command: 'say', args: 'hush' } as never)
  await speak($, 'Heard answer.')
  await settle()
  expect(spoken.at(-1)?.at(-1)).toBe('Heard answer.')
})

test('/say read says the whole last answer with code omitted, even when focused', async ($, on) => {
  const spoken = machine(on, { tty: '/dev/ttys004' })
  await $.session.start(start)
  await $.turn.complete(turn(1_000, 'Here:\n```js\nx()\n```\nThat is all.'))
  await $.command.run({ command: 'say', args: 'read' } as never)
  await settle()
  expect(spoken.at(-1)?.at(-1)).toBe('Here:\n Code omitted. \nThat is all.')
})

test('a fixed voice wins over the session voice, and claims nothing', { options: { voice: 'bf_emma' } }, async ($, on) => {
  const files: Record<string, string> = {}
  const spoken = machine(on, { tty: '' }, files)
  await $.session.start(start)
  await speak($, 'Voice check.')
  await settle()
  expect(spoken[0]).toEqual(['murmur', '--interrupt', '--speed', '1', '--voice', 'bf_emma', '--', 'Voice check.'])
  expect(files[TABLE]).toBeUndefined()
})

test('a second live session gets the best-graded free voice; a dead one gives its voice back', async ($, on) => {
  const files: Record<string, string> = { [TABLE]: JSON.stringify({ 1111: 'af_heart', 2222: 'bm_george' }) }
  const spoken = machine(on, { tty: '' }, files, ['1111'])  // 2222 has exited
  await $.session.start(start)
  await speak($, 'Hello.')
  await settle()
  expect(spoken[0]).toContain('bf_emma')
  expect(JSON.parse(files[TABLE]!)).toEqual({ 1111: 'af_heart', 4242: 'bf_emma' })
})

test('the session voice comes from the configured list', { options: { voices: 'bm_lewis, af_sky' } }, async ($, on) => {
  const spoken = machine(on, { tty: '' })
  await $.session.start(start)
  await speak($, 'Hi.')
  await settle()
  expect(spoken[0]).toContain('bm_lewis')
})

test('/say hush is kept in session state, which outlives a reload of the mod', async ($, on) => {
  const writes: unknown[] = []
  on('state.set', (_$, e, next) => (writes.push(e), next(e)))
  machine(on, { tty: '' })
  await $.session.start(start)
  await $.command.run({ command: 'say', args: 'hush' } as never)
  expect(writes).toContainEqual(expect.objectContaining({ plugin: 'say', key: 'muted', value: true }))
})

test('after /clear the chosen voice is saved under the new conversation', async ($, on) => {
  const files: Record<string, string> = {}
  machine(on, { tty: '' }, files)
  await $.session.start(start)
  await $.command.run({ command: 'say', args: 'pick emma' } as never)
  await $.session.end({ reason: 'clear' } as never)
  conversation.id = 'cccccccc-1111-2222-3333-444444444444'
  await $.prompt.submit({ text: 'Next', origin: { kind: 'user' } } as never)
  await settle()
  expect(files[`/home/me/Library/Caches/claude-say/chosen/${conversation.id}`]).toBe('bf_emma')
})

test('a soft chime plays before each spoken line', async ($, on) => {
  const spoken = machine(on, { tty: '' })
  await $.session.start(start)
  await speak($, 'A question.')
  await settle()
  await speak($, 'A question.')
  await settle()
  expect(spoken.heard).toEqual(['chime', 'speech', 'chime', 'speech'])
})

test('no chime when it is off', { options: { chime: false } }, async ($, on) => {
  const spoken = machine(on, { tty: '' })
  await $.session.start(start)
  await speak($, 'A question.')
  await settle()
  expect(spoken.heard).toEqual(['speech'])
})

test('/say pick <name> switches this session voice, says hello in it, and remembers it', async ($, on) => {
  const files: Record<string, string> = {}
  const spoken = machine(on, { tty: '' }, files)
  await $.session.start(start)
  expect((await $.command.run({ command: 'say', args: 'pick emma' } as never)).text).toBe('🔊 This session now speaks as Emma (bf_emma).')
  await settle()
  expect(spoken.at(-1)).toEqual(['murmur', '--interrupt', '--speed', '1', '--voice', 'bf_emma', '--', "Hi, I'm Emma. This is how I sound."])
  expect(files[CHOSEN]).toBe('bf_emma')
  expect(JSON.parse(files[TABLE]!)['4242']).toBe('bf_emma')               // other sessions avoid it
  expect((await $.command.run({ command: 'say', args: 'pick isa' } as never)).text).toMatch(/Isabella \(bf_isabella\)\. It installs on first use/)
  expect((await $.command.run({ command: 'say', args: 'pick e' } as never)).text).toBe('"e" could be Heart (af_heart), Emma (bf_emma), Isabella (bf_isabella).')
  expect((await $.command.run({ command: 'say', args: 'pick zed' } as never)).text).toBe('No voice called "zed". /say pick lists them.')
})

test('a resumed conversation keeps its /say voice, even over a fixed voice', { options: { voice: 'af_heart' } }, async ($, on) => {
  const spoken = machine(on, { tty: '' }, { [CHOSEN]: 'bf_emma' })
  await $.session.start(start)
  await speak($, 'A question.')
  await settle()
  expect(spoken.at(-1)?.slice(4, 6)).toEqual(['--voice', 'bf_emma'])
})

test('/say alone names this session voice and plays a sample of it', async ($, on) => {
  const spoken = machine(on, { tty: '' })
  await $.session.start(start)
  expect((await $.command.run({ command: 'say', args: '' } as never)).text).toBe('🔊 This session speaks as Heart (af_heart). /say pick for another.')
  await settle()
  expect(spoken.at(-1)?.at(-1)).toBe("Hi, I'm Heart. This is how I sound.")
})

test('/say pick lists the voices; picking one switches to it', async ($, on) => {
  const files: Record<string, string> = { [TABLE]: JSON.stringify({ '777': 'af_heart' }) }
  const spoken = machine(on, { tty: '' }, files, ['777'])
  await $.session.start(start)
  await $.command.run({ command: 'say', args: 'pick' } as never)
  const ui = await $.ui.mount({ plugin: 'say', surface: 'terminal', component: 'Pane', requestId: 'claude-say-picker', props: { title: 'Voices' } } as never)
  expect((await ui.find({ key: 'voice-0' }))?.text).toMatch(/Heart +af_heart +A +· in use/)
  expect(await ui.find({ type: 'Text', text: 'BRITISH FEMALE' })).toBeDefined()
  await ui.press({ key: 'voice-1' })
  await settle()
  expect(spoken.at(-1)?.at(-1)).toBe("Hi, I'm Emma. This is how I sound.")
  expect(files[CHOSEN]).toBe('bf_emma')
})

test('/say help lists the subcommands', async ($, on) => {
  machine(on, { tty: '' })
  await $.session.start(start)
  const text = (await $.command.run({ command: 'say', args: 'help' } as never)).text
  for (const sub of ['/say pick random', '/say pick <name>', '/say read', '/say tldr', '/say hush']) expect(text).toContain(sub)
})

test('/say pick random switches to another voice', async ($, on) => {
  const files: Record<string, string> = {}
  machine(on, { tty: '' }, files)
  await $.session.start(start)
  for (let i = 0; i < 5; i++) {
    const before = files[CHOSEN] ?? 'af_heart'
    expect((await $.command.run({ command: 'say', args: 'pick random' } as never)).text).toMatch(/^🔊 This session now speaks as /)
    expect(files[CHOSEN]).not.toBe(before)
  }
})

test('/say with an unknown word points to /say help', async ($, on) => {
  machine(on, { tty: '' })
  await $.session.start(start)
  expect((await $.command.run({ command: 'say', args: 'emma' } as never)).text).toBe('No /say command called "emma". /say help lists them.')
})

import type { EngineInterface, PluginOptions, Register, RenderNode } from 'claude-code'

import { checkinLine, errorLine, firstSentence, prose, rateLimitLine, summaryPrompt, taskLine, voiceList } from './speech'
import { byGrade, claimVoice, matchVoice, parseCatalog, parseTable, weightedPick } from './voices'
import type { VoiceInfo } from './voices'
// tldr's state contract, for the line this mod speaks: a renamed key there fails type-checking here.
import type {} from '../../tldr/types'

type Config = {
  speakWhen: string
  turnSummaries: boolean
  summaryStyle: string
  minTurnSeconds: number
  needsYou: boolean
  backgroundTasks: boolean
  checkins: boolean
  checkinMinutes: number
  rateLimitWarnings: boolean
  rateLimitPercent: number
  speed: number
  chime: boolean
  voice: string
  voices: string[]
}

function config(o: PluginOptions): Config {
  const num = (v: unknown, d: number) => (typeof v === 'number' && v > 0 ? v : d)
  return {
    speakWhen: o.speakWhen === 'always' ? 'always' : 'away',
    turnSummaries: o.turnSummaries !== false,
    summaryStyle: o.summaryStyle === 'first-sentence' ? 'first-sentence' : 'haiku',
    minTurnSeconds: num(o.minTurnSeconds, 20),
    needsYou: o.needsYou !== false,
    backgroundTasks: o.backgroundTasks !== false,
    checkins: o.checkins !== false,
    checkinMinutes: num(o.checkinMinutes, 5),
    rateLimitWarnings: o.rateLimitWarnings !== false,
    rateLimitPercent: num(o.rateLimitPercent, 90),
    speed: num(o.speed, 1),
    chime: o.chime !== false,
    voice: typeof o.voice === 'string' ? o.voice.trim() : '',
    voices: typeof o.voices === 'string' ? voiceList(o.voices) : [],
  }
}

/** /say hush, for this session: in $.state so a hot reload of the mod keeps it. */
const MUTED = { plugin: 'say', key: 'muted' } as const
const isMuted = async ($: EngineInterface) => (await $.state.get(MUTED)).value === true
/** Rate-limit windows already warned about, as "kind@resetsAt": in $.store, so one warning covers every session. */
const WARNED = 'warnedLimits'

// The module's own session state; a reload starts it over.
let cfg: Config
let claude: { tty: string; pid: string } | null = null
let home = ''
/** This session's own voice, claimed at start (unused when a fixed voice is set). */
let sessionVoice = ''
/** The voice you picked with /say for this conversation: wins over the session's own and the fixed one. */
let chosen = ''
/** What the /say picker lists: murmur's voices, and the ones other sessions hold. */
const PICKER = 'claude-say-picker'
const currentVoice = () => chosen || cfg.voice || sessionVoice || 'af_heart'
let picker: { voices: VoiceInfo[]; others: Set<string> } = { voices: [], others: new Set() }
let inGhostty = false
let lastRequest = ''
let lastAnswer = ''
let checkin: { cancel(): void } | undefined
let turnStartedAt = 0
/** Calls the permission check put to you, until they run or are refused. */
const asking = new Set<string>()

// "<tty> <pid>" of Claude itself: the nearest ancestor named claude (the mods' own host process, between it and
// this shell, owns the tty too, and changes when mods reload). Its pid keys the session's voice. No API names either.
const FIND_CLAUDE = `p=$$
first=
while [ "$p" -gt 1 ]; do
  t=$(ps -o tty= -p "$p" | tr -d ' ')
  case "$t" in ''|'?'|'??') ;; *) [ -z "$first" ] && first="$t $p"
    c=$(ps -o comm= -p "$p"); [ "\${c##*/}" = claude ] && { echo "$t $p"; exit; } ;;
  esac
  p=$(ps -o ppid= -p "$p" | tr -d ' ')
done
echo "$first"`

// The tty of the terminal Ghostty has focused, or nothing when Ghostty isn't the frontmost app.
const FOCUSED_TTY = `tell application "Ghostty"
  if frontmost then return tty of focused terminal of selected tab of front window
  return ""
end tell`

async function locate($: EngineInterface) {
  inGhostty = ((await $.env.get('TERM_PROGRAM')) ?? '').toLowerCase() === 'ghostty'
  home = (await $.env.get('HOME')) ?? ''
  const [tty, pid] = (await $.process.run(['sh', '-c', FIND_CLAUDE])).stdout.trim().split(' ')
  claude = tty && pid ? { tty, pid } : null
}

/** Claude Code's record of this session (~/.claude/sessions/<pid>.json) says its permission dialog is up. */
function asksPermission(record: string): boolean {
  try {
    const r = JSON.parse(record) as { status?: unknown; waitingFor?: unknown }
    return r.status === 'waiting' && typeof r.waitingFor === 'string' && /permission/i.test(r.waitingFor)
  } catch {
    return false
  }
}

/**
 * A call that asks waits in Claude Code's dialog, or in auto mode its checker. Only the dialog marks the session
 * record waiting, so watch it while the call is pending. Mods hear neither classic.PermissionRequest nor
 * classic.Notification while a dialog is up (checked on 2.1.301), so this file is the only sign.
 */
async function watchForDialog($: EngineInterface, id: string, tool: string) {
  if (!claude || !home) return
  asking.add(id)
  // ponytail: polls every half second, 10 minutes at most; an event for the dialog would replace it.
  for (let i = 0; i < 1200; i++) {
    await $.clock.sleep(500)
    if (!asking.has(id)) return
    if (asksPermission(await $.fs.read(`${home}/.claude/sessions/${claude.pid}.json`).catch(() => ''))) {
      return say($, `Claude needs your permission to use ${tool}.`)
    }
  }
}

// /say's choice, kept per conversation so resuming it (or reopening its workspace) keeps the voice.
async function chosenFile($: EngineInterface): Promise<string | undefined> {
  const id = await $.session.id()
  return home && /^[0-9a-f-]{8,64}$/i.test(id) ? `${home}/Library/Caches/claude-say/chosen/${id}` : undefined
}

async function choose($: EngineInterface, v: VoiceInfo): Promise<string> {
  chosen = v.id
  const file = await chosenFile($)
  if (file) {
    await $.process.run(['mkdir', '-p', file.replace(/\/[^/]*$/, '')])
    await $.fs.write(file, v.id)
  }
  await claimSessionVoice($).catch(() => {})
  void say($, sample(v.name), true)
  return `🔊 This session now speaks as ${v.name} (${v.id}).` + (v.isInstalled ? '' : ' It installs on first use, so the first line may take a moment.')
}

/** The voices to pick from, and which ones other running sessions hold. */
async function loadPicker($: EngineInterface) {
  const r = await $.process.run(['murmur', 'voices']).catch(() => ({ stdout: '' }))
  const table = parseTable(await $.fs.read(`${home}/Library/Caches/claude-say/voices.json`).catch(() => ''))
  const others = new Set(Object.entries(table).filter(([pid]) => pid !== claude?.pid).map(([, v]) => v))
  picker = { voices: parseCatalog(r.stdout), others }
  return picker.voices
}

// Every running session shares one small table of who speaks with which voice.
async function claimSessionVoice($: EngineInterface) {
  if (!claude || !home) return
  const dir = `${home}/Library/Caches/claude-say`
  const file = `${dir}/voices.json`
  const table = parseTable(await $.fs.read(file).catch(() => ''))
  const pids = Object.keys(table)
  const alive = pids.length
    ? (await $.process.run(['sh', '-c', 'for p; do kill -0 "$p" 2>/dev/null && echo "$p"; done', 'sh', ...pids])).stdout.split('\n')
    : []
  // Unless you listed voices yourself, sessions take the best-graded voice no other session holds.
  const pool = cfg.voices.length ? cfg.voices : byGrade(await loadPicker($))
  const claimed = claimVoice(table, claude.pid, new Set(alive), pool)
  sessionVoice = claimed.voice
  if (chosen) claimed.table[claude.pid] = chosen
  // ponytail: last writer wins; two sessions starting in the same instant can share a voice until one restarts.
  await $.process.run(['mkdir', '-p', dir])
  await $.fs.write(file, JSON.stringify(claimed.table))
}

// Quiet by default: speak only when this terminal isn't the one in front of you.
async function isAway($: EngineInterface): Promise<boolean> {
  if (cfg.speakWhen === 'always' || !inGhostty || !claude) return true  // can't tell: the other gates decide
  const r = await $.process.run(['osascript', '-e', FOCUSED_TTY])
  return r.exitCode !== 0 || r.stdout.trim() !== `/dev/${claude.tty}`
}

// Interrupt, don't stack: each new line cuts off whatever is still playing.
async function say($: EngineInterface, text: string, always = false) {
  if (!text.trim() || (await isMuted($)) || (!always && !(await isAway($)))) return
  // A soft bell first (the mod's chime.wav), so speech never starts out of nowhere. Not awaited: murmur takes
  // about as long to get ready as the bell rings.
  if (cfg.chime) void $.process.run(['afplay', `${$.plugin.root}/chime.wav`]).catch(() => null)
  const argv = ['murmur', '--interrupt', '--speed', String(cfg.speed)]
  const voice = chosen || cfg.voice || sessionVoice
  if (voice) argv.push('--voice', voice)
  const r = await $.process.run([...argv, '--', text]).catch(() => null)
  if (r && r.exitCode !== 0) $.ui.toast(`murmur: ${r.stderr.trim().slice(0, 120) || 'failed'}`)
}

/** The tldr mod's line for this turn, when tldr is enabled: one summary, shown and spoken. Empty when it has none. */
async function tldrLine($: EngineInterface, turnId: string): Promise<string> {
  const rows = await $.config.list().catch(() => [])
  if (!rows.some(r => r.key.startsWith('tldr.'))) return ''
  // tldr publishes after its own Haiku call (8 s at most); a short reply publishes an empty line at once.
  for (let waited = 0; waited <= 10_000; waited += 250) {
    const held = await $.state.get({ plugin: 'tldr', key: 'line' })
    if (held.value?.turnId === turnId) return held.value.text ?? ''
    await $.clock.sleep(250)
  }
  return ''
}

async function summarize($: EngineInterface, turnId: string, request: string, answer: string): Promise<string> {
  if (cfg.summaryStyle === 'first-sentence') return firstSentence(answer)
  const shared = await tldrLine($, turnId)
  if (shared) return shared
  const r = await $.model.complete({ model: 'haiku', prompt: summaryPrompt(request, answer), maxTokens: 60 })
  const line = r.isAnswered ? prose(r.text).replace(/\s+/g, ' ').trim() : ''
  return line && line.length <= 200 ? line : firstSentence(answer)
}

async function checkIn($: EngineInterface) {
  await say($, checkinLine(Math.round((Date.now() - turnStartedAt) / 60000)))
}

function stopCheckins() {
  checkin?.cancel()
  checkin = undefined
}

/** What a voice says to show how it sounds. */
const sample = (name: string) => `Hi, I'm ${name}. This is how I sound.`

/** /say alone: this session's voice and a sample of it. /say pick: the picker, a random voice, or the one named. */
async function pickVoice($: EngineInterface, query: string): Promise<{ text: string }> {
  const voices = await loadPicker($)
  if (voices.length === 0) return { text: "Couldn't list murmur's voices. Is murmur installed?" }
  if (!query) {
    const name = voices.find(v => v.id === currentVoice())?.name ?? currentVoice()
    if (await isMuted($)) return { text: `🔊 This session speaks as ${name} (${currentVoice()}), muted. /say pick for another.` }
    void say($, sample(name), true)
    return { text: `🔊 This session speaks as ${name} (${currentVoice()}). /say pick for another.` }
  }
  const [word = '', ...rest] = query.split(/\s+/)
  if (word.toLowerCase() !== 'pick') return { text: `No /say command called "${word}". /say help lists them.` }
  const name = rest.join(' ')
  if (name.toLowerCase() === 'random') {
    const others = voices.filter(v => v.id !== currentVoice())
    return { text: await choose($, weightedPick(others) ?? voices[0]!) }
  }
  if (!name) {
    await $.ui.open({ id: PICKER, title: 'Voices', focus: true, closeOnEscape: true, rows: voices.length + new Set(voices.map(v => v.group)).size + 1 })
    return { text: `Speaking as ${voices.find(v => v.id === currentVoice())?.name ?? currentVoice()}: pick another above.` }
  }
  const hits = matchVoice(name, voices)
  if (hits.length === 1) return { text: await choose($, hits[0]!) }
  if (hits.length === 0) return { text: `No voice called "${name}". /say pick lists them.` }
  return { text: `"${name}" could be ${hits.map(v => `${v.name} (${v.id})`).join(', ')}.` }
}

const HELP = [
  "/say              hear this session's voice",
  '/say pick         pick another voice from a list',
  '/say pick <name>  switch to that voice (/say pick emma)',
  '/say pick random  switch to a random voice',
  "/say read         read Claude's last answer aloud",
  '/say tldr         hear a 2–3 sentence summary of this session',
  '/say hush         mute or unmute spoken updates for this session',
].join('\n')

async function hush($: EngineInterface): Promise<{ text: string }> {
  const muted = !(await isMuted($))
  await $.state.set(MUTED, muted)
  if (muted) await $.process.run(['murmur', 'stop']).catch(() => null)
  return { text: muted ? '🔇 Spoken updates muted for this session. /say hush again to unmute.' : '🔊 Spoken updates back on.' }
}

async function readAloud($: EngineInterface): Promise<{ text: string }> {
  if (!lastAnswer) return { text: 'Nothing to read yet.' }
  if (await isMuted($)) return { text: 'Muted: /say hush to unmute first.' }
  void say($, prose(lastAnswer, 'Code omitted.'), true)
  return { text: '🔊 Reading the last answer aloud. /say hush stops it.' }
}

async function tldrAloud($: EngineInterface): Promise<{ text: string }> {
  if (await isMuted($)) return { text: 'Muted: /say hush to unmute first.' }
  const r = await $.model.fork({
    prompt: 'In 2 or 3 short sentences meant to be spoken aloud, summarize this session so far: the goal, what is done, and what is next. Plain words only, no markdown or code.',
  })
  if (!r.isAnswered) return { text: `Couldn't summarize: ${r.reason}` }
  const line = prose(r.text).replace(/\s+/g, ' ').trim()
  void say($, line, true)
  return { text: `🔊 ${line}` }
}

export const register: Register = (on, options) => {
  cfg = config(options)
  // Hooks that gate a prompt or a tool call pass it on untouched if they fail: speech must never block work.

  on('session.start', async ($, e, next) => {
    await locate($)
    const file = await chosenFile($).catch(() => undefined)
    chosen = file ? (await $.fs.read(file).catch(() => '')).trim() : ''
    if (!cfg.voice || chosen) await claimSessionVoice($).catch(() => {})
    await $.command.register({ name: 'say', description: "Spoken updates: /say to hear this session's voice, /say pick [<name>|random], /say read, /say tldr, /say hush, /say help" })
    return next(e)
  })

  // Every turn starts here: its request, a fresh todo list, and the check-in timer.
  on('prompt.submit', async ($, e, next) => {
    stopCheckins()
    turnStartedAt = Date.now()
    if (e.origin.kind === 'task-notification') {
      if (cfg.backgroundTasks) void say($, taskLine(e.text))
    } else {
      lastRequest = e.text
    }
    if (cfg.checkins) checkin = $.clock.every(cfg.checkinMinutes * 60_000, () => void checkIn($))
    return next(e)
  }).catch(($, e, next) => next(e))

  on('tool.call', { tool: 'AskUserQuestion' }, ($, e, next) => {
    if (cfg.needsYou) void say($, 'Claude has a question for you.')
    return next(e)
  }).catch(($, e, next) => next(e))

  on('tool.check', async ($, e, next) => {
    const r = await next(e)
    if (cfg.needsYou && r.decision === 'ask' && e.tool_use_id) void watchForDialog($, e.tool_use_id, e.tool).catch(() => {})
    return r
  }).catch(($, e, next) => next(e))

  // A call that ran or was refused is no longer waiting on you.
  on('tool.call', async ($, e, next) => {
    try {
      return await next(e)
    } finally {
      asking.delete((e as { tool_use_id?: string }).tool_use_id ?? '')
    }
  }).catch(($, e, next) => next(e))

  on('turn.complete', async ($, e, next) => {
    if (e.agentId) return next(e)
    stopCheckins()
    lastAnswer = e.answer
    const isLong = e.durationMs >= cfg.minTurnSeconds * 1000
    // An API error ends the turn (connection lost, the computer slept): say so, in place of a summary.
    const error = errorLine(e.reason, e.answer)
    if (error) {
      if (cfg.needsYou) void say($, error)
    } else if (cfg.turnSummaries && e.reason === 'answer' && isLong && !(await isMuted($))) {
      const request = lastRequest
      void summarize($, e.turnId, request, e.answer).then(line => say($, line))
    }
    return next(e)
  })

  // The limits are your account's, not this session's: whichever session sees one cross first says it.
  // ponytail: two sessions measuring in the same instant can both say it; a lock if that ever happens.
  on('session.measure', async ($, e, next) => {
    const crossed = cfg.rateLimitWarnings ? e.rateLimits.filter(w => w.percentUsed >= cfg.rateLimitPercent) : []
    if (crossed.length) {
      const stored = await $.store.get(WARNED)
      const warned = Array.isArray(stored) ? (stored as string[]) : []
      const fresh = crossed.filter(w => !warned.includes(`${w.kind}@${w.resetsAt ?? ''}`))
      if (fresh.length) {
        await $.store.set(WARNED, [...warned, ...fresh.map(w => `${w.kind}@${w.resetsAt ?? ''}`)].slice(-20))
        for (const w of fresh) void say($, rateLimitLine(w.kind, w.percentUsed))
      }
    }
    return next(e)
  })

  on('command.run', { command: 'say' }, async ($, e) => {
    switch (e.args.trim().toLowerCase()) {
      case 'help': return { text: HELP }
      case 'hush': return hush($)
      case 'read': return readAloud($)
      case 'tldr': return tldrAloud($)
      default: return pickVoice($, e.args.trim())
    }
  })

  on('ui.render', { component: 'Pane', requestId: PICKER }, async ($, e) => {
    const { Box, Button, Text } = $.ui.resolve(e)
    const mine = currentVoice()
    const rows: RenderNode[] = []
    let group = ''
    picker.voices.forEach((v, i) => {
      if (v.group !== group) {
        group = v.group
        rows.push(<Text bold>{group}</Text>)
      }
      const note = v.id === mine ? ' · this session' : picker.others.has(v.id) ? ' · in use' : ''
      rows.push(
        <Button
          key={`voice-${i}`}
          plain
          label={`${v.isInstalled ? '✓' : '·'} ${v.name.padEnd(9)} ${v.id.padEnd(12)} ${v.grade.padEnd(2)}${note}`}
          autoFocus={v.id === mine ? true : undefined}
          onPress={async () => {
            await $.ui.close({ id: PICKER })
            $.ui.toast(await choose($, v))
          }}
        />,
      )
    })
    return (
      <Box flexDirection="column">
        {rows}
        <Text dimColor>✓ installed · A–F: Kokoro's grade · Enter to speak with it · Esc to close</Text>
      </Box>
    )
  })
}

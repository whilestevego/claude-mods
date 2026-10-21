import type { EngineInterface, PluginOptions, Register, RenderNode } from 'claude-code'

import type { VoiceSaid } from '../types'

import { prose, voiceList } from './speech'
import { byGrade, claimVoice, matchVoice, parseCatalog, parseTable, weightedPick } from './voices'
import type { VoiceInfo } from './voices'

type Config = {
  speed: number
  chime: boolean
  voice: string
  voices: string[]
}

function config(o: PluginOptions): Config {
  const num = (v: unknown, d: number) => (typeof v === 'number' && v > 0 ? v : d)
  return {
    speed: num(o.speed, 1),
    chime: o.chime !== false,
    voice: typeof o.voice === 'string' ? o.voice.trim() : '',
    voices: typeof o.voices === 'string' ? voiceList(o.voices) : [],
  }
}

/** /say hush, for this session: in $.state so a hot reload of the mod keeps it. */
const MUTED = { plugin: 'say', key: 'muted' } as const
const isMuted = async ($: EngineInterface) => (await $.state.get(MUTED)).value === true

// The module's own session state; a reload starts it over.
let cfg: Config
let claude: { tty: string; pid: string } | null = null
let home = ''
/** This mod's folder, for its chime. */
let root = ''
/** This session's own voice, claimed at start (unused when a fixed voice is set). */
let sessionVoice = ''
/** The voice you picked with /say for this conversation: wins over the session's own and the fixed one. */
let chosen = ''
/** After /clear: the chosen voice is saved again under the new conversation at the next prompt. */
let isChosenStale = false
/** What the /say picker lists: murmur's voices, and the ones other sessions hold. */
const PICKER = 'claude-say-picker'
const currentVoice = () => chosen || cfg.voice || sessionVoice || 'af_heart'
let picker: { voices: VoiceInfo[]; others: Set<string> } = { voices: [], others: new Set() }
let lastAnswer = ''

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

async function locate($: EngineInterface) {
  home = (await $.env.get('HOME')) ?? ''
  const [tty, pid] = (await $.process.run(['sh', '-c', FIND_CLAUDE])).stdout.trim().split(' ')
  claude = tty && pid ? { tty, pid } : null
}

// /say's choice, kept per conversation so resuming it (or reopening its workspace) keeps the voice.
async function chosenFile($: EngineInterface): Promise<string | undefined> {
  const id = await $.session.id()
  return home && /^[0-9a-f-]{8,64}$/i.test(id) ? `${home}/Library/Caches/claude-say/chosen/${id}` : undefined
}

async function saveChosen($: EngineInterface) {
  const file = await chosenFile($)
  if (!file) return
  await $.process.run(['mkdir', '-p', file.replace(/\/[^/]*$/, '')])
  await $.fs.write(file, chosen)
}

async function choose($: EngineInterface, v: VoiceInfo): Promise<string> {
  chosen = v.id
  await saveChosen($)
  await claimSessionVoice($).catch(() => {})
  void say($, sample(v.name))
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

// Interrupt, don't stack: each new line cuts off whatever is still playing. Whether a line is worth saying at all
// (is anyone away from this terminal?) is the caller's call: the notify mod's, or yours with /say.
async function say($: EngineInterface, text: string): Promise<VoiceSaid> {
  if (!text.trim() || (await isMuted($))) return { isSpoken: false }
  // A soft bell first (the mod's chime.wav), so speech never starts out of nowhere. Not awaited: murmur takes
  // about as long to get ready as the bell rings.
  if (cfg.chime && root) void $.process.run(['afplay', `${root}/chime.wav`]).catch(() => null)
  const argv = ['murmur', '--interrupt', '--speed', String(cfg.speed)]
  const voice = chosen || cfg.voice || sessionVoice
  if (voice) argv.push('--voice', voice)
  const r = await $.process.run([...argv, '--', text]).catch(() => null)
  if (r && r.exitCode !== 0) $.ui.toast(`murmur: ${r.stderr.trim().slice(0, 120) || 'failed'}`)
  return { isSpoken: r?.exitCode === 0 }
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
    void say($, sample(name))
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
  void say($, prose(lastAnswer, 'Code omitted.'))
  return { text: '🔊 Reading the last answer aloud. /say hush stops it.' }
}

async function tldrAloud($: EngineInterface): Promise<{ text: string }> {
  if (await isMuted($)) return { text: 'Muted: /say hush to unmute first.' }
  const r = await $.model.fork({
    prompt: 'In 2 or 3 short sentences meant to be spoken aloud, summarize this session so far: the goal, what is done, and what is next. Plain words only, no markdown or code.',
  })
  if (!r.isAnswered) return { text: `Couldn't summarize: ${r.reason}` }
  const line = prose(r.text).replace(/\s+/g, ' ').trim()
  void say($, line)
  return { text: `🔊 ${line}` }
}

export const register: Register = (on, options) => {
  cfg = config(options)

  // $.voice.say: other mods (notify) speak through this session's voice. The noun's own method holds no `$`, so
  // it only answers when nothing else does; the voice.say hook below, which has one, does the speaking.
  on('engine.create', async (_$, e, next) => ({ ...(await next(e)), voice: { say: async () => ({ isSpoken: false }) } }))

  on('voice.say', async ($, e) => ({ value: await say($, e.text) }))

  on('session.start', async ($, e, next) => {
    root = $.plugin.root
    await locate($)
    const file = await chosenFile($).catch(() => undefined)
    chosen = file ? (await $.fs.read(file).catch(() => '')).trim() : ''
    if (!cfg.voice || chosen) await claimSessionVoice($).catch(() => {})
    await $.command.register({ name: 'say', description: "Spoken updates: /say to hear this session's voice, /say pick [<name>|random], /say read, /say tldr, /say hush, /say help" })
    return next(e)
  })

  on('prompt.submit', ($, e, next) => {
    if (isChosenStale && chosen) void saveChosen($).catch(() => {})
    isChosenStale = false
    return next(e)
  }).catch(($, e, next) => next(e))

  // For /say read.
  on('turn.complete', ($, e, next) => {
    if (!e.agentId) lastAnswer = e.answer
    return next(e)
  })

  // /clear starts a new conversation in this same session (no session.start follows): it keeps the voice.
  on('session.end', ($, e, next) => {
    if (e.reason === 'clear') isChosenStale = true
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

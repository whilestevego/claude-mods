import type { EngineInterface, PluginOptions, Register } from 'claude-code'

import { channel, checkinLine, doing, errorLine, firstSentence, prose, rateLimitLine, summaryPrompt, taskLine } from './lines'
import type { Channel } from './lines'
// The contracts this mod reads: turn-receipt's TL;DR for a turn, say's voice, the terminal mods' focus, and
// session-info's permission dialogs. A renamed key there fails
// type-checking here.
import type {} from '../../turn-receipt/types'
import type {} from '../../say/types'
import type {} from '../../ghostty/types'
import type {} from '../../rex/types'
import type {} from '../../session-info/types'

type Config = {
  when: string
  needsYou: Channel
  turnDone: Channel
  rateLimit: Channel
  backgroundTasks: Channel
  checkins: Channel
  summaryStyle: string
  minTurnSeconds: number
  checkinMinutes: number
  rateLimitPercent: number
}

function config(o: PluginOptions): Config {
  const num = (v: unknown, d: number) => (typeof v === 'number' && v > 0 ? v : d)
  return {
    when: o.when === 'always' ? 'always' : 'away',
    needsYou: channel(o.needsYou, 'both'),
    turnDone: channel(o.turnDone, 'both'),
    rateLimit: channel(o.rateLimit, 'both'),
    backgroundTasks: channel(o.backgroundTasks, 'voice'),
    checkins: channel(o.checkins, 'voice'),
    summaryStyle: o.summaryStyle === 'first-sentence' ? 'first-sentence' : 'haiku',
    minTurnSeconds: num(o.minTurnSeconds, 20),
    checkinMinutes: num(o.checkinMinutes, 5),
    rateLimitPercent: num(o.rateLimitPercent, 90),
  }
}

/** Rate-limit windows already warned about, as "kind@resetsAt": in $.store, so one warning covers every session. */
const WARNED = 'warnedLimits'
/** Set once the /notify haiku hint has been shown: in $.store, so it shows once, not once per session. */
const HINTED = 'hintedTest'

/** System Settings' Notifications page, for a terminal that herald can't come back to. */
const SETTINGS = 'x-apple.systempreferences:com.apple.Notifications-Settings.extension'
/** The herald source that posts the banners in Ghostty and Rex. */
const SOURCE = 'claude'

const HELP = [
  '/notify haiku     send a desktop notification with a fresh haiku, to check they show up',
  "/notify settings  open your terminal's notification settings",
].join('\n')

// The module's own session state; a reload starts it over.
let cfg: Config
/** The herald source, made with the first banner that herald posts. Why it couldn't be made, if so. */
let source: Promise<string | undefined> | undefined
/** The session's folder name, heading its banners so you can tell sessions apart. */
let folder = ''
let lastRequest = ''
let checkin: { cancel(): void } | undefined
/** What the check-in says Claude is on: the task in progress, else the latest step (a Bash or Agent description). */
const now = { task: '', taskId: '', step: '' }
/** Each task's spinner label, by id, so marking one in progress can name it. */
const tasks = new Map<string, string>()

/**
 * The shell command that brings you back to this session's tab, from the terminal mod that knows the terminal. Empty
 * when neither ghostty nor rex can: a mod that isn't loaded fails its call, and one in another terminal answers empty.
 */
async function showCommand($: EngineInterface): Promise<string> {
  const answers = await Promise.allSettled([(async () => $.ghostty.showCommand())(), (async () => $.rex.showCommand())()])
  return answers.map(a => (a.status === 'fulfilled' ? a.value : '')).find(Boolean) ?? ''
}

/** Runs herald, which `make install` puts in ~/.local/bin; that folder isn't always on the PATH. */
async function herald($: EngineInterface, args: string[]) {
  return $.process.run(['sh', '-c', 'PATH="$PATH:$HOME/.local/bin" exec herald "$@"', 'herald', ...args])
}

const failure = (r: { exitCode: number; stderr: string }) => r.stderr.trim().replace(/^herald: /, '').slice(0, 160) || `exit ${r.exitCode}`

/** Makes the herald source, or keeps it. Its icon is icon.png, when there is one. */
async function makeSource($: EngineInterface): Promise<string | undefined> {
  const icon = `${$.plugin.root}/icon.png`
  const hasIcon = (await $.process.run(['test', '-f', icon])).exitCode === 0
  const r = await herald($, ['add', SOURCE, '--title', 'Claude Code', ...(hasIcon ? ['--icon', icon] : [])])
  if (r.exitCode === 127) return 'herald is not installed (https://github.com/whilestevego/herald)'
  return r.exitCode === 0 ? undefined : failure(r)
}

/**
 * Shows a banner; the reason it couldn't, if it couldn't. In Ghostty and Rex herald posts it, and a click runs the
 * terminal mod's command: Ghostty's own banner click pulls a background tab's window over to your Space, the ghostty
 * mod's moves to the window's Space instead. Elsewhere Claude Code's channel sends it.
 */
async function banner($: EngineInterface, text: string): Promise<string | undefined> {
  const click = await showCommand($)
  if (click) {
    source ??= makeSource($).catch(e => String(e))
    const failed = await source
    if (failed) return `herald couldn't make its source: ${failed}`
    const r = await herald($, ['post', SOURCE, '--title', title(), '--on', 'click', click, '--', text])
    return r.exitCode === 0 ? undefined : failure(r)
  }
  const sent = await $.ui.notify(text, { title: title() })
  return sent.isSent ? undefined : sent.reason
}

// Quiet by default: alert only when this session isn't the one in front of you. The terminal mods know, each only in its
// own terminal: ghostty and rex answer false elsewhere, and a mod that isn't loaded fails its call. Without either,
// nothing can tell, so every alert goes out.
async function isAway($: EngineInterface): Promise<boolean> {
  if (cfg.when === 'always') return true
  const answers = await Promise.allSettled([(async () => $.ghostty.isFocused())(), (async () => $.rex.isFocused())()])
  if (answers.every(a => a.status === 'rejected')) return true
  return !answers.some(a => a.status === 'fulfilled' && a.value)
}

/** One alert, on the channels its setting names: a banner (see banner) and the say mod's voice, when it's loaded. */
async function alert($: EngineInterface, to: Channel, text: string) {
  if (to === 'off' || !text.trim() || !(await isAway($))) return
  await Promise.all([to !== 'voice' && banner($, text).catch(() => null), to !== 'banner' && speak($, text)])
}

/** Says `text` in this session's voice. Without the say mod there's no $.voice, and the line goes unsaid. */
async function speak($: EngineInterface, text: string) {
  try {
    await $.voice.say({ text })
  } catch {
    // say isn't loaded, or murmur failed
  }
}

/** A call that asks waits in Claude Code's dialog, or in auto mode its checker; session-info tells them apart. */
async function watchForDialog($: EngineInterface, id: string, tool: string) {
  if (await $.sessionInfo.dialogFor({ id })) await alert($, cfg.needsYou, `Claude needs your permission to use ${tool}.`)
}

/** turn-receipt's TL;DR for this turn, when turn-receipt is on: one summary, shown and told. Empty when it has none. */
async function tldrLine($: EngineInterface, turnId: string): Promise<string> {
  const rows = await $.config.list().catch(() => [])
  if (!rows.some(r => r.key.startsWith('turn-receipt.'))) return ''
  // turn-receipt publishes after its own Haiku call (8 s at most); a short reply publishes an empty line at once.
  for (let waited = 0; waited <= 10_000; waited += 250) {
    const held = await $.state.get({ plugin: 'turn-receipt', key: 'line' })
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

/**
 * A test banner whose text Claude Haiku writes: a fresh one each time, so you can tell it's the one you just sent.
 * macOS can't tell a mod whether it shows the terminal's notifications, so the reliable check is to send one and look.
 */
async function haikuBanner($: EngineInterface): Promise<{ text: string }> {
  const r = await $.model.complete({ model: 'haiku', prompt: 'Write one haiku about a desktop notification arriving. Reply with only its three lines.', maxTokens: 60 })
  const haiku = r.isAnswered ? prose(r.text).trim() : ''
  if (!haiku) return { text: "Claude Haiku didn't answer." }
  const failed = await banner($, haiku)
  return { text: failed ? `Couldn't send a notification (${failed}).` : `🔔 Sent:\n${haiku}` }
}

async function openSettings($: EngineInterface): Promise<{ text: string }> {
  const click = await showCommand($)
  if (click) source ??= makeSource($).catch(e => String(e))
  const viaHerald = click !== '' && !(await source)
  const r = viaHerald ? await herald($, ['settings', SOURCE]) : await $.process.run(['open', SETTINGS])
  if (r.exitCode !== 0) return { text: `Couldn't open System Settings: ${failure(r)}` }
  return { text: `Opened System Settings. Turn on Allow notifications${viaHerald ? ' for Claude Code' : ''}, then /notify haiku.` }
}

const title = () => (folder ? `Claude Code · ${folder}` : 'Claude Code')
const sendsBanners = () => [cfg.needsYou, cfg.turnDone, cfg.rateLimit, cfg.backgroundTasks, cfg.checkins].some(c => c === 'both' || c === 'banner')

function stopCheckins() {
  checkin?.cancel()
  checkin = undefined
}

// What Claude is on, for the check-in: its task list's item in progress, else what its latest Bash or Agent call says.
function track(e: unknown, r: unknown) {
  const a = e as Record<string, any>
  if (a.tool === 'TodoWrite') {
    const item = (a.todos as { status: string; activeForm: string }[] | undefined)?.find(t => t.status === 'in_progress')
    now.task = item ? doing(item.activeForm, true) : ''
  } else if (a.tool === 'TaskCreate') {
    const id = (r as { result?: { task?: { id?: string } } }).result?.task?.id
    if (id) tasks.set(id, a.activeForm ? doing(a.activeForm, true) : doing(a.subject ?? ''))
  } else if (a.tool === 'TaskUpdate') {
    if (a.activeForm) tasks.set(a.taskId, doing(a.activeForm, true))
    else if (a.subject) tasks.set(a.taskId, doing(a.subject))
    if (a.status === 'in_progress') Object.assign(now, { task: tasks.get(a.taskId) ?? '', taskId: a.taskId })
    else if (a.status && a.taskId === now.taskId) Object.assign(now, { task: '', taskId: '' })
    else if (a.taskId === now.taskId) now.task = tasks.get(a.taskId) ?? now.task
  } else if ((a.tool === 'Bash' || a.tool === 'Agent') && typeof a.description === 'string') {
    now.step = doing(a.description)
  }
}

export const register: Register = (on, options) => {
  cfg = config(options)
  // Hooks that gate a prompt or a tool call pass it on untouched if they fail: an alert must never block work.

  on('session.start', async ($, e, next) => {
    folder = e.cwd.replace(/\/+$/, '').split('/').pop() ?? ''
    await $.command.register({ name: 'notify', description: 'Desktop notifications: /notify haiku to check they show up, /notify settings to turn them on' })
    if (sendsBanners() && (await $.store.get(HINTED)) !== true) {
      await $.store.set(HINTED, true)
      $.ui.toast('notify: run /notify haiku to check desktop notifications show up')
    }
    return next(e)
  })

  on('command.run', { command: 'notify' }, async ($, e) => {
    switch (e.args.trim().toLowerCase()) {
      case 'haiku': return haikuBanner($)
      case 'settings': return openSettings($)
      default: return { text: HELP }
    }
  })

  // Every turn starts here: its request, and the check-in timer.
  on('prompt.submit', async ($, e, next) => {
    stopCheckins()
    now.step = ''
    if (e.origin.kind === 'task-notification') void alert($, cfg.backgroundTasks, taskLine(e.text))
    else lastRequest = e.text
    if (cfg.checkins !== 'off') {
      let minutes = 0
      checkin = $.clock.every(cfg.checkinMinutes * 60_000, () => {
        minutes += cfg.checkinMinutes
        void alert($, cfg.checkins, checkinLine(Math.round(minutes), now.task || now.step))
      })
    }
    return next(e)
  }).catch(($, e, next) => next(e))

  on('tool.call', { tool: 'AskUserQuestion' }, ($, e, next) => {
    void alert($, cfg.needsYou, 'Claude has a question for you.')
    return next(e)
  }).catch(($, e, next) => next(e))

  on('tool.check', async ($, e, next) => {
    const r = await next(e)
    if (cfg.needsYou !== 'off' && r.decision === 'ask' && e.tool_use_id) void watchForDialog($, e.tool_use_id, e.tool).catch(() => {})
    return r
  }).catch(($, e, next) => next(e))

  on('tool.call', async ($, e, next) => {
    const r = await next(e)
    track(e, r)
    return r
  }).catch(($, e, next) => next(e))

  on('turn.complete', async ($, e, next) => {
    if (e.agentId) return next(e)
    stopCheckins()
    // An API error ends the turn (connection lost, the computer slept): say so, in place of a summary.
    const error = errorLine(e.reason, e.answer)
    if (error) {
      void alert($, cfg.needsYou, error)
    } else if (cfg.turnDone !== 'off' && e.reason === 'answer' && e.durationMs >= cfg.minTurnSeconds * 1000) {
      void summarize($, e.turnId, lastRequest, e.answer).then(line => alert($, cfg.turnDone, line))
    }
    return next(e)
  })

  // The limits are your account's, not this session's: whichever session sees one cross first tells you.
  // ponytail: two sessions measuring in the same instant can both alert; a lock if that ever happens.
  on('session.measure', async ($, e, next) => {
    const crossed = cfg.rateLimit !== 'off' ? e.rateLimits.filter(w => w.percentUsed >= cfg.rateLimitPercent) : []
    if (crossed.length) {
      const stored = await $.store.get(WARNED)
      const warned = Array.isArray(stored) ? (stored as string[]) : []
      const fresh = crossed.filter(w => !warned.includes(`${w.kind}@${w.resetsAt ?? ''}`))
      if (fresh.length) {
        await $.store.set(WARNED, [...warned, ...fresh.map(w => `${w.kind}@${w.resetsAt ?? ''}`)].slice(-20))
        for (const w of fresh) void alert($, cfg.rateLimit, rateLimitLine(w.kind, w.percentUsed))
      }
    }
    return next(e)
  })
}

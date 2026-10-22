import type { EngineInterface, PluginOptions, Register } from 'claude-code'

import { channel, checkinLine, errorLine, firstSentence, prose, rateLimitLine, summaryPrompt, taskLine } from './lines'
import type { Channel } from './lines'
// The contracts this mod reads: tldr's line for a turn, say's voice, and ghostty's focus. A renamed key there fails
// type-checking here.
import type {} from '../../tldr/types'
import type {} from '../../say/types'
import type {} from '../../ghostty/types'

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
/** Set once the /notify test hint has been shown: in $.store, so it shows once, not once per session. */
const HINTED = 'hintedTest'

/** System Settings' Notifications page: Ghostty's own entry in Ghostty, the whole list elsewhere. */
const SETTINGS = 'x-apple.systempreferences:com.apple.Notifications-Settings.extension'
const GHOSTTY_ID = 'com.mitchellh.ghostty'

const HELP = [
  '/notify test      send a desktop notification now, to check they show up',
  "/notify settings  open your terminal's notification settings",
].join('\n')

// The module's own session state; a reload starts it over.
let cfg: Config
/** Claude's own process: its session record says when a permission dialog is up. */
let pid = ''
let home = ''
let inGhostty = false
/** The session's folder name, heading its banners so you can tell sessions apart. */
let folder = ''
let lastRequest = ''
let checkin: { cancel(): void } | undefined
let turnStartedAt = 0
/** Calls the permission check put to you, until they run or are refused. */
const asking = new Set<string>()

// The pid of Claude itself: the nearest ancestor named claude (the mods' own host process sits between it and this
// shell, and changes when mods reload). No API names it.
const FIND_CLAUDE = `p=$$
while [ "$p" -gt 1 ]; do
  c=$(ps -o comm= -p "$p"); [ "\${c##*/}" = claude ] && { echo "$p"; exit; }
  p=$(ps -o ppid= -p "$p" | tr -d ' ')
done`

async function locate($: EngineInterface) {
  inGhostty = ((await $.env.get('TERM_PROGRAM')) ?? '').toLowerCase() === 'ghostty'
  home = (await $.env.get('HOME')) ?? ''
  pid = (await $.process.run(['sh', '-c', FIND_CLAUDE])).stdout.trim()
}

// Quiet by default: alert only when this session isn't the one in front of you. The ghostty mod knows; without it
// nothing can tell, so every alert goes out.
async function isAway($: EngineInterface): Promise<boolean> {
  if (cfg.when === 'always') return true
  try {
    return !(await $.ghostty.isFocused())
  } catch {
    return true
  }
}

/**
 * One alert, on the channels its setting names. The banner goes through Claude Code's notification channel; in
 * Ghostty a click on it focuses the tab that raised it. The voice is the say mod's, when it's loaded.
 */
async function alert($: EngineInterface, to: Channel, text: string) {
  if (to === 'off' || !text.trim() || !(await isAway($))) return
  await Promise.all([to !== 'voice' && $.ui.notify(text, { title: title() }).catch(() => null), to !== 'banner' && speak($, text)])
}

/** Says `text` in this session's voice. Without the say mod there's no $.voice, and the line goes unsaid. */
async function speak($: EngineInterface, text: string) {
  try {
    await $.voice.say({ text })
  } catch {
    // say isn't loaded, or murmur failed
  }
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
  if (!pid || !home) return
  asking.add(id)
  // ponytail: polls every half second, 10 minutes at most; an event for the dialog would replace it.
  for (let i = 0; i < 1200; i++) {
    await $.clock.sleep(500)
    if (!asking.has(id)) return
    if (asksPermission(await $.fs.read(`${home}/.claude/sessions/${pid}.json`).catch(() => ''))) {
      return alert($, cfg.needsYou, `Claude needs your permission to use ${tool}.`)
    }
  }
}

/** The tldr mod's line for this turn, when tldr is enabled: one summary, shown and told. Empty when it has none. */
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

/**
 * macOS can't tell a mod whether it shows the terminal's notifications (Notification Center's prefs are undocumented
 * and lag behind the toggle), so the reliable check is to send one and look.
 */
async function testBanner($: EngineInterface): Promise<{ text: string }> {
  const sent = await $.ui.notify('This is what notify alerts look like. Click it to come back to this tab.', { title: title() })
  if (!sent.isSent) return { text: `Couldn't send a notification (${sent.reason}).` }
  return { text: "🔔 Sent. Didn't see a banner? /notify settings opens the switch for it." }
}

async function openSettings($: EngineInterface): Promise<{ text: string }> {
  const r = await $.process.run(['open', inGhostty ? `${SETTINGS}?id=${GHOSTTY_ID}` : SETTINGS])
  if (r.exitCode !== 0) return { text: `Couldn't open System Settings: ${r.stderr.trim().slice(0, 120) || `exit ${r.exitCode}`}` }
  return { text: `Opened System Settings. Turn on Allow notifications${inGhostty ? ' for Ghostty' : ''}, then /notify test.` }
}

const title = () => (folder ? `Claude Code · ${folder}` : 'Claude Code')
const sendsBanners = () => [cfg.needsYou, cfg.turnDone, cfg.rateLimit, cfg.backgroundTasks, cfg.checkins].some(c => c === 'both' || c === 'banner')

function stopCheckins() {
  checkin?.cancel()
  checkin = undefined
}

export const register: Register = (on, options) => {
  cfg = config(options)
  // Hooks that gate a prompt or a tool call pass it on untouched if they fail: an alert must never block work.

  on('session.start', async ($, e, next) => {
    folder = e.cwd.replace(/\/+$/, '').split('/').pop() ?? ''
    await locate($)
    await $.command.register({ name: 'notify', description: 'Desktop notifications: /notify test to check they show up, /notify settings to turn them on' })
    if (sendsBanners() && (await $.store.get(HINTED)) !== true) {
      await $.store.set(HINTED, true)
      $.ui.toast('notify: run /notify test to check desktop notifications show up')
    }
    return next(e)
  })

  on('command.run', { command: 'notify' }, async ($, e) => {
    switch (e.args.trim().toLowerCase()) {
      case 'test': return testBanner($)
      case 'settings': return openSettings($)
      default: return { text: HELP }
    }
  })

  // Every turn starts here: its request, and the check-in timer.
  on('prompt.submit', async ($, e, next) => {
    stopCheckins()
    turnStartedAt = Date.now()
    if (e.origin.kind === 'task-notification') void alert($, cfg.backgroundTasks, taskLine(e.text))
    else lastRequest = e.text
    if (cfg.checkins !== 'off') {
      checkin = $.clock.every(cfg.checkinMinutes * 60_000, () => {
        void alert($, cfg.checkins, checkinLine(Math.round((Date.now() - turnStartedAt) / 60000)))
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

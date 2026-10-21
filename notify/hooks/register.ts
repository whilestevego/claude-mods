import type { EngineInterface, PluginOptions, Register } from 'claude-code'

import { channel, checkinLine, errorLine, firstSentence, prose, rateLimitLine, summaryPrompt, taskLine } from './lines'
import type { Channel } from './lines'
// The contracts this mod reads: tldr's line for a turn, and say's voice. A renamed key there fails type-checking here.
import type {} from '../../tldr/types'
import type {} from '../../say/types'

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

// The module's own session state; a reload starts it over.
let cfg: Config
let claude: { tty: string; pid: string } | null = null
let home = ''
let inGhostty = false
/** The session's folder name, heading its banners so you can tell sessions apart. */
let folder = ''
let lastRequest = ''
let checkin: { cancel(): void } | undefined
let turnStartedAt = 0
/** Calls the permission check put to you, until they run or are refused. */
const asking = new Set<string>()

// "<tty> <pid>" of Claude itself: the nearest ancestor named claude (the mods' own host process, between it and
// this shell, owns the tty too, and changes when mods reload). No API names either.
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

// Quiet by default: alert only when this terminal isn't the one in front of you.
async function isAway($: EngineInterface): Promise<boolean> {
  if (cfg.when === 'always' || !inGhostty || !claude) return true // can't tell: the channel settings decide
  const r = await $.process.run(['osascript', '-e', FOCUSED_TTY])
  return r.exitCode !== 0 || r.stdout.trim() !== `/dev/${claude.tty}`
}

/**
 * One alert, on the channels its setting names. The banner goes through Claude Code's notification channel; in
 * Ghostty a click on it focuses the tab that raised it. The voice is the say mod's, when it's loaded.
 */
async function alert($: EngineInterface, to: Channel, text: string) {
  if (to === 'off' || !text.trim() || !(await isAway($))) return
  const title = folder ? `Claude Code · ${folder}` : 'Claude Code'
  await Promise.all([to !== 'voice' && $.ui.notify(text, { title }).catch(() => null), to !== 'banner' && speak($, text)])
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
  if (!claude || !home) return
  asking.add(id)
  // ponytail: polls every half second, 10 minutes at most; an event for the dialog would replace it.
  for (let i = 0; i < 1200; i++) {
    await $.clock.sleep(500)
    if (!asking.has(id)) return
    if (asksPermission(await $.fs.read(`${home}/.claude/sessions/${claude.pid}.json`).catch(() => ''))) {
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
    return next(e)
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

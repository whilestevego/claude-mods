import type { EngineInterface, PluginOptions, Register } from 'claude-code'

import {
  asMode, backgroundFrom, claudeSessions, matchSessions, modeFromHint, notify, progress, Progress, resetBackground,
  runningBar, shortFolder, shouldNotify, tabTitle, tintSequence, title,
} from './term'
import type { Mode, Session, Todo } from './term'
import { ask, clean } from './title'

type Config = {
  tabTitle: boolean
  titleMinutes: number
  tabProgress: boolean
  waitingBadge: boolean
  waitingNotification: string
  modeTint: boolean
  tintStrength: number
}

function config(o: PluginOptions): Config {
  return {
    tabTitle: o.tabTitle !== false,
    titleMinutes: typeof o.titleMinutes === 'number' && o.titleMinutes > 0 ? o.titleMinutes : 3,
    tabProgress: o.tabProgress !== false,
    waitingBadge: o.waitingBadge !== false,
    waitingNotification: o.waitingNotification === 'always' || o.waitingNotification === 'never' ? o.waitingNotification : 'auto',
    modeTint: o.modeTint !== false,
    tintStrength: typeof o.tintStrength === 'number' && o.tintStrength > 0 ? o.tintStrength : 10,
  }
}

// The module's own session state; a reload starts it over.
let cfg: Config
let tty = ''
let prompts: string[] = []
let summary = ''
let titledAt = 0
let todos: Todo[] = []
let hasFailed = false
let isRunning = false
let isWaiting = false
let home = ''
/** Your Ghostty background, which the mode tint shades. */
let base = '#282c34'
let mode: Mode = 'default'
/** The sessions the /goto picker shows. */
let picks: Session[] = []

const GOTO = 'claude-goto'

// The tty of the nearest ancestor that has one: Claude's own terminal.
const FIND_TTY = `p=$$
while [ "$p" -gt 1 ]; do
  t=$(ps -o tty= -p "$p" | tr -d ' ')
  case "$t" in ''|'?'|'??') p=$(ps -o ppid= -p "$p" | tr -d ' ') ;; *) echo "/dev/$t"; exit ;; esac
done`

async function locate($: EngineInterface) {
  const found = (await $.process.run(['sh', '-c', `${FIND_TTY}\necho "$HOME"`])).stdout.trim().split('\n')
  tty = found[0] ?? ''
  home = found[1] ?? ''
}

// Your configured background (or Ghostty's default), read once: the tint is a shade of it.
async function readBackground($: EngineInterface) {
  const show = (flag: string) => `"$GHOSTTY_BIN_DIR/ghostty" +show-config ${flag} 2>/dev/null | grep -E '^background ='`
  const [mine, defaults] = await Promise.all(
    ['', '--default'].map(f => $.process.run(['sh', '-c', show(f)]).then(r => r.stdout).catch(() => '')),
  )
  base = backgroundFrom(mine ?? '', defaults ?? '')
}

async function setMode($: EngineInterface, next: Mode) {
  if (!cfg.modeTint || next === mode) return
  mode = next
  await send($, tintSequence(mode, base, cfg.tintStrength))
}

// Every Ghostty terminal as "id<TAB>tty<TAB>title<TAB>folder"; plus the ttys running Claude.
const LIST_TERMINALS = `tell application "Ghostty"
  set out to ""
  repeat with t in terminals
    set out to out & (id of t) & (character id 9) & (tty of t) & (character id 9) & (name of t) & (character id 9) & (working directory of t) & linefeed
  end repeat
  return out
end tell`
// A string pattern with [/]: no backslash for the template literal to eat.
const CLAUDE_TTYS = `ps -ax -o tty=,comm= | awk 'match($2, "(^|[/])claude$") { print "/dev/" $1 }'`
const FOCUS = `on run argv
  tell application "Ghostty" to focus (first terminal whose id is (item 1 of argv))
end run`

async function listSessions($: EngineInterface): Promise<Session[]> {
  const [terms, ttys] = await Promise.all([
    $.process.run(['osascript', '-e', LIST_TERMINALS]),
    $.process.run(['sh', '-c', CLAUDE_TTYS]),
  ])
  // A failing command must say so: an empty list would read as "no other sessions".
  for (const [what, r] of [['Ghostty', terms], ['ps', ttys]] as const) {
    if (r.exitCode !== 0) throw new Error(`${what} query failed: ${r.stderr.trim().slice(0, 160) || `exit ${r.exitCode}`}`)
  }
  return claudeSessions(terms.stdout, new Set(ttys.stdout.split('\n').filter(Boolean)), tty)
}

async function goTo($: EngineInterface, s: Session) {
  await $.process.run(['osascript', '-e', FOCUS, s.id])
}

// A mod can't print to the screen, so escape sequences go straight to Claude's tty.
async function send($: EngineInterface, bytes: string) {
  if (!tty || !bytes) return
  await $.process.run(['sh', '-c', 'printf "%s" "$1" > "$2"', 'sh', bytes, tty]).catch(() => null)
}

async function drawTitle($: EngineInterface) {
  if (cfg.tabTitle || (cfg.waitingBadge && isWaiting) || summary) {
    await send($, title(tabTitle(summary, cfg.waitingBadge && isWaiting)))
  }
}

async function drawBar($: EngineInterface) {
  if (!cfg.tabProgress) return
  if (isWaiting) return send($, progress(Progress.paused))
  await send($, isRunning ? runningBar(todos, hasFailed) : progress(Progress.hide))
}

/** The voice mod speaks "needs you" itself when it's loaded with that setting on. */
async function voiceSpeaksIt($: EngineInterface): Promise<boolean> {
  const rows = await $.config.list().catch(() => [])
  return rows.some(r => r.key === 'voice.needsYou' && r.value === true)
}

async function waitOnYou($: EngineInterface, why: string) {
  isWaiting = true
  await Promise.all([drawTitle($), drawBar($)])
  if (shouldNotify(cfg.waitingNotification, await voiceSpeaksIt($))) await send($, notify('Claude Code', why))
}

async function stopWaiting($: EngineInterface) {
  if (!isWaiting) return
  isWaiting = false
  await Promise.all([drawTitle($), drawBar($)])
}

async function retitle($: EngineInterface, answer: string) {
  const r = await $.model.complete({ model: 'haiku', prompt: ask(prompts, answer), maxTokens: 20 })
  const words = r.isAnswered ? clean(r.text) : ''
  if (!words) return
  summary = words
  await drawTitle($)
}

export const register: Register = (on, options) => {
  cfg = config(options)
  // Hooks that gate a prompt or a tool call pass it on untouched if they fail: the tab must never block work.

  on('session.start', async ($, e, next) => {
    await locate($)
    if (cfg.modeTint) await readBackground($)
    await $.command.register({ name: 'goto', description: 'Jump to another Claude session in Ghostty: /goto, or /goto <number or words from its title>' })
    return next(e)
  })

  // Claude exits: give the terminal its own background back and clear the bar.
  on('session.end', async ($, e, next) => {
    await send($, (mode !== 'default' ? resetBackground : '') + (cfg.tabProgress ? progress(Progress.hide) : ''))
    return next(e)
  })

  // The hint line names the permission mode ("⏵⏵ accept edits on") and redraws the moment Shift+Tab changes it.
  on('ui.render', { component: 'PromptHint' }, async ($, e, next) => {
    const named = modeFromHint(e.props.hint)
    if (named) void setMode($, named)
    else if (!e.props.isWorking && /\? for shortcuts/.test(e.props.hint)) void setMode($, 'default')
    return next(e)
  })

  // Backup: every prompt carries the mode Claude Code is actually in.
  on('classic.UserPromptSubmit', async ($, e, next) => {
    const named = asMode(e.permission_mode)
    if (named) void setMode($, named)
    return next(e)
  }).catch(($, e, next) => next(e))

  on('command.run', { command: 'goto' }, async ($, e) => {
    const sessions = await listSessions($).catch((err: Error) => err)
    if (sessions instanceof Error) return { text: `/goto couldn't list sessions: ${sessions.message}` }
    const others = sessions.filter(s => !s.isMe)
    if (others.length === 0) return { text: 'No other Claude sessions are running in Ghostty.' }
    if (e.args.trim()) {
      const hits = matchSessions(sessions, e.args).filter(s => !s.isMe)
      if (hits.length === 1) {
        await goTo($, hits[0]!)
        return { text: `→ ${hits[0]!.title}` }
      }
      if (hits.length === 0) return { text: `No Claude session matches "${e.args.trim()}". /goto lists them.` }
    }
    picks = sessions
    await $.ui.open({ id: GOTO, title: 'Claude sessions', focus: true, closeOnEscape: true, rows: sessions.length + 1 })
    return { text: `${others.length} other Claude session${others.length === 1 ? '' : 's'}: pick one above.` }
  })

  on('ui.render', { component: 'Pane', requestId: GOTO }, async ($, e) => {
    const { Box, Button, Text } = $.ui.resolve(e)
    return (
      <Box flexDirection="column">
        {picks.map((s, i) =>
          s.isMe ? (
            <Text dimColor>
              {'   '}
              {s.title} · {shortFolder(s.folder, home)} (this session)
            </Text>
          ) : (
            <Button
              key={`goto-${i}`}
              plain
              hotkey={i < 9 ? String(i + 1) : undefined}
              label={`${s.title} · ${shortFolder(s.folder, home)}`}
              autoFocus={picks.findIndex(p => !p.isMe) === i ? true : undefined}
              onPress={async () => {
                await $.ui.close({ id: GOTO })
                await goTo($, s)
              }}
            />
          ),
        )}
        <Text dimColor>Number or Enter to jump · Esc to close</Text>
      </Box>
    )
  })

  on('prompt.submit', async ($, e, next) => {
    if (e.origin.kind !== 'task-notification' && e.text.trim()) prompts = [...prompts, e.text].slice(-6)
    todos = []
    hasFailed = false
    isRunning = true
    isWaiting = false
    void Promise.all([drawTitle($), drawBar($)])
    return next(e)
  }).catch(($, e, next) => next(e))

  on('tool.call', { tool: 'TodoWrite' }, async ($, e, next) => {
    todos = e.todos.map(t => ({ status: t.status }))
    void drawBar($)
    return next(e)
  }).catch(($, e, next) => next(e))

  on('tool.call', { tool: 'AskUserQuestion' }, async ($, e, next) => {
    void waitOnYou($, 'Claude has a question for you')
    return next(e)
  }).catch(($, e, next) => next(e))

  // Every tool call: a permission prompt or a question waits inside next(); its return means you answered.
  on('tool.call', async ($, e, next) => {
    const ran = await next(e)
    const failed = ran.deny === undefined && ran.isError === true
    if (failed !== hasFailed) {
      hasFailed = failed
      void drawBar($)
    }
    void stopWaiting($)
    return ran
  }).catch(($, e, next) => next(e))

  on('classic.Notification', async ($, e, next) => {
    if (e.notification_type === 'permission_prompt') void waitOnYou($, e.message)
    return next(e)
  }).catch(($, e, next) => next(e))

  on('turn.complete', async ($, e, next) => {
    if (e.agentId) return next(e)
    isRunning = false
    isWaiting = false
    void Promise.all([drawTitle($), drawBar($)])
    const now = Date.now()
    if (cfg.tabTitle && prompts.length && now - titledAt >= cfg.titleMinutes * 60_000) {
      titledAt = now
      void retitle($, e.answer)
    }
    return next(e)
  })
}

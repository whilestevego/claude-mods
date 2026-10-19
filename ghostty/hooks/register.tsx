import { atom, read, update } from 'claude-code'
import type { EngineInterface, PluginOptions, Register } from 'claude-code'

import type { WorkspaceRow } from '../types'

import {
  claudeSessions, matchSessions, progress, Progress, runningBar, shortFolder, shouldNotify, tabTitle, titleAction,
} from './term'
import type { Session } from './term'
import { DEFAULTS, parseAdd, parseBindings, prettyKeys, renderFile, upsert, withInclude } from './keybinds'
import type { Binding } from './keybinds'
import { asksPermission, badge, nextWaiting, parseEntry, rank } from './registry'
import type { Entry, Ranked, Status } from './registry'
import { ask, bare, clean, context } from './title'
import {
  claudePidsFrom, cleanName, closable, conversationOf, fromWindow, namePrompt, openScript, parseWorkspace, sameWorkspace, slug,
  summary as describe,
} from './workspace'
import type { Workspace } from './workspace'

type Config = {
  tabTitle: boolean
  titleMinutes: number
  tabProgress: boolean
  waitingBadge: boolean
  waitingNotification: string
  keybinds: boolean
}

function config(o: PluginOptions): Config {
  return {
    tabTitle: o.tabTitle !== false,
    titleMinutes: typeof o.titleMinutes === 'number' && o.titleMinutes > 0 ? o.titleMinutes : 3,
    tabProgress: o.tabProgress !== false,
    waitingBadge: o.waitingBadge !== false,
    waitingNotification: o.waitingNotification === 'always' || o.waitingNotification === 'never' ? o.waitingNotification : 'auto',
    keybinds: o.keybinds === true,
  }
}

// The module's own session state; a reload starts it over.
let cfg: Config
let tty = ''
/** Claude's own process: a session is alive while it is. */
let pid = ''
let summary = ''
let titledAt = 0
let hasFailed = false
let isRunning = false
let isWaiting = false
/** Calls the permission check put to you, until they run or are refused. */
const asking = new Set<string>()
/** The calls waiting on you right now (a dialog that's up, a question): ❓ until the last of them is answered. */
const waitingOn = new Set<string>()
let home = ''
/** The sessions the /goto picker shows. */
let picks: Ranked[] = []
let status: Status = 'idle'
let statusSince = 0

const workspaceRows = atom({ plugin: 'ghostty', key: 'workspaces' } as const, [])
const WORKSPACES = 'claude-workspaces'

const GOTO = 'claude-goto'

// "<tty> <pid>" of Claude itself: the nearest ancestor named claude (the mods' own host process, between it and
// this shell, owns the tty too). Without one, the nearest ancestor owning a tty. No API names Claude's tty or pid.
const FIND_TTY = `p=$$
first=
while [ "$p" -gt 1 ]; do
  t=$(ps -o tty= -p "$p" | tr -d ' ')
  case "$t" in ''|'?'|'??') ;; *) [ -z "$first" ] && first="/dev/$t $p"
    c=$(ps -o comm= -p "$p"); [ "\${c##*/}" = claude ] && { echo "/dev/$t $p"; exit; } ;;
  esac
  p=$(ps -o ppid= -p "$p" | tr -d ' ')
done
echo "$first"`

async function locate($: EngineInterface) {
  home = (await $.env.get('HOME')) ?? ''
  ;[tty = '', pid = ''] = (await $.process.run(['sh', '-c', FIND_TTY])).stdout.trim().split(' ')
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

// A mod can't print to the screen, so escape sequences go straight to Claude's tty. Bytes written there can land
// inside a frame Claude is drawing and garble it, so only the progress bar (no other way to set it) goes this way.
async function send($: EngineInterface, bytes: string) {
  if (!tty || !bytes) return
  await $.process.run(['sh', '-c', 'printf "%s" "$1" > "$2"', 'sh', bytes, tty]).catch(() => null)
}

const SET_TITLE = `on run argv
tell application "Ghostty" to perform action (item 2 of argv) on (first terminal whose tty is (item 1 of argv))
end run`

async function drawTitle($: EngineInterface) {
  if (!tty) return
  if (cfg.tabTitle || (cfg.waitingBadge && isWaiting) || summary) {
    await $.process.run(['osascript', '-e', SET_TITLE, tty, titleAction(tabTitle(summary, cfg.waitingBadge && isWaiting))]).catch(() => null)
  }
}

let wantedBar = ''
let sentBar = ''

async function drawBar($: EngineInterface) {
  if (!cfg.tabProgress) return
  wantedBar = isWaiting ? progress(Progress.paused) : isRunning ? runningBar(hasFailed) : progress(Progress.hide)
  // Let the redraw that came with this change (a submitted prompt, a finished turn) finish first; the last call wins.
  // ponytail: a fixed delay only dodges that redraw, a spinner frame can still collide; no way to sync with Claude's renderer.
  await $.clock.sleep(150)
  if (wantedBar === sentBar) return
  sentBar = wantedBar
  await send($, sentBar)
}

/** The say mod speaks "needs you" itself when it's loaded with that setting on. */
async function voiceSpeaksIt($: EngineInterface): Promise<boolean> {
  const rows = await $.config.list().catch(() => [])
  return rows.some(r => r.key === 'say.needsYou' && r.value === true)
}

async function waitOnYou($: EngineInterface, id: string, why: string) {
  waitingOn.add(id)
  isWaiting = true
  void setStatus($, 'waiting').catch(() => {})
  await Promise.all([drawTitle($), drawBar($)])
  if (shouldNotify(cfg.waitingNotification, await voiceSpeaksIt($))) await $.ui.notify(why, { title: 'Claude Code' }).catch(() => null)
}

/**
 * A call that asks waits in Claude Code's dialog, or in auto mode its checker. Only the dialog marks the session
 * record waiting, so watch it while the call is pending. Mods hear neither classic.PermissionRequest nor
 * classic.Notification while a dialog is up (checked on 2.1.301), so this file is the only sign.
 */
async function watchForDialog($: EngineInterface, id: string, why: string) {
  asking.add(id)
  // ponytail: polls every half second, 10 minutes at most; an event for the dialog would replace it.
  for (let i = 0; i < 1200; i++) {
    await $.clock.sleep(500)
    if (!asking.has(id)) return
    if (asksPermission(await $.fs.read(`${home}/.claude/sessions/${pid}.json`).catch(() => ''))) return waitOnYou($, id, why)
  }
}

/** `id` was answered; the ❓ goes once nothing else waits on you. */
async function answered($: EngineInterface, id: string) {
  if (!waitingOn.delete(id) || waitingOn.size > 0) return
  isWaiting = false
  void setStatus($, isRunning ? 'working' : 'idle').catch(() => {})
  await Promise.all([drawTitle($), drawBar($)])
}

/**
 * A new title from the transcript (so a resumed session has its history), remembered for its conversation.
 * `answer`: the reply that just ended, which the transcript may not hold yet. '' when there's nothing to summarize.
 */
async function retitle($: EngineInterface, answer?: string): Promise<string> {
  const c = context(await $.session.messages())
  if (c.prompts.length === 0) return ''
  const r = await $.model.complete({ model: 'haiku', prompt: ask(c.prompts, answer ?? c.answer), maxTokens: 24 })
  const words = r.isAnswered ? clean(r.text) : ''
  if (!words) return ''
  summary = words
  await drawTitle($)
  const file = titleFile(await $.session.id())
  if (file) await $.process.run(['mkdir', '-p', titleDir()]).then(() => $.fs.write(file, words)).catch(() => {})
  return words
}

// Each conversation's title, so resuming it (or reopening its workspace) puts the title back.
const titleDir = () => `${home}/Library/Caches/claude-ghostty/titles`
const titleFile = (sessionId?: string) => (home && sessionId && /^[0-9a-f-]{8,64}$/i.test(sessionId) ? `${titleDir()}/${sessionId}` : undefined)

/** The title this conversation had, or a new one when it has history but no title yet. */
async function restoreTitle($: EngineInterface) {
  const file = titleFile(await $.session.id())
  const saved = file ? clean(await $.fs.read(file).catch(() => '')) : ''
  titledAt = Date.now()
  if (!saved) return void (await retitle($))
  summary = saved
  await drawTitle($)
}

// ─── Session status (for /goto and /workspace) ─────────────────────────────

const statusDir = () => `${home}/Library/Caches/claude-ghostty/sessions`

/** This session's status file: only this session writes it, so sessions never race. */
async function setStatus($: EngineInterface, next: Status) {
  if (!home || !tty) return
  if (next !== status || !statusSince) statusSince = Date.now()
  status = next
  const entry: Entry = { tty, pid, sessionId: await $.session.id(), cwd: await $.session.cwd(), status, since: statusSince }
  await $.process.run(['mkdir', '-p', statusDir()])
  await $.fs.write(`${statusDir()}/${tty.replace(/\W/g, '_')}.json`, JSON.stringify(entry))
}

async function readEntries($: EngineInterface): Promise<Map<string, Entry>> {
  const files = await $.fs.list(statusDir()).catch(() => [])
  const entries = await Promise.all(
    files.filter(f => f.name.endsWith('.json')).map(f => $.fs.read(`${statusDir()}/${f.name}`).then(parseEntry, () => undefined)),
  )
  return new Map(entries.filter(e => e !== undefined).map(e => [e.tty, e]))
}

async function rankedSessions($: EngineInterface): Promise<Ranked[]> {
  const [sessions, entries] = await Promise.all([listSessions($), readEntries($)])
  return rank(sessions, entries)
}

// ─── Workspaces ──────────────────────────────────────────────────────────────

const workspaceDir = () => `${home}/.claude/workspaces`

// The window holding this session, as "tab index<TAB>tty<TAB>folder<TAB>title<TAB>terminal id" lines in order.
const LIST_WINDOW = `on run argv
  set myTty to item 1 of argv
  set sep to character id 9
  tell application "Ghostty"
    repeat with w in windows
      set hit to false
      repeat with t in terminals of w
        if tty of t is myTty then set hit to true
      end repeat
      if hit then
        set out to ""
        repeat with tb in tabs of w
          repeat with t in terminals of tb
            set out to out & (index of tb) & sep & (tty of t) & sep & (working directory of t) & sep & (name of t) & sep & (id of t) & linefeed
          end repeat
        end repeat
        return out
      end if
    end repeat
  end tell
  return ""
end run`

// Every Claude process with its tty: "/dev/ttys004 36583" lines.
const CLAUDE_PIDS = `ps -ax -o tty=,pid=,comm= | awk 'match($3, "(^|[/])claude$") { print "/dev/" $1, $2 }'`

/** Claude Code's records of running sessions: process ID → conversation ID. */
async function conversations($: EngineInterface, pids: Iterable<string>): Promise<Map<string, string>> {
  const pairs = await Promise.all(
    [...pids].map(async pid => [pid, conversationOf(await $.fs.read(`${home}/.claude/sessions/${pid}.json`).catch(() => ''))] as const),
  )
  return new Map(pairs.filter((p): p is readonly [string, string] => p[1] !== undefined))
}

type Saved = { text: string; window?: string; claudePids?: Map<string, string> }

/** Every saved workspace, read in full. */
async function savedWorkspaces($: EngineInterface): Promise<Array<Workspace & { file: string }>> {
  const files = await $.fs.list(workspaceDir()).catch(() => [])
  const all = await Promise.all(
    files.filter(f => f.name.endsWith('.json')).map(async f => {
      const file = `${workspaceDir()}/${f.name}`
      const ws = parseWorkspace(await $.fs.read(file).catch(() => ''))
      return ws ? { ...ws, file } : undefined
    }),
  )
  return all.filter(w => w !== undefined)
}

async function saveWorkspace($: EngineInterface, given: string): Promise<Saved> {
  const [window, ps] = await Promise.all([$.process.run(['osascript', '-e', LIST_WINDOW, tty]), $.process.run(['sh', '-c', CLAUDE_PIDS])])
  if (window.exitCode !== 0) return { text: `Couldn't read this Ghostty window: ${window.stderr.trim().slice(0, 160)}` }
  const claudePids = claudePidsFrom(ps.stdout)
  const tabs = fromWindow(window.stdout, claudePids, await conversations($, claudePids.values()))
  if (tabs.length === 0) return { text: "Couldn't find this session's Ghostty window." }
  // No name: the saved workspace this window was opened from keeps its name and file, else Haiku names it.
  const all = await savedWorkspaces($)
  const same = given.trim() ? undefined : sameWorkspace(tabs, all)
  let name = given.trim() || same?.name || ''
  if (!name) {
    const r = await $.model.complete({ model: 'haiku', prompt: namePrompt(tabs), maxTokens: 20, timeoutMs: 8000 })
    name = (r.isAnswered && cleanName(r.text)) || `Workspace ${new Date().toISOString().slice(0, 10)}`
  }
  const file = same?.file ?? fileFor(name, all, given.trim() !== '')
  const existed = all.some(w => w.file === file)
  const ws: Workspace = { name, savedAt: Date.now(), tabs }
  await $.process.run(['mkdir', '-p', workspaceDir()])
  await $.fs.write(file, JSON.stringify(ws, null, 2))
  const unknown = tabs.flat().filter(p => p.kind === 'claude' && !p.sessionId)
  const text = `${existed ? 'Updated' : 'Saved'} workspace "${name}": ${describe(ws)}.` +
    (unknown.length ? ` Couldn't find the conversation for ${unknown.map(p => `"${p.title}"`).join(', ')}: ${unknown.length === 1 ? 'it' : 'they'} will reopen as a new session.` : '')
  return { text, window: window.stdout, claudePids }
}

/**
 * Where `name` is saved: its slug's file, unless that holds a different workspace (another name, or one
 * Haiku's name happened to land on), which is never overwritten: then the first free `-2`, `-3`, …
 */
function fileFor(name: string, all: ReadonlyArray<{ file: string; name: string }>, isNamedByYou: boolean): string {
  const at = (suffix: string) => `${workspaceDir()}/${slug(name)}${suffix}.json`
  const held = all.find(w => w.file === at(''))
  if (!held || (isNamedByYou && held.name.toLowerCase() === name.toLowerCase())) return at('')
  for (let n = 2; ; n++) if (!all.some(w => w.file === at(`-${n}`))) return at(`-${n}`)
}

/**
 * Saves the window, exits every other Claude session in it and closes their panes, then exits this
 * session too, leaving its tab open at the shell. Shell panes stay open. Sessions still working or waiting on
 * you are not stopped unless `force`.
 */
async function closeWorkspace($: EngineInterface, given: string, force: boolean): Promise<string> {
  const saved = await saveWorkspace($, given)
  if (!saved.window || !saved.claudePids) return saved.text
  const targets = closable(saved.window, saved.claudePids, tty)
  if (targets.length === 0) return exitThisSession($, `${saved.text} Exiting this session.`)
  if (!force) {
    const entries = await readEntries($)
    const busy = targets.filter(t => entries.get(t.tty)?.status === 'working' || entries.get(t.tty)?.status === 'waiting')
    if (busy.length) {
      const names = busy.map(t => `"${t.title || t.tty}"`).join(', ')
      return `${saved.text} Closed nothing: ${names} ${busy.length === 1 ? 'is' : 'are'} still working or waiting on you. ` +
        'Let them finish, or /workspace close --force.'
    }
  }
  // A polite exit, as quitting from outside does; Claude has written each conversation to disk as it went.
  await $.process.run(['kill', '-TERM', ...targets.map(t => t.pid)])
  let alive = targets
  for (let waited = 0; alive.length && waited < 5000; waited += 250) {
    await $.clock.sleep(250)
    const r = await $.process.run(['sh', '-c', 'for p; do kill -0 "$p" 2>/dev/null && echo "$p"; done', 'sh', ...alive.map(t => t.pid)])
    const running = new Set(r.stdout.split('\n').filter(Boolean))
    alive = alive.filter(t => running.has(t.pid))
  }
  const exited = targets.filter(t => !alive.includes(t))
  for (const t of exited) await $.process.run(['osascript', '-e', CLOSE_TERMINAL, t.id])
  return exitThisSession(
    $,
    `${saved.text} Closed ${exited.length} other Claude session${exited.length === 1 ? '' : 's'}.` +
      (alive.length ? ` ${alive.length} didn't exit within 5 seconds and ${alive.length === 1 ? 'is' : 'are'} still open.` : '') +
      ' Exiting this session.',
  )
}

/** Quits this session the way typing /exit does, just after `message` has printed: the tab stays, at the shell. */
function exitThisSession($: EngineInterface, message: string): string {
  $.clock.after(300, () => void $.command.run({ command: 'exit', args: '' }).catch(() => {}))
  return message
}

const CLOSE_TERMINAL = `on run argv
  tell application "Ghostty" to close (first terminal whose id is (item 1 of argv))
end run`

async function loadWorkspaces($: EngineInterface): Promise<WorkspaceRow[]> {
  const all = await savedWorkspaces($)
  return all.map(ws => ({ file: ws.file, name: ws.name, summary: describe(ws), savedAt: ws.savedAt })).sort((a, b) => b.savedAt - a.savedAt)
}

async function openWorkspace($: EngineInterface, file: string): Promise<string> {
  const ws = parseWorkspace(await $.fs.read(file).catch(() => ''))
  if (!ws) return "That workspace couldn't be read."
  // Each Claude tab's saved title, for its session to pick up when it resumes; a title the session saved itself wins.
  await $.process.run(['mkdir', '-p', titleDir()])
  for (const p of ws.tabs.flat()) {
    const file = p.kind === 'claude' ? titleFile(p.sessionId) : undefined
    if (file && bare(p.title) && !(await $.fs.stat(file).then(() => true, () => false))) await $.fs.write(file, clean(bare(p.title)))
  }
  const r = await $.process.run(['osascript', '-e', openScript(ws)])
  return r.exitCode === 0 ? `Opened "${ws.name}": ${describe(ws)}.` : `Ghostty couldn't open it: ${r.stderr.trim().slice(0, 160)}`
}

async function deleteWorkspace($: EngineInterface, file: string) {
  await $.process.run(['rm', '-f', file])
  await update($, workspaceRows, rows => rows.filter(r => r.file !== file))
}

// ─── Keybinds ────────────────────────────────────────────────────────────────

// Where Ghostty reads its config: ~/.config/ghostty when that's in use, else the macOS app folder.
async function configDir($: EngineInterface): Promise<string> {
  const xdg = `${home}/.config/ghostty`
  const app = `${home}/Library/Application Support/com.mitchellh.ghostty`
  const r = await $.process.run(['sh', '-c', '[ -f "$1/config" ] && echo "$1" || echo "$2"', 'sh', xdg, app])
  return r.stdout.trim() || app
}

async function readBindings($: EngineInterface): Promise<{ dir: string; file: string; text: string | null }> {
  const dir = await configDir($)
  const file = `${dir}/claude-keybinds`
  const text = await $.fs.read(file).catch(() => null)
  return { dir, file, text }
}

/** Writes the bindings, makes the main config load them, and lets Ghostty check and reload. Undoes a rejected change. */
async function saveBindings($: EngineInterface, bindings: readonly Binding[]): Promise<string | undefined> {
  const { dir, file, text } = await readBindings($)
  const previous = text ?? ''
  await $.process.run(['mkdir', '-p', dir])
  await $.fs.write(file, renderFile(previous, bindings))
  const main = `${dir}/config`
  const config = await $.fs.read(main).catch(() => '')
  if (withInclude(config) !== config) await $.fs.write(main, withInclude(config))
  const check = await $.process.run(['sh', '-c', '"$GHOSTTY_BIN_DIR/ghostty" +validate-config 2>&1'])
  if (check.exitCode !== 0) {
    await $.fs.write(file, previous)
    return check.stdout.trim().split('\n')[0] || 'Ghostty rejected the change'
  }
  await $.process.run(['osascript', '-e', 'tell application "Ghostty" to perform action "reload_config" on (first terminal)'])
  return undefined
}

function listing(bindings: readonly Binding[]): string {
  if (bindings.length === 0) return 'No Claude keybinds yet. /keybind add <keys> <text>, e.g. /keybind add super+ctrl+h /say hush'
  return bindings.map(b => `${prettyKeys(b.keys).padEnd(6)} ${b.text}`).join('\n')
}

export const register: Register = (on, options) => {
  cfg = config(options)
  // Hooks that gate a prompt or a tool call pass it on untouched if they fail: the tab must never block work.

  on('session.start', async ($, e, next) => {
    await locate($)
    void setStatus($, 'idle').catch(() => {})
    if (cfg.tabTitle) void restoreTitle($).catch(() => {})
    await $.command.register({ name: 'title', description: 'A new 4-word tab title for this session, now' })
    await $.command.register({ name: 'keybind', description: 'Ghostty keys that type into Claude: /keybind, /keybind add <keys> <text>, /keybind remove <keys>' })
    // First start: install the default keys once (a later /keybind remove sticks, since the file then exists).
    if (cfg.keybinds && (await readBindings($).catch(() => null))?.text === null) void saveBindings($, DEFAULTS).catch(() => {})
    await $.command.register({ name: 'goto', description: 'Jump to another Claude session in Ghostty (waiting ones first): /goto, /goto next, or /goto <number or words>' })
    await $.command.register({ name: 'workspace', description: 'Save this Ghostty window of sessions, or reopen one: /workspace save [name], /workspace close [name] (save, then exit the other sessions), /workspace list, /workspace open <name>' })
    return next(e)
  })

  // Claude exits: clear the bar. /clear ends the conversation but not Claude, and no session.start follows:
  // drop the old topic from the tab and let the next finished turn title the new one.
  on('session.end', async ($, e, next) => {
    if (cfg.tabProgress) await send($, progress(Progress.hide))
    if (e.reason === 'clear') {
      summary = ''
      titledAt = 0
      await drawTitle($)
    }
    return next(e)
  })

  on('command.run', { command: 'title' }, async $ => {
    titledAt = Date.now()
    const words = await retitle($).catch(() => '')
    return { text: words ? `Tab title: ${words}` : 'Nothing to summarize yet: send a message first.' }
  })

  on('command.run', { command: 'goto' }, async ($, e) => {
    const ranked = await rankedSessions($).catch((err: Error) => err)
    if (ranked instanceof Error) return { text: `/goto couldn't list sessions: ${ranked.message}` }
    const others = ranked.filter(s => !s.isMe)
    if (others.length === 0) return { text: 'No other Claude sessions are running in Ghostty.' }
    const query = e.args.trim()
    if (query === 'next') {
      const waiting = nextWaiting(ranked)
      if (!waiting) return { text: 'No session is waiting on you.' }
      await goTo($, waiting)
      return { text: `→ ${waiting.title} (${badge(waiting, Date.now())})` }
    }
    if (query) {
      const hits = matchSessions(ranked, query).filter(s => !s.isMe)
      if (hits.length === 1) {
        await goTo($, hits[0]!)
        return { text: `→ ${hits[0]!.title}` }
      }
      if (hits.length === 0) return { text: `No Claude session matches "${query}". /goto lists them.` }
    }
    picks = ranked
    await $.ui.open({ id: GOTO, title: 'Claude sessions', focus: true, closeOnEscape: true, rows: ranked.length + 1 })
    const waiting = others.filter(s => s.status === 'waiting').length
    return { text: `${others.length} other Claude session${others.length === 1 ? '' : 's'}${waiting ? `, ${waiting} waiting on you` : ''}: pick one above.` }
  })

  on('command.run', { command: 'workspace' }, async ($, e) => {
    const [verb = 'list', ...rest] = e.args.trim().split(/\s+/).filter(Boolean)
    const arg = rest.join(' ')
    if (verb === 'save') return { text: (await saveWorkspace($, arg)).text }
    if (verb === 'close') return { text: await closeWorkspace($, rest.filter(w => w !== '--force').join(' '), rest.includes('--force')) }
    const rows = await loadWorkspaces($)
    if (verb === 'open' && arg) {
      const hit = rows.find(r => r.name.toLowerCase() === arg.toLowerCase()) ?? rows.find(r => r.name.toLowerCase().includes(arg.toLowerCase()))
      return { text: hit ? await openWorkspace($, hit.file) : `No workspace called "${arg}". /workspace list shows them.` }
    }
    if (verb !== 'list' && verb !== 'open') return { text: 'Usage: /workspace save [name], /workspace close [name], /workspace list, /workspace open <name>' }
    if (rows.length === 0) return { text: 'No saved workspaces yet. /workspace save remembers this window.' }
    await update($, workspaceRows, () => rows)
    await $.ui.open({ id: WORKSPACES, title: 'Workspaces', focus: true, closeOnEscape: true, rows: rows.length + 1 })
    return { text: `${rows.length} saved workspace${rows.length === 1 ? '' : 's'}: pick one above.` }
  })

  on('command.run', { command: 'keybind' }, async ($, e) => {
    const [verb, ...rest] = e.args.trim().split(/\s+/)
    const current = parseBindings((await readBindings($)).text ?? '')
    if (!verb || verb === 'list') return { text: listing(current) }
    if (verb === 'add') {
      const b = parseAdd(rest.join(' '))
      if (typeof b === 'string') return { text: b }
      const error = await saveBindings($, upsert(current, b))
      return { text: error ? `Ghostty didn't accept that: ${error}` : `${prettyKeys(b.keys)} now types ${b.text} ⏎` }
    }
    if (verb === 'remove') {
      const keys = (rest[0] ?? '').toLowerCase()
      if (!current.some(b => b.keys === keys)) return { text: `No Claude keybind on ${keys || '(no keys given)'}.\n${listing(current)}` }
      const error = await saveBindings($, current.filter(b => b.keys !== keys))
      return { text: error ? `Ghostty didn't accept that: ${error}` : `Removed ${prettyKeys(keys)}.` }
    }
    return { text: 'Usage: /keybind, /keybind add <keys> <text>, /keybind remove <keys>' }
  })

  on('ui.render', { component: 'Pane', requestId: GOTO }, async ($, e) => {
    const { Box, Button, Text } = $.ui.resolve(e)
    const now = Date.now()
    const label = (s: Ranked) => `${badge(s, now).padEnd(6)} ${s.title} · ${shortFolder(s.folder, home)}`
    const first = picks.findIndex(p => !p.isMe)
    return (
      <Box flexDirection="column">
        {picks.map((s, i) =>
          s.isMe ? (
            <Text dimColor>
              {'   '}
              {label(s)} (this session)
            </Text>
          ) : (
            <Button
              key={`goto-${i}`}
              plain
              hotkey={i < 9 ? String(i + 1) : undefined}
              label={label(s)}
              autoFocus={first === i ? true : undefined}
              onPress={async () => {
                await $.ui.close({ id: GOTO })
                await goTo($, s)
              }}
            />
          ),
        )}
        <Text dimColor>❓ waiting on you · ⏳ working · number or Enter to jump · Esc to close</Text>
      </Box>
    )
  })

  on('ui.render', { component: 'Pane', requestId: WORKSPACES }, async ($, e) => {
    const { Box, Button, Text } = $.ui.resolve(e)
    const rows = await read($, workspaceRows)
    if (rows.length === 0) return <Text dimColor>No saved workspaces. /workspace save remembers this window.</Text>
    return (
      <Box flexDirection="column">
        {rows.map((r, i) => (
          <Box flexDirection="row">
            <Button
              key={`ws-open-${i}`}
              plain
              hotkey={i < 9 ? String(i + 1) : undefined}
              label={`${r.name} · ${r.summary} · ${new Date(r.savedAt).toLocaleDateString()}`}
              autoFocus={i === 0 ? true : undefined}
              onPress={async () => {
                await $.ui.close({ id: WORKSPACES })
                const text = await openWorkspace($, r.file)
                $.ui.toast(text)
              }}
            />
            <Text> </Text>
            <Button key={`ws-del-${i}`} plain dimColor label="✕ delete" onPress={() => deleteWorkspace($, r.file)} />
          </Box>
        ))}
        <Text dimColor>number or Enter to open · Tab to ✕ delete · Esc to close</Text>
      </Box>
    )
  })

  on('prompt.submit', async ($, e, next) => {
    hasFailed = false
    isRunning = true
    isWaiting = false
    waitingOn.clear()
    void Promise.all([drawTitle($), drawBar($), setStatus($, 'working').catch(() => {})])
    return next(e)
  }).catch(($, e, next) => next(e))

  on('tool.call', { tool: 'AskUserQuestion' }, async ($, e, next) => {
    if (e.tool_use_id) void waitOnYou($, e.tool_use_id, 'Claude has a question for you')
    return next(e)
  }).catch(($, e, next) => next(e))

  // Every tool call: a permission prompt or a question waits inside next(); its return means you answered that one.
  // Other calls finishing meanwhile (parallel reads, subagents) leave the ❓ alone.
  on('tool.call', async ($, e, next) => {
    const ran = await next(e)
    const id = e.tool_use_id ?? ''
    asking.delete(id)
    const failed = ran.deny === undefined && ran.isError === true
    if (!e.agentId && failed !== hasFailed) {
      hasFailed = failed
      void drawBar($)
    }
    void answered($, id)
    return ran
  }).catch(($, e, next) => next(e))

  on('tool.check', async ($, e, next) => {
    const r = await next(e)
    if (r.decision === 'ask' && e.tool_use_id) void watchForDialog($, e.tool_use_id, `Claude needs your permission to use ${e.tool}`).catch(() => {})
    return r
  }).catch(($, e, next) => next(e))

  on('turn.complete', async ($, e, next) => {
    if (e.agentId) return next(e)
    isRunning = false
    isWaiting = false
    waitingOn.clear()
    void Promise.all([drawTitle($), drawBar($), setStatus($, 'idle').catch(() => {})])
    const now = Date.now()
    if (cfg.tabTitle && now - titledAt >= cfg.titleMinutes * 60_000) {
      titledAt = now
      void retitle($, e.answer).catch(() => {})
    }
    return next(e)
  })
}

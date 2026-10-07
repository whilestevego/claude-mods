// Ghostty's escape sequences, and the small decisions around them. Pure: register.ts writes the bytes.

const ESC = '\x1b'
const BEL = '\x07'

/** Strips control characters, so text from the model or a tool can't smuggle in escape sequences. */
export function safe(text: string): string {
  return text.replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ').replace(/\s+/g, ' ').trim()
}

/** OSC 2: the tab title. */
export const title = (text: string) => `${ESC}]2;${safe(text)}${BEL}`

/** OSC 9;4 states, as Ghostty draws them on the tab. */
export const Progress = { hide: 0, value: 1, error: 2, busy: 3, paused: 4 } as const

/** OSC 9;4: the tab's progress bar. `percent` matters for `value` (and colors `error`/`paused` when given). */
export function progress(state: number, percent?: number): string {
  const p = percent === undefined ? '' : `;${Math.max(0, Math.min(100, Math.round(percent)))}`
  return `${ESC}]9;4;${state}${p}${BEL}`
}

/** OSC 777: a desktop notification. `;` separates fields there, so it can't appear inside one. */
export function notify(heading: string, body: string): string {
  const field = (s: string) => safe(s).replace(/;/g, ',')
  return `${ESC}]777;notify;${field(heading)};${field(body)}${BEL}`
}

/** The tab title: the session's summary, with ❓ in front while Claude waits on you. */
export function tabTitle(summary: string, isWaiting: boolean): string {
  return `${isWaiting ? '❓' : '✳'} ${summary || 'Claude Code'}`
}

export type Todo = { status: 'pending' | 'in_progress' | 'completed' }

/** How far along Claude's todo list is, or undefined without one (an indeterminate bar then). */
export function percentDone(todos: readonly Todo[]): number | undefined {
  if (todos.length === 0) return undefined
  return (todos.filter(t => t.status === 'completed').length / todos.length) * 100
}

/** The bar for a running turn: red after a failed tool call, else the todo list's progress, else busy. */
export function runningBar(todos: readonly Todo[], hasFailed: boolean): string {
  const pct = percentDone(todos)
  if (hasFailed) return progress(Progress.error, pct ?? 100)
  return pct === undefined ? progress(Progress.busy) : progress(Progress.value, pct)
}

/** Whether to post a notification when Claude waits on you: never twice, and not when the voice mod will say it. */
export function shouldNotify(setting: string, voiceSpeaksIt: boolean): boolean {
  return setting === 'always' || (setting === 'auto' && !voiceSpeaksIt)
}

// ─── Mode tint ───────────────────────────────────────────────────────────────

export type Mode = 'default' | 'acceptEdits' | 'plan' | 'auto' | 'dontAsk' | 'bypassPermissions'

/** What each mode tints the background toward; default mode keeps your own background. */
export const TINTS: Record<Mode, string | null> = {
  default: null,
  plan: '#3b82f6', // blue: reading and planning, nothing changes
  acceptEdits: '#f59e0b', // amber: edits land without asking
  auto: '#a855f7', // purple: a classifier decides
  dontAsk: '#14b8a6', // teal: unapproved tools are denied
  bypassPermissions: '#ef4444', // red: nothing asks
}

/** The mode Claude Code's hint line names ("⏵⏵ accept edits on"), or undefined when it names none. */
export function modeFromHint(hint: string): Mode | undefined {
  const h = hint.toLowerCase()
  if (h.includes('bypass permissions')) return 'bypassPermissions'
  if (h.includes('accept edits')) return 'acceptEdits'
  if (h.includes('plan mode')) return 'plan'
  if (h.includes('auto mode')) return 'auto'
  if (h.includes("don't ask") || h.includes('dont ask')) return 'dontAsk'
  return undefined
}

export function asMode(value: string | undefined): Mode | undefined {
  return value && value in TINTS ? (value as Mode) : undefined
}

const hex = (n: number) => Math.round(Math.max(0, Math.min(255, n))).toString(16).padStart(2, '0')

/** `base` moved `percent`% of the way toward `toward`, as #rrggbb; undefined for anything unparsable. */
export function mix(base: string, toward: string, percent: number): string | undefined {
  const rgb = (c: string) => (/^#?([0-9a-f]{6})$/i.exec(c.trim())?.[1]?.match(/../g) ?? []).map(x => parseInt(x, 16))
  const [a, b] = [rgb(base), rgb(toward)]
  if (a.length !== 3 || b.length !== 3) return undefined
  const t = Math.max(0, Math.min(100, percent)) / 100
  return `#${a.map((v, i) => hex(v + (b[i]! - v) * t)).join('')}`
}

/** OSC 11 sets this terminal's background; OSC 111 puts back the configured one. */
export const background = (color: string) => `${ESC}]11;${color}${BEL}`
export const resetBackground = `${ESC}]111${BEL}`

/** The sequence for a mode: a tint of `base`, or the reset for default mode. */
export function tintSequence(mode: Mode, base: string, percent: number): string {
  const toward = TINTS[mode]
  const color = toward ? mix(base, toward, percent) : undefined
  return color ? background(color) : resetBackground
}

/** Ghostty's background from `ghostty +show-config` output: your setting, else the default's. */
export function backgroundFrom(config: string, defaults: string): string {
  const pick = (text: string) => /^background\s*=\s*(#?[0-9a-f]{6})\s*$/im.exec(text)?.[1]
  const c = pick(config) ?? pick(defaults) ?? '#282c34'
  return c.startsWith('#') ? c : `#${c}`
}

// ─── /goto ───────────────────────────────────────────────────────────────────

export type Session = { id: string; tty: string; title: string; folder: string; isMe: boolean }

/**
 * Ghostty's terminals ("id\ttty\ttitle\tfolder" lines) that run Claude (by tty, from `ps`).
 * Splits of one tab running Claude are separate sessions; a tab without Claude isn't one.
 */
export function claudeSessions(terminals: string, claudeTtys: ReadonlySet<string>, myTty: string): Session[] {
  return terminals
    .split('\n')
    .map(line => line.split('\t'))
    .filter(f => f.length >= 4 && claudeTtys.has(f[1]!))
    .map(([id, tty, title, folder]) => ({ id: id!, tty: tty!, title: safe(title!), folder: folder!, isMe: tty === myTty }))
}

/** The sessions `/goto <query>` means: a number from the list, or text in the title or folder. */
export function matchSessions(sessions: readonly Session[], query: string): Session[] {
  const q = query.trim().toLowerCase()
  if (!q) return []
  const n = Number(q)
  if (Number.isInteger(n) && n >= 1 && n <= sessions.length) return [sessions[n - 1]!]
  return sessions.filter(s => s.title.toLowerCase().includes(q) || s.folder.toLowerCase().includes(q))
}

/** "~/work/brilliant" for display. */
export function shortFolder(folder: string, home: string): string {
  return home && folder.startsWith(home) ? `~${folder.slice(home.length)}` : folder
}

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

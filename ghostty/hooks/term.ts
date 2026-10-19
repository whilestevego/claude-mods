// Ghostty's escape sequences and actions, and the small decisions around them. Pure: register.ts sends them.

const ESC = '\x1b'
const BEL = '\x07'

/** Strips control characters, so text from the model or a tool can't smuggle in escape sequences. */
export function safe(text: string): string {
  return text.replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ').replace(/\s+/g, ' ').trim()
}

/** Ghostty's set_surface_title action, sent over AppleScript so no bytes race Claude's own drawing on the tty. */
export const titleAction = (text: string) => `set_surface_title:${safe(text)}`

/** OSC 9;4 states, as Ghostty draws them on the tab. */
export const Progress = { hide: 0, value: 1, error: 2, busy: 3, paused: 4 } as const

/** OSC 9;4: the tab's progress bar. `percent` matters for `value` (and colors `error`/`paused` when given). */
export function progress(state: number, percent?: number): string {
  const p = percent === undefined ? '' : `;${Math.max(0, Math.min(100, Math.round(percent)))}`
  return `${ESC}]9;4;${state}${p}${BEL}`
}

/** The tab title: the session's summary, with ❓ in front while Claude waits on you. */
export function tabTitle(summary: string, isWaiting: boolean): string {
  return `${isWaiting ? '❓' : '✳'} ${summary || 'Claude Code'}`
}

/** The bar for a running turn: red after a failed tool call, else busy. */
export function runningBar(hasFailed: boolean): string {
  return hasFailed ? progress(Progress.error, 100) : progress(Progress.busy)
}

/** Whether to post a notification when Claude waits on you: never twice, and not when the say mod will speak it. */
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

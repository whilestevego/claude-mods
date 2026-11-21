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

// Workspaces: a Ghostty window's tabs of Claude sessions and shells, saved and reopened.

import { safe } from './term'
import { bare } from './title'

/** A Claude tab resumes its conversation (or the folder's latest, without a known ID); a shell just opens there. */
export type Pane = { kind: 'claude'; cwd: string; title: string; sessionId?: string } | { kind: 'shell'; cwd: string; title: string }

/** Each tab's panes in order: the first is the tab, the rest its splits. */
export type Workspace = { name: string; savedAt: number; tabs: Pane[][] }

/**
 * The window's terminals ("tab index<TAB>tty<TAB>folder<TAB>title" lines, in order) as tabs of panes.
 * A pane is Claude when Claude runs on its tty (`claudePids`: tty → Claude's process ID); its conversation
 * is the one Claude Code records for that process (`conversations`: pid → session ID).
 */
export function fromWindow(
  lines: string,
  claudePids: ReadonlyMap<string, string>,
  conversations: ReadonlyMap<string, string>,
): Pane[][] {
  const tabs = new Map<string, Pane[]>()
  for (const line of lines.split('\n')) {
    const [tab, tty, cwd, title] = line.split('\t')
    if (!tab || !tty || cwd === undefined) continue
    const name = bare(safe(title ?? ''))
    const pid = claudePids.get(tty)
    const pane: Pane = pid
      ? { kind: 'claude', cwd, title: name, sessionId: conversations.get(pid) }
      : { kind: 'shell', cwd, title: name }
    tabs.set(tab, [...(tabs.get(tab) ?? []), pane])
  }
  return [...tabs.values()]
}

/** `ps` lines ("/dev/ttys004 36583") → tty → Claude's process ID. */
export function claudePidsFrom(ps: string): Map<string, string> {
  return new Map(ps.split('\n').map(l => l.trim().split(/\s+/)).filter(f => f.length === 2).map(([tty, pid]) => [tty!, pid!]))
}

/** Claude Code's own record of a running session (~/.claude/sessions/<pid>.json) → its conversation ID. */
export function conversationOf(record: string): string | undefined {
  try {
    const id = (JSON.parse(record) as { sessionId?: unknown }).sessionId
    return typeof id === 'string' ? id : undefined
  } catch {
    return undefined
  }
}

/** The conversations a workspace resumes. */
export function conversationsIn(ws: Pick<Workspace, 'tabs'>): Set<string> {
  return new Set(ws.tabs.flat().flatMap(p => (p.kind === 'claude' && p.sessionId ? [p.sessionId] : [])))
}

/**
 * The saved workspace this window is (at least half the same conversations), so saving it again,
 * or closing it, updates that one instead of making a near-duplicate under a new name.
 */
export function sameWorkspace<T extends Pick<Workspace, 'tabs'>>(tabs: Pane[][], saved: readonly T[]): T | undefined {
  const mine = conversationsIn({ tabs })
  if (mine.size === 0) return undefined
  let best: T | undefined
  let bestShare = 0.5
  for (const ws of saved) {
    const theirs = conversationsIn(ws)
    const shared = [...mine].filter(id => theirs.has(id)).length
    const share = shared / Math.max(mine.size, theirs.size)
    if (share >= bestShare) [best, bestShare] = [ws, share]
  }
  return best
}

/** The terminals `/workspace close` exits and closes: every Claude pane but this session's own. */
export function closable(lines: string, claudePids: ReadonlyMap<string, string>, myTty: string): Array<{ id: string; tty: string; pid: string }> {
  return lines
    .split('\n')
    .map(l => l.split('\t'))
    .filter(f => f.length >= 5 && f[1] !== myTty && claudePids.has(f[1]!))
    .map(f => ({ id: f[4]!, tty: f[1]!, pid: claudePids.get(f[1]!)! }))
}

/** "Brilliant Admin Work" → "brilliant-admin-work": the file name. */
export function slug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'workspace'
}

export function namePrompt(tabs: readonly Pane[][]): string {
  const rows = tabs.flat().map(p => `- ${p.title || '(untitled)'} in ${p.cwd}`)
  return [
    'These terminal tabs are being saved as a workspace. Name it in 2 to 4 words, Title Case,',
    'after the work they share (a project or a task). Reply with the name only.',
    '',
    ...rows.slice(0, 30),
  ].join('\n')
}

/** The model's reply as a name; empty when unusable. */
export function cleanName(reply: string): string {
  const name = safe(reply).replace(/["'`*_#.:]/g, '').trim()
  return name.length >= 2 && name.length <= 48 ? name : ''
}

/** An AppleScript string literal. */
const str = (s: string) => `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`

/** The command a pane starts with: resume its conversation, or a new session when it isn't known. */
export function startCommand(p: Pane): string | undefined {
  if (p.kind === 'shell') return undefined
  return p.sessionId && /^[0-9a-f-]{8,64}$/i.test(p.sessionId) ? `claude --resume ${p.sessionId}` : 'claude'
}

/**
 * AppleScript that recreates the workspace in a new window. Commands are typed into each pane's shell
 * (initial input), so they run with your normal PATH and environment.
 */
export function openScript(ws: Workspace): string {
  const out = ['tell application "Ghostty"']
  let n = 0
  const config = (p: Pane) => {
    const c = `c${++n}`
    out.push(`  set ${c} to new surface configuration`)
    out.push(`  set initial working directory of ${c} to ${str(p.cwd)}`)
    const cmd = startCommand(p)
    if (cmd) out.push(`  set initial input of ${c} to ${str(cmd)} & linefeed`)
    return c
  }
  ws.tabs.forEach((panes, i) => {
    const [first, ...splits] = panes
    if (!first) return
    const c = config(first)
    if (i === 0) {
      out.push(`  set w to new window with configuration ${c}`)
      out.push('  set t to focused terminal of selected tab of w')
    } else {
      out.push(`  set tb to new tab in w with configuration ${c}`)
      out.push('  set t to focused terminal of tb')
    }
    for (const p of splits) out.push(`  set t to split t direction right with configuration ${config(p)}`)
  })
  out.push('  activate window w', 'end tell')
  return out.join('\n')
}

/** "3 tabs · 2 Claude" for the picker. */
export function summary(ws: Workspace): string {
  const claude = ws.tabs.flat().filter(p => p.kind === 'claude').length
  return `${ws.tabs.length} tab${ws.tabs.length === 1 ? '' : 's'} · ${claude} Claude`
}

export function parseWorkspace(text: string): Workspace | undefined {
  try {
    const w = JSON.parse(text) as Workspace
    return typeof w.name === 'string' && Array.isArray(w.tabs) ? w : undefined
  } catch {
    return undefined
  }
}

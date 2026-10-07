// Workspaces: a Ghostty window's tabs of Claude sessions and shells, saved and reopened.

import type { Entry } from './registry'
import { safe } from './term'

/** A Claude tab resumes its conversation (or the folder's latest, without a known ID); a shell just opens there. */
export type Pane = { kind: 'claude'; cwd: string; title: string; sessionId?: string } | { kind: 'shell'; cwd: string; title: string }

/** Each tab's panes in order: the first is the tab, the rest its splits. */
export type Workspace = { name: string; savedAt: number; tabs: Pane[][] }

/**
 * The window's terminals ("tab index<TAB>tty<TAB>folder<TAB>title" lines, in order) as tabs of panes.
 * A pane is Claude when Claude runs on its tty; its conversation comes from that session's status file.
 */
export function fromWindow(lines: string, claudeTtys: ReadonlySet<string>, entries: ReadonlyMap<string, Entry>): Pane[][] {
  const tabs = new Map<string, Pane[]>()
  for (const line of lines.split('\n')) {
    const [tab, tty, cwd, title] = line.split('\t')
    if (!tab || !tty || cwd === undefined) continue
    const name = safe(title ?? '')
    const pane: Pane = claudeTtys.has(tty)
      ? { kind: 'claude', cwd, title: name, sessionId: entries.get(tty)?.sessionId }
      : { kind: 'shell', cwd, title: name }
    tabs.set(tab, [...(tabs.get(tab) ?? []), pane])
  }
  return [...tabs.values()]
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

/** The command a pane starts with: resume its conversation, or the folder's most recent one. */
export function startCommand(p: Pane): string | undefined {
  if (p.kind === 'shell') return undefined
  return p.sessionId && /^[0-9a-f-]{8,64}$/i.test(p.sessionId) ? `claude --resume ${p.sessionId}` : 'claude --continue'
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

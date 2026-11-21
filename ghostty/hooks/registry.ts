// Each Claude session's status in its own small file, so /workspace close can tell which sessions are busy.

export type Status = 'idle' | 'working' | 'waiting'

/** One session's file: `<dir>/<tty name>.json`, written only by that session. */
export type Entry = { tty: string; pid: string; sessionId: string; cwd: string; status: Status; since: number }

export function parseEntry(text: string): Entry | undefined {
  try {
    const e = JSON.parse(text) as Partial<Entry>
    return typeof e.tty === 'string' && typeof e.status === 'string' ? (e as Entry) : undefined
  } catch {
    return undefined
  }
}

/**
 * Claude Code's own record of a running session (~/.claude/sessions/<pid>.json) says a permission dialog is up.
 * Only the dialog sets it: auto mode's checker approves a call that asks without one.
 */
export function asksPermission(record: string): boolean {
  try {
    const r = JSON.parse(record) as { status?: unknown; waitingFor?: unknown }
    return r.status === 'waiting' && typeof r.waitingFor === 'string' && /permission/i.test(r.waitingFor)
  } catch {
    return false
  }
}

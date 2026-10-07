// Each Claude session's status in its own small file, so /goto can rank sessions and /workspace can resume them.

import type { Session } from './term'

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

export type Ranked = Session & { status: Status; since?: number }

const ORDER: Record<Status, number> = { waiting: 0, working: 1, idle: 2 }

/** Waiting on you first (longest wait first), then working, then idle; this session last. */
export function rank(sessions: readonly Session[], entries: ReadonlyMap<string, Entry>): Ranked[] {
  return sessions
    .map(s => {
      const e = entries.get(s.tty)
      return { ...s, status: e?.status ?? 'idle', since: e?.since }
    })
    .sort((a, b) => Number(a.isMe) - Number(b.isMe) || ORDER[a.status] - ORDER[b.status] || (a.since ?? 0) - (b.since ?? 0))
}

/** "45s", "4m", "1h 5m". */
export function ago(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000))
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  return m < 60 ? `${m}m` : `${Math.floor(m / 60)}h ${m % 60}m`
}

/** The picker row's lead: ❓ and the wait, ⏳ while working, nothing when idle. */
export function badge(r: Ranked, now: number): string {
  if (r.status === 'waiting') return `❓ ${r.since ? ago(now - r.since) : ''}`.trim()
  return r.status === 'working' ? '⏳' : ''
}

/** The other session waiting on you longest, for `/goto next`. */
export function nextWaiting(ranked: readonly Ranked[]): Ranked | undefined {
  return ranked.find(r => !r.isMe && r.status === 'waiting')
}

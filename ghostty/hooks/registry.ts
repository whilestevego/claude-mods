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

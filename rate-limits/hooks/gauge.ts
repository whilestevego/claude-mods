import type { Window } from '../types'

export const WARN_AT = 90

export function label(kind: string): string {
  return ({ five_hour: '5h', seven_day: 'week', spend_limit: 'spend' } as Record<string, string>)[kind] ?? kind
}

export function color(percent: number): string {
  return percent >= WARN_AT ? 'red' : percent >= 70 ? 'yellow' : 'green'
}

export function meter(percent: number, width = 10): string {
  const filled = Math.min(width, Math.max(0, Math.round((percent / 100) * width)))
  return '▰'.repeat(filled) + '▱'.repeat(width - filled)
}

// "3:10 PM" for a reset within a day, "Mon 9 AM" beyond that.
export function resets(iso: string | undefined, now: number): string {
  if (!iso) return ''
  const at = new Date(iso)
  const isSoon = at.getTime() - now < 24 * 3600 * 1000
  return at.toLocaleString([], isSoon ? { hour: 'numeric', minute: '2-digit' } : { weekday: 'short', hour: 'numeric' })
}

// The window keys that just crossed WARN_AT and haven't been warned about since they last reset.
export function toWarn(windows: readonly Window[], warned: readonly string[]): string[] {
  return windows
    .filter(w => w.percentUsed >= WARN_AT)
    .map(w => `${w.kind}@${w.resetsAt ?? ''}`)
    .filter(k => !warned.includes(k))
}

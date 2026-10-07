import type { Receipt } from '../types'

// The tail after the engine's "✻ Baked for 42s · done 10:21 PM".
export function tail(r: Receipt): string {
  const parts = [`${r.tools} tool${r.tools === 1 ? '' : 's'}`]
  if (r.files.length) parts.push(`${r.files.length} file${r.files.length === 1 ? '' : 's'} edited: ${r.files.map(f => f.split('/').pop()).join(', ')}`)
  if (r.tokensIn != null && r.tokensOut != null) // != also skips receipts saved before tokens existed
    parts.push(`${kTokens(r.tokensIn)} in / ${kTokens(r.tokensOut)} out`)
  if (r.usd !== null) parts.push(`$${r.usd.toFixed(2)}`)
  return ` · ${parts.join(' · ')}`
}

export function kTokens(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : `${n}`
}

export function duration(ms: number): string {
  const s = Math.round(ms / 1000)
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`
}

// The engine's "✻ Baked for 42s · done 10:21 PM", then the receipt.
export function fullLine(word: string, r: Receipt): string {
  const done = new Date(r.doneAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  return `✻ ${word} for ${duration(r.ms)} · done ${done}${tail(r)}`
}

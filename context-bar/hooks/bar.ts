import type { Segment } from '../types'

// Cumulative rounding: cell counts always sum to exactly `width`.
export function cells(segments: readonly Segment[], width: number): number[] {
  const total = segments.reduce((sum, s) => sum + s.tokens, 0)
  if (total <= 0 || width <= 0) return segments.map(() => 0)
  let cumulative = 0
  let drawn = 0
  return segments.map(s => {
    cumulative += s.tokens
    const edge = Math.round((cumulative / total) * width)
    const count = edge - drawn
    drawn = edge
    return count
  })
}

export function kTokens(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : `${n}`
}

// Shorter legend names; "System prompt" → "Sys. prompt", "System tools" → "Sys. tools".
export function shortName(name: string): string {
  return ({ 'MCP server instructions': 'MCP', 'Memory files': 'Memory' } as Record<string, string>)[name] ?? name.replace(/^System\b/, 'Sys.')
}

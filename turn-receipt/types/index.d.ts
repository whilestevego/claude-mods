/** `tldr`: the turn's one-line summary, added when Claude Haiku answers. */
export type Receipt = { ms: number; tools: number; files: string[]; usd: number | null; isAborted: boolean; doneAt: number; tokensIn: number | null; tokensOut: number | null; tldr?: string }

/** This turn's TL;DR; empty `text` when the reply was too short for one. The notify mod reads it. */
export type TldrLine = { turnId: string; text: string }

declare module 'claude-code' {
  interface PluginState {
    // Keyed by the turn's durationMs: the one thing the end-of-turn line shares with turn.complete.
    'turn-receipt': { byDuration: Record<string, Receipt>; line: TldrLine | null }
  }
}

export type Receipt = { ms: number; tools: number; files: string[]; usd: number | null; isAborted: boolean; doneAt: number; tokensIn: number | null; tokensOut: number | null }

declare module 'claude-code' {
  interface PluginState {
    // Keyed by the turn's durationMs: the one thing the end-of-turn line shares with turn.complete.
    'turn-receipt': { byDuration: Record<string, Receipt> }
  }
}

/** This turn's TL;DR; empty `text` when the reply was too short for one. Other mods (voice) read it. */
export type TldrLine = { turnId: string; text: string }

/** Each turn's TL;DR keyed by its duration in ms, the one thing the turn's closing line shares with turn.complete. */
export type TldrByDuration = Record<string, string>

declare module 'claude-code' {
  interface PluginState {
    tldr: { line: TldrLine | null; byDuration: TldrByDuration }
  }
}

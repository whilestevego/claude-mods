/** This turn's TL;DR; empty `text` when the reply was too short for one. Other mods (voice) read it. */
export type TldrLine = { turnId: string; text: string }

declare module 'claude-code' {
  interface PluginState {
    tldr: { line: TldrLine | null }
  }
}

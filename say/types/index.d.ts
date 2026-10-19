/** /say hush, for this session. */
export type SayMuted = boolean

declare module 'claude-code' {
  interface PluginState {
    say: { muted: SayMuted }
  }
}

export type Copied = boolean

declare module 'claude-code' {
  interface PluginState {
    'session-id': { copied: Copied }
  }
}

export type Copied = '' | 'name' | 'id'

declare module 'claude-code' {
  interface PluginState {
    'session-id': { copied: Copied }
  }
}

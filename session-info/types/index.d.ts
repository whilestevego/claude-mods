export type Copied = '' | 'name' | 'id' | 'worktree'

declare module 'claude-code' {
  interface PluginState {
    'session-info': { copied: Copied }
  }
}

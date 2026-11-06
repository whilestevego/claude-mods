export type Copied = boolean

declare module 'claude-code' {
  interface PluginState {
    'worktree-name': { copied: Copied }
  }
}

/** One saved workspace as the /workspace picker lists it. */
export type WorkspaceRow = { file: string; name: string; summary: string; savedAt: number }

declare module 'claude-code' {
  interface PluginState {
    ghostty: { workspaces: WorkspaceRow[] }
  }
}

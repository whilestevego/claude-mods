
/** One saved workspace as the /workspace picker lists it. */
export type WorkspaceRow = { file: string; name: string; summary: string; savedAt: number }


/** The ghostty mod's answers, for other mods (notify). */
export type Ghostty = {
  /** Ghostty is the frontmost app and has this session's terminal focused. False outside Ghostty. */
  isFocused: () => Promise<boolean>
}

declare module 'claude-code' {
  interface EngineInterface {
    ghostty: Ghostty
  }
  interface PluginState {
    ghostty: { workspaces: WorkspaceRow[] }
  }
}

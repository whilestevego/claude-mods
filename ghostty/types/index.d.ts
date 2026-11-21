
/** One saved workspace as the /workspace picker lists it. */
export type WorkspaceRow = { file: string; name: string; summary: string; savedAt: number }


/** The ghostty mod's answers, for other mods (notify). */
export type Ghostty = {
  /** Ghostty is the frontmost app and has this session's terminal focused. False outside Ghostty. */
  isFocused: () => Promise<boolean>
  /** A shell command that brings you back to this terminal, such as for a click on a notification. Empty outside Ghostty. */
  showCommand: () => Promise<string>
}

declare module 'claude-code' {
  interface EngineInterface {
    ghostty: Ghostty
  }
  interface PluginState {
    ghostty: { workspaces: WorkspaceRow[] }
  }
}

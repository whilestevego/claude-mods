
/** One saved workspace as the /workspace picker lists it. */
export type WorkspaceRow = { file: string; name: string; summary: string; savedAt: number }

/** The ghostty mod's answers about Ghostty, for other mods (notify). */
export type Ghostty = {
  /** This session's terminal is the one in front of you: Ghostty is the frontmost app and has it focused. */
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

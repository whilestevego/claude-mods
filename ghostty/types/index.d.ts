
/** One saved workspace as the /workspace picker lists it. */
export type WorkspaceRow = { file: string; name: string; summary: string; savedAt: number }

/** The terminal mod's answers about the terminal, for other mods (notify). */
export type Terminal = {
  /** This session's terminal is the one in front of you: Ghostty is the frontmost app and has it focused. */
  isFocused: () => Promise<boolean>
}

declare module 'claude-code' {
  interface EngineInterface {
    terminal: Terminal
  }
  interface PluginState {
    ghostty: { workspaces: WorkspaceRow[] }
  }
}

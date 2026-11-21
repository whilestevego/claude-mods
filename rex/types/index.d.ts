/** The rex mod's answers, for other mods (notify). */
export type Rex = {
  /** Rex is in front, on this session, with this pane focused in the active tab. False outside Rex. */
  isFocused: () => Promise<boolean>
  /** A shell command that brings you back to this pane, such as for a click on a notification. Empty outside Rex. */
  showCommand: () => Promise<string>
}

declare module 'claude-code' {
  interface EngineInterface {
    rex: Rex
  }
}

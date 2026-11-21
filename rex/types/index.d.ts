/** The rex mod's answers, for other mods (notify). */
export type Rex = {
  /** Rex is in front, on this session, with this pane focused in the active tab. False outside Rex. */
  isFocused: () => Promise<boolean>
}

declare module 'claude-code' {
  interface EngineInterface {
    rex: Rex
  }
}

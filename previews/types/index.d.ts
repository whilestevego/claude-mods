/** The ToolUse row whose preview the pointer is over, or null. */
export type ShownPreview = string | null

declare module 'claude-code' {
  interface PluginState {
    previews: { shown: ShownPreview }
  }
}

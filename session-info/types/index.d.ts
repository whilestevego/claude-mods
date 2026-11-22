export type Copied = '' | 'name' | 'id' | 'worktree'

/** session-info's answers, for other mods (ghostty, rex, notify, say). */
export type SessionInfoNoun = {
  /** Claude's own process: its pid, and its tty such as `/dev/ttys004`. Empty strings when neither is found. */
  process: () => Promise<{ pid: string; tty: string }>
  /** A new 4-word title from the transcript, saved for this conversation. `answer`: the reply that just ended. '' when there's nothing to summarize. */
  newTitle: (args: { answer?: string }) => Promise<string>
  /** The title saved for a conversation, this one when `sessionId` is left out. '' when there's none. */
  savedTitle: (args: { sessionId?: string }) => Promise<string>
  /** Saves `title` for a conversation, such as one a workspace reopens. */
  saveTitle: (args: { sessionId: string; title: string }) => Promise<void>
  /** True once Claude Code's permission dialog is up for call `id`; false once the call ran or was refused, or after 10 minutes. */
  dialogFor: (args: { id: string }) => Promise<boolean>
}

declare module 'claude-code' {
  interface EngineInterface {
    sessionInfo: SessionInfoNoun
  }
  interface PluginState {
    'session-info': { copied: Copied }
  }
}

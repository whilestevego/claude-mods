/** /say hush, for this session. */
export type VoiceMuted = boolean

/** `$.voice.say`'s argument: one line to speak in this session's voice. */
export type VoiceSay = { text: string }

/** Whether it reached the speakers: false while /say hush mutes this session, or when murmur failed. */
export type VoiceSaid = { isSpoken: boolean }

/** The say mod's voice, for other mods (notify) to speak through. */
export type Voice = { say: (input: VoiceSay) => Promise<VoiceSaid> }

declare module 'claude-code' {
  interface EngineInterface {
    voice: Voice
  }
  interface PluginState {
    say: { muted: VoiceMuted }
  }
}

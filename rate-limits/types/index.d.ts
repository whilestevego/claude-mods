export type Window = { kind: string; percentUsed: number; resetsAt?: string }

declare module 'claude-code' {
  interface PluginState {
    'rate-limits': { windows: Window[]; warned: string[] }
  }
}

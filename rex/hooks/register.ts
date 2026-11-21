import type { EngineInterface, Register } from 'claude-code'
// The contract this mod answers, $.terminal.isFocused, is declared with the ghostty mod's.
import type {} from '../../ghostty/types'

/** Rex's CLI and this session's pane, set at session start; empty outside Rex. */
const rex = { bin: '', session: '', block: '' }

const FRONT = `tell application "Rex" to return (frontmost as text) & tab & (id of current session)`

/**
 * `front`: Rex's frontmost flag and current session ("true\t<host>/session:…"). `view`: `rex session inspect --json`.
 * Rex's current session is the one in the Rex window you used last, so with several Rex windows this can be wrong.
 */
export function isShown(front: string, view: string, session: string, block: string): boolean {
  const [isFront, current = ''] = front.trim().split('\t')
  if (isFront !== 'true' || !current.endsWith(`/${session}`)) return false
  try {
    const v = JSON.parse(view) as { active_window_id?: string; windows?: { window_id: string; focused_block_id?: string }[] }
    return v.windows?.some(w => w.window_id === v.active_window_id && w.focused_block_id === block) ?? false
  } catch {
    return false
  }
}

async function isFocused($: EngineInterface): Promise<boolean> {
  const front = await $.process.run(['osascript', '-e', FRONT])
  if (front.exitCode !== 0 || !front.stdout.startsWith('true')) return false
  const view = await $.process.run([rex.bin, 'session', 'inspect', rex.session, '--json'])
  return view.exitCode === 0 && isShown(front.stdout, view.stdout, rex.session, rex.block)
}

export const register: Register = on => {
  on('engine.create', async (_$, e, next) => ({ ...(await next(e)), terminal: { isFocused: async () => false } }))

  on('terminal.isFocused', async ($, e, next) => (rex.block ? { value: await isFocused($).catch(() => false) } : next(e)))

  on('session.start', async ($, e, next) => {
    const bin = await $.env.get('REX_BIN_DIR')
    if (((await $.env.get('TERM_PROGRAM')) ?? '').toLowerCase() === 'rex' && bin) {
      Object.assign(rex, { bin: `${bin}/rex`, session: (await $.env.get('REX_SESSION')) ?? '', block: (await $.env.get('REX_BLOCK')) ?? '' })
    }
    return next(e)
  })
}

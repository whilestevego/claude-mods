import type { EngineInterface, PluginOptions, Register } from 'claude-code'
import type {} from '../types'
// session-info's contract: this mod asks it for the tab titles.
import type {} from '../../session-info/types'

type Config = { tabTitle: boolean; titleMinutes: number }

function config(o: PluginOptions): Config {
  return {
    tabTitle: o.tabTitle !== false,
    titleMinutes: typeof o.titleMinutes === 'number' && o.titleMinutes > 0 ? o.titleMinutes : 3,
  }
}

let cfg: Config
let titledAt = 0

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

type View = { active_window_id?: string; windows?: { window_id: string; focused_block_id?: string; layers?: { blocks?: { block_id: string }[] }[] }[] }

/** The tab (window) that holds `block`, from `rex session inspect --json`. */
export function windowOf(view: string, block: string): string | undefined {
  try {
    return (JSON.parse(view) as View).windows?.find(w => w.layers?.some(l => l.blocks?.some(b => b.block_id === block)))?.window_id
  } catch {
    return undefined
  }
}

/** The Rex Mac apps attached to the session, from `rex session inspect --json`. */
export function appClients(view: string): string[] {
  try {
    const v = JSON.parse(view) as { clients?: { client_id: string; info?: { kind?: string; platform?: string } }[] }
    return (v.clients ?? []).filter(c => c.info?.kind === 'app' && c.info.platform === 'macos').map(c => c.client_id)
  } catch {
    return []
  }
}

const quote = (s: string) => `'${s.replaceAll("'", `'\\''`)}'`

/**
 * The command that shows `block`. `rex focus` moves only the server's focus, so each Mac app must also select the tab,
 * with session.select (it needs Remote Control). A client ID is fixed at post time: after Rex restarts, only `activate` works.
 */
export function showCommand(bin: string, session: string, block: string, window: string | undefined, clients: string[]): string {
  const rex = quote(bin)
  const select = window ? clients.map(c => `${rex} -C ${quote(c)} do session.select ${quote(`session_id=${session}`)} ${quote(`window_id=${window}`)}`) : []
  return [`${rex} focus -s ${quote(session)} ${quote(block)}`, ...select, `osascript -e 'tell application "Rex" to activate'`].join('; ')
}

async function isFocused($: EngineInterface): Promise<boolean> {
  const front = await $.process.run(['osascript', '-e', FRONT])
  if (front.exitCode !== 0 || !front.stdout.startsWith('true')) return false
  const view = await $.process.run([rex.bin, 'session', 'inspect', rex.session, '--json'])
  return view.exitCode === 0 && isShown(front.stdout, view.stdout, rex.session, rex.block)
}

// ─── Tab title ───────────────────────────────────────────────────────────────

/** Names this pane's tab. A tab label is not the terminal title, so Claude Code's own title never overwrites it. */
async function label($: EngineInterface, words: string) {
  const view = await $.process.run([rex.bin, 'session', 'inspect', rex.session, '--json'])
  const window = view.exitCode === 0 ? windowOf(view.stdout, rex.block) : undefined
  if (window) await $.process.run([rex.bin, 'window', 'rename', '-s', rex.session, window, words])
}

/** A new title from the transcript, which session-info saves for the conversation. `answer`: the reply that just ended. */
async function retitle($: EngineInterface, answer?: string): Promise<string> {
  const words = await $.sessionInfo.newTitle({ answer })
  if (words) await label($, words)
  return words
}

/** The title this conversation had, or a new one when it has history but no title yet. */
async function restoreTitle($: EngineInterface) {
  const saved = await $.sessionInfo.savedTitle({})
  titledAt = Date.now()
  if (saved) await label($, saved)
  else await retitle($)
}

export const register: Register = (on, options) => {
  cfg = config(options)

  // $.rex.isFocused and $.rex.showCommand, for notify. False and empty outside Rex.
  on('engine.create', async (_$, e, next) => ({ ...(await next(e)), rex: { isFocused: async () => false, showCommand: async () => '' } }))

  on('rex.isFocused', async $ => ({ value: rex.block !== '' && (await isFocused($).catch(() => false)) }))

  on('rex.showCommand', async $ => {
    if (!rex.block) return { value: '' }
    const view = await $.process.run([rex.bin, 'session', 'inspect', rex.session, '--json'])
    const json = view.exitCode === 0 ? view.stdout : ''
    return { value: showCommand(rex.bin, rex.session, rex.block, windowOf(json, rex.block), appClients(json)) }
  })

  on('session.start', async ($, e, next) => {
    const bin = await $.env.get('REX_BIN_DIR')
    if (((await $.env.get('TERM_PROGRAM')) ?? '').toLowerCase() === 'rex' && bin) {
      Object.assign(rex, { bin: `${bin}/rex`, session: (await $.env.get('REX_SESSION')) ?? '', block: (await $.env.get('REX_BLOCK')) ?? '' })
    }
    if (!rex.block || !cfg.tabTitle) return next(e)
    void restoreTitle($).catch(() => {})
    await $.command.register({ name: 'title', description: 'A new 4-word tab title for this session, now' })
    return next(e)
  })

  on('command.run', { command: 'title' }, async $ => {
    titledAt = Date.now()
    const words = await retitle($).catch(() => '')
    return { text: words ? `Tab title: ${words}` : 'Nothing to summarize yet: send a message first.' }
  })

  // /clear starts a new conversation in the same pane: its first title comes with the next finished turn.
  on('session.end', async ($, e, next) => {
    if (rex.block && cfg.tabTitle && e.reason === 'clear') {
      titledAt = 0
      await label($, 'Claude Code').catch(() => {})
    }
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    const now = Date.now()
    if (rex.block && cfg.tabTitle && !e.agentId && now - titledAt >= cfg.titleMinutes * 60_000) {
      titledAt = now
      void retitle($, e.answer).catch(() => {})
    }
    return next(e)
  })
}

import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'
import type { Copied } from '../types'
import { ask, clean, context } from './title'

// "<tty> <pid>" of Claude itself: the nearest ancestor named claude (the mods' own host process, between it and
// this shell, owns the tty too, and changes when mods reload). Without one, the nearest ancestor owning a tty.
// No API names Claude's tty or pid. Found once: the walk up the process tree costs a few `ps` runs.
const FIND_CLAUDE = `p=$$
first=
while [ "$p" -gt 1 ]; do
  t=$(ps -o tty= -p "$p" | tr -d ' ')
  case "$t" in ''|'?'|'??') ;; *) [ -z "$first" ] && first="/dev/$t $p"
    c=$(ps -o comm= -p "$p"); [ "\${c##*/}" = claude ] && { echo "/dev/$t $p"; exit; } ;;
  esac
  p=$(ps -o ppid= -p "$p" | tr -d ' ')
done
echo "$first"`

let claude: Promise<{ pid: string; tty: string }> | undefined
const processOf = ($: EngineInterface) =>
  (claude ??= $.process.run(['sh', '-c', FIND_CLAUDE])
    .then(r => {
      const [tty = '', pid = ''] = r.stdout.trim().split(' ')
      return { pid, tty }
    })
    .catch(() => ({ pid: '', tty: '' })))

const homeOf = async ($: EngineInterface) => (await $.env.get('HOME')) ?? ''

// Each conversation's tab title, so resuming it (in Ghostty or Rex, or from a workspace) puts the title back.
const titleDir = (home: string) => `${home}/Library/Caches/claude-titles`
const titleFile = (home: string, sessionId: string) => (home && /^[0-9a-f-]{8,64}$/i.test(sessionId) ? `${titleDir(home)}/${sessionId}` : undefined)

async function savedTitle($: EngineInterface, sessionId?: string) {
  const file = titleFile(await homeOf($), sessionId ?? (await $.session.id()))
  return file ? clean(await $.fs.read(file).catch(() => '')) : ''
}

async function saveTitle($: EngineInterface, sessionId: string, title: string) {
  const home = await homeOf($)
  const file = titleFile(home, sessionId)
  const words = clean(title)
  if (!file || !words) return
  await $.process.run(['mkdir', '-p', titleDir(home)])
  await $.fs.write(file, words)
}

async function newTitle($: EngineInterface, answer?: string) {
  const c = context(await $.session.messages())
  if (c.prompts.length === 0) return ''
  const r = await $.model.complete({ model: 'haiku', prompt: ask(c.prompts, answer ?? c.answer), maxTokens: 24 })
  const words = r.isAnswered ? clean(r.text) : ''
  if (words) await saveTitle($, await $.session.id(), words).catch(() => {})
  return words
}

/**
 * Claude Code's record of this session (~/.claude/sessions/<pid>.json) says its permission dialog is up. Only the
 * dialog sets it: auto mode's checker approves a call that asks without one.
 */
export function asksPermission(record: string): boolean {
  try {
    const r = JSON.parse(record) as { status?: unknown; waitingFor?: unknown }
    return r.status === 'waiting' && typeof r.waitingFor === 'string' && /permission/i.test(r.waitingFor)
  } catch {
    return false
  }
}

/** One watch for each call that asks, however many mods wait on it. */
const dialogs = new Map<string, Promise<boolean>>()
/** Calls that ran or were refused while their watch was on. */
const finished = new Set<string>()

/**
 * Mods hear neither classic.PermissionRequest nor classic.Notification while a dialog is up (checked on 2.1.301),
 * so the session record is the only sign.
 */
function dialogFor($: EngineInterface, id: string): Promise<boolean> {
  const watch = dialogs.get(id) ?? (async () => {
    const [{ pid }, home] = await Promise.all([processOf($), homeOf($)])
    if (!pid || !home) return false
    // ponytail: polls every half second, 10 minutes at most; an event for the dialog would replace it.
    for (let i = 0; i < 1200; i++) {
      await $.clock.sleep(500)
      if (finished.has(id)) return false
      if (asksPermission(await $.fs.read(`${home}/.claude/sessions/${pid}.json`).catch(() => ''))) return true
    }
    return false
  })().finally(() => {
    dialogs.delete(id)
    finished.delete(id)
  })
  dialogs.set(id, watch)
  return watch
}

// OSC 22 sets the mouse pointer's shape (Ghostty, Kitty, foot; other terminals ignore it).
// A mod can't print to the screen, so it's written straight to Claude's tty.
const SET_POINTER = `printf '\\033]22;%s\\033\\\\' "$1" > "$2"`

// A mod can't ask for the session's name (what /list-agents shows and SendMessage addresses), so it's read from
// the registry Claude Code keeps per running session: ~/.claude/sessions/<pid>.json. Newest wins if a pid file is stale.
// The second line is the ref /list-agents puts after the name: the start of sha256("session:" + messagingSocketPath).
const NAME_OF = `f=$(grep -lF "\\"sessionId\\":\\"$1\\"" "\${CLAUDE_CONFIG_DIR:-$HOME/.claude}"/sessions/*.json 2>/dev/null)
[ -n "$f" ] || exit 0
f=$(ls -t $f | head -1)
cat "$f"; echo
s=$(plutil -extract messagingSocketPath raw -o - "$f" 2>/dev/null) && printf 'session:%s' "$s" | shasum -a 256 | cut -c1-6`

// ponytail: re-read at most every 10s since the footer redraws often; a rename shows up within that.
let named = { id: '', at: 0, text: Promise.resolve('') }
const nameOf = async ($: EngineInterface, id: string) => {
  const now = await $.clock.now()
  if (named.id !== id || now - named.at > 10_000) {
    const text = $.process.run(['sh', '-c', NAME_OF, 'sh', id])
      .then(r => {
        const [json, ref] = r.stdout.trim().split(/\n+/)
        const name = String(JSON.parse(json || '{}').name ?? '')
        return name && ref ? `${name} [${ref}]` : name
      })
      .catch(() => '')
    named = { id, at: now, text }
  }
  return named.text
}

// `git rev-parse --show-toplevel` names the worktree the session is in, unlike $.session.repo(), which answers the
// main working tree. Outside a repo git fails and the name is empty. A directory's worktree doesn't change, so it's read once.
const worktrees = new Map<string, Promise<string>>()
const worktreeOf = async ($: EngineInterface) => {
  const cwd = await $.session.cwd()
  if (!worktrees.has(cwd)) {
    worktrees.set(cwd, $.process.run(['git', '-C', cwd, 'rev-parse', '--show-toplevel'])
      .then(r => (r.exitCode === 0 ? r.stdout.trim().split('/').pop() ?? '' : ''))
      .catch(() => ''))
  }
  return worktrees.get(cwd)!
}

let wantedPointer = 'default'
let sentPointer = 'default'

const copied = atom({ plugin: 'session-info', key: 'copied' } as const, '' as Copied)

export const register: Register = on => {
  // $.sessionInfo, for other mods. The noun's own methods hold no `$`, so the hooks below, which have one, answer.
  on('engine.create', async (_$, e, next) => ({
    ...(await next(e)),
    sessionInfo: {
      process: async () => ({ pid: '', tty: '' }),
      newTitle: async () => '',
      savedTitle: async () => '',
      saveTitle: async () => {},
      dialogFor: async () => false,
    },
  }))
  on('sessionInfo.process', async $ => ({ value: await processOf($) }))
  on('sessionInfo.newTitle', async ($, e) => ({ value: await newTitle($, e.answer) }))
  on('sessionInfo.savedTitle', async ($, e) => ({ value: await savedTitle($, e.sessionId) }))
  on('sessionInfo.saveTitle', async ($, e) => ({ value: await saveTitle($, e.sessionId, e.title) }))
  on('sessionInfo.dialogFor', async ($, e) => ({ value: await dialogFor($, e.id) }))

  // A call that ran or was refused no longer waits on a dialog. Passed on untouched if this fails.
  on('tool.call', async ($, e, next) => {
    try {
      return await next(e)
    } finally {
      const id = (e as { tool_use_id?: string }).tool_use_id ?? ''
      if (dialogs.has(id)) finished.add(id)
    }
  }).catch(($, e, next) => next(e))

  // The footer's mode labels: no plugin-name prefix, always visible, and the id follows /clear.
  on('ui.render', { component: 'SessionMode' }, async ($, e, next) => {
    if (e.surface !== 'terminal' && e.surface !== 'desktop') return next(e) // no Client elsewhere
    const { Box, Text, Client } = $.ui.resolve(e)
    const id = await $.session.id()
    const name = await nameOf($, id)
    const worktree = await worktreeOf($)
    const model = (await $.session.model()).replace(/^claude-/, '')
    const whichCopied = await read($, copied)
    // Pass the footer on with no mode labels, since this hook draws them itself. Other mods can then add their
    // own items after these.
    const rest = await next({ ...e, props: { ...e.props, modes: [] } })

    return (
      <Box>
        {e.props.modes.length > 0 && <Text dimColor>{e.props.modes.join(' & ')} & </Text>}
        {name && <Client key="session-name" module="./sid.tsx" props={{ emoji: '📝', text: name, copied: whichCopied === 'name' }} />}
        {name && <Text> </Text>}
        <Client key="session-id" module="./sid.tsx" props={{ emoji: '🏷️', text: id.slice(0, 8), copied: whichCopied === 'id' }} />
        {worktree && <Text> </Text>}
        {worktree && <Client key="worktree" module="./sid.tsx" props={{ emoji: '🌳', text: worktree, copied: whichCopied === 'worktree' }} />}
        {model && <Text> 🧠 {model}</Text>}
        {rest}
      </Box>
    )
  })

  // sid.tsx posts hovers and clicks here, where $ can reach the tty and the clipboard.
  on('ui.message', async ($, e, next) => {
    const kind = ({ 'session-name': 'name', 'session-id': 'id', worktree: 'worktree' } as const)[e.element as string]
    if (!kind) return next(e)
    if (e.data === 'enter' || e.data === 'leave') {
      // The hover redraws the id (its underline turns blue) at this very moment, and bytes written to the tty mid-frame
      // garble the screen, so let that redraw finish first. The last hover wins; a quick enter-leave writes nothing.
      wantedPointer = e.data === 'enter' ? 'pointer' : 'default'
      await $.clock.sleep(100)
      if (wantedPointer !== sentPointer) {
        sentPointer = wantedPointer
        const to = (await processOf($)).tty
        if (to) await $.process.run(['sh', '-c', SET_POINTER, 'sh', sentPointer, to])
      }
      return next(e)
    }
    const id = await $.session.id()
    const text = e.data === 'copy-command' ? `claude --resume ${id}`
      : kind === 'name' ? await nameOf($, id)
      : kind === 'worktree' ? await worktreeOf($)
      : id
    const { isCopied } = await $.ui.copy({ text, surface: e.surface })
    if (isCopied) {
      await update($, copied, () => kind)
      $.clock.after(1500, () => update($, copied, was => (was === kind ? '' : was)))
    }
    return next(e)
  })
}

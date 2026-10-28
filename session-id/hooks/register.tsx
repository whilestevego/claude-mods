import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'
import type { Copied } from '../types'

// OSC 22 sets the mouse pointer's shape (Ghostty, Kitty, foot; other terminals ignore it).
// A mod can't print to the screen, so it's written straight to the tty of the nearest ancestor that has one,
// found once: the walk up the process tree costs a few `ps` runs.
const FIND_TTY = `p=$$
while [ "$p" -gt 1 ]; do
  t=$(ps -o tty= -p "$p" | tr -d ' ')
  case "$t" in ''|'?'|'??') p=$(ps -o ppid= -p "$p" | tr -d ' ') ;; *) echo "/dev/$t"; exit ;; esac
done`
const SET_POINTER = `printf '\\033]22;%s\\033\\\\' "$1" > "$2"`

let tty: Promise<string> | undefined
const ttyOf = ($: EngineInterface) => (tty ??= $.process.run(['sh', '-c', FIND_TTY]).then(r => r.stdout.trim()))

// A mod can't ask for the session's name (what /list-agents shows and SendMessage addresses), so it's read from
// the registry Claude Code keeps per running session: ~/.claude/sessions/<pid>.json. Newest wins if a pid file is stale.
const NAME_OF = `f=$(grep -lF "\\"sessionId\\":\\"$1\\"" "\${CLAUDE_CONFIG_DIR:-$HOME/.claude}"/sessions/*.json 2>/dev/null)
[ -n "$f" ] || exit 0
cat "$(ls -t $f | head -1)"`

// ponytail: re-read at most every 10s since the footer redraws often; a rename shows up within that.
let named = { id: '', at: 0, text: Promise.resolve('') }
const nameOf = async ($: EngineInterface, id: string) => {
  const now = await $.clock.now()
  if (named.id !== id || now - named.at > 10_000) {
    const text = $.process.run(['sh', '-c', NAME_OF, 'sh', id])
      .then(r => String(JSON.parse(r.stdout || '{}').name ?? ''))
      .catch(() => '')
    named = { id, at: now, text }
  }
  return named.text
}

let wantedPointer = 'default'
let sentPointer = 'default'

const copied = atom({ plugin: 'session-id', key: 'copied' } as const, '' as Copied)

export const register: Register = on => {
  // The footer's mode labels: no plugin-name prefix, always visible, and the id follows /clear.
  on('ui.render', { component: 'SessionMode' }, async ($, e, next) => {
    if (e.surface !== 'terminal' && e.surface !== 'desktop') return next(e) // no Client elsewhere
    const { Box, Text, Client } = $.ui.resolve(e)
    const id = await $.session.id()
    const name = await nameOf($, id)
    const whichCopied = await read($, copied)

    return (
      <Box>
        {e.props.modes.length > 0 && <Text dimColor>{e.props.modes.join(' & ')} & </Text>}
        {name && <Client key="session-name" module="./sid.tsx" props={{ emoji: '📝', text: name, copied: whichCopied === 'name' }} />}
        {name && <Text> </Text>}
        <Client key="session-id" module="./sid.tsx" props={{ emoji: '🏷️', text: id.slice(0, 8), copied: whichCopied === 'id' }} />
      </Box>
    )
  })

  // sid.tsx posts hovers and clicks here, where $ can reach the tty and the clipboard.
  on('ui.message', async ($, e, next) => {
    if (e.element !== 'session-id' && e.element !== 'session-name') return next(e)
    if (e.data === 'enter' || e.data === 'leave') {
      // The hover redraws the id (its underline turns blue) at this very moment, and bytes written to the tty mid-frame
      // garble the screen, so let that redraw finish first. The last hover wins; a quick enter-leave writes nothing.
      wantedPointer = e.data === 'enter' ? 'pointer' : 'default'
      await $.clock.sleep(100)
      if (wantedPointer !== sentPointer) {
        sentPointer = wantedPointer
        const to = await ttyOf($)
        if (to) await $.process.run(['sh', '-c', SET_POINTER, 'sh', sentPointer, to])
      }
      return next(e)
    }
    const id = await $.session.id()
    const kind = e.element === 'session-name' ? 'name' : 'id'
    const text = e.data === 'copy-command' ? `claude --resume ${id}` : kind === 'name' ? await nameOf($, id) : id
    const { isCopied } = await $.ui.copy({ text, surface: e.surface })
    if (isCopied) {
      await update($, copied, () => kind)
      $.clock.after(1500, () => update($, copied, was => (was === kind ? '' : was)))
    }
    return next(e)
  })
}

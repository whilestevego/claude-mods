import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

// OSC 22 sets the mouse pointer's shape (Ghostty, Kitty, foot; other terminals ignore it).
// A mod can't print to the screen, so write it straight to the tty of the nearest ancestor that has one.
const SET_POINTER = `p=$$
while [ "$p" -gt 1 ]; do
  t=$(ps -o tty= -p "$p" | tr -d ' ')
  case "$t" in ''|'?'|'??') p=$(ps -o ppid= -p "$p" | tr -d ' ') ;; *) printf '\\033]22;%s\\033\\\\' "$1" > "/dev/$t"; exit ;; esac
done`

const copied = atom({ plugin: 'session-id', key: 'copied' } as const, false)

export const register: Register = on => {
  // The footer's mode labels: no plugin-name prefix, always visible, and the id follows /clear.
  on('ui.render', { component: 'SessionMode' }, async ($, e, next) => {
    if (e.surface !== 'terminal' && e.surface !== 'desktop') return next(e) // no Client elsewhere
    const { Box, Text, Client } = $.ui.resolve(e)
    const id = await $.session.id()
    const isCopied = await read($, copied)

    return (
      <Box>
        {e.props.modes.length > 0 && <Text dimColor>{e.props.modes.join(' & ')} & </Text>}
        <Client key="session-id" module="./sid.tsx" props={{ id, copied: isCopied }} />
      </Box>
    )
  })

  // sid.tsx posts hovers and clicks here, where $ can reach the tty and the clipboard.
  on('ui.message', { element: 'session-id' }, async ($, e, next) => {
    if (e.data === 'enter' || e.data === 'leave') {
      await $.process.run(['sh', '-c', SET_POINTER, 'sh', e.data === 'enter' ? 'pointer' : 'default'])
      return next(e)
    }
    const id = await $.session.id()
    const text = e.data === 'copy-command' ? `claude --resume ${id}` : id
    const { isCopied } = await $.ui.copy({ text, surface: e.surface })
    if (isCopied) {
      await update($, copied, () => true)
      $.clock.after(1500, () => update($, copied, () => false))
    }
    return next(e)
  })
}

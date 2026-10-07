import type { Register } from 'claude-code'

import { ask, clean } from './title'

const EVERY_MS = 3 * 60 * 1000

// OSC 2 sets the tab title. A mod can't print to the screen, so write it straight to the
// tty of the nearest ancestor that has one. Claude Code's own title is turned off in
// settings (CLAUDE_CODE_DISABLE_TERMINAL_TITLE) so the two don't fight.
const SET_TITLE = `p=$$
while [ "$p" -gt 1 ]; do
  t=$(ps -o tty= -p "$p" | tr -d ' ')
  case "$t" in ''|'?'|'??') p=$(ps -o ppid= -p "$p" | tr -d ' ') ;; *) printf '\\033]2;%s\\007' "$1" > "/dev/$t"; exit ;; esac
done`

export const register: Register = on => {
  let prompts: string[] = []
  let lastAt = 0

  on('prompt.submit', ($, e, next) => {
    if (e.text.trim()) prompts = [...prompts, e.text].slice(-6)
    return next(e)
  })

  // After a main-thread turn, at most every few minutes: summarize in the background so the turn isn't held.
  on('turn.complete', async ($, e, next) => {
    const now = await $.clock.now()
    if (!e.agentId && prompts.length && now - lastAt >= EVERY_MS) {
      lastAt = now
      void $.model.complete({ model: 'haiku', prompt: ask(prompts, e.answer), maxTokens: 20 }).then(async r => {
        const title = r.isAnswered ? clean(r.text) : ''
        if (title) await $.process.run(['sh', '-c', SET_TITLE, 'sh', `✳ ${title}`])
      })
    }
    return next(e)
  })
}

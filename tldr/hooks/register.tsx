import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import { cleanLine, tldrPrompt } from './line'

// Shown under the turn's closing line ("✻ Cooked for 11s"). turn-receipt reads it too, since it redraws that line.
const byDuration = atom({ plugin: 'tldr', key: 'byDuration' } as const, {})

export const register: Register = (on, options) => {
  const minChars = typeof options.minChars === 'number' && options.minChars > 0 ? options.minChars : 600
  let request = ''

  on('prompt.submit', ($, e, next) => {
    if (e.origin.kind !== 'task-notification') request = e.text
    return next(e)
  }).catch(($, e, next) => next(e))

  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    if (e.agentId) return result
    const isLong = e.reason === 'answer' && e.answer.length >= minChars
    let text = ''
    if (isLong) {
      const r = await $.model.complete({ model: 'haiku', prompt: tldrPrompt(request, e.answer), maxTokens: 80, timeoutMs: 8000 })
      text = r.isAnswered ? cleanLine(r.text) : ''
    }
    if (text) {
      // ponytail: two turns with the same durationMs share a TL;DR; key by a real turn id if the line ever carries one.
      await update($, byDuration, all => Object.fromEntries([...Object.entries(all), [String(e.durationMs), text]].slice(-500)))
    }
    // Published for other mods (voice speaks this same line). Empty text: nothing to wait for. Only tldr writes it.
    await $.state.set({ plugin: 'tldr', key: 'line' }, { turnId: e.turnId, text })
    // Not returned as text beneath the answer: Claude Code labels that row with every mod on the event.
    return result
  })

  // Under the closing line. When turn-receipt drew that line it already added the TL;DR, so it isn't added twice.
  on('ui.render', { component: 'TurnDuration' }, async ($, e, next) => {
    const line = await next(e)
    const text = (await read($, byDuration))[String(e.props.durationMs)]
    if (!text || JSON.stringify(line).includes('TL;DR')) return line
    const { Box, Text } = $.ui.resolve(e)
    return (
      <Box flexDirection="column">
        {line}
        <Text dimColor>  TL;DR: {text}</Text>
      </Box>
    )
  })
}

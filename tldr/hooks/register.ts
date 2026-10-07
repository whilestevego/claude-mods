import type { Register } from 'claude-code'

import { cleanLine, tldrPrompt } from './line'


export const register: Register = (on, options) => {
  const minChars = typeof options.minChars === 'number' && options.minChars > 0 ? options.minChars : 600
  let request = ''

  on('prompt.submit', ($, e, next) => {
    if (e.origin.kind !== 'task-notification') request = e.text
    return next(e)
  }).catch(($, e, next) => next(e))

  // Shown beneath the answer: what turn.complete answers besides the reply itself.
  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    if (e.agentId) return result
    const isLong = e.reason === 'answer' && e.answer.length >= minChars
    let text = ''
    if (isLong) {
      const r = await $.model.complete({ model: 'haiku', prompt: tldrPrompt(request, e.answer), maxTokens: 80, timeoutMs: 8000 })
      text = r.isAnswered ? cleanLine(r.text) : ''
    }
    // Published for other mods (voice speaks this same line). Empty text: nothing to wait for. Only tldr writes it.
    await $.state.set({ plugin: 'tldr', key: 'line' }, { turnId: e.turnId, text })
    return text ? { ...result, text: `TL;DR: ${text}` } : result
  })
}

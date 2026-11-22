import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Receipt } from '../types'
import { cleanLine, tldrPrompt } from './line'
import { fullLine } from './receipt'

const byDuration = atom({ plugin: 'turn-receipt', key: 'byDuration' } as const, {})

async function spent($: EngineInterface) {
  return (await $.session.usage()).cost?.usd ?? null
}

const LINE = { plugin: 'turn-receipt', key: 'line' } as const

/** Writes the turn's TL;DR (none for a reply under `minChars`) onto its receipt, and publishes it for the notify mod. */
async function summarize($: EngineInterface, turnId: string, key: string, request: string, answer: string, minChars: number) {
  let text = ''
  if (answer.length >= minChars) {
    const r = await $.model.complete({ model: 'haiku', prompt: tldrPrompt(request, answer), maxTokens: 80, timeoutMs: 8000 })
    text = r.isAnswered ? cleanLine(r.text) : ''
  }
  if (text) await update($, byDuration, all => (all[key] ? { ...all, [key]: { ...all[key], tldr: text } } : all))
  // An empty text tells notify there's nothing to wait for.
  await $.state.set(LINE, { turnId, text })
}

export const register: Register = (on, options) => {
  const minChars = typeof options.minChars === 'number' && options.minChars > 0 ? options.minChars : 600
  let request = ''
  // The turn in progress; a reload mid-turn just under-counts that one turn.
  // Hooks that gate a prompt or a tool call pass it on untouched if they fail: a receipt must never block work.
  let tools = 0
  let files = new Set<string>()
  let usdAtStart: number | null = null

  on('prompt.submit', async ($, e, next) => {
    if (e.origin.kind !== 'task-notification') request = e.text
    tools = 0
    files = new Set()
    usdAtStart = await spent($)
    return next(e)
  }).catch(($, e, next) => next(e))

  on('tool.call', async ($, e, next) => {
    tools += 1
    const ran = await next(e)
    if (!ran.isError && (e.tool === 'Edit' || e.tool === 'Write')) files.add(e.file_path)
    if (!ran.isError && e.tool === 'NotebookEdit') files.add(e.notebook_path)
    return ran
  }).catch(($, e, next) => next(e))

  on('turn.complete', async ($, e, next) => {
    if (e.agentId) return next(e)
    const usd = await spent($)
    const receipt: Receipt = {
      ms: e.durationMs,
      tools,
      files: [...files],
      usd: usd !== null && usdAtStart !== null ? usd - usdAtStart : null,
      isAborted: e.isAborted,
      doneAt: Date.now(),
      tokensIn: e.usage ? e.usage.input_tokens + e.usage.cache_read_input_tokens + e.usage.cache_creation_input_tokens : null,
      tokensOut: e.usage?.output_tokens ?? null,
    }
    // ponytail: two turns with the same durationMs share a receipt; key by a real turn id if the line ever carries one.
    const key = String(e.durationMs)
    await update($, byDuration, all => Object.fromEntries([...Object.entries(all), [key, receipt]].slice(-500)))
    // Haiku answers after the turn has completed, never holding it up; the closing line redraws when it lands.
    void summarize($, e.turnId, key, request, e.reason === 'answer' ? e.answer : '', minChars)
      .catch(() => $.state.set(LINE, { turnId: e.turnId, text: '' }))
    return next(e)
  })

  // Redraws the engine's end-of-turn line ("✻ Baked for 42s · done 10:21 PM") with the receipt on the end.
  // The engine's own line is an opaque handle a mod can't add to, so this draws the whole line.
  on('ui.render', { component: 'TurnDuration' }, async ($, e, next) => {
    const receipt = (await read($, byDuration))[String(e.props.durationMs)]
    if (!receipt?.doneAt) return next(e) // receipts saved before doneAt existed keep the plain line
    const { Box, Text } = $.ui.resolve(e)
    const line = <Text dimColor>{fullLine(e.props.word, receipt)}</Text>
    if (!receipt.tldr) return line
    return (
      <Box flexDirection="column">
        {line}
        <Text dimColor>  TL;DR: {receipt.tldr}</Text>
      </Box>
    )
  })
}

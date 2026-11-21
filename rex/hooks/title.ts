// The model's reply as a safe tab title: no control characters (no escape-sequence injection), 4 words, 48 chars.
export function clean(reply: string): string {
  return reply
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ')
    .replace(/["'`*_#.]/g, '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 4)
    .join(' ')
    .slice(0, 48)
}

/** Your last 10 requests and Claude's latest reply, from the transcript; markup-only messages (commands, notices) are skipped. */
export function context(messages: ReadonlyArray<{ role: string; text: string }>): { prompts: string[]; answer: string } {
  const said = messages.filter(m => m.text.trim() && !m.text.trimStart().startsWith('<'))
  return {
    prompts: said.filter(m => m.role === 'user').map(m => m.text).slice(-10),
    answer: [...said].reverse().find(m => m.role === 'assistant')?.text ?? '',
  }
}

export function ask(prompts: readonly string[], answer: string): string {
  return [
    'Recent requests in a coding session, oldest first:',
    ...prompts.map(p => `- ${p.slice(0, 300)}`),
    '',
    `Latest reply (start): ${answer.slice(0, 600)}`,
    '',
    'Summarize what this session is about in exactly 4 words, Title Case. Reply with the 4 words only.',
  ].join('\n')
}

/** A tab's title without the ✳ or ❓ this mod puts in front; '' for the default "Claude Code". */
export function bare(tabName: string): string {
  const words = tabName.replace(/^[✳❓]️?\s*/u, '').trim()
  return words === 'Claude Code' ? '' : words
}

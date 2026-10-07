// The model's reply as a safe tab title: no control characters (no escape-sequence injection), 3 words, 40 chars.
export function clean(reply: string): string {
  return reply
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ')
    .replace(/["'`*_#.]/g, '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 3)
    .join(' ')
    .slice(0, 40)
}

export function ask(prompts: readonly string[], answer: string): string {
  return [
    'Recent requests in a coding session, oldest first:',
    ...prompts.map(p => `- ${p.slice(0, 300)}`),
    '',
    `Latest reply (start): ${answer.slice(0, 600)}`,
    '',
    'Summarize what this session is about in exactly 3 words, Title Case. Reply with the 3 words only.',
  ].join('\n')
}

/** The prompt for one line that works both under the reply and spoken aloud. */
export function tldrPrompt(request: string, answer: string): string {
  return [
    "A coding assistant just finished replying. Write its TL;DR: ONE plain sentence of at most 20 words",
    "saying what was done or concluded, and anything the developer must act on. It is shown under the",
    'reply and read aloud, so: no markdown, code, file paths, quotes or a "TL;DR" prefix.',
    '',
    `Request: ${request.slice(0, 1500)}`,
    `Reply: ${answer.slice(0, 4000)}`,
  ].join('\n')
}

/** The model's line, cleaned to one safe sentence; empty when unusable. */
export function cleanLine(reply: string): string {
  const line = reply
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ')
    .replace(/^\s*(tl;?dr:?\s*)/i, '')
    .replace(/[*_`#>]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  return line.length >= 3 && line.length <= 240 ? line : ''
}


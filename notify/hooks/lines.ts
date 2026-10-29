// What each alert says: turning Claude's markdown and events into one line, for a banner or a voice.

/** Markdown → plain spoken prose. Code blocks become `codeAs` (dropped when empty). */
export function prose(markdown: string, codeAs = ''): string {
  return markdown
    .replace(/```[\s\S]*?```/g, codeAs ? ` ${codeAs} ` : ' ')
    .replace(/`([^`\n]*)`/g, '$1')
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/^\s*\|.*\|\s*$/gm, '')
    .replace(/[*_#>|~]/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{2,}/g, '\n')
    .trim()
}

/** The first sentence when it reads well spoken, else `fallback`. */
export function firstSentence(markdown: string, fallback = 'Done.'): string {
  const text = prose(markdown).replace(/\s+/g, ' ')
  const first = text.match(/^.*?[.!?](?=\s|$)/)?.[0] ?? text
  return first.length >= 3 && first.length <= 160 ? first : fallback
}

/** The prompt that turns a finished turn into one spoken line. */
export function summaryPrompt(request: string, answer: string): string {
  return [
    'A coding assistant just finished a task. In ONE short sentence of at most 15 words, meant to be',
    'spoken aloud to the developer, say what was done and whether anything needs their attention.',
    'Plain words only: no markdown, code, file paths or quotes.',
    '',
    `Request: ${request.slice(0, 1500)}`,
    `Answer: ${answer.slice(0, 3000)}`,
  ].join('\n')
}

/** A background task's notification text → what to say. */
export function taskLine(text: string): string {
  const summary = text.match(/<summary>([\s\S]*?)<\/summary>/)?.[1]?.trim()
  const status = text.match(/<status>([\s\S]*?)<\/status>/)?.[1]?.trim()
  const what = summary ? prose(summary).replace(/\s+/g, ' ').slice(0, 140) : ''
  if (what) return `Background task: ${what}`
  return status === 'failed' ? 'A background task failed.' : 'A background task finished.'
}

/**
 * A turn an API error ended, as one line ("API Error: Connection lost mid-response. …" → "Claude hit an error:
 * Connection lost mid-response."); empty for a turn that ended well. Claude Code writes the error as the turn's text.
 */
export function errorLine(reason: string, answer: string): string {
  const said = answer.trim().match(/^API Error:\s*(.*)$/s)?.[1]
  if (said === undefined && reason !== 'error') return ''
  const first = said ? firstSentence(said, '') : ''
  return first ? `Claude hit an error: ${first}` : 'Claude hit an error.'
}

/** The progress check-in during a long turn, naming what Claude is `doing` when known. */
export function checkinLine(minutes: number, doing = ''): string {
  const time = `${minutes} minute${minutes === 1 ? '' : 's'} in.`
  return doing ? `Still working on ${doing}, ${time}` : `Still working, ${time}`
}

/**
 * A tool's label → what to say after "working on": "Run the test suite" → "running the test suite". Pass `isGerund`
 * for a spinner label ("Fixing the click"), already in that form. Kept to its first clause, at most 8 words.
 */
export function doing(label: string, isGerund = false): string {
  const words = prose(label).split(/\s+(?:and|then)\s+|[,;:(—]|\s-\s/)[0]!.trim().replace(/[.!?]+$/, '').split(/\s+/).slice(0, 8)
  const [first = '', ...rest] = words
  if (!first) return ''
  const verb = /^[A-Z][a-z]/.test(first) || /^[a-z]/.test(first) ? first.toLowerCase() : first // keep "CI", "README"
  return [isGerund ? verb : ing(verb), ...rest].join(' ')
}

/** run → running, write → writing, fix → fixing. */
// ponytail: plain English rules; a stressed-last-syllable verb not listed ("refer") gets one consonant.
function ing(verb: string): string {
  if (/ie$/.test(verb)) return verb.slice(0, -2) + 'ying'
  if (/[^aeioy]e$/.test(verb)) return verb.slice(0, -1) + 'ing'
  if (/^[^aeiou]*[aeiou][^aeiouwxy]$/.test(verb) || /^(commit|submit|admit|omit)$/.test(verb)) return verb + verb.at(-1) + 'ing'
  return verb + 'ing'
}

export function rateLimitLine(kind: string, percent: number): string {
  const name = ({ five_hour: 'five hour', seven_day: 'weekly', spend_limit: 'spend' } as Record<string, string>)[kind] ?? kind
  return `Heads up: you've used ${Math.round(percent)} percent of your ${name} limit.`
}


/** Where an alert goes: a banner (the terminal's desktop notification), the say mod's voice, both, or nowhere. */
export type Channel = 'both' | 'banner' | 'voice' | 'off'

export function channel(option: unknown, fallback: Channel): Channel {
  return option === 'both' || option === 'banner' || option === 'voice' || option === 'off' ? option : fallback
}

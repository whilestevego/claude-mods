// One voice per running Claude session, claimed from a small table every session shares.

/** Session (process id) → voice. */
export type VoiceTable = Record<string, string>

/**
 * This session's voice: the one it already holds, else the first in `pool` no other live session holds
 * (cycling once every voice is taken). Sessions not in `alive` are dropped, freeing their voices.
 */
export function claimVoice(table: VoiceTable, me: string, alive: ReadonlySet<string>, pool: readonly string[]) {
  const live: VoiceTable = Object.fromEntries(Object.entries(table).filter(([pid]) => pid === me || alive.has(pid)))
  const held = live[me]
  if (held) return { voice: held, table: live }
  const choices = pool.length ? pool : ['af_heart']
  const taken = new Set(Object.values(live))
  const voice = choices.find(v => !taken.has(v)) ?? choices[Object.keys(live).length % choices.length]!
  return { voice, table: { ...live, [me]: voice } }
}

/** The shared table file's text → a table; anything unreadable is an empty table. */
export function parseTable(text: string): VoiceTable {
  try {
    const data: unknown = JSON.parse(text)
    if (!data || typeof data !== 'object' || Array.isArray(data)) return {}
    return Object.fromEntries(Object.entries(data).filter((kv): kv is [string, string] => typeof kv[1] === 'string'))
  } catch {
    return {}
  }
}

/** One of murmur's voices, as `murmur voices` lists it; `grade` is Kokoro's (A to F), '' from a murmur without grades. */
export type VoiceInfo = { id: string; name: string; group: string; isInstalled: boolean; grade: string }

/** `murmur voices` output → its voices, in its order ("AMERICAN FEMALE" headers, "  ✓ af_bella  Bella  A-" rows). */
export function parseCatalog(text: string): VoiceInfo[] {
  let group = ''
  const voices: VoiceInfo[] = []
  for (const line of text.split('\n')) {
    const header = line.match(/^([A-Z][A-Z ]+)$/)
    if (header) group = header[1]!.trim()
    const row = line.match(/^\s+([✓·])\s+([a-z]{2}_[a-z]+)\s+(\S+)(?:\s+([A-F][+-]?)(?=\s|$))?/)
    if (row) voices.push({ id: row[2]!, name: row[3]!, group, isInstalled: row[1] === '✓', grade: row[4] ?? '' })
  }
  return voices
}

/** "emma", "bf_emma", "isa" → the voices it could mean: an exact id or name wins, else every partial match. */
export function matchVoice(query: string, voices: readonly VoiceInfo[]): VoiceInfo[] {
  const q = query.trim().toLowerCase()
  if (!q) return []
  const exact = voices.filter(v => v.id === q || v.name.toLowerCase() === q)
  return exact.length ? exact : voices.filter(v => v.id.includes(q) || v.name.toLowerCase().includes(q))
}

/** A grade as a number: A 4, B 3, C 2, D 1, F 0, a + or − worth 0.3; no grade counts as a C. */
export function gradePoints(grade: string): number {
  const m = grade.match(/^([A-DF])([+-]?)$/)
  if (!m) return 2
  return 'FDCBA'.indexOf(m[1]!) + (m[2] === '+' ? 0.3 : m[2] === '-' ? -0.3 : 0)
}

/** Voice ids, best grade first; equal grades keep murmur's order. */
export function byGrade(voices: readonly VoiceInfo[]): string[] {
  return [...voices].sort((a, b) => gradePoints(b.grade) - gradePoints(a.grade)).map(v => v.id)
}

/** A random voice, weighted by the square of its grade: an A comes up 16 times as often as a D. */
export function weightedPick(voices: readonly VoiceInfo[], random = Math.random): VoiceInfo | undefined {
  const weights = voices.map(v => Math.max(gradePoints(v.grade), 0.1) ** 2)
  let r = random() * weights.reduce((a, b) => a + b, 0)
  return voices.find((_, i) => (r -= weights[i]!) < 0) ?? voices.at(-1)
}

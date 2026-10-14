// One voice per running Claude session, claimed from a small table every session shares.

/** Voices handed to sessions in turn: alternating accents and genders so neighbours sound distinct. */
export const SESSION_VOICES = [
  'af_heart', 'bm_george', 'af_nicole', 'am_michael', 'bf_emma', 'am_fenrir',
  'bf_isabella', 'bm_fable', 'af_bella', 'am_santa', 'bf_lily', 'bm_lewis',
]

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
  const choices = pool.length ? pool : SESSION_VOICES
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

/** One of murmur's voices, as `murmur voices` lists it. */
export type VoiceInfo = { id: string; name: string; group: string; isInstalled: boolean }

/** `murmur voices` output → its voices, in its order ("AMERICAN FEMALE" headers, "  ✓ af_bella  Bella" rows). */
export function parseCatalog(text: string): VoiceInfo[] {
  let group = ''
  const voices: VoiceInfo[] = []
  for (const line of text.split('\n')) {
    const header = line.match(/^([A-Z][A-Z ]+)$/)
    if (header) group = header[1]!.trim()
    const row = line.match(/^\s+([✓·])\s+([a-z]{2}_[a-z]+)\s+(\S+)/)
    if (row) voices.push({ id: row[2]!, name: row[3]!, group, isInstalled: row[1] === '✓' })
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

import { test, expect } from 'claude-code/testing'

import { ago, badge, nextWaiting, parseEntry, rank } from './registry'
import type { Entry } from './registry'

const s = (id: string, tty: string, isMe = false) => ({ id, tty, title: id, folder: '/f', isMe })
const e = (tty: string, status: Entry['status'], since: number): Entry => ({ tty, pid: '1', sessionId: 'x', cwd: '/f', status, since })

test('waiting first, longest wait first, then working, then idle; me last', () => {
  const ranked = rank(
    [s('idle', 't1'), s('me', 't2', true), s('work', 't3'), s('wait-new', 't4'), s('wait-old', 't5')],
    new Map([['t3', e('t3', 'working', 50)], ['t4', e('t4', 'waiting', 900)], ['t5', e('t5', 'waiting', 100)], ['t2', e('t2', 'waiting', 1)]]),
  )
  expect(ranked.map(r => r.id)).toEqual(['wait-old', 'wait-new', 'work', 'idle', 'me'])
  expect(nextWaiting(ranked)?.id).toBe('wait-old')
  expect(nextWaiting(rank([s('a', 't1')], new Map()))).toBeUndefined()
})

test('badges and durations', () => {
  expect(ago(45_000)).toBe('45s')
  expect(ago(4 * 60_000)).toBe('4m')
  expect(ago(65 * 60_000)).toBe('1h 5m')
  const now = 10 * 60_000
  expect(badge({ ...s('a', 't'), status: 'waiting', since: now - 240_000 }, now)).toBe('❓ 4m')
  expect(badge({ ...s('a', 't'), status: 'working' }, now)).toBe('⏳')
  expect(badge({ ...s('a', 't'), status: 'idle' }, now)).toBe('')
})

test('parseEntry tolerates junk', () => {
  expect(parseEntry('{"tty":"/dev/ttys1","status":"idle"}')?.tty).toBe('/dev/ttys1')
  expect(parseEntry('nope')).toBeUndefined()
  expect(parseEntry('{}')).toBeUndefined()
})

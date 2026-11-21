import { test, expect } from 'claude-code/testing'

import { parseEntry } from './registry'

test('parseEntry tolerates junk', () => {
  expect(parseEntry('{"tty":"/dev/ttys1","status":"idle"}')?.tty).toBe('/dev/ttys1')
  expect(parseEntry('nope')).toBeUndefined()
  expect(parseEntry('{}')).toBeUndefined()
})

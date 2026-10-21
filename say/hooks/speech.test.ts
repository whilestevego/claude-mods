import { test, expect } from 'claude-code/testing'

import { prose, voiceList } from './speech'

test('prose strips markdown and can name code', () => {
  expect(prose('I fixed the **login** bug in `auth.ts`.')).toBe('I fixed the login bug in auth.ts.')
  expect(prose('See [docs](http://x).\n```ts\nx()\n```\n- one\n- two', 'Code omitted.')).toBe('See docs.\n Code omitted. \none\ntwo')
  expect(prose('| a | b |\n|---|---|\nAfter')).toBe('After')
})

test('voiceList', () => {
  expect(voiceList(' af_heart, bm_george ,')).toEqual(['af_heart', 'bm_george'])
  expect(voiceList('')).toEqual([])
})

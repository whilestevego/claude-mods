import { test, expect } from 'claude-code/testing'

import { channel, checkinLine, doing, errorLine, firstSentence, prose, rateLimitLine, summaryPrompt, taskLine } from './lines'

test('prose strips markdown and can name code', () => {
  expect(prose('I fixed the **login** bug in `auth.ts`.')).toBe('I fixed the login bug in auth.ts.')
  expect(prose('See [docs](http://x).\n```ts\nx()\n```\n- one\n- two', 'Code omitted.')).toBe('See docs.\n Code omitted. \none\ntwo')
  expect(prose('| a | b |\n|---|---|\nAfter')).toBe('After')
})

test('firstSentence', () => {
  expect(firstSentence('Fixed it. Then tested.')).toBe('Fixed it.')
  expect(firstSentence('x'.repeat(200))).toBe('Done.')
  expect(firstSentence('```only code```')).toBe('Done.')
})

test('summaryPrompt bounds its inputs', () => {
  expect(summaryPrompt('a'.repeat(5000), 'b'.repeat(9000)).length).toBeLessThan(5000)
})

test('taskLine', () => {
  expect(taskLine('<task-notification><status>completed</status><summary>Tests **passed**: 42</summary></task-notification>'))
    .toBe('Background task: Tests passed: 42')
  expect(taskLine('<status>failed</status>')).toBe('A background task failed.')
  expect(taskLine('whatever')).toBe('A background task finished.')
})

test('checkinLine', () => {
  expect(checkinLine(5)).toBe('Still working, 5 minutes in.')
  expect(checkinLine(1)).toBe('Still working, 1 minute in.')
  expect(checkinLine(5, 'running the tests')).toBe('Still working on running the tests, 5 minutes in.')
})

test('doing turns a label into what Claude is on', () => {
  expect(doing('Run the test suite')).toBe('running the test suite')
  expect(doing('Write the config')).toBe('writing the config')
  expect(doing('Fix the banner click')).toBe('fixing the banner click')
  expect(doing('See what changed')).toBe('seeing what changed')
  expect(doing('Commit and push the fix')).toBe('committing')
  expect(doing('Check CI status, then report')).toBe('checking CI status')
  expect(doing('Read `register.ts` to find the hook')).toBe('reading register.ts to find the hook')
  expect(doing('Find every caller of the function across all of the mods')).toBe('finding every caller of the function across all')
  expect(doing('Fixing the banner click', true)).toBe('fixing the banner click')
  expect(doing('README cleanup', true)).toBe('README cleanup')
  expect(doing('')).toBe('')
})

test('rateLimitLine', () => {
  expect(rateLimitLine('five_hour', 90.4)).toBe("Heads up: you've used 90 percent of your five hour limit.")
})

test('errorLine', () => {
  expect(errorLine('answer', 'API Error: Connection lost mid-response. The response above may be incomplete.')).toBe('Claude hit an error: Connection lost mid-response.')
  expect(errorLine('error', 'API Error: Your computer went to sleep mid-response. The response above may be incomplete.')).toBe('Claude hit an error: Your computer went to sleep mid-response.')
  expect(errorLine('error', '')).toBe('Claude hit an error.')
  expect(errorLine('answer', 'All done. No API Error: here.')).toBe('')
})

test('channel', () => {
  expect(channel('banner', 'both')).toBe('banner')
  expect(channel('loud', 'voice')).toBe('voice')
  expect(channel(undefined, 'off')).toBe('off')
})

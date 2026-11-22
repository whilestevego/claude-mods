import { test, expect } from 'claude-code/testing'

import { asksPermission } from './register'

// The $.sessionInfo methods themselves can't be called from a test (a test's hooks may make no call on `$`); the
// tests of ghostty, rex, notify and say cover how each mod uses them.

test('asksPermission reads only a permission dialog', () => {
  expect(asksPermission(JSON.stringify({ status: 'waiting', waitingFor: 'permission prompt' }))).toBe(true)
  expect(asksPermission(JSON.stringify({ status: 'waiting', waitingFor: 'input' }))).toBe(false)
  expect(asksPermission(JSON.stringify({ status: 'busy' }))).toBe(false)
  expect(asksPermission('nope')).toBe(false)
})

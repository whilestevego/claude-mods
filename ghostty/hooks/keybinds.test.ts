import { test, expect } from 'claude-code/testing'

import { bindingLine, DEFAULTS, parseAdd, parseBindings, prettyKeys, renderFile, upsert, withInclude, INCLUDE } from './keybinds'

test('a binding round-trips through the file', () => {
  const b = { keys: 'super+ctrl+g', text: '/goto' }
  expect(bindingLine(b)).toBe('keybind = super+ctrl+g=text:/goto\\r')
  expect(parseBindings(renderFile('', [b, { keys: 'super+ctrl+h', text: 'say a\\b' }]))).toEqual([b, { keys: 'super+ctrl+h', text: 'say a\\b' }])
})

test('lines written by hand survive a rewrite', () => {
  const before = '# mine\nkeybind = super+ctrl+x=new_split:right\nkeybind = super+ctrl+g=text:/goto\\r\n'
  const after = renderFile(before, upsert(parseBindings(before), { keys: 'super+ctrl+h', text: '/hush' }))
  expect(after).toContain('# mine\nkeybind = super+ctrl+x=new_split:right')
  expect(parseBindings(after).map(b => b.keys)).toEqual(['super+ctrl+g', 'super+ctrl+h'])
})

test('upsert replaces the same keys', () => {
  expect(upsert(DEFAULTS, { keys: 'super+ctrl+g', text: '/goto 1' })).toEqual([{ keys: 'super+ctrl+g', text: '/goto 1' }])
})

test('parseAdd', () => {
  expect(parseAdd('super+ctrl+H  /hush')).toEqual({ keys: 'super+ctrl+h', text: '/hush' })
  expect(parseAdd('super+ctrl+r /read please')).toEqual({ keys: 'super+ctrl+r', text: '/read please' })
  expect(typeof parseAdd('super+ctrl+h')).toBe('string')
  expect(typeof parseAdd('super=ctrl /hush')).toBe('string')
})

test('the include is added once', () => {
  const once = withInclude('clipboard-paste-protection = false\n')
  expect(once).toContain(INCLUDE)
  expect(withInclude(once)).toBe(once)
  expect(prettyKeys('super+ctrl+g')).toBe('⌘⌃G')
})

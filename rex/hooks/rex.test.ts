import { test, expect } from 'claude-code/testing'

import { appClients, isShown, showCommand, windowOf } from './register'

const S = 'session:01a'
const view = (active: string, focused: string) => JSON.stringify({ active_window_id: active, windows: [{ window_id: 'w1', focused_block_id: focused }, { window_id: 'w2', focused_block_id: 'b2' }] })

test('shown only when Rex is in front, on this session, with this pane focused in the active tab', () => {
  expect(isShown(`true\tHOST/${S}\n`, view('w1', 'b1'), S, 'b1')).toBe(true)
  expect(isShown(`false\tHOST/${S}`, view('w1', 'b1'), S, 'b1')).toBe(false)
  expect(isShown(`true\tHOST/session:other`, view('w1', 'b1'), S, 'b1')).toBe(false)
  expect(isShown(`true\tHOST/${S}`, view('w2', 'b1'), S, 'b1')).toBe(false)
  expect(isShown(`true\tHOST/${S}`, view('w1', 'b9'), S, 'b1')).toBe(false)
  expect(isShown(`true\tHOST/${S}`, 'not json', S, 'b1')).toBe(false)
})

test('windowOf finds the tab that holds a pane', () => {
  const v = JSON.stringify({ windows: [{ window_id: 'w1', layers: [{ blocks: [{ block_id: 'b1' }] }] }, { window_id: 'w2', layers: [{ blocks: [{ block_id: 'b2' }, { block_id: 'b3' }] }] }] })
  expect(windowOf(v, 'b3')).toBe('w2')
  expect(windowOf(v, 'b9')).toBe(undefined)
  expect(windowOf('junk', 'b1')).toBe(undefined)
})

test('appClients finds the Mac apps attached to the session', () => {
  const v = JSON.stringify({ clients: [{ client_id: 'c1', info: { kind: 'app', platform: 'macos' } }, { client_id: 'c2', info: { kind: 'cli', platform: 'macos' } }] })
  expect(appClients(v)).toEqual(['c1'])
  expect(appClients('junk')).toEqual([])
})

test('showCommand focuses the pane, selects its tab in each app, then activates Rex', () => {
  expect(showCommand("/Rex Server.app/rex", S, 'b1', 'w1', ['c1'])).toBe(
    `'/Rex Server.app/rex' focus -s '${S}' 'b1'; '/Rex Server.app/rex' -C 'c1' do session.select 'session_id=${S}' 'window_id=w1'; osascript -e 'tell application "Rex" to activate'`)
  expect(showCommand('/rex', S, 'b1', undefined, ['c1'])).toBe(`'/rex' focus -s '${S}' 'b1'; osascript -e 'tell application "Rex" to activate'`)
  expect(showCommand("/it's/rex", S, 'b1', undefined, [])).toContain(`'/it'\\''s/rex'`)
})

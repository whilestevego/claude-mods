import { test, expect } from 'claude-code/testing'

import { absolute, findRefs, hrefFor, linkify } from './links'

const text = [
  'I changed `src/app.ts:42` and hooks/register.tsx, see ./README.md.',
  'Not paths: e.g. version 1.2, http://example.com/a/b.js, [docs](https://x.dev/a.md).',
  '```ts',
  'import x from "./inside/code.ts"',
  '```',
].join('\n')

test('findRefs looks only at prose, and only at path-like words', () => {
  expect(findRefs(text)).toEqual(['src/app.ts', 'hooks/register.tsx', './README.md', 'e.g', '1.2'])
})

test('linkify links the references that exist, and nothing else', () => {
  const resolved = new Map([['src/app.ts', '/repo/src/app.ts'], ['./README.md', '/repo/README.md']])
  const out = linkify(text, resolved, (abs, ref) => hrefFor('zed', abs, ref))
  expect(out).toContain('[`src/app.ts:42`](zed://file/repo/src/app.ts:42)')
  expect(out).toContain('[./README.md](zed://file/repo/README.md)')
  expect(out).toContain(' and hooks/register.tsx,')  // not resolved: left alone
  expect(out).toContain('[docs](https://x.dev/a.md)')
  expect(out).toContain('import x from "./inside/code.ts"')
})

test('hrefFor', () => {
  expect(hrefFor('file', '/a b/c.ts', { path: 'c.ts', line: 3 })).toBe('file:///a%20b/c.ts')
  expect(hrefFor('zed', '/a/c.ts', { path: 'c.ts', line: 3, col: 7 })).toBe('zed://file/a/c.ts:3:7')
  expect(hrefFor('vscode', '/a/c.ts', { path: 'c.ts' })).toBe('vscode://file/a/c.ts')
})

test('absolute', () => {
  expect(absolute('src/a.ts', '/repo', '/home/me')).toBe('/repo/src/a.ts')
  expect(absolute('../b.ts', '/repo/sub', '/home/me')).toBe('/repo/b.ts')
  expect(absolute('~/x.md', '/repo', '/home/me')).toBe('/home/me/x.md')
  expect(absolute('/etc/hosts', '/repo', '/home/me')).toBe('/etc/hosts')
})

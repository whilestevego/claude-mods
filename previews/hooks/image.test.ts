import { test, expect } from 'claude-code/testing'

import { boxFor, cacheName, imagePath, isImage, needsConversion, parseSize } from './image'

test('which reads are images', () => {
  expect(imagePath('Read', { file_path: '/tmp/shot.png' })).toBe('/tmp/shot.png')
  expect(imagePath('Read', { file_path: '/tmp/photo.JPG' })).toBe('/tmp/photo.JPG')
  expect(imagePath('Read', { file_path: '/tmp/notes.md' })).toBeUndefined()
  expect(imagePath('Read', { file_path: 'relative.png' })).toBeUndefined()
  expect(imagePath('Bash', { command: 'ls a.png' })).toBeUndefined()
  expect([isImage('a.webp'), needsConversion('a.webp'), needsConversion('a.png')]).toEqual([true, true, false])
})

test('shape and sizes', () => {
  expect(boxFor(1600, 800, 14, 200)).toEqual({ rows: 14, columns: 56 })  // 2:1 picture fits: 14 rows, 56 columns
  expect(boxFor(2000, 208, 14, 120)).toEqual({ rows: 6, columns: 120 })  // a wide screenshot: width capped, height follows
  expect(boxFor(400, 1600, 14, 120)).toEqual({ rows: 14, columns: 7 })   // a tall one stays 14 rows
  expect(boxFor(0, 0, 10, 100)).toEqual({ rows: 10, columns: 20 })
  expect(parseSize('/a.png\n  pixelWidth: 1280\n  pixelHeight: 720\n')).toEqual({ width: 1280, height: 720 })
  expect(cacheName('/a.jpg', 1)).toBe(cacheName('/a.jpg', 1))
  expect(cacheName('/a.jpg', 1)).not.toBe(cacheName('/a.jpg', 2))
})

import { describe, expect, it } from 'vitest'

import { fileTreeOf } from './fileTree'

describe('fileTreeOf', () => {
  it('폴더를 먼저, 이름순으로 묶고 경로를 붙인다', () => {
    expect(fileTreeOf(['z.md', 'notes/b.md', 'a.md', 'notes/deep/c.md', 'docs/d.md'])).toEqual([
      {
        name: 'docs',
        path: 'docs',
        children: [{ name: 'd.md', path: 'docs/d.md', children: null }]
      },
      {
        name: 'notes',
        path: 'notes',
        children: [
          {
            name: 'deep',
            path: 'notes/deep',
            children: [{ name: 'c.md', path: 'notes/deep/c.md', children: null }]
          },
          { name: 'b.md', path: 'notes/b.md', children: null }
        ]
      },
      { name: 'a.md', path: 'a.md', children: null },
      { name: 'z.md', path: 'z.md', children: null }
    ])
  })

  it('비어 있으면 빈 트리다', () => {
    expect(fileTreeOf([])).toEqual([])
  })
})

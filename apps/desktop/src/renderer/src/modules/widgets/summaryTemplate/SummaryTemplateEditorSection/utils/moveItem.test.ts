import { describe, expect, it } from 'vitest'

import { moveItem } from './moveItem'

describe('moveItem', () => {
  const items = ['a', 'b', 'c', 'd']

  it('앞에서 뒤로, 뒤에서 앞으로 옮긴다', () => {
    expect(moveItem({ items, from: 0, to: 2 })).toEqual(['b', 'c', 'a', 'd'])
    expect(moveItem({ items, from: 3, to: 1 })).toEqual(['a', 'd', 'b', 'c'])
  })

  it('원래 배열을 바꾸지 않는다', () => {
    moveItem({ items, from: 0, to: 3 })
    expect(items).toEqual(['a', 'b', 'c', 'd'])
  })

  it('범위를 벗어나면 그대로 둔다', () => {
    expect(moveItem({ items, from: 0, to: -1 })).toBe(items)
    expect(moveItem({ items, from: 4, to: 0 })).toBe(items)
  })
})

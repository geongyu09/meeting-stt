import { describe, expect, it } from 'vitest'

import { moveItem } from './moveItem'
import { toMoveTarget } from './toMoveTarget'

const ITEMS = ['a', 'b', 'c']

const dropAt = ({ from, insertAt }: { from: number; insertAt: number }) =>
  moveItem({ items: ITEMS, from, to: toMoveTarget({ from, insertAt }) })

describe('toMoveTarget', () => {
  it('앞쪽에 놓으면 그 자리가 된다', () => {
    expect(dropAt({ from: 2, insertAt: 0 })).toEqual(['c', 'a', 'b'])
  })

  it('뒤쪽에 놓으면 자기가 빠진 만큼 당겨진다', () => {
    expect(dropAt({ from: 0, insertAt: 2 })).toEqual(['b', 'a', 'c'])
  })

  it('끝에 놓으면 맨 뒤로 간다', () => {
    expect(dropAt({ from: 0, insertAt: 3 })).toEqual(['b', 'c', 'a'])
  })

  it('자기 바로 앞·뒤에 놓으면 그대로다', () => {
    expect(dropAt({ from: 1, insertAt: 1 })).toEqual(ITEMS)
    expect(dropAt({ from: 1, insertAt: 2 })).toEqual(ITEMS)
  })
})

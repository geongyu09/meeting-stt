import { describe, expect, it } from 'vitest'
import { toolLabelOf } from './toolLabel'

describe('toolLabelOf', () => {
  it('읽기·고치기·실행·웹 도구를 종류로 묶고 모르는 도구는 null이다', () => {
    expect(toolLabelOf('Read')).toBe('read')
    expect(toolLabelOf('Grep')).toBe('read')
    expect(toolLabelOf('Edit')).toBe('edit')
    expect(toolLabelOf('Shell')).toBe('run')
    expect(toolLabelOf('WebFetch')).toBe('web')
    expect(toolLabelOf('Task')).toBeNull()
  })
})

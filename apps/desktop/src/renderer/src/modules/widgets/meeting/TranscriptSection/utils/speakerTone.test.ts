import { describe, expect, it } from 'vitest'
import { speakerToneOf } from './speakerTone'

const options = ['a', 'b', 'c', 'd', 'e'].map((label) => ({ label, name: label }))

describe('speakerToneOf', () => {
  it('목록 순서대로 1부터 매긴다', () => {
    expect(speakerToneOf({ speakerOptions: options, label: 'a' })).toBe(1)
    expect(speakerToneOf({ speakerOptions: options, label: 'd' })).toBe(4)
  })

  it('다섯 번째 화자는 1번 색으로 돌아간다', () => {
    expect(speakerToneOf({ speakerOptions: options, label: 'e' })).toBe(1)
  })

  it('목록에 없는 라벨은 1번이다', () => {
    expect(speakerToneOf({ speakerOptions: options, label: 'zzz' })).toBe(1)
  })
})

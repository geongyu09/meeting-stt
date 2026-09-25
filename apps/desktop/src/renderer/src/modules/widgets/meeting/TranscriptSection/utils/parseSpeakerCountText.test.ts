import { describe, expect, it } from 'vitest'
import { parseSpeakerCountText } from './parseSpeakerCountText'

describe('parseSpeakerCountText', () => {
  it('비어 있으면 모름(null)이고 유효하다', () => {
    expect(parseSpeakerCountText('  ')).toEqual({ speakerCount: null, isValid: true })
  })

  it('범위 안 정수를 읽는다', () => {
    expect(parseSpeakerCountText(' 4 ')).toEqual({ speakerCount: 4, isValid: true })
  })

  it('범위 밖·소수·문자는 유효하지 않다', () => {
    expect(parseSpeakerCountText('0').isValid).toBe(false)
    expect(parseSpeakerCountText('21').isValid).toBe(false)
    expect(parseSpeakerCountText('2.5').isValid).toBe(false)
    expect(parseSpeakerCountText('두 명').isValid).toBe(false)
  })
})

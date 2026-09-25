import { describe, expect, it } from 'vitest'
import { formatDuration, formatDurationShort } from './index'

describe('formatDuration', () => {
  it('시·분·초를 모두 표시한다', () => {
    expect(formatDuration({ sec: 3723, locale: 'ko' })).toBe('1시간 2분 3초')
  })

  it('값이 0인 단위는 생략한다', () => {
    expect(formatDuration({ sec: 3600, locale: 'ko' })).toBe('1시간')
    expect(formatDuration({ sec: 125, locale: 'ko' })).toBe('2분 5초')
  })

  it('0초 녹음은 "0초"로 표시한다', () => {
    expect(formatDuration({ sec: 0, locale: 'ko' })).toBe('0초')
  })

  it('소수점 길이는 초 단위로 반올림한다', () => {
    expect(formatDuration({ sec: 61.6, locale: 'ko' })).toBe('1분 2초')
  })

  it('음수는 0초로 취급한다', () => {
    expect(formatDuration({ sec: -5, locale: 'ko' })).toBe('0초')
  })
})

describe('formatDurationShort', () => {
  it('1분이 넘으면 초를 버린다', () => {
    expect(formatDurationShort({ sec: 48 * 60 + 12, locale: 'ko' })).toBe('48분')
    expect(formatDurationShort({ sec: 72 * 60 + 30, locale: 'ko' })).toBe('1시간 12분')
  })

  it('정각 시간은 분을 생략한다', () => {
    expect(formatDurationShort({ sec: 3600, locale: 'ko' })).toBe('1시간')
  })

  it('1분 미만은 초로 보여 준다', () => {
    expect(formatDurationShort({ sec: 42, locale: 'ko' })).toBe('42초')
    expect(formatDurationShort({ sec: 0, locale: 'ko' })).toBe('0초')
  })
})

describe('formatDuration (en)', () => {
  it('단위를 h·m·s 약어로 붙인다', () => {
    expect(formatDuration({ sec: 3723, locale: 'en' })).toBe('1h 2m 3s')
    expect(formatDuration({ sec: 0, locale: 'en' })).toBe('0s')
    expect(formatDurationShort({ sec: 72 * 60 + 30, locale: 'en' })).toBe('1h 12m')
  })
})

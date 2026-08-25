import { describe, expect, it } from 'vitest'
import { formatMeetingDate } from './index'

describe('formatMeetingDate', () => {
  it('현지 시각 기준 날짜와 시:분을 조립한다', () => {
    const epochMs = new Date(2026, 7, 26, 15, 12).getTime()

    expect(formatMeetingDate({ epochMs })).toBe('2026년 8월 26일 15:12')
  })

  it('한 자리 시각은 0을 채운다', () => {
    const epochMs = new Date(2026, 0, 3, 9, 5).getTime()

    expect(formatMeetingDate({ epochMs })).toBe('2026년 1월 3일 09:05')
  })
})

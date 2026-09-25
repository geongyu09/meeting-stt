import { describe, expect, it } from 'vitest'
import { formatMeetingDate, formatMeetingDay, formatMeetingTime } from './index'

describe('formatMeetingTime', () => {
  it('오후 시각을 12시간제로 읽는다', () => {
    expect(
      formatMeetingTime({ epochMs: new Date(2026, 8, 24, 14, 10).getTime(), locale: 'ko' })
    ).toBe('오후 2:10')
  })

  it('자정은 오전 12시, 정오는 오후 12시다', () => {
    expect(
      formatMeetingTime({ epochMs: new Date(2026, 8, 24, 0, 5).getTime(), locale: 'ko' })
    ).toBe('오전 12:05')
    expect(
      formatMeetingTime({ epochMs: new Date(2026, 8, 24, 12, 0).getTime(), locale: 'ko' })
    ).toBe('오후 12:00')
  })
})

describe('formatMeetingTime (en)', () => {
  it('12시간제에 AM/PM을 뒤에 붙인다', () => {
    expect(
      formatMeetingTime({ epochMs: new Date(2026, 8, 24, 14, 10).getTime(), locale: 'en' })
    ).toBe('2:10 PM')
    expect(
      formatMeetingTime({ epochMs: new Date(2026, 8, 24, 0, 5).getTime(), locale: 'en' })
    ).toBe('12:05 AM')
  })
})

describe('formatMeetingDate', () => {
  it('날짜·요일·시각을 조립한다', () => {
    expect(
      formatMeetingDate({ epochMs: new Date(2026, 8, 24, 14, 10).getTime(), locale: 'ko' })
    ).toBe('2026년 9월 24일 (목) 오후 2:10')
  })
})

describe('formatMeetingDate (en)', () => {
  it('요일·월 이름을 영어 약어로 조립한다', () => {
    expect(
      formatMeetingDate({ epochMs: new Date(2026, 8, 24, 14, 10).getTime(), locale: 'en' })
    ).toBe('Thu, Sep 24, 2026 2:10 PM')
  })
})

describe('formatMeetingDay', () => {
  const now = new Date(2026, 8, 24, 15, 0).getTime()

  it('올해면 연도를 생략한다', () => {
    expect(
      formatMeetingDay({ epochMs: new Date(2026, 8, 22, 9, 0).getTime(), now, locale: 'ko' })
    ).toBe('9월 22일')
  })

  it('다른 해면 연도를 붙인다', () => {
    expect(
      formatMeetingDay({ epochMs: new Date(2025, 11, 30, 9, 0).getTime(), now, locale: 'ko' })
    ).toBe('2025년 12월 30일')
  })
})

describe('formatMeetingDay (en)', () => {
  const now = new Date(2026, 8, 24, 15, 0).getTime()

  it('올해면 월·일만, 다른 해면 연도를 붙인다', () => {
    expect(
      formatMeetingDay({ epochMs: new Date(2026, 8, 22, 9, 0).getTime(), now, locale: 'en' })
    ).toBe('Sep 22')
    expect(
      formatMeetingDay({ epochMs: new Date(2025, 11, 30, 9, 0).getTime(), now, locale: 'en' })
    ).toBe('Dec 30, 2025')
  })
})

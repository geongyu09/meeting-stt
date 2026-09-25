import { getMessages, type Locale } from '@shared/i18n'

const NOON_HOUR = 12

interface FormatMeetingTimeParams {
  epochMs: number
  locale: Locale
}

/**
 * "오후 2:10" / "2:10 PM". Intl 대신 직접 조립하는 이유는 실행 환경의 ICU 데이터에 따라 문구가 달라지지 않게 하기 위해서다.
 * 자정은 "오전 12:00", 정오는 "오후 12:00"으로 읽는다. 문구 자체는 사전(`common.date`)이 정한다.
 */
export const formatMeetingTime = ({ epochMs, locale }: FormatMeetingTimeParams) => {
  const date = new Date(epochMs)
  const hours = date.getHours()

  return getMessages(locale).common.date.time({
    hour12: hours % NOON_HOUR || NOON_HOUR,
    minute: String(date.getMinutes()).padStart(2, '0'),
    isPm: hours >= NOON_HOUR
  })
}

/** 회의 상세 제목 아래: "2026년 9월 24일 (수) 오후 2:10" */
export const formatMeetingDate = ({ epochMs, locale }: FormatMeetingTimeParams) => {
  const date = new Date(epochMs)

  return getMessages(locale).common.date.full({
    year: date.getFullYear(),
    month: date.getMonth() + 1,
    day: date.getDate(),
    weekday: date.getDay(),
    time: formatMeetingTime({ epochMs, locale })
  })
}

interface FormatMeetingDayParams {
  epochMs: number
  now: number
  locale: Locale
}

/** 사이드바 목록: 올해면 "9월 22일", 다른 해면 "2025년 9월 22일" */
export const formatMeetingDay = ({ epochMs, now, locale }: FormatMeetingDayParams) => {
  const date = new Date(epochMs)
  const { date: messages } = getMessages(locale).common
  const parts = { year: date.getFullYear(), month: date.getMonth() + 1, day: date.getDate() }

  return date.getFullYear() === new Date(now).getFullYear()
    ? messages.monthDay(parts)
    : messages.yearMonthDay(parts)
}

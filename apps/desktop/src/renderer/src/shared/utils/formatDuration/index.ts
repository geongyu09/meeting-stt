import { getMessages, type Locale } from '@shared/i18n'

const SECONDS_PER_MINUTE = 60
const SECONDS_PER_HOUR = 3600

interface FormatDurationParams {
  sec: number
  locale: Locale
}

/** 회의 길이 표시용. 값이 0인 단위는 생략한다 ("1시간 2분", "0초") */
export const formatDuration = ({ sec, locale }: FormatDurationParams) => {
  const { duration } = getMessages(locale).common
  const total = Math.max(0, Math.round(sec))
  const hours = Math.floor(total / SECONDS_PER_HOUR)
  const minutes = Math.floor((total % SECONDS_PER_HOUR) / SECONDS_PER_MINUTE)
  const seconds = total % SECONDS_PER_MINUTE

  const parts = [
    ...(hours ? [duration.hours({ hours })] : []),
    ...(minutes ? [duration.minutes({ minutes })] : []),
    ...(seconds ? [duration.seconds({ seconds })] : [])
  ]

  return parts.length ? parts.join(' ') : duration.zero
}

/**
 * 사이드바처럼 좁은 곳의 회의 길이. 1분이 넘으면 초를 버린다 ("48분", "1시간 12분").
 * 1분 미만이면 초로 보여 준다 — "0분"은 녹음이 비었다는 뜻으로 읽힌다.
 */
export const formatDurationShort = ({ sec, locale }: FormatDurationParams) => {
  const { duration } = getMessages(locale).common
  const total = Math.max(0, Math.round(sec))
  if (total < SECONDS_PER_MINUTE) return duration.seconds({ seconds: total })

  const hours = Math.floor(total / SECONDS_PER_HOUR)
  const minutes = Math.floor((total % SECONDS_PER_HOUR) / SECONDS_PER_MINUTE)

  return [
    ...(hours ? [duration.hours({ hours })] : []),
    ...(minutes ? [duration.minutes({ minutes })] : [])
  ].join(' ')
}

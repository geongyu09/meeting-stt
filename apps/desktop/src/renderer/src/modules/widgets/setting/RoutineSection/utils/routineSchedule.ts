import type { Messages } from '@shared/i18n'
import { WEEKDAY_COUNT } from '@shared/routine'
import type { Routine, RoutineSchedule } from '@shared/types'

import type { RoutineFormValues } from '../types/routineForm'

const MINUTES_PER_HOUR = 60

/** 화면은 월요일부터 보여 준다 (저장값은 0 = 일요일) */
export const WEEKDAY_DISPLAY_ORDER = [1, 2, 3, 4, 5, 6, 0]

const WORKDAYS = [1, 2, 3, 4, 5]
const DEFAULT_TIME = '09:00'
const DEFAULT_INTERVAL_MIN = 30

interface SummarizeScheduleParams {
  schedule: RoutineSchedule
  labels: Messages['routine']['schedule']
}

/** 목록 한 줄 요약: "매일 09:00", "평일 09:00", "월·수 18:00", "30분마다", "3시간마다" */
export const summarizeSchedule = ({ schedule, labels }: SummarizeScheduleParams) => {
  if (schedule.kind === 'interval') {
    const { minutes } = schedule
    return minutes % MINUTES_PER_HOUR === 0
      ? labels.everyHours({ count: minutes / MINUTES_PER_HOUR })
      : labels.everyMinutes({ count: minutes })
  }

  const { weekdays, time } = schedule
  const isWorkdays =
    weekdays.length === WORKDAYS.length && WORKDAYS.every((day) => weekdays.includes(day))
  const days =
    weekdays.length === WEEKDAY_COUNT
      ? labels.everyDay
      : isWorkdays
        ? labels.weekdaysOnly
        : WEEKDAY_DISPLAY_ORDER.filter((day) => weekdays.includes(day))
            .map((day) => labels.weekdayNames[day])
            .join(labels.daySeparator)

  return labels.time({ days, time })
}

/** 폼 초기값. 새 루틴은 평일 09:00이다 */
export const formValuesOf = (routine: Routine | null): RoutineFormValues => {
  const schedule = routine?.schedule
  const minutes = schedule?.kind === 'interval' ? schedule.minutes : DEFAULT_INTERVAL_MIN
  const isHours = minutes % MINUTES_PER_HOUR === 0

  return {
    name: routine?.name ?? '',
    prompt: routine?.prompt ?? '',
    kind: schedule?.kind ?? 'time',
    weekdays: schedule?.kind === 'time' ? schedule.weekdays : WORKDAYS,
    time: schedule?.kind === 'time' ? schedule.time : DEFAULT_TIME,
    intervalCount: String(isHours ? minutes / MINUTES_PER_HOUR : minutes),
    intervalUnit: isHours ? 'hours' : 'minutes'
  }
}

/** 폼 입력값을 저장할 주기로 바꾼다. 범위 검증은 main이 한다 */
export const scheduleOf = (values: RoutineFormValues): RoutineSchedule =>
  values.kind === 'time'
    ? { kind: 'time', weekdays: values.weekdays, time: values.time }
    : {
        kind: 'interval',
        minutes:
          Number(values.intervalCount) * (values.intervalUnit === 'hours' ? MINUTES_PER_HOUR : 1)
      }

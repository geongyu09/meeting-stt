import type { Messages } from '@shared/i18n'
import { WEEKDAY_COUNT } from '@shared/routine'
import type { RoutineSchedule } from '@shared/types'

const MINUTES_PER_HOUR = 60

/** 화면은 월요일부터 보여 준다 (저장값은 0 = 일요일) */
export const WEEKDAY_DISPLAY_ORDER = [1, 2, 3, 4, 5, 6, 0]

export const WORKDAYS = [1, 2, 3, 4, 5]

interface SummarizeScheduleParams {
  schedule: RoutineSchedule
  labels: Messages['routine']['schedule']
}

/** 루틴 주기 한 줄 요약: "매일 09:00", "평일 09:00", "월·수 18:00", "30분마다", "3시간마다" */
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

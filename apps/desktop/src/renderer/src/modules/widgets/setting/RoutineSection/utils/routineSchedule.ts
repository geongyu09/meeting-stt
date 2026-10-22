import type { Routine, RoutineSchedule } from '@shared/types'
import { WORKDAYS } from '@renderer/shared/utils/summarizeSchedule'

import type { RoutineFormValues } from '../types/routineForm'

const MINUTES_PER_HOUR = 60

const DEFAULT_TIME = '09:00'
const DEFAULT_INTERVAL_MIN = 30

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

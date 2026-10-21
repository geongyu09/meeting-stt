import type { RoutineSchedule } from '@shared/types'

export type IntervalUnit = 'minutes' | 'hours'

/** 루틴 폼의 입력값. 저장할 때 `RoutineSchedule`로 바꾼다 */
export interface RoutineFormValues {
  name: string
  prompt: string
  kind: RoutineSchedule['kind']
  weekdays: number[]
  time: string
  /** 입력 중 빈 칸을 허용하려고 문자열로 든다. 틀린 값은 main이 거절한다 */
  intervalCount: string
  intervalUnit: IntervalUnit
}

export type RoutineRunState = 'idle' | 'running' | 'queued'

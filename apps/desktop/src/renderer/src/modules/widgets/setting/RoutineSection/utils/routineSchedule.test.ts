import { describe, expect, it } from 'vitest'
import type { Routine } from '@shared/types'

import { formValuesOf, scheduleOf } from './routineSchedule'

const routineOf = (schedule: Routine['schedule']): Routine => ({
  id: 'r1',
  name: '아침',
  prompt: '정리',
  schedule,
  isEnabled: true,
  anchorAt: 0,
  lastRun: null
})

describe('formValuesOf · scheduleOf', () => {
  it('새 루틴은 평일 09:00이고 그대로 저장하면 같은 주기다', () => {
    const values = formValuesOf(null)

    expect(scheduleOf(values)).toEqual({ kind: 'time', weekdays: [1, 2, 3, 4, 5], time: '09:00' })
  })

  it('간격은 시간 단위로 펼쳤다가 분으로 되돌린다', () => {
    const values = formValuesOf(routineOf({ kind: 'interval', minutes: 120 }))

    expect(values).toMatchObject({ kind: 'interval', intervalCount: '2', intervalUnit: 'hours' })
    expect(scheduleOf(values)).toEqual({ kind: 'interval', minutes: 120 })
    expect(scheduleOf({ ...values, intervalUnit: 'minutes', intervalCount: '45' })).toEqual({
      kind: 'interval',
      minutes: 45
    })
  })

  it('빈 간격은 0분이 되어 main이 거절한다', () => {
    const values = { ...formValuesOf(null), kind: 'interval' as const, intervalCount: '' }

    expect(scheduleOf(values)).toEqual({ kind: 'interval', minutes: 0 })
  })
})

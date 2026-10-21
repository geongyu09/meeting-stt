import { describe, expect, it } from 'vitest'
import { routineEn, routineKo } from '@shared/locales/routine'
import type { Routine } from '@shared/types'

import { formValuesOf, scheduleOf, summarizeSchedule } from './routineSchedule'

const labels = routineKo.schedule

const routineOf = (schedule: Routine['schedule']): Routine => ({
  id: 'r1',
  name: '아침',
  prompt: '정리',
  schedule,
  isEnabled: true,
  anchorAt: 0,
  lastRun: null
})

describe('summarizeSchedule', () => {
  it('요일을 매일·평일·월요일부터 나열로 줄인다', () => {
    const at = (weekdays: number[]) =>
      summarizeSchedule({ schedule: { kind: 'time', weekdays, time: '09:00' }, labels })

    expect(at([0, 1, 2, 3, 4, 5, 6])).toBe('매일 09:00')
    expect(at([1, 2, 3, 4, 5])).toBe('평일 09:00')
    expect(at([0, 1, 3])).toBe('월·수·일 09:00')
  })

  it('60분 단위 간격은 시간으로 보여 준다', () => {
    const at = (minutes: number) =>
      summarizeSchedule({ schedule: { kind: 'interval', minutes }, labels })

    expect(at(30)).toBe('30분마다')
    expect(at(180)).toBe('3시간마다')
    expect(
      summarizeSchedule({ schedule: { kind: 'interval', minutes: 90 }, labels: routineEn.schedule })
    ).toBe('Every 90 min')
  })
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

import { describe, expect, it } from 'vitest'
import { routineEn, routineKo } from '@shared/locales/routine'

import { summarizeSchedule } from './index'

const labels = routineKo.schedule

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

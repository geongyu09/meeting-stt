import { describe, expect, it } from 'vitest'

import {
  isRoutineDue,
  nextRoutineRunAt,
  parseStoredRoutines,
  readRoutineIdPayload,
  readRoutineInputPayload
} from './routine'
import type { Routine } from './types'

// 2026-10-22는 목요일(4)이다. 로컬 시각으로 만들어 시간대와 무관하게 돈다
const localMs = (day: number, hours: number, minutes = 0) =>
  new Date(2026, 9, day, hours, minutes).getTime()

const WEEKDAYS = [1, 2, 3, 4, 5]

const routineOf = (overrides: Partial<Routine> = {}): Routine => ({
  id: 'r1',
  name: '아침 브리핑',
  prompt: '오늘 할 일 정리',
  schedule: { kind: 'time', weekdays: WEEKDAYS, time: '09:00' },
  isEnabled: true,
  anchorAt: localMs(22, 8),
  lastRun: null,
  ...overrides
})

describe('nextRoutineRunAt', () => {
  it('간격은 기준 시각에 분을 더한다', () => {
    const after = localMs(22, 8)
    expect(nextRoutineRunAt({ schedule: { kind: 'interval', minutes: 30 }, after })).toBe(
      localMs(22, 8, 30)
    )
  })

  it('같은 날 시각이 아직 안 지났으면 오늘이다', () => {
    const schedule = { kind: 'time' as const, weekdays: WEEKDAYS, time: '09:00' }
    expect(nextRoutineRunAt({ schedule, after: localMs(22, 8) })).toBe(localMs(22, 9))
  })

  it('오늘 시각이 지났으면 다음 고른 요일이다 (목 → 금)', () => {
    const schedule = { kind: 'time' as const, weekdays: WEEKDAYS, time: '09:00' }
    expect(nextRoutineRunAt({ schedule, after: localMs(22, 9) })).toBe(localMs(23, 9))
  })

  it('고르지 않은 요일은 건너뛴다 (금 저녁 → 월)', () => {
    const schedule = { kind: 'time' as const, weekdays: WEEKDAYS, time: '09:00' }
    expect(nextRoutineRunAt({ schedule, after: localMs(23, 18) })).toBe(localMs(26, 9))
  })

  it('요일 하나만 고르고 그 요일 시각이 지났으면 다음 주다', () => {
    const schedule = { kind: 'time' as const, weekdays: [4], time: '09:00' }
    expect(nextRoutineRunAt({ schedule, after: localMs(22, 10) })).toBe(localMs(29, 9))
  })

  it('요일이 비면 돌지 않는다', () => {
    const schedule = { kind: 'time' as const, weekdays: [], time: '09:00' }
    expect(nextRoutineRunAt({ schedule, after: localMs(22, 8) })).toBe(Number.POSITIVE_INFINITY)
  })
})

describe('isRoutineDue', () => {
  it('다음 실행 시각이 지나면 true', () => {
    expect(isRoutineDue({ routine: routineOf(), now: localMs(22, 9) })).toBe(true)
    expect(isRoutineDue({ routine: routineOf(), now: localMs(22, 8, 59) })).toBe(false)
  })

  it('여러 주기를 놓쳐도 기준 시각만 보면 한 번 때가 된 것이다', () => {
    const routine = routineOf({ anchorAt: localMs(19, 8) })
    expect(isRoutineDue({ routine, now: localMs(22, 10) })).toBe(true)
  })

  it('꺼진 루틴은 때가 되지 않는다', () => {
    expect(isRoutineDue({ routine: routineOf({ isEnabled: false }), now: localMs(22, 10) })).toBe(
      false
    )
  })
})

describe('readRoutineInputPayload', () => {
  const valid = {
    id: null,
    name: '  아침  ',
    prompt: ' 정리해 줘 ',
    schedule: { kind: 'time', weekdays: [5, 1, 1], time: '09:30' },
    isEnabled: true
  }

  it('공백을 자르고 요일을 정리한다', () => {
    expect(readRoutineInputPayload(valid)).toEqual({
      id: null,
      name: '아침',
      prompt: '정리해 줘',
      schedule: { kind: 'time', weekdays: [1, 5], time: '09:30' },
      isEnabled: true
    })
  })

  it('이름·프롬프트가 비거나 이름이 길면 거절한다', () => {
    expect(() => readRoutineInputPayload({ ...valid, name: ' ' })).toThrow('이름')
    expect(() => readRoutineInputPayload({ ...valid, name: 'a'.repeat(41) })).toThrow('이름')
    expect(() => readRoutineInputPayload({ ...valid, prompt: '' })).toThrow('프롬프트')
  })

  it('틀린 주기를 거절한다', () => {
    const cases = [
      { kind: 'time', weekdays: [], time: '09:00' },
      { kind: 'time', weekdays: [7], time: '09:00' },
      { kind: 'time', weekdays: [1], time: '24:00' },
      { kind: 'time', weekdays: [1], time: '9:00' },
      { kind: 'interval', minutes: 9 },
      { kind: 'interval', minutes: 1441 },
      { kind: 'interval', minutes: 30.5 },
      { kind: 'cron' }
    ]
    cases.forEach((schedule) =>
      expect(() => readRoutineInputPayload({ ...valid, schedule })).toThrow('주기')
    )
  })

  it('간격 경계값은 받는다', () => {
    const at = (minutes: number) =>
      readRoutineInputPayload({ ...valid, schedule: { kind: 'interval', minutes } }).schedule
    expect(at(10)).toEqual({ kind: 'interval', minutes: 10 })
    expect(at(1440)).toEqual({ kind: 'interval', minutes: 1440 })
  })

  it('켜기 값이나 id 형식이 틀리면 거절한다', () => {
    expect(() => readRoutineInputPayload({ ...valid, isEnabled: 'yes' })).toThrow()
    expect(() => readRoutineInputPayload({ ...valid, id: '' })).toThrow()
    expect(() => readRoutineIdPayload({ id: 3 })).toThrow()
  })
})

describe('parseStoredRoutines', () => {
  it('깨진 항목만 버린다', () => {
    const stored = [routineOf(), { id: 'broken' }, routineOf({ id: 'r2', lastRun: null })]
    expect(parseStoredRoutines(stored).map((routine) => routine.id)).toEqual(['r1', 'r2'])
  })

  it('형식이 틀린 마지막 결과는 없음으로 읽는다', () => {
    const [routine] = parseStoredRoutines([{ ...routineOf(), lastRun: { text: 1 } }])
    expect(routine.lastRun).toBeNull()
  })

  it('배열이 아니면 빈 목록이다', () => {
    expect(parseStoredRoutines(undefined)).toEqual([])
    expect(parseStoredRoutines({})).toEqual([])
  })
})

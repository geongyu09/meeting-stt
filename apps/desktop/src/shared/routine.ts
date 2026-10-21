/**
 * 루틴의 순수 로직 (references/features/assistant.md "루틴").
 * 다음 실행 계산과 renderer가 보낸 payload·DB 저장값 검증을 둔다. 스케줄러·spawn은 `src/main/assistant/routines.ts`.
 */

import { MAX_QUESTION_CHARS } from './assistant'
import { routineKo } from './locales/routine'
import type { Routine, RoutineInput, RoutineRun, RoutineSchedule } from './types'

/** main이 던지는 검증 오류 문구. 기본은 한국어 사전이고 main은 현재 언어의 `t().routine.errors`를 넘긴다 */
export type RoutineErrorMessages = typeof routineKo.errors

export const ROUTINE_NAME_MAX_CHARS = 40

/** 에이전트 한 턴이 몇 분씩 걸려 더 짧으면 쉬지 않고 연달아 돌며 구독 한도를 쓴다 */
export const ROUTINE_MIN_INTERVAL_MIN = 10

/** 더 긴 주기는 시각 루틴(요일)으로 만든다 */
export const ROUTINE_MAX_INTERVAL_MIN = 24 * 60

/** 마지막 답을 settings JSON에 통째로 넣으므로 길이를 자른다 */
export const ROUTINE_RESULT_MAX_CHARS = 20_000

export const WEEKDAY_COUNT = 7

const MS_PER_MIN = 60_000

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

const isWeekday = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0 && value < WEEKDAY_COUNT

const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === 'string')

interface NextRoutineRunAtParams {
  schedule: RoutineSchedule
  /** 기준 시각(epoch ms). 이 시각보다 뒤의 첫 실행을 찾는다 */
  after: number
}

/**
 * @description 기준 시각 다음의 실행 시각을 구합니다. 시각 루틴은 로컬 시각 기준이다.
 * @param schedule - 루틴 주기
 * @param after - 기준 시각 (`Routine.anchorAt`)
 * @returns 다음 실행 시각(epoch ms). 요일이 비어 있으면 Infinity(돌지 않음)
 * @example
 * nextRoutineRunAt({ schedule: { kind: 'interval', minutes: 30 }, after: 0 }) // 1_800_000
 */
export const nextRoutineRunAt = ({ schedule, after }: NextRoutineRunAtParams) => {
  if (schedule.kind === 'interval') return after + schedule.minutes * MS_PER_MIN

  const [hours, minutes] = schedule.time.split(':').map(Number)
  const base = new Date(after)
  // 오늘부터 7일 뒤까지 보면 고른 요일이 반드시 나온다 (오늘 시각이 지났으면 다음 주 같은 요일)
  const next = Array.from(
    { length: WEEKDAY_COUNT + 1 },
    (_, offset) =>
      new Date(base.getFullYear(), base.getMonth(), base.getDate() + offset, hours, minutes)
  ).find(
    (candidate) => candidate.getTime() > after && schedule.weekdays.includes(candidate.getDay())
  )

  return next?.getTime() ?? Number.POSITIVE_INFINITY
}

/**
 * @description 켜진 루틴의 다음 실행 시각이 지났는지 봅니다. 여러 주기를 놓쳐도 실행을 시작하면 기준 시각이 지금으로 바뀌어 한 번만 돈다.
 * @param routine - 루틴
 * @param now - 지금(epoch ms)
 * @returns 지금 돌아야 하면 true
 * @example
 * routines.filter((routine) => isRoutineDue({ routine, now: Date.now() }))
 */
export const isRoutineDue = ({ routine, now }: { routine: Routine; now: number }) =>
  routine.isEnabled &&
  nextRoutineRunAt({ schedule: routine.schedule, after: routine.anchorAt }) <= now

/** 형식이 맞으면 정리한 주기(요일 중복 제거·정렬), 아니면 null */
const readSchedule = (value: unknown): RoutineSchedule | null => {
  if (!isRecord(value)) return null

  if (value.kind === 'interval') {
    const { minutes } = value
    const isValid =
      typeof minutes === 'number' &&
      Number.isInteger(minutes) &&
      minutes >= ROUTINE_MIN_INTERVAL_MIN &&
      minutes <= ROUTINE_MAX_INTERVAL_MIN

    return isValid ? { kind: 'interval', minutes } : null
  }

  const { time, weekdays } = value
  if (value.kind !== 'time' || typeof time !== 'string' || !TIME_PATTERN.test(time)) return null
  if (!Array.isArray(weekdays) || !weekdays.length || !weekdays.every(isWeekday)) return null

  return { kind: 'time', weekdays: [...new Set(weekdays)].toSorted((a, b) => a - b), time }
}

/**
 * @description `routines:save` payload를 검증합니다. 이름·프롬프트는 앞뒤 공백을 자른다.
 * @param payload - renderer가 보낸 값
 * @param errors - 오류 문구 사전. 생략하면 한국어
 * @returns 정리한 루틴 입력
 * @example
 * const input = readRoutineInputPayload({ id: null, name: '아침', prompt: '정리해 줘', schedule, isEnabled: true })
 */
export const readRoutineInputPayload = (
  payload: unknown,
  errors: RoutineErrorMessages = routineKo.errors
): RoutineInput => {
  if (!isRecord(payload) || typeof payload.isEnabled !== 'boolean') {
    throw new Error(errors.invalidRoutine)
  }
  if (payload.id !== null && (typeof payload.id !== 'string' || !payload.id)) {
    throw new Error(errors.invalidRoutine)
  }

  const name = typeof payload.name === 'string' ? payload.name.trim() : ''
  if (!name || name.length > ROUTINE_NAME_MAX_CHARS) throw new Error(errors.invalidName)

  const prompt = typeof payload.prompt === 'string' ? payload.prompt.trim() : ''
  if (!prompt) throw new Error(errors.emptyPrompt)
  if (prompt.length > MAX_QUESTION_CHARS) throw new Error(errors.promptTooLong)

  const schedule = readSchedule(payload.schedule)
  if (!schedule) throw new Error(errors.invalidSchedule)

  return { id: payload.id, name, prompt, schedule, isEnabled: payload.isEnabled }
}

/**
 * @description `routines:delete`·`routines:run` payload에서 루틴 id를 꺼냅니다. 있는 루틴인지는 main이 본다.
 * @param payload - renderer가 보낸 값
 * @param errors - 오류 문구 사전. 생략하면 한국어
 * @returns 루틴 id
 * @example
 * readRoutineIdPayload({ id: 'abc' }) // 'abc'
 */
export const readRoutineIdPayload = (
  payload: unknown,
  errors: RoutineErrorMessages = routineKo.errors
) => {
  if (!isRecord(payload) || typeof payload.id !== 'string' || !payload.id) {
    throw new Error(errors.invalidRoutine)
  }

  return payload.id
}

const readRun = (value: unknown): RoutineRun | null => {
  if (!isRecord(value)) return null

  const { finishedAt, text, changedFiles, error } = value
  if (typeof finishedAt !== 'number' || typeof text !== 'string') return null
  if (!isStringArray(changedFiles) || (error !== null && typeof error !== 'string')) return null

  return { finishedAt, text, changedFiles, error }
}

const readStoredRoutine = (value: unknown): Routine | null => {
  if (!isRecord(value)) return null

  const { id, name, prompt, isEnabled, anchorAt } = value
  const schedule = readSchedule(value.schedule)
  const isValid =
    typeof id === 'string' &&
    typeof name === 'string' &&
    typeof prompt === 'string' &&
    typeof isEnabled === 'boolean' &&
    typeof anchorAt === 'number' &&
    schedule !== null
  if (!isValid) return null

  return { id, name, prompt, schedule, isEnabled, anchorAt, lastRun: readRun(value.lastRun) }
}

/**
 * @description settings 키 `assistant.routines`의 값을 읽습니다. 형식이 깨진 항목은 버린다 — 루틴 하나 때문에 목록 전체를 잃지 않는다.
 * @param value - JSON.parse한 저장값
 * @returns 루틴 목록
 * @example
 * const routines = parseStoredRoutines(readValue('assistant.routines'))
 */
export const parseStoredRoutines = (value: unknown) =>
  Array.isArray(value)
    ? value.flatMap((item) => {
        const routine = readStoredRoutine(item)
        return routine ? [routine] : []
      })
    : []

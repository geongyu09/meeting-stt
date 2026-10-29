import { randomUUID } from 'node:crypto'
import type { Routine, RoutineInput, RoutineRun, RoutinesState } from '@shared/types'
import { isRoutineDue, ROUTINE_RESULT_MAX_CHARS } from '@shared/routine'
import { getRoutines, setRoutines } from '../db/settings'
import { t } from '../locale'
import { info, messageOf, warn } from '../log'
import { notificationSummaryOf, showNotification } from '../windows/notify'

import { requireWorkspaceFolder } from './folder'
import { runUnattendedTurn } from './unattendedTurn'

/**
 * 루틴 스케줄러와 실행 큐 (references/features/assistant.md "루틴" > "스케줄러와 실행").
 * 채팅 대화(`session.ts`)와 별개로 새 세션 한 턴씩 돌고, 도는 루틴·큐는 main 메모리에만 둔다.
 */

/** 루틴마다 타이머를 두지 않고 이 간격으로 훑는다 — 잠자기에서 깨어난 직후 놓친 실행을 잡는다 */
const ROUTINE_TICK_MS = 30_000

/** 에이전트가 멈춰도 다음 루틴이 막히지 않게 한다 */
const ROUTINE_TIMEOUT_MS = 10 * 60_000

/** 루틴 프롬프트 앞에 붙인다. UI 문구가 아니라 프롬프트라 UI 언어와 무관하게 한국어다 */
const ROUTINE_PREAMBLE =
  '이 요청은 사용자가 정해 둔 루틴으로, 정해진 주기에 자동으로 실행됐다. 답할 사람이 없으니 ' +
  '질문하지 말고 끝까지 처리하라. 답변 글은 알림과 루틴 목록에 그대로 보인다.'

let queuedIds: string[] = []
let running: { id: string; controller: AbortController } | null = null
let tickTimer: NodeJS.Timeout | null = null
/** 앱 종료 뒤에는 닫힌 DB를 건드리지 않는다 */
let isStopped = false
let changeListener: ((state: RoutinesState) => void) | null = null

export const setRoutinesListener = (listener: (state: RoutinesState) => void) => {
  changeListener = listener
}

export const getRoutinesState = (): RoutinesState => ({
  routines: getRoutines(),
  runningId: running?.id ?? null,
  queuedIds
})

const pushState = () => changeListener?.(getRoutinesState())

const updateRoutine = ({ id, change }: { id: string; change: (routine: Routine) => Routine }) =>
  setRoutines(getRoutines().map((routine) => (routine.id === id ? change(routine) : routine)))

const runOf = ({ text, changedFiles, error }: Omit<RoutineRun, 'finishedAt'>): RoutineRun => ({
  finishedAt: Date.now(),
  text: text.slice(0, ROUTINE_RESULT_MAX_CHARS),
  changedFiles,
  error
})

interface ExecuteRoutineParams {
  routine: Routine
  controller: AbortController
}

/** 한 번 실행한 결과. 지우기·앱 종료로 끝냈으면 null(결과를 남기지 않는다) */
const executeRoutine = async ({
  routine,
  controller
}: ExecuteRoutineParams): Promise<RoutineRun | null> => {
  try {
    const run = await runUnattendedTurn({
      folder: await requireWorkspaceFolder(),
      text: `${ROUTINE_PREAMBLE}\n\n${routine.prompt}`,
      controller,
      timeoutMs: ROUTINE_TIMEOUT_MS,
      timeoutMessage: t().routine.errors.timeout
    })
    if (run.error) warn(`루틴 실패 (${routine.name}): ${run.error}`)

    return runOf(run)
  } catch (caught) {
    if (controller.signal.aborted) return null

    const reason = messageOf(caught)
    warn(`루틴 실패 (${routine.name}): ${reason}`)
    return runOf({ text: '', changedFiles: [], error: reason })
  }
}

const notifyRun = ({ routine, run }: { routine: Routine; run: RoutineRun }) => {
  const summary = notificationSummaryOf(run.text)
  const labels = t().routine.notification

  showNotification({
    title: routine.name,
    body: run.error ? labels.failed({ reason: run.error }) : summary || labels.noAnswer
  })
}

const drainQueue = async () => {
  if (running || isStopped) return

  const [id, ...rest] = queuedIds
  if (!id) return
  queuedIds = rest

  const routine = getRoutines().find((item) => item.id === id)
  if (!routine) return drainQueue()

  const controller = new AbortController()
  running = { id, controller }
  // 시작할 때 기준 시각을 옮겨야 여러 주기를 놓쳤어도 한 번만 돈다
  updateRoutine({ id, change: (current) => ({ ...current, anchorAt: Date.now() }) })
  pushState()
  info(`루틴 시작: ${routine.name}`)
  showNotification({ title: routine.name, body: t().routine.notification.started })

  const run = await executeRoutine({ routine, controller })
  running = null
  if (isStopped) return

  if (run) {
    updateRoutine({ id, change: (current) => ({ ...current, lastRun: run }) })
    notifyRun({ routine, run })
  }
  pushState()
  await drainQueue()
}

const startDraining = () => {
  drainQueue().catch((caught: unknown) => warn(`루틴 큐 처리 실패: ${messageOf(caught)}`))
}

const enqueue = (id: string) => {
  if (running?.id === id || queuedIds.includes(id)) return

  queuedIds = [...queuedIds, id]
  pushState()
  startDraining()
}

const tick = () => {
  const now = Date.now()
  getRoutines()
    .filter((routine) => isRoutineDue({ routine, now }))
    .forEach((routine) => enqueue(routine.id))
}

/** 앱 시작 때 한 번. 꺼져 있던 동안 놓친 실행을 바로 잡고 이후 30초마다 훑는다 */
export const startRoutineScheduler = () => {
  tick()
  tickTimer = setInterval(tick, ROUTINE_TICK_MS)
}

/** 앱 종료(`will-quit`). spawn한 에이전트는 앱이 끝나도 혼자 남아 파일을 고칠 수 있다 */
export const stopRoutines = () => {
  isStopped = true
  if (tickTimer) clearInterval(tickTimer)
  tickTimer = null
  queuedIds = []
  running?.controller.abort()
}

/** 만들기·고치기. 저장도 기준 시각을 옮긴다 — 고친 순간 이미 지난 시각이 바로 돌지 않게 */
export const saveRoutine = ({ id, ...fields }: RoutineInput) => {
  const routines = getRoutines()
  const anchorAt = Date.now()

  if (id === null) {
    setRoutines([...routines, { id: randomUUID(), ...fields, anchorAt, lastRun: null }])
  } else {
    if (!routines.some((routine) => routine.id === id)) {
      throw new Error(t().routine.errors.notFound)
    }
    updateRoutine({ id, change: (current) => ({ ...current, ...fields, anchorAt }) })
  }

  pushState()
  return getRoutinesState()
}

/** 지우면 큐에서 빼고 도는 중이면 끝낸다 */
export const deleteRoutine = (id: string) => {
  setRoutines(getRoutines().filter((routine) => routine.id !== id))
  queuedIds = queuedIds.filter((queuedId) => queuedId !== id)
  if (running?.id === id) running.controller.abort()

  pushState()
  return getRoutinesState()
}

/** 주기와 무관하게 지금 큐에 넣는다. 꺼진 루틴도 된다 */
export const runRoutineNow = (id: string) => {
  if (!getRoutines().some((routine) => routine.id === id)) {
    throw new Error(t().routine.errors.notFound)
  }

  enqueue(id)
  return getRoutinesState()
}

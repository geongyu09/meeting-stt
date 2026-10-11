import { useCallback, useEffect, useRef, useState } from 'react'
import type { ControlDictationRequest, DictationStateEvent } from '@shared/ipc'
import { controlDictationApi, getDictationStateApi } from '@renderer/shared/api/dictation'
import { onDictationState } from '@renderer/shared/api/events'
import { useLocale } from '@renderer/shared/provider/context/localeContext'

const ELAPSED_TICK_MS = 200
const MS_PER_SEC = 1000

const IDLE_STATE: DictationStateEvent = {
  phase: 'idle',
  startedAt: null,
  level: 0,
  insertMode: 'clipboard',
  lastInsertedText: '',
  hasLastResult: false
}

/**
 * 받아쓰기(음성 입력) 상태를 구독하고 시작·정지를 요청한다. 단일 출처는 main의 받아쓰기 세션이고
 * 위젯 패널·설정 화면·메뉴바가 같은 값을 본다 (references/architecture.md "받아쓰기" > "세션과 상태").
 */
const useDictation = () => {
  const { t } = useLocale()
  const [state, setState] = useState(IDLE_STATE)
  const [now, setNow] = useState(() => Date.now())
  const [controlError, setControlError] = useState<string | null>(null)
  const isEventReceivedRef = useRef(false)

  // 상태가 바뀐 순간의 시각을 함께 잡아 둔다 — 첫 타이머 전까지 경과 시간이 0으로 보이지 않게
  const applyState = useCallback((next: DictationStateEvent) => {
    setState(next)
    setNow(Date.now())
  }, [])

  const applyEvent = useCallback(
    (next: DictationStateEvent) => {
      isEventReceivedRef.current = true
      applyState(next)
    },
    [applyState]
  )

  // 늦게 열린 창은 상태 이벤트를 놓쳤을 수 있어 현재 값을 한 번 물어본다
  const fetchState = useCallback(
    () =>
      getDictationStateApi()
        .then((next) => {
          // 조회하는 동안 이벤트가 먼저 왔다면 그쪽이 더 새롭다
          if (!isEventReceivedRef.current) applyState(next)
        })
        .catch(() =>
          setState((current) => ({ ...current, errorMessage: t.dictation.errors.stateUnavailable }))
        ),
    [applyState, t]
  )

  useEffect(() => {
    fetchState()
  }, [fetchState])

  useEffect(() => onDictationState(applyEvent), [applyEvent])

  /**
   * 접근성 권한은 시스템 설정에서 바꾼 뒤 돌아와야 알 수 있다. 설정 화면이 창 포커스 때 다시 읽는다.
   * 이벤트가 이미 왔어도 권한 상태는 push되지 않으므로 조회 결과를 그대로 받는다
   */
  const refetch = useCallback(
    () =>
      getDictationStateApi()
        .then(applyState)
        .catch(() =>
          setState((current) => ({ ...current, errorMessage: t.dictation.errors.stateUnavailable }))
        ),
    [applyState, t]
  )

  // 경과 시간은 startedAt으로 각자 계산한다 — 창이 가려져 렌더가 밀려도 값이 정확하다
  useEffect(() => {
    if (state.startedAt === null) return

    const timer = setInterval(() => setNow(Date.now()), ELAPSED_TICK_MS)

    return () => clearInterval(timer)
  }, [state.startedAt])

  const control = useCallback(
    async ({ kind }: ControlDictationRequest) => {
      try {
        await controlDictationApi({ kind })
        setControlError(null)
      } catch {
        setControlError(t.dictation.errors.controlFailed)
      }
    },
    [t]
  )

  const elapsedSec =
    state.startedAt === null ? 0 : Math.max(0, (now - state.startedAt) / MS_PER_SEC)

  return {
    phase: state.phase,
    isActive: state.phase !== 'idle',
    level: state.level,
    insertMode: state.insertMode,
    lastInsertedText: state.lastInsertedText,
    hasLastResult: state.hasLastResult,
    errorMessage: state.errorMessage ?? controlError ?? undefined,
    elapsedSec,
    control,
    refetch
  }
}

export default useDictation

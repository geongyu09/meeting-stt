import { useCallback, useEffect, useSyncExternalStore } from 'react'
import type { AssistantStatus } from '@shared/types'
import { getAssistantStatusApi } from '@renderer/shared/api/assistant'
import { useLocale } from '@renderer/shared/provider/context/localeContext'

interface AssistantStatusSnapshot {
  status: AssistantStatus | null
  isLoading: boolean
  error: Error | null
}

const INITIAL_SNAPSHOT: AssistantStatusSnapshot = { status: null, isLoading: true, error: null }

// 설정 카드와 채팅이 각자 이 훅을 부르므로, 한쪽이 폴더를 고르면 다른 쪽도 바로 알도록 상태를 모듈 하나가 든다
// (.claude/rules/component-abstract-pattern.md — 요청이 겹치면 도메인 훅에 캐시를 둔다)
let snapshot = INITIAL_SNAPSHOT
const listeners = new Set<() => void>()

const publish = (patch: Partial<AssistantStatusSnapshot>) => {
  snapshot = { ...snapshot, ...patch }
  listeners.forEach((listener) => listener())
}

const subscribe = (listener: () => void) => {
  listeners.add(listener)

  return () => {
    listeners.delete(listener)
    // 마지막 구독자가 떠나면 비운다 — 다음에 열 때 옛 값이 먼저 보이지 않게
    if (listeners.size === 0) snapshot = INITIAL_SNAPSHOT
  }
}

const getSnapshot = () => snapshot

/**
 * 작업 폴더 상태. 설정 화면·설정 카드·채팅이 같이 본다. 폴더 고르기·권한 저장 응답도 같은 모양이라
 * `applyStatus`로 바로 반영하면 같은 창의 다른 구독자에게도 퍼진다 (references/features/assistant.md "개인 비서 모드").
 */
const useAssistantStatus = () => {
  const { t } = useLocale()
  const { status, isLoading, error } = useSyncExternalStore(subscribe, getSnapshot)

  // effect에서 부르는 함수라 await 대신 프로미스 체인으로 쓴다 (.claude/rules/hook-guide.md)
  const fetchStatus = useCallback(
    () =>
      getAssistantStatusApi()
        .then((next) => publish({ status: next, error: null }))
        .catch((caught: unknown) =>
          publish({ error: caught instanceof Error ? caught : new Error(t.assistant.chat.loading) })
        )
        .finally(() => publish({ isLoading: false })),
    [t]
  )

  useEffect(() => {
    fetchStatus()
  }, [fetchStatus])

  const applyStatus = useCallback((next: AssistantStatus) => {
    publish({ status: next, error: null })
  }, [])

  return { status, isLoading, error, refetch: fetchStatus, applyStatus }
}

export default useAssistantStatus

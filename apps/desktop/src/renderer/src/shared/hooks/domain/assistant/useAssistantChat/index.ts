import { useCallback, useEffect, useRef, useState } from 'react'
import type { AssistantChatState, AssistantProvider } from '@shared/types'
import {
  cancelAssistantApi,
  getAssistantStateApi,
  resetAssistantChatApi,
  sendAssistantMessageApi
} from '@renderer/shared/api/assistant'
import { onAssistantState } from '@renderer/shared/api/events'

const EMPTY_STATE: AssistantChatState = {
  provider: null,
  sessionId: null,
  turns: [],
  isRunning: false
}

/**
 * 개인 비서 대화. 단일 출처는 main의 대화 세션이라 화면을 옮겼다 돌아와도 이어 그린다
 * (references/architecture.md "개인 비서 모드" > "대화 상태"). 실패는 호출한 쪽이 안내하도록 그대로 던진다.
 */
const useAssistantChat = () => {
  const [state, setState] = useState(EMPTY_STATE)
  const isEventReceivedRef = useRef(false)

  useEffect(
    () =>
      onAssistantState((next) => {
        isEventReceivedRef.current = true
        setState(next)
      }),
    []
  )

  // 이미 진행 중인 대화가 있을 수 있어 현재 값을 한 번 물어본다
  useEffect(() => {
    getAssistantStateApi()
      .then((next) => {
        // 조회하는 동안 이벤트가 먼저 왔다면 그쪽이 더 새롭다
        if (!isEventReceivedRef.current) setState(next)
      })
      .catch(() => setState(EMPTY_STATE))
  }, [])

  const send = useCallback(
    ({ provider, text }: { provider: AssistantProvider; text: string }) =>
      sendAssistantMessageApi({ provider, text }),
    []
  )

  const reset = useCallback(async () => setState(await resetAssistantChatApi()), [])

  return { state, send, cancel: cancelAssistantApi, reset }
}

export default useAssistantChat

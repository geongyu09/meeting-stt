import { useCallback, useEffect, useState } from 'react'
import type { AssistantStatus } from '@shared/types'
import { getAssistantStatusApi } from '@renderer/shared/api/assistant'
import { useLocale } from '@renderer/shared/provider/context/localeContext'

/**
 * 작업 폴더 상태. 설정 화면과 비서 화면이 같이 본다. 폴더 고르기·권한 저장 응답도 같은 모양이라
 * `applyStatus`로 바로 반영한다 (references/architecture.md "개인 비서 모드").
 */
const useAssistantStatus = () => {
  const { t } = useLocale()
  const [status, setStatus] = useState<AssistantStatus | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  // effect에서 부르는 함수라 await 대신 프로미스 체인으로 쓴다 (.claude/rules/hook-guide.md)
  const fetchStatus = useCallback(
    () =>
      getAssistantStatusApi()
        .then((next) => {
          setStatus(next)
          setError(null)
        })
        .catch((caught: unknown) =>
          setError(caught instanceof Error ? caught : new Error(t.assistant.chat.loading))
        )
        .finally(() => setIsLoading(false)),
    [t]
  )

  useEffect(() => {
    fetchStatus()
  }, [fetchStatus])

  const applyStatus = useCallback((next: AssistantStatus) => {
    setStatus(next)
    setError(null)
  }, [])

  return { status, isLoading, error, refetch: fetchStatus, applyStatus }
}

export default useAssistantStatus

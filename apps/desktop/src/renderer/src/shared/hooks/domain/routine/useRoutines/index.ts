import { useEffect, useState } from 'react'
import type { RoutinesState } from '@shared/types'
import { onRoutinesChanged } from '@renderer/shared/api/events'
import { getRoutinesApi } from '@renderer/shared/api/routine'

/**
 * 루틴 목록과 실행 상태 (references/features/assistant.md "루틴"). 스케줄러가 실행을 시작하고 끝낼 때마다
 * `routines:changed`로 갱신된다. 저장·삭제 응답도 같은 모양이라 `applyState`로 바로 반영한다.
 */
const useRoutines = () => {
  const [state, setState] = useState<RoutinesState | null>(null)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    getRoutinesApi()
      .then((next) => {
        setState(next)
        setError(null)
      })
      .catch((caught: unknown) =>
        setError(caught instanceof Error ? caught : new Error(String(caught)))
      )

    return onRoutinesChanged(setState)
  }, [])

  return { state, error, applyState: setState }
}

export default useRoutines

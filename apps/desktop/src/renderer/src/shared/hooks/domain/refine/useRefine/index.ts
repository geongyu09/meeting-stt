import { useEffect, useState } from 'react'
import type { RefineStage } from '@shared/types'
import { onRefineProgress } from '@renderer/shared/api/events'
import { runRefineApi } from '@renderer/shared/api/refine'
import { useLocale } from '@renderer/shared/provider/context/localeContext'

interface UseRefineParams {
  meetingId: string
}

/** 잡이 끝났거나 아직 시작하지 않은 상태. 나머지 단계(용어 교정의 read·verify, 문장 교정의 sentence)는 진행 중이다 */
const IDLE_STAGES: (RefineStage | null)[] = [null, 'done', 'error']

interface RunRefineParams {
  /** 첫 진행 이벤트가 오기 전에 보여 줄 단계. 로컬은 'read', 외부 공급자는 'sentence' */
  initialStage: RefineStage
}

/**
 * 교정 잡의 진행 상태. 결과 자체는 회의 상세의 일부라 `useMeeting`이 들고,
 * 이 훅은 재실행 요청과 진행률만 다룬다. 자동 실행의 진행률도 같은 이벤트로 온다 (references/architecture.md "회의록 교정").
 */
const useRefine = ({ meetingId }: UseRefineParams) => {
  const { t } = useLocale()
  const [stage, setStage] = useState<RefineStage | null>(null)
  const [percent, setPercent] = useState(0)
  const [error, setError] = useState<string | null>(null)

  useEffect(
    () =>
      onRefineProgress((event) => {
        if (event.meetingId !== meetingId) return

        setStage(event.stage)
        setPercent(event.percent)
        setError(event.stage === 'error' ? (event.errorMessage ?? t.refine.errors.request) : null)
      }),
    [meetingId, t]
  )

  const runRefine = async ({ initialStage }: RunRefineParams) => {
    setStage(initialStage)
    setPercent(0)
    setError(null)

    try {
      await runRefineApi({ meetingId })
    } catch (caught) {
      setStage('error')
      setError(caught instanceof Error ? caught.message : t.refine.errors.request)
    }
  }

  return {
    stage,
    percent,
    error,
    isRunning: !IDLE_STAGES.includes(stage),
    runRefine
  }
}

export default useRefine

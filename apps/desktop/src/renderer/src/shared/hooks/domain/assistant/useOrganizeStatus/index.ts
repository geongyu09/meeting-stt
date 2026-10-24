import { useEffect, useState } from 'react'
import type { OrganizeStatus } from '@shared/types'
import { getOrganizeStatusApi } from '@renderer/shared/api/assistant'
import { onOrganizeProgress } from '@renderer/shared/api/events'

interface UseOrganizeStatusParams {
  meetingId: string
}

/**
 * 녹음 기록을 비서의 뇌 어디에 저장했고 정리 에이전트가 어떤 파일을 바꿨는지
 * (references/features/assistant.md "녹음 기록 자동 정리" > "화면"). 보낸 적 없으면 null.
 */
const useOrganizeStatus = ({ meetingId }: UseOrganizeStatusParams) => {
  const [status, setStatus] = useState<OrganizeStatus | null>(null)

  useEffect(() => {
    let isActive = true
    const unsubscribe = onOrganizeProgress((event) => {
      if (event.meetingId === meetingId) setStatus(event)
    })
    getOrganizeStatusApi({ meetingId })
      // 조회 응답보다 이벤트가 먼저 왔으면 이벤트가 더 새 값이다
      .then((initial) => {
        if (isActive) setStatus((current) => current ?? initial)
      })
      .catch((caught: unknown) => console.warn('기록 정리 상태를 읽지 못했습니다', caught))

    return () => {
      isActive = false
      unsubscribe()
    }
  }, [meetingId])

  return { status }
}

export default useOrganizeStatus

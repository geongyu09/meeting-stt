import { useCallback, useEffect, useState } from 'react'
import type { MeetingDetail } from '@shared/types'
import { onPipelineProgress } from '@renderer/shared/api/events'
import { getMeetingApi } from '@renderer/shared/api/meetings'

interface UseMeetingParams {
  meetingId: string
}

const useMeeting = ({ meetingId }: UseMeetingParams) => {
  const [detail, setDetail] = useState<MeetingDetail | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  // effect에서 부르는 함수라 await 대신 프로미스 체인으로 쓴다 (useMeetings와 같은 이유)
  const fetchMeeting = useCallback(
    () =>
      getMeetingApi({ meetingId })
        .then((next) => {
          setDetail(next)
          setError(null)
        })
        .catch((caught: unknown) =>
          setError(caught instanceof Error ? caught : new Error('회의를 불러오지 못했습니다'))
        )
        .finally(() => setIsLoading(false)),
    [meetingId]
  )

  const refetch = useCallback(() => {
    setIsLoading(true)

    return fetchMeeting()
  }, [fetchMeeting])

  useEffect(() => {
    fetchMeeting()
  }, [fetchMeeting])

  // 이 회의의 처리가 끝났을 때만 다시 읽는다
  useEffect(
    () =>
      onPipelineProgress((event) => {
        if (event.meetingId !== meetingId) return
        if (event.stage === 'done' || event.stage === 'error') fetchMeeting()
      }),
    [meetingId, fetchMeeting]
  )

  return {
    meeting: detail?.meeting ?? null,
    utterances: detail?.utterances ?? [],
    speakers: detail?.speakers ?? [],
    isLoading,
    error,
    refetch
  }
}

export default useMeeting

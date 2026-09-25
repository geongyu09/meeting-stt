import { useCallback, useEffect, useState } from 'react'
import type { MeetingDetail } from '@shared/types'
import { onPipelineProgress, onRefineProgress } from '@renderer/shared/api/events'
import {
  deleteMeetingApi,
  getMeetingApi,
  renameMeetingApi,
  reprocessMeetingApi
} from '@renderer/shared/api/meetings'
import { mergeSpeakersApi, renameSpeakerApi } from '@renderer/shared/api/speakers'
import { reassignUtteranceApi, updateUtteranceTextApi } from '@renderer/shared/api/utterances'
import { useLocale } from '@renderer/shared/provider/context/localeContext'

interface UseMeetingParams {
  meetingId: string
}

const useMeeting = ({ meetingId }: UseMeetingParams) => {
  const { t } = useLocale()
  const [detail, setDetail] = useState<MeetingDetail | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)
  const [saveError, setSaveError] = useState<Error | null>(null)

  // effect에서 부르는 함수라 await 대신 프로미스 체인으로 쓴다 (useMeetings와 같은 이유)
  const fetchMeeting = useCallback(
    () =>
      getMeetingApi({ meetingId })
        .then((next) => {
          setDetail(next)
          setError(null)
        })
        .catch((caught: unknown) =>
          setError(caught instanceof Error ? caught : new Error(t.transcript.errors.load))
        )
        .finally(() => setIsLoading(false)),
    [meetingId, t]
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

  // 자동 교정이 본문을 바꾸므로 잡이 끝나면 다시 읽는다 (references/architecture.md "회의록 교정")
  useEffect(
    () =>
      onRefineProgress((event) => {
        if (event.meetingId === meetingId && event.stage === 'done') fetchMeeting()
      }),
    [meetingId, fetchMeeting]
  )

  /** 편집 채널은 갱신된 상세를 그대로 돌려준다 (references/architecture.md) */
  const applyMutation = async (mutate: () => Promise<MeetingDetail>) => {
    try {
      setDetail(await mutate())
      setSaveError(null)

      return true
    } catch (caught) {
      setSaveError(caught instanceof Error ? caught : new Error(t.transcript.errors.save))

      return false
    }
  }

  const renameMeeting = ({ title }: { title: string }) =>
    applyMutation(() => renameMeetingApi({ meetingId, title }))

  const editUtteranceText = ({ utteranceId, text }: { utteranceId: string; text: string }) =>
    applyMutation(() => updateUtteranceTextApi({ meetingId, utteranceId, text }))

  const reassignUtterance = ({
    utteranceId,
    speakerLabel
  }: {
    utteranceId: string
    speakerLabel: string
  }) => applyMutation(() => reassignUtteranceApi({ meetingId, utteranceId, speakerLabel }))

  const renameSpeaker = ({ label, displayName }: { label: string; displayName: string }) =>
    applyMutation(() => renameSpeakerApi({ meetingId, label, displayName }))

  const mergeSpeakers = ({ fromLabel, intoLabel }: { fromLabel: string; intoLabel: string }) =>
    applyMutation(() => mergeSpeakersApi({ meetingId, fromLabel, intoLabel }))

  /** 응답은 처리 중으로 바뀐 상세다. 끝나면 진행률 이벤트의 done·error로 다시 읽는다 */
  const reprocessMeeting = ({ speakerCount }: { speakerCount: number | null }) =>
    applyMutation(() => reprocessMeetingApi({ meetingId, speakerCount }))

  /** 성공하면 상세가 사라지므로 호출한 쪽이 화면을 옮긴다 */
  const removeMeeting = async () => {
    try {
      await deleteMeetingApi({ meetingId })
      setSaveError(null)

      return true
    } catch (caught) {
      setSaveError(caught instanceof Error ? caught : new Error(t.transcript.errors.remove))

      return false
    }
  }

  return {
    meeting: detail?.meeting ?? null,
    utterances: detail?.utterances ?? [],
    speakers: detail?.speakers ?? [],
    refineResult: detail?.refineResult ?? null,
    isLoading,
    error,
    saveError,
    refetch,
    renameMeeting,
    editUtteranceText,
    reassignUtterance,
    renameSpeaker,
    mergeSpeakers,
    reprocessMeeting,
    removeMeeting
  }
}

export default useMeeting

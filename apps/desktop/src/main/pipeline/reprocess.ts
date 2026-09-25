import { findMeeting, markMeetingReprocessing } from '../db/meetings'
import { info } from '../log'
import { notifyMeetingsChanged } from '../meetingsChanged'
import { enqueuePipelineJob } from './queue'
import { t } from '../locale'

interface ReprocessMeetingParams {
  meetingId: string
  /** null이면 임계값 폴백 */
  speakerCount: number | null
}

/**
 * 남아 있는 원본 WAV로 파이프라인을 다시 돌린다. 이전 회의록은 새 결과가 저장될 때 한 번에 교체된다
 * (references/architecture.md "녹음본 재생·내보내기·다시 인식").
 */
export const reprocessMeeting = ({ meetingId, speakerCount }: ReprocessMeetingParams) => {
  const meeting = findMeeting({ meetingId })
  if (!meeting) throw new Error(t().main.errors.meetingNotFound)
  if (!meeting.hasAudio) {
    throw new Error(t().main.recording.audioMissingForReprocess)
  }
  // 녹음 중이거나 이미 큐에 있는 회의다. 같은 회의를 두 번 줄 세우지 않는다
  if (meeting.status === 'recording' || meeting.status === 'processing') {
    throw new Error(t().main.recording.alreadyProcessing)
  }

  markMeetingReprocessing({ meetingId, speakerCount })
  enqueuePipelineJob({ meetingId })
  notifyMeetingsChanged()
  info(`회의 ${meetingId} 다시 인식 요청${speakerCount ? ` (참석자 ${speakerCount}명)` : ''}`)
}

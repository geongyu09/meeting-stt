import type { PipelineProgressEvent } from '@shared/ipc'
import type { PipelineStage } from '@shared/types'
import { findAudioPath, updateMeetingStatus } from '../db/meetings'
import { ensureSpeakers } from '../db/speakers'
import { replaceUtterances } from '../db/utterances'
import { error as logError, info, messageOf } from '../log'
import { runPipeline } from './run'

const DONE_PERCENT = 100

let notify: (event: PipelineProgressEvent) => void = () => {}
let pending: string[] = []
let isRunning = false

/** main이 창을 만든 뒤 한 번 등록한다. 창이 없을 때 보내면 무시된다 */
export const setPipelineProgressListener = (listener: (event: PipelineProgressEvent) => void) => {
  notify = listener
}

const report = ({
  meetingId,
  stage,
  percent
}: {
  meetingId: string
  stage: PipelineStage
  percent: number
}) => notify({ meetingId, stage, percent: Math.round(percent) })

const processMeeting = async (meetingId: string) => {
  const audioPath = findAudioPath({ meetingId })
  if (!audioPath) throw new Error('녹음 파일을 찾을 수 없습니다')

  updateMeetingStatus({ meetingId, status: 'processing' })
  const utterances = await runPipeline({
    audioPath,
    onProgress: ({ stage, percent }) => report({ meetingId, stage, percent })
  })

  report({ meetingId, stage: 'save', percent: 0 })
  ensureSpeakers({
    meetingId,
    labels: [...new Set(utterances.map((utterance) => utterance.speakerLabel))]
  })
  replaceUtterances({ meetingId, utterances })
  updateMeetingStatus({ meetingId, status: 'done' })
  report({ meetingId, stage: 'done', percent: DONE_PERCENT })
  info(`회의 ${meetingId} 처리 완료 (발화 ${utterances.length}개)`)
}

const drain = async () => {
  if (isRunning) return
  isRunning = true

  while (pending.length) {
    const [meetingId, ...rest] = pending
    pending = rest

    try {
      await processMeeting(meetingId)
    } catch (caught) {
      const message = messageOf(caught)
      logError(`회의 ${meetingId} 처리 실패: ${message}`)
      updateMeetingStatus({ meetingId, status: 'error', errorMessage: message })
      report({ meetingId, stage: 'error', percent: 0 })
    }
  }

  isRunning = false
}

/** 동시성 1. 여러 회의를 동시에 돌리지 않는다 (references/pitfalls.md) */
export const enqueuePipelineJob = ({ meetingId }: { meetingId: string }) => {
  pending = [...pending, meetingId]
  void drain()
}

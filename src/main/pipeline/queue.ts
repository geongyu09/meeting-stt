import type { PipelineProgressEvent, SummaryProgressEvent } from '@shared/ipc'
import type { PipelineStage, SummaryStage } from '@shared/types'
import { discardRecording } from '../audio/recordings'
import { findAudioPath, updateMeetingStatus, updateMeetingSummary } from '../db/meetings'
import { getAppSettings } from '../db/settings'
import { ensureSpeakers } from '../db/speakers'
import { replaceUtterances } from '../db/utterances'
import { error as logError, info, messageOf, warn } from '../log'
import { runSummary } from '../summary/run'
import { buildTranscriptText } from '../summary/transcript'
import { runPipeline } from './run'

const DONE_PERCENT = 100

/**
 * 파이프라인과 요약은 같은 CPU·GPU를 쓴다. 따로 큐를 두면 둘이 동시에 돌아 둘 다 느려지므로
 * 한 큐에서 동시성 1로 처리한다 (references/architecture.md).
 */
type Job = { kind: 'pipeline' | 'summary'; meetingId: string }

let notifyPipeline: (event: PipelineProgressEvent) => void = () => {}
let notifySummary: (event: SummaryProgressEvent) => void = () => {}
let pending: Job[] = []
let isRunning = false

/** main이 창을 만든 뒤 한 번 등록한다. 창이 없을 때 보내면 무시된다 */
export const setPipelineProgressListener = (listener: (event: PipelineProgressEvent) => void) => {
  notifyPipeline = listener
}

export const setSummaryProgressListener = (listener: (event: SummaryProgressEvent) => void) => {
  notifySummary = listener
}

const report = ({
  meetingId,
  stage,
  percent
}: {
  meetingId: string
  stage: PipelineStage
  percent: number
}) => notifyPipeline({ meetingId, stage, percent: Math.round(percent) })

interface ReportSummaryParams extends Omit<SummaryProgressEvent, 'stage'> {
  stage: SummaryStage
}

const reportSummary = ({ percent, ...rest }: ReportSummaryParams) =>
  notifySummary({ ...rest, percent: Math.round(percent) })

/**
 * 회의록이 만들어졌으면 원본 WAV는 기본적으로 지운다 (설정 `audio.keep`, references/architecture.md).
 * 여기서 실패해도 회의록은 이미 저장됐으므로 잡을 실패로 만들지 않는다.
 */
const applyAudioRetention = async ({ meetingId }: { meetingId: string }) => {
  if (getAppSettings().isAudioKept) return

  try {
    await discardRecording({ meetingId })
  } catch (caught) {
    warn(`회의 ${meetingId} 원본 녹음 삭제 실패: ${messageOf(caught)}`)
  }
}

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

  await applyAudioRetention({ meetingId })
}

const summarizeMeeting = async (meetingId: string) => {
  const transcript = buildTranscriptText({ meetingId })
  if (!transcript.trim()) throw new Error('요약할 회의록이 없습니다')

  const summary = await runSummary({
    meetingId,
    transcript,
    onProgress: ({ stage, percent }) => reportSummary({ meetingId, stage, percent })
  })

  updateMeetingSummary({ meetingId, summary })
  reportSummary({ meetingId, stage: 'done', percent: DONE_PERCENT, summary })
  info(`회의 ${meetingId} 요약 완료 (${summary.length}자)`)
}

/**
 * 요약 실패는 회의 상태를 건드리지 않는다 — 회의록은 멀쩡하고 요약만 없는 상태다
 * (references/architecture.md).
 */
const failJob = ({ kind, meetingId }: Job, message: string) => {
  if (kind === 'summary') {
    logError(`회의 ${meetingId} 요약 실패: ${message}`)
    reportSummary({ meetingId, stage: 'error', percent: 0, errorMessage: message })
    return
  }

  logError(`회의 ${meetingId} 처리 실패: ${message}`)
  updateMeetingStatus({ meetingId, status: 'error', errorMessage: message })
  report({ meetingId, stage: 'error', percent: 0 })
}

const drain = async () => {
  if (isRunning) return
  isRunning = true

  while (pending.length) {
    const [job, ...rest] = pending
    pending = rest

    try {
      await (job.kind === 'summary'
        ? summarizeMeeting(job.meetingId)
        : processMeeting(job.meetingId))
    } catch (caught) {
      failJob(job, messageOf(caught))
    }
  }

  isRunning = false
}

const enqueue = (job: Job) => {
  pending = [...pending, job]
  void drain()
}

/** 동시성 1. 여러 회의를 동시에 돌리지 않는다 (references/pitfalls.md) */
export const enqueuePipelineJob = ({ meetingId }: { meetingId: string }) =>
  enqueue({ kind: 'pipeline', meetingId })

/** 같은 회의의 요약이 이미 줄 서 있으면 두 번 돌리지 않는다 */
export const enqueueSummaryJob = ({ meetingId }: { meetingId: string }) => {
  if (pending.some((job) => job.kind === 'summary' && job.meetingId === meetingId)) return

  enqueue({ kind: 'summary', meetingId })
}

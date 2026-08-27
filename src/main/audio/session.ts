import { randomUUID } from 'node:crypto'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { app } from 'electron'
import { SAMPLE_RATE_HZ } from '@shared/audio'
import {
  findMeeting,
  insertMeeting,
  updateMeetingDuration,
  updateMeetingSpeakerCount,
  updateMeetingStatus
} from '../db/meetings'
import { info } from '../log'
import { enqueuePipelineJob } from '../pipeline/queue'
import { createWavWriter, type WavWriter } from './wavWriter'

/** 이보다 짧으면 사실상 빈 녹음이라 파이프라인을 돌리지 않는다 */
const MIN_RECORDING_SEC = 1

const writers = new Map<string, WavWriter>()

export const recordingsDir = () => path.join(app.getPath('userData'), 'recordings')

const pad2 = (value: number) => String(value).padStart(2, '0')

/** 기본 제목은 "2026-08-26 회의" (references/data-model.md) */
const defaultTitle = (createdAt: number) => {
  const date = new Date(createdAt)

  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())} 회의`
}

const writerOf = (meetingId: string) => {
  const writer = writers.get(meetingId)
  if (!writer) throw new Error('진행 중인 녹음이 아닙니다')

  return writer
}

/** 회의 행과 WAV 파일을 함께 만든다. id를 먼저 정해야 파일 이름이 정해진다 */
export const startRecording = async ({ sampleRate }: { sampleRate: number }) => {
  if (sampleRate !== SAMPLE_RATE_HZ) {
    throw new Error(
      `이 마이크는 ${SAMPLE_RATE_HZ}Hz 녹음을 지원하지 않습니다 (현재 ${sampleRate}Hz)`
    )
  }

  const meetingId = randomUUID()
  const createdAt = Date.now()
  const audioPath = path.join(recordingsDir(), `${meetingId}.wav`)

  await mkdir(recordingsDir(), { recursive: true })
  writers.set(meetingId, await createWavWriter({ filePath: audioPath }))
  insertMeeting({ id: meetingId, title: defaultTitle(createdAt), createdAt, audioPath })
  info(`녹음 시작 ${meetingId}`)

  return { meetingId }
}

export const appendRecordingChunk = async ({
  meetingId,
  pcm
}: {
  meetingId: string
  pcm: ArrayBuffer
}) => {
  await writerOf(meetingId).appendChunk(new Float32Array(pcm))
}

interface StopRecordingParams {
  meetingId: string
  /** 있으면 화자 분리를 이 수로 고정한다. 검증은 핸들러가 끝냈다 */
  speakerCount?: number
}

/** 헤더를 확정하고 파이프라인 잡을 큐에 넣는다 */
export const stopRecording = async ({ meetingId, speakerCount }: StopRecordingParams) => {
  const { durationSec } = await writerOf(meetingId).finalize()
  writers.delete(meetingId)
  updateMeetingDuration({ meetingId, durationSec })
  if (speakerCount) updateMeetingSpeakerCount({ meetingId, speakerCount })
  info(
    `녹음 종료 ${meetingId} (${durationSec.toFixed(1)}초${speakerCount ? `, 참석자 ${speakerCount}명` : ''})`
  )

  if (durationSec < MIN_RECORDING_SEC) {
    updateMeetingStatus({
      meetingId,
      status: 'error',
      errorMessage: '녹음이 너무 짧아 회의록을 만들지 못했습니다'
    })
  } else {
    enqueuePipelineJob({ meetingId })
  }

  const meeting = findMeeting({ meetingId })
  if (!meeting) throw new Error('회의 정보를 찾을 수 없습니다')

  return meeting
}

import { randomUUID } from 'node:crypto'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { app } from 'electron'
import { rmsOf, SAMPLE_RATE_HZ } from '@shared/audio'
import type { RecordingStateEvent } from '@shared/ipc'
import {
  findMeeting,
  insertMeeting,
  updateMeetingDuration,
  updateMeetingSpeakerCount,
  updateMeetingStatus
} from '../db/meetings'
import { info, warn } from '../log'
import { notifyMeetingsChanged } from '../meetingsChanged'
import { enqueuePipelineJob } from '../pipeline/queue'
import { createWavWriter, type WavWriter } from './wavWriter'
import { t } from '../locale'

/** 이보다 짧으면 사실상 빈 녹음이라 파이프라인을 돌리지 않는다 */
export const MIN_RECORDING_SEC = 1

interface RecordingSession {
  meetingId: string
  startedAt: number
  writer: WavWriter
  level: number
}

/**
 * 진행 중 녹음의 단일 출처. 오디오 그래프는 위젯 창 하나가 들고 있고, 상태는 여기에만 있다
 * (references/architecture.md의 "녹음 위젯 패널").
 */
let session: RecordingSession | null = null

/**
 * 참석자 수는 세션 밖에 둔다 — 녹음 시작 전에도 입력할 수 있고, 정지 후에도 남아 다음 녹음에 그대로 쓰인다.
 * 두 창의 입력란에 계속 보이므로 숨은 값이 아니다.
 */
let speakerCount: number | undefined

let notifyState: (event: RecordingStateEvent) => void = () => {}

export const recordingsDir = () => path.join(app.getPath('userData'), 'recordings')

const pad2 = (value: number) => String(value).padStart(2, '0')

/** 기본 제목은 "2026-08-26 회의" (references/data-model.md) */
export const defaultTitle = (createdAt: number) => {
  const date = new Date(createdAt)

  return t().main.recording.defaultTitle({
    date: `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`
  })
}

/** main이 창을 만든 뒤 한 번 등록한다. 창이 없을 때 보내면 무시된다 */
export const setRecordingStateListener = (listener: (event: RecordingStateEvent) => void) => {
  notifyState = listener
}

export const getRecordingState = (): RecordingStateEvent => ({
  meetingId: session?.meetingId ?? null,
  startedAt: session?.startedAt ?? null,
  level: session?.level ?? 0,
  speakerCount
})

/** `stoppedMeetingId`·`errorMessage`처럼 한 번만 실리는 값은 여기서 얹는다 */
const publish = (extra: Partial<RecordingStateEvent> = {}) =>
  notifyState({ ...getRecordingState(), ...extra })

export const isRecording = () => session !== null

const sessionOf = (meetingId: string) => {
  if (session?.meetingId !== meetingId) throw new Error(t().main.recording.notActive)

  return session
}

/** 회의 행과 WAV 파일을 함께 만든다. id를 먼저 정해야 파일 이름이 정해진다 */
export const startRecording = async ({ sampleRate }: { sampleRate: number }) => {
  if (session) throw new Error(t().main.recording.alreadyActive)
  if (sampleRate !== SAMPLE_RATE_HZ) {
    throw new Error(
      t().main.recording.sampleRateUnsupported({ expected: SAMPLE_RATE_HZ, actual: sampleRate })
    )
  }

  const meetingId = randomUUID()
  const createdAt = Date.now()
  const audioPath = path.join(recordingsDir(), `${meetingId}.wav`)

  await mkdir(recordingsDir(), { recursive: true })
  const writer = await createWavWriter({ filePath: audioPath })
  insertMeeting({ id: meetingId, title: defaultTitle(createdAt), createdAt, audioPath })
  session = { meetingId, startedAt: createdAt, writer, level: 0 }
  info(`녹음 시작 ${meetingId}`)
  publish()
  notifyMeetingsChanged()

  return { meetingId }
}

export const appendRecordingChunk = async ({
  meetingId,
  pcm
}: {
  meetingId: string
  pcm: ArrayBuffer
}) => {
  // 끝난 녹음이나 남은 오디오 그래프가 보낸 청크다. 사용자에게 알릴 실패가 아니라 버린다 (references/pitfalls.md)
  if (session?.meetingId !== meetingId) {
    warn(`진행 중이 아닌 녹음의 청크를 버렸습니다 ${meetingId}`)
    return
  }

  const active = session
  const samples = new Float32Array(pcm)

  await active.writer.appendChunk(samples)
  // 레벨 미터는 여기서 계산해 두 창에 같은 값을 보낸다 (renderer마다 따로 재지 않는다)
  active.level = rmsOf(samples)
  publish()
}

/** 헤더를 확정하고 파이프라인 잡을 큐에 넣는다 */
export const stopRecording = async ({ meetingId }: { meetingId: string }) => {
  const active = sessionOf(meetingId)
  const { durationSec } = await active.writer.finalize()
  session = null
  updateMeetingDuration({ meetingId, durationSec })
  if (speakerCount) updateMeetingSpeakerCount({ meetingId, speakerCount })
  info(
    `녹음 종료 ${meetingId} (${durationSec.toFixed(1)}초${speakerCount ? `, 참석자 ${speakerCount}명` : ''})`
  )

  if (durationSec < MIN_RECORDING_SEC) {
    updateMeetingStatus({
      meetingId,
      status: 'error',
      errorMessage: t().main.recording.tooShort
    })
  } else {
    enqueuePipelineJob({ meetingId })
  }

  publish({ stoppedMeetingId: meetingId })
  notifyMeetingsChanged()

  const meeting = findMeeting({ meetingId })
  if (!meeting) throw new Error(t().main.recording.meetingInfoNotFound)

  return meeting
}

/** 값이 바뀌면 두 창의 입력란이 같은 값을 보도록 바로 알린다. 검증은 핸들러가 끝냈다 */
export const setRecordingSpeakerCount = (next: number | undefined) => {
  speakerCount = next
  publish()

  return getRecordingState()
}

/**
 * 마이크 권한 거부처럼 위젯에서만 알 수 있는 실패를 두 창에 전한다.
 * 시작을 누른 사람이 메인 창에 있을 수 있어 실패가 위젯 안에만 남으면 안 된다.
 */
export const reportRecordingError = ({ message }: { message: string }) =>
  publish({ errorMessage: message })

/**
 * 종료 직전에 진행 중 녹음을 마무리한다. 헤더가 확정되지 않은 WAV는 파이프라인이 읽지 못한다.
 * Phase 5-3부터 화면 이동으로 정지되지 않으므로 이 경로가 마지막 방어선이다.
 */
export const finalizeActiveRecording = async () => {
  if (!session) return false

  await stopRecording({ meetingId: session.meetingId })

  return true
}

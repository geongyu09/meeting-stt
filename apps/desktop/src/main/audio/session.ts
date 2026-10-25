import { randomUUID } from 'node:crypto'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { app } from 'electron'
import { CHUNK_SAMPLES, rmsOf, SAMPLE_RATE_HZ } from '@shared/audio'
import type { AudioQualityIssue } from '@shared/audioQuality'
import { dateTextOf } from '@shared/autoTitle'
import type { RecordingStateEvent } from '@shared/ipc'
import type { RecordingType } from '@shared/types'
import {
  findMeeting,
  insertMeeting,
  updateAutoTitle,
  updateMeetingDuration,
  updateMeetingNote,
  updateMeetingRecordType,
  updateMeetingSpeakerCount,
  updateMeetingStatus
} from '../db/meetings'
import {
  getRecordingType,
  getSystemAudioEnabled,
  setRecordingTypeSetting,
  setSystemAudioEnabled
} from '../db/settings'
import { info, messageOf, warn } from '../log'
import { notifyMeetingsChanged } from '../meetingsChanged'
import { enqueuePipelineJob } from '../pipeline/queue'
import {
  feedLiveTranscript,
  getLiveTranscriptState,
  resetLiveTranscript,
  setLiveTranscriptEnabled
} from './liveTranscript'
import { createQualityMonitor, type QualityMonitor } from './qualityMonitor'
import { probeSystemAudio, startSystemAudioCapture, type SystemAudioCapture } from './systemAudio'
import { mixSamples } from './systemAudioMix'
import { createWavWriter, type WavWriter } from './wavWriter'
import { t } from '../locale'

/** 이보다 짧으면 사실상 빈 녹음이라 파이프라인을 돌리지 않는다 */
export const MIN_RECORDING_SEC = 1

interface RecordingSession {
  meetingId: string
  /** 경과 시간의 기준 시각. 재개할 때마다 멈춰 있던 시간만큼 뒤로 민다 */
  startedAt: number
  /** 일시정지한 시각. 이 동안 들어온 청크는 버린다 (references/architecture.md "일시정지·재개") */
  pausedAt: number | null
  writer: WavWriter
  level: number
  /** 온라인 회의 소리 캡처. 켜져 있어도 도구가 실패하면 null이고 마이크만 녹음한다 */
  systemAudio: SystemAudioCapture | null
  /** 들어오는 소리의 품질 판정. WAV에 쓰는 샘플을 그대로 넣는다 (references/architecture.md "녹음 품질 안내") */
  quality: QualityMonitor
  qualityIssue: AudioQualityIssue | null
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

/**
 * 녹음 노트도 세션 밖에 둔다 — 녹음 전에 쓴 초안이 다음 녹음의 노트가 된다. 녹음 중에는 바뀔 때마다 회의 행에 쓰고
 * 정지하면 비운다 (references/features/recording.md "녹음 노트")
 */
let note = ''

/**
 * 온라인 회의 소리 함께 녹음 (Phase 5-2). 참석자 수처럼 세션 밖에 두고, DB(`audio.systemCapture`)에서 처음 한 번 읽어 캐시한다.
 * 실패 안내는 켜기(프로브)나 녹음 중 캡처가 끊겼을 때 실리고 다음 시도에서 지운다.
 */
let isSystemAudioEnabled: boolean | undefined
let systemAudioError: string | undefined

const systemAudioEnabled = () => {
  if (isSystemAudioEnabled === undefined) isSystemAudioEnabled = getSystemAudioEnabled()

  return isSystemAudioEnabled
}

/**
 * 녹음 종류도 세션 밖에 둔다. 녹음 중에도 바뀌고 정지하는 순간의 값이 그 회의의 종류다.
 * 참석자 수와 달리 DB(`recording.type`)에 남아 앱을 다시 켜도 이어진다 (references/features/assistant.md "녹음 종류 (회의 / 메모)")
 */
let recordingType: RecordingType | undefined

const currentRecordingType = () => {
  if (recordingType === undefined) recordingType = getRecordingType()

  return recordingType
}

let notifyState: (event: RecordingStateEvent) => void = () => {}

export const recordingsDir = () => path.join(app.getPath('userData'), 'recordings')

/** 기본 제목은 전사 전 임시 이름 "2026-08-26 녹음" (references/features/transcript.md "회의록 자동 제목") */
export const defaultTitle = (createdAt: number) =>
  t().main.recording.defaultTitle({ date: dateTextOf(createdAt) })

/** main이 창을 만든 뒤 한 번 등록한다. 창이 없을 때 보내면 무시된다 */
export const setRecordingStateListener = (listener: (event: RecordingStateEvent) => void) => {
  notifyState = listener
}

export const getRecordingState = (): RecordingStateEvent => ({
  meetingId: session?.meetingId ?? null,
  startedAt: session?.startedAt ?? null,
  pausedAt: session?.pausedAt ?? null,
  level: session?.level ?? 0,
  speakerCount,
  recordingType: currentRecordingType(),
  note,
  liveTranscript: getLiveTranscriptState(),
  systemAudio: {
    isEnabled: systemAudioEnabled(),
    ...(systemAudioError ? { errorMessage: systemAudioError } : {})
  },
  ...(session?.qualityIssue ? { qualityIssue: session.qualityIssue } : {})
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
  if (note) updateMeetingNote({ meetingId, note })
  session = {
    meetingId,
    startedAt: createdAt,
    pausedAt: null,
    writer,
    level: 0,
    systemAudio: null,
    quality: createQualityMonitor(),
    qualityIssue: null
  }
  if (systemAudioEnabled()) session.systemAudio = openSystemAudio({ meetingId })
  resetLiveTranscript()
  info(`녹음 시작 ${meetingId}`)
  publish()
  notifyMeetingsChanged()

  return { meetingId }
}

/** 실패해도 녹음은 마이크만으로 계속한다 — 회의 중에 녹음이 통째로 실패하는 것보다 낫다 */
const openSystemAudio = ({ meetingId }: { meetingId: string }) => {
  systemAudioError = undefined
  const onFailure = (message: string) => {
    if (session?.meetingId !== meetingId) return
    warn(`시스템 오디오 캡처 실패 ${meetingId}: ${message}`)
    session.systemAudio = null
    systemAudioError = message
    publish()
  }

  try {
    const capture = startSystemAudioCapture({ onFailure })
    capture.ready.catch((caught: unknown) => onFailure(messageOf(caught)))

    return capture
  } catch (caught) {
    onFailure(messageOf(caught))

    return null
  }
}

/** 상대방의 마지막 말이 FIFO에 남아 있을 수 있어 한 청크 더 쓴 뒤 도구를 끝낸다 */
const closeSystemAudio = async (active: RecordingSession) => {
  const capture = active.systemAudio
  if (!capture) return

  active.systemAudio = null
  const rest = capture.drain(CHUNK_SAMPLES)
  if (rest.length > 0) await active.writer.appendChunk(rest)
  await capture.stop()
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
  const micSamples = new Float32Array(pcm)

  // 위젯의 오디오 그래프는 일시정지와 무관하게 돌아 청크가 계속 온다. 멈춰 있던 동안의 상대방 소리가
  // 재개 뒤에 섞이지 않도록 시스템 오디오도 같은 길이만큼 꺼내 버린다
  if (active.pausedAt !== null) {
    active.systemAudio?.take(micSamples.length)
    active.level = 0
    publish()
    return
  }

  // 섞은 결과가 WAV·레벨·라이브 받아쓰기의 입력이다. 파이프라인은 손대지 않는다
  const samples = active.systemAudio
    ? mixSamples({ base: micSamples, overlay: active.systemAudio.take(micSamples.length) })
    : micSamples

  await active.writer.appendChunk(samples)
  // 레벨 미터는 여기서 계산해 두 창에 같은 값을 보낸다 (renderer마다 따로 재지 않는다)
  active.level = rmsOf(samples)
  active.qualityIssue = active.quality.push(samples)
  // 인식 결과는 따로 publish하지 않고 다음 청크 이벤트에 실린다 — 0.5초 안에 실려 가는 값이라 이벤트를 늘릴 이유가 없다
  feedLiveTranscript({ samples, rms: active.level })
  publish()
}

/** 헤더를 확정하고 파이프라인 잡을 큐에 넣는다 */
export const stopRecording = async ({ meetingId }: { meetingId: string }) => {
  const active = sessionOf(meetingId)
  await closeSystemAudio(active)
  const { durationSec } = await active.writer.finalize()
  session = null
  // 노트는 이미 회의 행에 있다. 다음 녹음은 빈 노트로 시작한다
  note = ''
  resetLiveTranscript()
  updateMeetingDuration({ meetingId, durationSec })
  const isMemo = currentRecordingType() === 'memo'
  if (isMemo) markMemo({ meetingId })
  // 메모는 화자 분리를 하지 않으므로 참석자 수를 남기지 않는다. 세션의 값은 다음 회의 녹음을 위해 둔다
  else if (speakerCount) updateMeetingSpeakerCount({ meetingId, speakerCount })
  info(
    `녹음 종료 ${meetingId} (${durationSec.toFixed(1)}초${isMemo ? ', 메모' : speakerCount ? `, 참석자 ${speakerCount}명` : ''})`
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

/** 제목은 시작할 때 "녹음"으로 만들어지므로 정지할 때 메모 기본 제목으로 바꾼다. 그사이 고친 제목은 그대로 둔다 */
const markMemo = ({ meetingId }: { meetingId: string }) => {
  updateMeetingRecordType({ meetingId, recordType: 'memo' })
  const meeting = findMeeting({ meetingId })
  if (!meeting) return

  updateAutoTitle({
    meetingId,
    title: t().main.recording.memoDefaultTitle({ date: dateTextOf(meeting.createdAt) }),
    defaultTitle: defaultTitle(meeting.createdAt)
  })
}

/** 녹음 중에도 바꿀 수 있다 — 정지하는 순간의 값을 쓴다. 검증은 핸들러가 끝냈다 */
export const setRecordingType = (next: RecordingType) => {
  recordingType = next
  setRecordingTypeSetting({ type: next })
  publish()

  return getRecordingState()
}

/** 값이 바뀌면 두 창의 입력란이 같은 값을 보도록 바로 알린다. 검증은 핸들러가 끝냈다 */
export const setRecordingSpeakerCount = (next: number | undefined) => {
  speakerCount = next
  publish()

  return getRecordingState()
}

/** 녹음 중이면 바뀔 때마다 회의 행에 바로 쓴다 — 녹음 도중 앱이 죽어도 노트가 남는다. 검증은 핸들러가 끝냈다 */
export const setRecordingNote = (next: string) => {
  note = next
  if (session) updateMeetingNote({ meetingId: session.meetingId, note })
  publish()

  return getRecordingState()
}

/** 재개할 때 기준 시각을 멈춰 있던 시간만큼 밀어 경과 시간이 일시정지 구간을 세지 않게 한다 */
export const setRecordingPaused = (isPaused: boolean) => {
  if (!session) throw new Error(t().main.recording.notActive)
  if ((session.pausedAt !== null) === isPaused) return getRecordingState()

  const now = Date.now()
  if (isPaused) {
    session.pausedAt = now
    session.level = 0
    // 멈춰 있는 동안에는 소리를 보지 않으므로 안내도 내린다. 재개하면 다음 청크에서 다시 판정한다
    session.qualityIssue = null
  } else if (session.pausedAt !== null) {
    session.startedAt += now - session.pausedAt
    session.pausedAt = null
  }
  info(`녹음 ${isPaused ? '일시정지' : '재개'} ${session.meetingId}`)
  publish()

  return getRecordingState()
}

/** 녹음 화면의 파형 ↔ 라이브 받아쓰기 보기. 참석자 수처럼 세션 밖에 두어 다음 녹음에도 이어진다 */
export const setRecordingLiveTranscript = (isEnabled: boolean) => {
  setLiveTranscriptEnabled(isEnabled)
  publish()

  return getRecordingState()
}

/**
 * 온라인 회의 소리 함께 녹음 켜기/끄기. 켤 때는 도구를 한 번 돌려 권한 창을 미리 띄우고 실패를 그 자리에서 알린다.
 * 녹음 중에는 프로브 없이 값만 바꾼다 (다음 녹음부터 적용, 화면은 스위치를 비활성화한다).
 */
export const setRecordingSystemAudio = async (isEnabled: boolean) => {
  systemAudioError = undefined

  if (isEnabled && !session) {
    try {
      await probeSystemAudio()
    } catch (caught) {
      systemAudioError = messageOf(caught)
      warn(`시스템 오디오 프로브 실패: ${systemAudioError}`)
      isEnabled = false
    }
  }

  isSystemAudioEnabled = isEnabled
  setSystemAudioEnabled({ isEnabled })
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

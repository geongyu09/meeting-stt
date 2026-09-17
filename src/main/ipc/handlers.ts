import { BrowserWindow, clipboard, ipcMain, systemPreferences } from 'electron'
import {
  IPC,
  type DownloadModelsResponse,
  type GetMeetingRequest,
  type GetMeetingResponse,
  type GetMeetingsResponse,
  type GetSettingsResponse,
  type ModelDownloadProgressEvent,
  type ModelStatusResponse,
  type MutateMeetingResponse,
  type RequestMicrophonePermissionResponse,
  type StartRecordingRequest,
  type StartRecordingResponse,
  type StopRecordingResponse,
  type UpdateSettingsResponse
} from '@shared/ipc'
import { isValidSpeakerCount, MAX_SPEAKER_COUNT, MIN_SPEAKER_COUNT } from '@shared/speakerCount'
import { deleteMeetingWithRecording } from '../audio/recordings'
import { appendRecordingChunk, startRecording, stopRecording } from '../audio/session'
import { findMeeting, listMeetings, renameMeeting } from '../db/meetings'
import { getAppSettings, setWhisperModelId, updateAppSettings } from '../db/settings'
import { hasSpeaker, listSpeakers, mergeSpeakers, renameSpeaker } from '../db/speakers'
import { listUtterances, updateUtteranceSpeaker, updateUtteranceText } from '../db/utterances'
import type { ModelDownloadProgress } from '../models/download'
import { isWhisperModelId } from '../models/registry'
import { downloadModels, downloadSummaryModel, modelStatus } from '../models/service'
import { enqueueSummaryJob } from '../pipeline/queue'
import { downloadUpdate, installUpdate } from '../updater'

const FULL_PERCENT = 100

const TITLE_MAX_LENGTH = 200
const UTTERANCE_TEXT_MAX_LENGTH = 10_000
const SPEAKER_NAME_MAX_LENGTH = 60
const LABEL_MAX_LENGTH = 100
const CLIPBOARD_MAX_LENGTH = 2_000_000

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

interface ReadTextParams {
  payload: unknown
  key: string
  maxLength: number
  label: string
}

/** renderer가 보낸 payload는 신뢰하지 않는다 (.claude/rules/ipc-api-guide.md) */
const readText = ({ payload, key, maxLength, label }: ReadTextParams) => {
  if (!isRecord(payload) || typeof payload[key] !== 'string') {
    throw new Error(`잘못된 요청입니다 (${label} 없음)`)
  }

  const text = payload[key]
  if (!text.trim()) throw new Error(`${label}을(를) 비워 둘 수 없습니다`)
  if (text.length > maxLength) {
    throw new Error(`${label}이(가) 너무 깁니다 (최대 ${maxLength}자)`)
  }

  return text.trim()
}

const readMeetingId = (payload: unknown) =>
  readText({ payload, key: 'meetingId', maxLength: LABEL_MAX_LENGTH, label: '회의 ID' })

const readUtteranceId = (payload: unknown) =>
  readText({ payload, key: 'utteranceId', maxLength: LABEL_MAX_LENGTH, label: '발화 ID' })

const readSpeakerLabel = ({ payload, key }: { payload: unknown; key: string }) =>
  readText({ payload, key, maxLength: LABEL_MAX_LENGTH, label: '화자 라벨' })

const readSampleRate = (payload: unknown) => {
  if (!isRecord(payload) || typeof payload.sampleRate !== 'number') {
    throw new Error('잘못된 요청입니다 (sampleRate 없음)')
  }

  return (payload as unknown as StartRecordingRequest).sampleRate
}

/** 비어 있으면 임계값 폴백. 값이 있는데 범위를 벗어나면 조용히 버리지 않고 거절한다 */
const readSpeakerCount = (payload: unknown) => {
  if (!isRecord(payload) || payload.speakerCount === undefined || payload.speakerCount === null) {
    return undefined
  }
  if (!isValidSpeakerCount(payload.speakerCount)) {
    throw new Error(`참석자 수는 ${MIN_SPEAKER_COUNT}~${MAX_SPEAKER_COUNT} 사이의 정수여야 합니다`)
  }

  return payload.speakerCount
}

const readPcm = (payload: unknown) => {
  if (!isRecord(payload) || !(payload.pcm instanceof ArrayBuffer)) {
    throw new Error('잘못된 요청입니다 (PCM 청크 없음)')
  }

  return payload.pcm
}

const readBoolean = ({ payload, key }: { payload: unknown; key: string }) => {
  if (!isRecord(payload) || typeof payload[key] !== 'boolean') {
    throw new Error('잘못된 요청입니다 (설정 값 없음)')
  }

  return payload[key]
}

const readSettings = (payload: unknown) => ({
  isAudioKept: readBoolean({ payload, key: 'isAudioKept' }),
  isUpdateCheckEnabled: readBoolean({ payload, key: 'isUpdateCheckEnabled' }),
  isQuietProcessing: readBoolean({ payload, key: 'isQuietProcessing' })
})

const readWhisperModelId = (payload: unknown) => {
  if (!isRecord(payload) || !isWhisperModelId(payload.whisperModelId)) {
    throw new Error('알 수 없는 음성 인식 모델입니다')
  }

  return payload.whisperModelId
}

/** macOS만 명시적 요청이 필요하다. 그 외 플랫폼은 getUserMedia 실패로 처리한다 */
const requestMicrophonePermission = async (): Promise<RequestMicrophonePermissionResponse> => {
  if (process.platform !== 'darwin') return { isGranted: true }

  return { isGranted: await systemPreferences.askForMediaAccess('microphone') }
}

const getMeetingDetail = ({ meetingId }: GetMeetingRequest): GetMeetingResponse => {
  const meeting = findMeeting({ meetingId })
  if (!meeting) return null

  return {
    meeting,
    utterances: listUtterances({ meetingId }),
    speakers: listSpeakers({ meetingId })
  }
}

/** 편집 채널은 갱신된 상세를 그대로 돌려준다 (references/architecture.md) */
const requireMeetingDetail = ({ meetingId }: GetMeetingRequest): MutateMeetingResponse => {
  const detail = getMeetingDetail({ meetingId })
  if (!detail) throw new Error('회의를 찾을 수 없습니다')

  return detail
}

const requireSpeaker = ({ meetingId, label }: { meetingId: string; label: string }) => {
  if (!hasSpeaker({ meetingId, label })) throw new Error('이 회의에 없는 화자입니다')
}

const handleRenameMeeting = (payload: unknown) => {
  const meetingId = readMeetingId(payload)
  const title = readText({ payload, key: 'title', maxLength: TITLE_MAX_LENGTH, label: '회의 제목' })

  if (!renameMeeting({ meetingId, title })) throw new Error('회의를 찾을 수 없습니다')

  return requireMeetingDetail({ meetingId })
}

const handleDeleteMeeting = async (payload: unknown) => {
  const meetingId = readMeetingId(payload)

  if (!(await deleteMeetingWithRecording({ meetingId }))) {
    throw new Error('회의를 찾을 수 없습니다')
  }
}

const handleUpdateUtteranceText = (payload: unknown) => {
  const meetingId = readMeetingId(payload)
  const changed = updateUtteranceText({
    meetingId,
    utteranceId: readUtteranceId(payload),
    text: readText({
      payload,
      key: 'text',
      maxLength: UTTERANCE_TEXT_MAX_LENGTH,
      label: '발화 내용'
    })
  })
  if (!changed) throw new Error('발화를 찾을 수 없습니다')

  return requireMeetingDetail({ meetingId })
}

const handleReassignUtterance = (payload: unknown) => {
  const meetingId = readMeetingId(payload)
  const speakerLabel = readSpeakerLabel({ payload, key: 'speakerLabel' })
  requireSpeaker({ meetingId, label: speakerLabel })

  const changed = updateUtteranceSpeaker({
    meetingId,
    utteranceId: readUtteranceId(payload),
    speakerLabel
  })
  if (!changed) throw new Error('발화를 찾을 수 없습니다')

  return requireMeetingDetail({ meetingId })
}

const handleRenameSpeaker = (payload: unknown) => {
  const meetingId = readMeetingId(payload)
  const changed = renameSpeaker({
    meetingId,
    label: readSpeakerLabel({ payload, key: 'label' }),
    displayName: readText({
      payload,
      key: 'displayName',
      maxLength: SPEAKER_NAME_MAX_LENGTH,
      label: '화자 이름'
    })
  })
  if (!changed) throw new Error('이 회의에 없는 화자입니다')

  return requireMeetingDetail({ meetingId })
}

const handleMergeSpeakers = (payload: unknown) => {
  const meetingId = readMeetingId(payload)
  const fromLabel = readSpeakerLabel({ payload, key: 'fromLabel' })
  const intoLabel = readSpeakerLabel({ payload, key: 'intoLabel' })

  if (fromLabel === intoLabel) throw new Error('같은 화자끼리는 합칠 수 없습니다')
  requireSpeaker({ meetingId, label: fromLabel })
  requireSpeaker({ meetingId, label: intoLabel })
  mergeSpeakers({ meetingId, fromLabel, intoLabel })

  return requireMeetingDetail({ meetingId })
}

const handleWriteClipboardText = (payload: unknown) => {
  clipboard.writeText(
    readText({ payload, key: 'text', maxLength: CLIPBOARD_MAX_LENGTH, label: '복사할 내용' })
  )
}

/** 다운로드 진행률은 요청한 창이 아니라 모든 창에 보낸다 — 창이 하나뿐이고, 요청 창이 닫혀도 진행은 계속된다 */
const broadcastModelDownloadProgress = ({
  key,
  receivedBytes,
  totalBytes
}: ModelDownloadProgress) => {
  const event: ModelDownloadProgressEvent = {
    key,
    receivedBytes,
    totalBytes,
    percent: totalBytes > 0 ? Math.round((receivedBytes / totalBytes) * FULL_PERCENT) : 0
  }

  BrowserWindow.getAllWindows().forEach((window) => {
    window.webContents.send(IPC.events.modelDownload, event)
  })
}

/** 고른 모델은 다운로드 성공과 무관하게 먼저 저장한다 — 창을 닫았다 다시 들어와도 같은 선택으로 이어받는다 */
const handleDownloadModels = async (payload: unknown): Promise<DownloadModelsResponse> => {
  const whisperModelId = readWhisperModelId(payload)
  setWhisperModelId({ whisperModelId })

  return downloadModels({ whisperModelId, onProgress: broadcastModelDownloadProgress })
}

export const registerIpcHandlers = () => {
  ipcMain.handle(IPC.recording.requestPermission, () => requestMicrophonePermission())

  ipcMain.handle(IPC.recording.start, (_event, payload): Promise<StartRecordingResponse> =>
    startRecording({ sampleRate: readSampleRate(payload) })
  )

  ipcMain.handle(IPC.recording.chunk, (_event, payload) =>
    appendRecordingChunk({ meetingId: readMeetingId(payload), pcm: readPcm(payload) })
  )

  ipcMain.handle(IPC.recording.stop, (_event, payload): Promise<StopRecordingResponse> =>
    stopRecording({ meetingId: readMeetingId(payload), speakerCount: readSpeakerCount(payload) })
  )

  ipcMain.handle(IPC.meetings.list, (): GetMeetingsResponse => listMeetings())

  ipcMain.handle(IPC.meetings.get, (_event, payload): GetMeetingResponse =>
    getMeetingDetail({ meetingId: readMeetingId(payload) })
  )

  ipcMain.handle(IPC.meetings.rename, (_event, payload): MutateMeetingResponse =>
    handleRenameMeeting(payload)
  )

  ipcMain.handle(IPC.meetings.delete, (_event, payload) => handleDeleteMeeting(payload))

  ipcMain.handle(IPC.utterances.updateText, (_event, payload): MutateMeetingResponse =>
    handleUpdateUtteranceText(payload)
  )

  ipcMain.handle(IPC.utterances.reassign, (_event, payload): MutateMeetingResponse =>
    handleReassignUtterance(payload)
  )

  ipcMain.handle(IPC.speakers.rename, (_event, payload): MutateMeetingResponse =>
    handleRenameSpeaker(payload)
  )

  ipcMain.handle(IPC.speakers.merge, (_event, payload): MutateMeetingResponse =>
    handleMergeSpeakers(payload)
  )

  ipcMain.handle(IPC.settings.get, (): GetSettingsResponse => getAppSettings())

  ipcMain.handle(IPC.settings.update, (_event, payload): UpdateSettingsResponse =>
    updateAppSettings(readSettings(payload))
  )

  ipcMain.handle(IPC.models.status, (): ModelStatusResponse => modelStatus())

  ipcMain.handle(IPC.models.download, (_event, payload) => handleDownloadModels(payload))

  ipcMain.handle(IPC.models.downloadSummary, (): Promise<DownloadModelsResponse> =>
    downloadSummaryModel({ onProgress: broadcastModelDownloadProgress })
  )

  ipcMain.handle(IPC.update.download, () => downloadUpdate())

  ipcMain.handle(IPC.update.install, () => installUpdate())

  ipcMain.handle(IPC.clipboard.writeText, (_event, payload) => handleWriteClipboardText(payload))

  // 요약은 수 분이 걸려 invoke를 매달아 둘 수 없다. 큐에 넣기만 하고 결과는 이벤트로 보낸다
  ipcMain.handle(IPC.summary.create, (_event, payload) =>
    enqueueSummaryJob({ meetingId: readMeetingId(payload) })
  )
}

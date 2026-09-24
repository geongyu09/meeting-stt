import { BrowserWindow, clipboard, ipcMain, systemPreferences } from 'electron'
import {
  IPC,
  type CheckLlmResponse,
  type DownloadModelsResponse,
  type GetLlmStatusResponse,
  type GetMeetingRequest,
  type GetMeetingResponse,
  type GetMeetingsResponse,
  type DraftGlossaryResponse,
  type GetGlossaryResponse,
  type GetSettingsResponse,
  type GetRecordingStateResponse,
  type ModelDownloadProgressEvent,
  type ModelStatusResponse,
  type MutateMeetingResponse,
  type RecordingCommandEvent,
  type RequestMicrophonePermissionResponse,
  type SearchMeetingsResponse,
  type SetLlmApiKeyResponse,
  type SetLlmProviderResponse,
  type SetOpenaiModelResponse,
  type StartRecordingRequest,
  type StartRecordingResponse,
  type StopRecordingResponse,
  type UpdateGlossaryResponse,
  type UpdateSettingsResponse
} from '@shared/ipc'
import { readGlossarySettings, readTeamDescription } from '@shared/glossary'
import { isLlmProvider, isOpenaiModelId, readApiKeyPayload } from '@shared/llm'
import { isValidAccelerator } from '@shared/shortcut'
import {
  isWidgetFadeOpacity,
  MAX_WIDGET_FADE_OPACITY,
  MIN_WIDGET_FADE_OPACITY
} from '@shared/widget'
import {
  isValidSpeakerCount,
  MAX_SPEAKER_COUNT,
  MIN_SPEAKER_COUNT
} from '@meeting-stt/core/speakerCount'
import { deleteMeetingWithRecording } from '../audio/recordings'
import {
  appendRecordingChunk,
  getRecordingState,
  reportRecordingError,
  setRecordingSpeakerCount,
  startRecording,
  stopRecording
} from '../audio/session'
import { findMeeting, listMeetings, renameMeeting, searchMeetings } from '../db/meetings'
import {
  getAppSettings,
  getGlossarySettings,
  setLlmProvider,
  setOpenaiModel,
  setWhisperModelId,
  updateAppSettings,
  updateGlossarySettings
} from '../db/settings'
import { clearApiKey, saveApiKey } from '../llm/apiKey'
import { checkLlm } from '../llm/check'
import { getLlmStatus } from '../llm/provider'
import { hasSpeaker, listSpeakers, mergeSpeakers, renameSpeaker } from '../db/speakers'
import { listUtterances, updateUtteranceSpeaker, updateUtteranceText } from '../db/utterances'
import type { ModelDownloadProgress } from '../models/download'
import { isWhisperModelId } from '@meeting-stt/models/desktop'
import { notifyMeetingsChanged } from '../meetingsChanged'
import { downloadModels, downloadSummaryModel, modelStatus } from '../models/service'
import { enqueueGlossaryDraft, enqueueSummaryJob } from '../pipeline/queue'
import { checkForUpdatesNow, downloadUpdate, installUpdate } from '../updater'
import { showMainWindow } from '../windows/main'
import { replaceGlobalShortcuts, setGlobalShortcutsSuspended } from '../windows/shortcuts'
import { applyWidgetOpacity, requestRecordingCommand, setWidgetVisible } from '../windows/widget'

const FULL_PERCENT = 100

const TITLE_MAX_LENGTH = 200
const UTTERANCE_TEXT_MAX_LENGTH = 10_000
const SPEAKER_NAME_MAX_LENGTH = 60
const LABEL_MAX_LENGTH = 100
const CLIPBOARD_MAX_LENGTH = 2_000_000
const ERROR_MESSAGE_MAX_LENGTH = 500
const SEARCH_QUERY_MAX_LENGTH = 200

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

const readFadeOpacity = (payload: unknown) => {
  const value = isRecord(payload) ? payload.widgetFadeOpacity : undefined
  if (!isWidgetFadeOpacity(value)) {
    throw new Error(
      `위젯 불투명도는 ${MIN_WIDGET_FADE_OPACITY}~${MAX_WIDGET_FADE_OPACITY} 사이여야 합니다`
    )
  }

  return value
}

const readShortcut = ({ payload, key }: { payload: unknown; key: string }) => {
  const value = isRecord(payload) ? payload[key] : undefined
  if (typeof value !== 'string' || !isValidAccelerator(value)) {
    throw new Error('단축키는 ⌘·⌥·⌃ 중 하나 이상과 문자·숫자·기능키를 함께 눌러 지정해 주세요')
  }

  return value
}

const readSettings = (payload: unknown) => ({
  isAudioKept: readBoolean({ payload, key: 'isAudioKept' }),
  isUpdateCheckEnabled: readBoolean({ payload, key: 'isUpdateCheckEnabled' }),
  isQuietProcessing: readBoolean({ payload, key: 'isQuietProcessing' }),
  isWidgetEnabled: readBoolean({ payload, key: 'isWidgetEnabled' }),
  isWidgetFadeEnabled: readBoolean({ payload, key: 'isWidgetFadeEnabled' }),
  widgetFadeOpacity: readFadeOpacity(payload),
  recordingShortcut: readShortcut({ payload, key: 'recordingShortcut' }),
  widgetShortcut: readShortcut({ payload, key: 'widgetShortcut' })
})

const RECORDING_COMMAND_KINDS: RecordingCommandEvent['kind'][] = ['start', 'stop', 'toggle']

const readRecordingCommandKind = (payload: unknown) => {
  const kind = isRecord(payload) ? payload.kind : undefined
  if (!RECORDING_COMMAND_KINDS.includes(kind as RecordingCommandEvent['kind'])) {
    throw new Error('알 수 없는 녹음 명령입니다')
  }

  return kind as RecordingCommandEvent['kind']
}

const readLlmProvider = (payload: unknown) => {
  if (!isRecord(payload) || !isLlmProvider(payload.provider)) {
    throw new Error('알 수 없는 LLM 공급자입니다')
  }

  return payload.provider
}

/** 키는 저장·삭제만 하고 renderer로 되돌려주지 않는다 (references/data-model.md) */
const handleSetLlmApiKey = (payload: unknown): Promise<SetLlmApiKeyResponse> => {
  const { vendor, apiKey } = readApiKeyPayload(payload)
  if (apiKey === null) clearApiKey({ vendor })
  else saveApiKey({ vendor, apiKey })

  return getLlmStatus()
}

const readOpenaiModel = (payload: unknown) => {
  if (!isRecord(payload) || !isOpenaiModelId(payload.model)) {
    throw new Error('알 수 없는 GPT 모델입니다')
  }

  return payload.model
}

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
  notifyMeetingsChanged()

  return requireMeetingDetail({ meetingId })
}

const handleDeleteMeeting = async (payload: unknown) => {
  const meetingId = readMeetingId(payload)

  if (!(await deleteMeetingWithRecording({ meetingId }))) {
    throw new Error('회의를 찾을 수 없습니다')
  }
  notifyMeetingsChanged()
}

/** 빈 질의는 오류가 아니라 빈 결과다. 사용자가 입력을 지우는 중에도 부른다 */
const handleSearchMeetings = (payload: unknown): SearchMeetingsResponse => {
  if (!isRecord(payload) || typeof payload.query !== 'string') {
    throw new Error('잘못된 요청입니다 (검색어 없음)')
  }
  if (payload.query.length > SEARCH_QUERY_MAX_LENGTH) {
    throw new Error(`검색어가 너무 깁니다 (최대 ${SEARCH_QUERY_MAX_LENGTH}자)`)
  }

  return searchMeetings({ query: payload.query })
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

  // 녹음을 끝낸 직후에 보고 싶은 것은 결과 화면이다. 위젯에서 정지했다면 메인 창이 뒤에 있다
  ipcMain.handle(IPC.recording.stop, async (_event, payload): Promise<StopRecordingResponse> => {
    const meeting = await stopRecording({ meetingId: readMeetingId(payload) })
    showMainWindow()

    return meeting
  })

  ipcMain.handle(IPC.recording.state, (): GetRecordingStateResponse => getRecordingState())

  ipcMain.handle(IPC.recording.control, (_event, payload) =>
    requestRecordingCommand({ kind: readRecordingCommandKind(payload) })
  )

  ipcMain.handle(IPC.recording.setSpeakerCount, (_event, payload): GetRecordingStateResponse =>
    setRecordingSpeakerCount(readSpeakerCount(payload))
  )

  ipcMain.handle(IPC.recording.reportError, (_event, payload) =>
    reportRecordingError({
      message: readText({
        payload,
        key: 'message',
        maxLength: ERROR_MESSAGE_MAX_LENGTH,
        label: '오류 내용'
      })
    })
  )

  ipcMain.handle(IPC.widget.setVisible, (_event, payload) =>
    setWidgetVisible({ isVisible: readBoolean({ payload, key: 'isVisible' }) })
  )

  ipcMain.handle(IPC.meetings.list, (): GetMeetingsResponse => listMeetings())

  ipcMain.handle(IPC.meetings.get, (_event, payload): GetMeetingResponse =>
    getMeetingDetail({ meetingId: readMeetingId(payload) })
  )

  ipcMain.handle(IPC.meetings.rename, (_event, payload): MutateMeetingResponse =>
    handleRenameMeeting(payload)
  )

  ipcMain.handle(IPC.meetings.delete, (_event, payload) => handleDeleteMeeting(payload))

  ipcMain.handle(IPC.meetings.search, (_event, payload): SearchMeetingsResponse =>
    handleSearchMeetings(payload)
  )

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

  // 설정이 정하는 것은 패널이 보이는지 여부뿐이다 — 창은 그래프 소유자라 계속 살아 있다.
  // 값이 바뀐 경우에만 적용한다. 그러지 않으면 ✕로 숨긴 패널이 다른 설정을 저장할 때 되살아난다
  // 단축키는 등록을 먼저 시도하고 성공했을 때만 저장한다 — 실패하면 이전 단축키로 되돌아가 있다
  ipcMain.handle(IPC.settings.update, (_event, payload): UpdateSettingsResponse => {
    const previous = getAppSettings()
    const next = readSettings(payload)

    const isShortcutChanged =
      next.recordingShortcut !== previous.recordingShortcut ||
      next.widgetShortcut !== previous.widgetShortcut
    if (isShortcutChanged) replaceGlobalShortcuts({ next, previous })

    const settings = updateAppSettings(next)

    if (settings.isWidgetEnabled !== previous.isWidgetEnabled) {
      setWidgetVisible({ isVisible: settings.isWidgetEnabled })
    }
    applyWidgetOpacity()

    return settings
  })

  ipcMain.handle(IPC.shortcuts.setSuspended, (_event, payload): void =>
    setGlobalShortcutsSuspended({ isSuspended: readBoolean({ payload, key: 'isSuspended' }) })
  )

  ipcMain.handle(IPC.models.status, (): ModelStatusResponse => modelStatus())

  ipcMain.handle(IPC.models.download, (_event, payload) => handleDownloadModels(payload))

  ipcMain.handle(IPC.models.downloadSummary, (): Promise<DownloadModelsResponse> =>
    downloadSummaryModel({ onProgress: broadcastModelDownloadProgress })
  )

  ipcMain.handle(IPC.update.check, () => checkForUpdatesNow())

  ipcMain.handle(IPC.update.download, () => downloadUpdate())

  ipcMain.handle(IPC.update.install, () => installUpdate())

  ipcMain.handle(IPC.clipboard.writeText, (_event, payload) => handleWriteClipboardText(payload))

  // 요약은 수 분이 걸려 invoke를 매달아 둘 수 없다. 큐에 넣기만 하고 결과는 이벤트로 보낸다
  ipcMain.handle(IPC.summary.create, (_event, payload) =>
    enqueueSummaryJob({ meetingId: readMeetingId(payload) })
  )

  ipcMain.handle(IPC.glossary.get, (): GetGlossaryResponse => getGlossarySettings())

  ipcMain.handle(IPC.glossary.update, (_event, payload): UpdateGlossaryResponse =>
    updateGlossarySettings(readGlossarySettings(payload))
  )

  ipcMain.handle(IPC.glossary.draft, async (_event, payload): Promise<DraftGlossaryResponse> => ({
    terms: await enqueueGlossaryDraft({ teamDescription: readTeamDescription(payload) })
  }))

  ipcMain.handle(IPC.llm.status, (): Promise<GetLlmStatusResponse> => getLlmStatus())

  ipcMain.handle(IPC.llm.setProvider, (_event, payload): Promise<SetLlmProviderResponse> => {
    setLlmProvider({ provider: readLlmProvider(payload) })

    return getLlmStatus()
  })

  ipcMain.handle(IPC.llm.setApiKey, (_event, payload) => handleSetLlmApiKey(payload))

  ipcMain.handle(IPC.llm.setOpenaiModel, (_event, payload): Promise<SetOpenaiModelResponse> => {
    setOpenaiModel({ model: readOpenaiModel(payload) })

    return getLlmStatus()
  })

  // 짧은 프롬프트 한 번이라 큐를 거치지 않는다 (references/architecture.md "LLM 공급자")
  ipcMain.handle(IPC.llm.check, (): Promise<CheckLlmResponse> => checkLlm())
}

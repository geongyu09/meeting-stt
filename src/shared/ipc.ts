import type {
  AppSettings,
  Meeting,
  MeetingDetail,
  ModelKey,
  PipelineStage,
  SummaryStage,
  WhisperModelId
} from './types'

/**
 * IPC 채널과 payload 타입의 단일 정의. main·preload·renderer가 모두 이 파일을 import한다.
 * 채널은 그 Phase에서 실제로 쓰는 것만 둔다 (.claude/rules/ipc-api-guide.md).
 */
export const IPC = {
  recording: {
    requestPermission: 'recording:requestPermission',
    start: 'recording:start',
    chunk: 'recording:chunk',
    stop: 'recording:stop'
  },
  meetings: {
    list: 'meetings:list',
    get: 'meetings:get',
    rename: 'meetings:rename',
    delete: 'meetings:delete'
  },
  utterances: { updateText: 'utterances:updateText', reassign: 'utterances:reassign' },
  speakers: { rename: 'speakers:rename', merge: 'speakers:merge' },
  settings: { get: 'settings:get', update: 'settings:update' },
  clipboard: { writeText: 'clipboard:writeText' },
  summary: { create: 'summary:create' },
  models: {
    status: 'models:status',
    download: 'models:download',
    downloadSummary: 'models:downloadSummary'
  },
  update: { download: 'update:download', install: 'update:install' },
  events: {
    progress: 'pipeline:progress',
    summary: 'summary:progress',
    modelDownload: 'models:downloadProgress',
    updateAvailable: 'update:available'
  }
} as const

export interface RequestMicrophonePermissionResponse {
  isGranted: boolean
}

export interface StartRecordingRequest {
  /** renderer의 AudioContext가 실제로 쓰는 샘플레이트. 16kHz가 아니면 main이 거절한다 */
  sampleRate: number
}
export interface StartRecordingResponse {
  meetingId: string
}

export interface SendRecordingChunkRequest {
  meetingId: string
  /** AudioWorklet이 넘긴 Float32 PCM 원본. main이 Int16으로 바꿔 파일에 append한다 */
  pcm: ArrayBuffer
}

export interface StopRecordingRequest {
  meetingId: string
  /**
   * 참석자 수(@shared/speakerCount 범위의 정수). 있으면 화자 분리를 `num-clusters`로 고정하고,
   * 없으면 임계값 폴백으로 나눈다 — 폴백은 긴 녹음에서 과분할된다 (references/architecture.md)
   */
  speakerCount?: number
}
export type StopRecordingResponse = Meeting

export type GetMeetingsResponse = Meeting[]

export interface GetMeetingRequest {
  meetingId: string
}
export type GetMeetingResponse = MeetingDetail | null

/**
 * 회의 상세를 바꾸는 채널은 모두 갱신된 상세를 그대로 돌려준다 (references/architecture.md).
 * 여러 행이 한꺼번에 바뀌는 화자 병합·재배정도 응답 하나로 renderer 상태를 맞출 수 있다.
 */
export type MutateMeetingResponse = MeetingDetail

export interface RenameMeetingRequest {
  meetingId: string
  title: string
}

export interface DeleteMeetingRequest {
  meetingId: string
}

export interface UpdateUtteranceTextRequest {
  meetingId: string
  utteranceId: string
  text: string
}

export interface ReassignUtteranceRequest {
  meetingId: string
  utteranceId: string
  /** 같은 회의의 speakers에 있는 라벨이어야 한다 */
  speakerLabel: string
}

export interface RenameSpeakerRequest {
  meetingId: string
  label: string
  displayName: string
}

export interface MergeSpeakersRequest {
  meetingId: string
  /** 사라지는 화자 */
  fromLabel: string
  /** 발화를 넘겨받는 화자 */
  intoLabel: string
}

export type GetSettingsResponse = AppSettings
export type UpdateSettingsRequest = AppSettings
export type UpdateSettingsResponse = AppSettings

export interface WriteClipboardTextRequest {
  text: string
}

export interface PipelineProgressEvent {
  meetingId: string
  stage: PipelineStage
  /** 그 단계 안에서의 퍼센트. 전체 진행률 합산은 renderer가 @shared/progress로 한다 */
  percent: number
}

/**
 * 요약은 수 분이 걸려 invoke를 매달아 둘 수 없다. 이 채널은 값을 바꾸는 게 아니라
 * 잡을 예약하고 즉시 반환하며, 결과는 `summary:progress`로 온다 (references/architecture.md).
 */
export interface CreateSummaryRequest {
  meetingId: string
}

export interface SummaryProgressEvent {
  meetingId: string
  stage: SummaryStage
  percent: number
  /** stage가 'done'일 때만. renderer가 다시 조회하지 않도록 결과를 함께 보낸다 */
  summary?: string
  /** stage가 'error'일 때만. 사용자에게 보여줄 한국어 안내 */
  errorMessage?: string
}

/** 온보딩·설정 화면이 그리는 모델 하나의 설치 상태 (references/distribution.md 3절) */
export interface ModelStatusItem {
  key: ModelKey
  label: string
  isInstalled: boolean
  sizeBytes: number
  /** false면 요약 모델. 온보딩 준비 여부(isReady)에 들어가지 않는다 */
  isRequired: boolean
}

/** 사용자가 고를 수 있는 음성 인식 모델 하나. 레지스트리는 main에만 있으므로 renderer는 이 응답으로만 안다 */
export interface WhisperModelChoice {
  id: WhisperModelId
  label: string
  description: string
  sizeBytes: number
}

export interface ModelStatusResponse {
  /** 필수 모델이 전부 있어 온보딩을 건너뛰어도 되는지 */
  isReady: boolean
  isSummaryReady: boolean
  selectedWhisperModelId: WhisperModelId
  recommendedWhisperModelId: WhisperModelId
  whisperOptions: WhisperModelChoice[]
  items: ModelStatusItem[]
}

export interface DownloadModelsRequest {
  whisperModelId: WhisperModelId
}
/** 다운로드가 끝난 뒤의 상태. 진행 중 퍼센트는 `models:downloadProgress`로 온다 */
export type DownloadModelsResponse = ModelStatusResponse

export interface ModelDownloadProgressEvent {
  key: ModelKey
  receivedBytes: number
  totalBytes: number
  percent: number
}

/** 새 버전을 발견했을 때 한 번 보낸다. 내려받기는 사용자가 `update:download`로 요청한다 */
export interface UpdateAvailableEvent {
  version: string
}

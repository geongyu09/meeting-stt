export type MeetingStatus = 'recording' | 'processing' | 'done' | 'error'

export interface Meeting {
  id: string
  title: string
  createdAt: number
  durationSec: number
  status: MeetingStatus
  errorMessage?: string
  summary?: string
}

export interface Utterance {
  id: string
  meetingId: string
  ord: number
  speakerLabel: string
  startSec: number
  endSec: number
  text: string
}

export interface Speaker {
  meetingId: string
  label: string
  displayName: string | null
}

/** 사용자 설정. main의 settings 테이블에 키별 JSON으로 저장한다 (references/data-model.md) */
export interface AppSettings {
  /** 파이프라인이 성공한 뒤 원본 WAV를 남길지. 기본은 삭제(false) */
  isAudioKept: boolean
  /** 앱 시작 시 새 버전을 확인할지. 기본은 꺼짐 — 네트워크는 모델 다운로드 한 번뿐이라는 약속 때문이다 */
  isUpdateCheckEnabled: boolean
}

/** 사용자가 고를 수 있는 음성 인식 모델 (Phase 4). 목록·체크섬은 src/main/models/registry.ts */
export type WhisperModelId = 'turbo-q5' | 'large-v3-q5' | 'small-q5_1'

/** 모델 파일 종류. 'summary'만 선택 모델이고 나머지는 필수다 */
export type ModelKey = 'whisper' | 'vad' | 'segmentation' | 'embedding' | 'summary'

/** 디테일 화면이 한 번에 받는 묶음 */
export interface MeetingDetail {
  meeting: Meeting
  utterances: Utterance[]
  speakers: Speaker[]
}

/** 파이프라인 중간 산출물 — 초 단위 시간, DB에 들어가기 전 형태 */
export interface SttWord {
  start: number
  end: number
  text: string
}

export interface SttSegment {
  start: number
  end: number
  text: string
  words?: SttWord[]
}

export interface SpeakerSegment {
  start: number
  end: number
  speaker: string
}

/** 화자가 배정된 조각. 병합 전 단계 */
export interface SpeakerPiece {
  speaker: string
  start: number
  end: number
  text: string
}

export type MergedUtterance = Omit<Utterance, 'id' | 'meetingId'>

/**
 * 파이프라인 단계. VAD는 whisper에 내장돼 별도 단계가 없고,
 * 'done'·'error'는 잡이 끝날 때 한 번만 보내는 종료 상태다.
 */
export type PipelineStage = 'stt' | 'diarize' | 'merge' | 'save' | 'done' | 'error'

/**
 * 요약 단계 (Phase 5). 'summarize'는 회의록 전체 또는 구간별 부분 요약,
 * 'reduce'는 부분 요약을 하나로 합치는 단계다. 'done'·'error'는 마지막에 한 번만 보낸다.
 */
export type SummaryStage = 'summarize' | 'reduce' | 'done' | 'error'

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

export type PipelineStage = 'vad' | 'stt' | 'diarize' | 'merge' | 'save'

export interface PipelineProgress {
  meetingId: string
  stage: PipelineStage
  percent: number
}

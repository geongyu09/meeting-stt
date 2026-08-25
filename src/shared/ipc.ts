import type { Meeting, MeetingDetail, PipelineStage } from './types'

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
  meetings: { list: 'meetings:list', get: 'meetings:get' },
  events: { progress: 'pipeline:progress' }
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
}
export type StopRecordingResponse = Meeting

export type GetMeetingsResponse = Meeting[]

export interface GetMeetingRequest {
  meetingId: string
}
export type GetMeetingResponse = MeetingDetail | null

export interface PipelineProgressEvent {
  meetingId: string
  stage: PipelineStage
  percent: number
}

/** 메인 스레드 ↔ 워커 메시지 계약. 두 워커가 같은 진행률·오류 모양을 쓴다 */

import type { SpeakerSegment, SttSegment } from '../ported/types'

export type PipelineStage = 'decode' | 'diarize' | 'stt' | 'merge'

/** ONNX 실행 장치. 라이브러리가 쓰는 문자열과 같아야 한다 */
export type DeviceKind = 'webgpu' | 'wasm'

/** 양자화 종류. q4f16은 WebGPU의 shader-f16 기능이 있어야 돌아간다 */
export type DtypeKind = 'q4f16' | 'q4' | 'fp32'

/** 고를 수 있는 Whisper 크기. RTF 판단선을 넘으면 small로 낮춰 보라고 계획에 적혀 있다 (§6) */
export type WhisperModelKind = 'large-v3-turbo' | 'small' | 'tiny'

export interface DiarizeRequest {
  samples: Float32Array
  sampleRate: number
  speakerCount: number
  device: DeviceKind
}

export interface SttRequest {
  samples: Float32Array
  sampleRate: number
  device: DeviceKind
  dtype: DtypeKind
  whisperModel: WhisperModelKind
}

export interface WorkerProgressMessage {
  type: 'progress'
  /** 모델 내려받는 중인지, 추론 중인지 */
  kind: 'download' | 'run'
  percent: number
  note: string
}

export interface DiarizeDoneMessage {
  type: 'done'
  speakerSegments: SpeakerSegment[]
  /** 군집에 들어간 임베딩 수 — 창 경계에서 얼마나 잘게 잘렸는지 보는 값 */
  embeddingCount: number
  /** 다음 워커에 넘기려고 소유권을 돌려받는다 */
  samples: Float32Array
  elapsedMs: number
}

export interface SttDoneMessage {
  type: 'done'
  segments: SttSegment[]
  /** VAD가 남긴 발화 길이(초). RTF 계산의 분모가 아니라 참고값이다 */
  speechSec: number
  vadElapsedMs: number
  samples: Float32Array
  elapsedMs: number
}

export interface WorkerErrorMessage {
  type: 'error'
  message: string
}

export type DiarizeResponse = WorkerProgressMessage | DiarizeDoneMessage | WorkerErrorMessage
export type SttResponse = WorkerProgressMessage | SttDoneMessage | WorkerErrorMessage

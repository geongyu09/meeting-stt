import type { TimeSpan } from '@meeting-stt/core/cluster'

/**
 * main ↔ 임베딩 utilityProcess(`pipeline/embedWorker.ts`) 메시지. 구조화 복제로 오가므로 TypedArray는 그대로 실린다
 * (references/architecture.md "화자 재군집").
 */

export interface EmbedWorkerRequest {
  type: 'embed'
  modelPath: string
  audioPath: string
  chunks: TimeSpan[]
  threads: number
}

export interface EmbedProgressMessage {
  type: 'progress'
  done: number
  total: number
}

export interface EmbedResultMessage {
  type: 'result'
  dim: number
  /** 임베딩을 뽑은 조각의 인덱스. vectors는 이 순서로 dim개씩 이어 붙인 것 */
  chunkIndexes: number[]
  vectors: Float32Array
}

export interface EmbedErrorMessage {
  type: 'error'
  message: string
}

export type EmbedWorkerMessage = EmbedProgressMessage | EmbedResultMessage | EmbedErrorMessage

import { utilityProcess } from 'electron'
import type { ChunkEmbedding, TimeSpan } from '@meeting-stt/core/cluster'
import type {
  EmbedResultMessage,
  EmbedWorkerMessage,
  EmbedWorkerRequest
} from '../types/embedWorker'
import { info, warn } from '../log'
import embedWorkerPath from './embedWorker?modulePath'
import type { EmbedProgress } from './speakerEmbedding'

/**
 * 재임베딩을 utilityProcess에서 돌린다. sherpa-onnx-node의 임베딩 계산은 동기라 main에서 부르면
 * 이벤트 루프가 1분 넘게 멈춘다 (references/architecture.md "화자 재군집", references/pitfalls.md).
 */

const WORKER_SERVICE_NAME = 'meeting-stt-embed'

const unpackResult = ({ dim, chunkIndexes, vectors }: EmbedResultMessage): ChunkEmbedding[] =>
  chunkIndexes.map((chunkIndex, index) => ({
    chunkIndex,
    vector: vectors.slice(index * dim, (index + 1) * dim)
  }))

interface EmbedChunksInWorkerParams {
  modelPath: string
  audioPath: string
  chunks: TimeSpan[]
  threads: number
  onProgress?: (progress: EmbedProgress) => void
}

export const embedChunksInWorker = ({
  modelPath,
  audioPath,
  chunks,
  threads,
  onProgress
}: EmbedChunksInWorkerParams) =>
  new Promise<ChunkEmbedding[]>((resolve, reject) => {
    const child = utilityProcess.fork(embedWorkerPath, [], {
      serviceName: WORKER_SERVICE_NAME,
      stdio: 'pipe'
    })
    let isSettled = false

    const settle = (finish: () => void) => {
      if (isSettled) return
      isSettled = true
      finish()
      child.kill()
    }

    // 파이프를 비우지 않으면 워커가 출력에서 막힌다. 애드온 로그는 운영 로그로 넘긴다
    child.stdout?.on('data', (data: Buffer) => info(`임베딩 워커: ${String(data).trim()}`))
    child.stderr?.on('data', (data: Buffer) => warn(`임베딩 워커: ${String(data).trim()}`))

    child.on('message', (message: EmbedWorkerMessage) => {
      if (message.type === 'progress') {
        onProgress?.({ done: message.done, total: message.total })
        return
      }
      if (message.type === 'result') {
        settle(() => resolve(unpackResult(message)))
        return
      }
      settle(() => reject(new Error(message.message)))
    })
    child.on('exit', (code) => {
      settle(() => reject(new Error(`임베딩 워커가 결과 없이 종료됐습니다 (code ${code})`)))
    })

    const request: EmbedWorkerRequest = { type: 'embed', modelPath, audioPath, chunks, threads }
    child.postMessage(request)
  })

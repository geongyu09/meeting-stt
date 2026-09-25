import type { ChunkEmbedding } from '@meeting-stt/core/cluster'
import type { EmbedWorkerMessage, EmbedWorkerRequest } from '../types/embedWorker'
import { embedChunks } from './speakerEmbedding'

/**
 * 화자 재임베딩 utilityProcess 진입점. main의 `pipeline/embed.ts`가 `utilityProcess.fork`로 띄우고
 * 요청 하나를 보내면 진행률과 결과(또는 오류)를 돌려준다. 결과를 보낸 뒤 종료는 main이 한다
 * (references/architecture.md "화자 재군집"). 이 파일은 `electron`을 import할 수 없다.
 */

const post = (message: EmbedWorkerMessage) => process.parentPort.postMessage(message)

/** 조각별 벡터를 하나의 Float32Array로 이어 붙인다 — 메시지 하나로 옮기기 위해서다 */
const flattenEmbeddings = ({ embeddings, dim }: { embeddings: ChunkEmbedding[]; dim: number }) => {
  const vectors = new Float32Array(embeddings.length * dim)
  embeddings.forEach((embedding, index) => vectors.set(embedding.vector, index * dim))

  return { chunkIndexes: embeddings.map((embedding) => embedding.chunkIndex), vectors }
}

const handleRequest = (request: EmbedWorkerRequest) => {
  try {
    const { dim, embeddings } = embedChunks({
      modelPath: request.modelPath,
      audioPath: request.audioPath,
      chunks: request.chunks,
      threads: request.threads,
      onProgress: ({ done, total }) => post({ type: 'progress', done, total })
    })

    post({ type: 'result', dim, ...flattenEmbeddings({ embeddings, dim }) })
  } catch (caught) {
    post({ type: 'error', message: caught instanceof Error ? caught.message : String(caught) })
  }
}

process.parentPort.on('message', (event) => {
  const request: unknown = event.data
  if (
    typeof request === 'object' &&
    request !== null &&
    (request as { type?: unknown }).type === 'embed'
  ) {
    handleRequest(request as EmbedWorkerRequest)
  }
})

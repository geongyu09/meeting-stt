import { SpeakerEmbeddingExtractor, readWave } from 'sherpa-onnx-node'
import type { ChunkEmbedding, TimeSpan } from '@meeting-stt/core/cluster'

/**
 * 조각별 화자 임베딩. sherpa-onnx CLI와 같은 ERes2Net 모델을 sherpa-onnx-node 애드온으로 직접 부른다.
 * `compute`가 동기라 103분 회의에서 1분 넘게 스레드를 잡는다 — 앱에서는 반드시 utilityProcess(`embedWorker.ts`)에서만 부르고,
 * 스크립트(`scripts/recluster.ts`, `scripts/pipeline.ts`)는 그대로 쓴다 (references/architecture.md "화자 재군집").
 * electron·locale·db를 import하지 않는다.
 */

const EMBEDDING_PROVIDER = 'cpu'
const PROGRESS_EVERY_CHUNKS = 50
/**
 * Electron은 N-API 외부 버퍼를 금지한다(`External buffers are not allowed`, V8 샌드박스).
 * sherpa-onnx-node의 readWave·compute 기본값(true)을 그대로 두면 utilityProcess에서 죽는다 (references/pitfalls.md)
 */
const IS_EXTERNAL_BUFFER_ENABLED = false

export interface EmbedProgress {
  done: number
  total: number
}

interface EmbedChunkParams {
  extractor: SpeakerEmbeddingExtractor
  samples: Float32Array
  sampleRate: number
  chunk: TimeSpan
}

/** 조각 하나의 임베딩. 너무 짧아 NaN이 나오면 null (0.05초 조각에서 확인) */
const embedChunk = ({ extractor, samples, sampleRate, chunk }: EmbedChunkParams) => {
  const startSample = Math.max(0, Math.floor(chunk.start * sampleRate))
  const endSample = Math.min(samples.length, Math.floor(chunk.end * sampleRate))
  if (endSample <= startSample) return null

  const stream = extractor.createStream()
  stream.acceptWaveform({ sampleRate, samples: samples.subarray(startSample, endSample) })
  stream.inputFinished()
  if (!extractor.isReady(stream)) return null

  const vector = extractor.compute(stream, IS_EXTERNAL_BUFFER_ENABLED)

  return vector.some(Number.isNaN) ? null : vector
}

interface EmbedChunksParams {
  modelPath: string
  audioPath: string
  chunks: TimeSpan[]
  threads: number
  onProgress?: (progress: EmbedProgress) => void
}

/** WAV를 한 번 읽고 조각마다 임베딩을 뽑는다. 임베딩을 못 뽑은 조각은 결과에 없다 */
export const embedChunks = ({
  modelPath,
  audioPath,
  chunks,
  threads,
  onProgress
}: EmbedChunksParams) => {
  const { samples, sampleRate } = readWave(audioPath, IS_EXTERNAL_BUFFER_ENABLED)
  const extractor = new SpeakerEmbeddingExtractor({
    model: modelPath,
    numThreads: threads,
    provider: EMBEDDING_PROVIDER,
    debug: 0
  })
  const embeddings: ChunkEmbedding[] = []

  chunks.forEach((chunk, chunkIndex) => {
    const vector = embedChunk({ extractor, samples, sampleRate, chunk })
    if (vector) embeddings.push({ chunkIndex, vector })

    const done = chunkIndex + 1
    if (done % PROGRESS_EVERY_CHUNKS === 0) onProgress?.({ done, total: chunks.length })
  })
  onProgress?.({ done: chunks.length, total: chunks.length })

  return { dim: extractor.dim, embeddings }
}

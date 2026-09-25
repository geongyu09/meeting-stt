import {
  OVERSPLIT_CLUSTER_COUNT,
  reclusterChunks,
  splitIntoChunks
} from '@meeting-stt/core/cluster'
import type { SpeakerSegment } from '@shared/types'
import { info, messageOf, warn } from '../log'
import { modelPath } from '../models/paths'
import { embedChunksInWorker } from './embed'
import type { EmbedProgress } from './speakerEmbedding'

/**
 * 화자 재군집. sherpa-onnx CLI 구간의 라벨을 버리고 5초 이하 조각으로 재임베딩한 뒤
 * k-means + 중심 병합으로 다시 묶는다 — CLI 내장 군집이 실제 화자 둘을 합치는 문제의 대응이다
 * (references/architecture.md "화자 재군집", docs/diarization-clustering-results.md).
 */

/** 조각이 이보다 적으면 군집할 것이 없다 */
const MIN_CHUNKS_TO_RECLUSTER = 2
const MS_PER_SEC = 1000

const countSpeakers = (segments: SpeakerSegment[]) =>
  new Set(segments.map((segment) => segment.speaker)).size

interface ReclusterSpeakersParams {
  speakerSegments: SpeakerSegment[]
  /** 정규화본 WAV. CLI가 읽은 것과 같은 파일이어야 조각 시각이 맞는다 */
  audioPath: string
  speakerCount?: number
  threads: number
  onProgress?: (progress: EmbedProgress) => void
}

/**
 * 재군집한 화자 구간. 참석자가 1명이거나 조각이 없으면 CLI 결과 그대로,
 * 임베딩이 실패하면 경고를 남기고 CLI 라벨로 폴백한다 (회의록이 아예 안 나오는 것보다 낫다).
 */
export const reclusterSpeakers = async ({
  speakerSegments,
  audioPath,
  speakerCount,
  threads,
  onProgress
}: ReclusterSpeakersParams): Promise<SpeakerSegment[]> => {
  const chunks = splitIntoChunks({ segments: speakerSegments })
  if (speakerCount === 1 || chunks.length < MIN_CHUNKS_TO_RECLUSTER) return speakerSegments

  const clusterCount = speakerCount ?? OVERSPLIT_CLUSTER_COUNT
  const startedAt = Date.now()

  try {
    const embeddings = await embedChunksInWorker({
      modelPath: modelPath('embedding'),
      audioPath,
      chunks,
      threads,
      onProgress
    })
    const relabeled = reclusterChunks({ chunks, embeddings, clusterCount })
    const elapsedSec = ((Date.now() - startedAt) / MS_PER_SEC).toFixed(1)
    info(
      `화자 재군집: 조각 ${chunks.length}개(임베딩 ${embeddings.length}개) → K=${clusterCount} → 화자 ${countSpeakers(relabeled)}명, ${elapsedSec}초`
    )

    return relabeled
  } catch (caught) {
    warn(
      `화자 재군집에 실패해 CLI 라벨을 씁니다 (화자 ${countSpeakers(speakerSegments)}명): ${messageOf(caught)}`
    )

    return speakerSegments
  }
}

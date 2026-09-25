import { OVERSPLIT_CLUSTER_COUNT } from '@meeting-stt/core/cluster'
import type { SpeakerSegment } from '@shared/types'

/** `0.959 -- 5.178 speaker_01` 형태의 결과 줄 */
const SEGMENT_PATTERN = /^\s*(\d+(?:\.\d+)?)\s*--\s*(\d+(?:\.\d+)?)\s+(\S+)\s*$/
const PROGRESS_PATTERN = /^\s*progress\s+(\d+(?:\.\d+)?)%\s*$/

/**
 * 화자 분리 stdout을 화자 구간으로 바꾼다.
 * 설정 덤프·Started 같은 다른 줄은 버리고, 겹치는 구간은 그대로 남긴다
 * (겹쳐 말하기는 병합 단계에서 겹침이 큰 화자로 정리된다).
 */
export const parseDiarizeOutput = (stdout: string): SpeakerSegment[] =>
  stdout.split('\n').reduce<SpeakerSegment[]>((segments, line) => {
    const matched = line.match(SEGMENT_PATTERN)
    if (!matched) return segments

    return [
      ...segments,
      { start: Number(matched[1]), end: Number(matched[2]), speaker: matched[3] }
    ]
  }, [])

/** 진행률 줄에서 퍼센트를 읽는다. 포맷이 바뀌면 null */
export const parseDiarizeProgress = (line: string) => {
  const matched = line.match(PROGRESS_PATTERN)
  return matched ? Number(matched[1]) : null
}

interface BuildDiarizeArgsParams {
  segmentationModelPath: string
  embeddingModelPath: string
  audioPath: string
  threads: number
  /** 참석자 수. 없으면 과분할(12)로 돌리고 재군집이 병합한다 (references/architecture.md "화자 재군집") */
  speakerCount?: number
  /**
   * 임계값 군집. 스크립트 실험 전용 — 앱은 쓰지 않는다. 클러스터 수가 녹음 길이에 비례해 늘어난다
   * (docs/phase1-results.md 6절)
   */
  clusterThreshold?: number
}

/**
 * CLI 인자. 라벨은 재군집이 다시 붙이므로 CLI 군집은 구간 경계를 만드는 용도다.
 * 참석자 수를 모를 때 임계값 대신 12를 주는 이유는 구간이 덜 잘게 쪼개지고 폴백 결과도 낫기 때문이다.
 */
export const buildDiarizeArgs = ({
  segmentationModelPath,
  embeddingModelPath,
  audioPath,
  threads,
  speakerCount,
  clusterThreshold
}: BuildDiarizeArgsParams) => [
  clusterThreshold !== undefined
    ? `--clustering.cluster-threshold=${clusterThreshold}`
    : `--clustering.num-clusters=${speakerCount ?? OVERSPLIT_CLUSTER_COUNT}`,
  `--segmentation.pyannote-model=${segmentationModelPath}`,
  `--embedding.model=${embeddingModelPath}`,
  `--segmentation.num-threads=${threads}`,
  `--embedding.num-threads=${threads}`,
  audioPath
]

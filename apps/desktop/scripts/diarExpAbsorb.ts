// E11: 참석자 수 없음 경로의 군소 화자 흡수 기준을 바꿔 본다 (docs/diarization-experiments.md 4절 E11).
// 앱과 같은 창 간격 0.25 입력을 시드 5개로 군집하고, 같은 군집 결과에 기준선(10초)과 변형을 짝지어 채점한다.
// 사용: nice -n 15 pnpm --filter meeting-stt exec tsx scripts/diarExpAbsorb.ts [--dataset=D1,D6]
import { existsSync } from 'node:fs'

import {
  OVERSPLIT_CLUSTER_COUNT,
  clusterEmbeddings,
  l2Normalize,
  splitIntoChunks
} from '@meeting-stt/core/cluster'
import type { SpeakerSegment } from '@shared/types'

import { NOISE_SEEDS, centroidsOf, segmentsOf } from './diarExpCluster'
import {
  cliPathFor,
  embedWithCache,
  embeddingCachePathOf,
  loadCliSegments,
  selectDatasets
} from './diarDatasets'
import { appendResult, evaluateSegments, loadEvalContext } from './diarEval'
import { dot } from './diarExpLinalg'
import { fail, info } from './log'

const TAG = 'r2.E11'
const DEFAULT_DATASETS = 'D1,D3s,D4s,D5,D2,D6'
const APP_SHIFT_SUFFIX = '.shift0.25.txt'
const PERCENT = 100

interface VariantInput {
  segments: SpeakerSegment[]
  labels: number[]
  /** L2 정규화한 조각 임베딩 */
  vectors: Float32Array[]
  totalSec: number
}

const gapBetween = (a: SpeakerSegment, b: SpeakerSegment) =>
  Math.max(0, a.start - b.end, b.start - a.end)

/** 앱의 absorbMinorSpeakers와 같은 규칙(시간상 가장 가까운 주요 화자에게 넘김)에 기준만 바꾼 것 */
const absorbBelow = ({
  segments,
  minTotalSec
}: {
  segments: SpeakerSegment[]
  minTotalSec: number
}) => {
  const totals = new Map<string, number>()
  for (const s of segments) totals.set(s.speaker, (totals.get(s.speaker) ?? 0) + s.end - s.start)
  const majors = segments.filter((s) => (totals.get(s.speaker) ?? 0) >= minTotalSec)
  if (majors.length === 0 || majors.length === segments.length) return segments

  return segments.map((segment) => {
    if ((totals.get(segment.speaker) ?? 0) >= minTotalSec) return segment
    const nearest = majors.reduce((best, major) =>
      gapBetween(major, segment) < gapBetween(best, segment) ? major : best
    )
    return { ...segment, speaker: nearest.speaker }
  })
}

/**
 * 사후 추가(결과를 본 뒤): 파편 클러스터는 구성원이 자기 중심에 느슨하게 모여 있다(응집도 0.33~~0.46, 실제 화자는 0.47 이상).
 * 응집도가 minCohesion 미만인 클러스터를 풀어 조각마다 남은 클러스터 중 가장 가까운 중심에 붙인다
 */
const dissolveLoose = ({
  vectors,
  labels,
  minCohesion
}: {
  vectors: Float32Array[]
  labels: number[]
  minCohesion: number
}) => {
  const centroids = centroidsOf({ vectors, labels })
  const cohesionOf = (label: number) => {
    const centroid = centroids.get(label) ?? new Float32Array(0)
    const members = vectors.filter((_, index) => labels[index] === label)
    return members.reduce((sum, vector) => sum + dot(vector, centroid), 0) / members.length
  }
  const kept = [...centroids].filter(([label]) => cohesionOf(label) >= minCohesion)
  if (kept.length === 0 || kept.length === centroids.size) return labels

  const keptLabels = new Set(kept.map(([label]) => label))
  return labels.map((label, index) =>
    keptLabels.has(label)
      ? label
      : kept.reduce((best, candidate) =>
          dot(vectors[index], candidate[1]) > dot(vectors[index], best[1]) ? candidate : best
        )[0]
  )
}

/** 기준선 10초는 assignSpeakers가 늘 하는 흡수와 같아 따로 흡수하지 않는다 */
const absorbVariant = ({
  name,
  minTotalSecOf
}: {
  name: string
  minTotalSecOf: (totalSec: number) => number
}) => ({
  name,
  run: ({ segments, totalSec }: VariantInput) =>
    absorbBelow({ segments, minTotalSec: minTotalSecOf(totalSec) })
})

const VARIANTS = [
  absorbVariant({ name: 'abs10', minTotalSecOf: () => 0 }),
  ...[20, 30, 45, 60].map((sec) => absorbVariant({ name: `abs${sec}`, minTotalSecOf: () => sec })),
  ...[0.5, 1, 1.5, 2].map((share) =>
    absorbVariant({
      name: `rel${share}`,
      minTotalSecOf: (totalSec) => (totalSec * share) / PERCENT
    })
  )
]

const main = async () => {
  const selector =
    process.argv.find((arg) => arg.startsWith('--dataset='))?.slice(10) ?? DEFAULT_DATASETS

  for (const dataset of selectDatasets(selector)) {
    const baselinePath = cliPathFor({ dataset, countPath: 'unknown' })
    const shiftPath = baselinePath.replace(/\.txt$/, APP_SHIFT_SUFFIX)
    // D6은 창 간격 0.25가 기본이 된 뒤 만들어 기준 경로가 곧 앱 입력이다
    const cliPath = existsSync(shiftPath) ? shiftPath : baselinePath
    if (!existsSync(cliPath)) {
      info(`[${dataset.id}] 고정 입력이 없어 건너뜁니다 (diarExpPrepare.ts)`)
      continue
    }

    const context = await loadEvalContext(dataset)
    const chunks = splitIntoChunks({ segments: await loadCliSegments(cliPath) })
    const { embeddings } = await embedWithCache({
      wavPath: dataset.normPath,
      chunks,
      cachePath: embeddingCachePathOf(cliPath)
    })
    const rawVectors = embeddings.map((embedding) => embedding.vector)
    const vectors = rawVectors.map(l2Normalize)
    const dissolveVariants = [0.4, 0.42, 0.45].map((minCohesion) => ({
      name: `coh${minCohesion}`,
      run: ({ labels }: VariantInput) =>
        segmentsOf({
          input: { chunks, embeddings },
          labels: dissolveLoose({ vectors, labels, minCohesion })
        })
    }))

    for (const seed of NOISE_SEEDS) {
      const labels = clusterEmbeddings({
        embeddings: rawVectors,
        clusterCount: OVERSPLIT_CLUSTER_COUNT,
        seed
      })
      const segments = segmentsOf({ input: { chunks, embeddings }, labels })
      const totalSec = segments.reduce((sum, s) => sum + s.end - s.start, 0)

      for (const variant of [...VARIANTS, ...dissolveVariants]) {
        const result = evaluateSegments({
          context,
          speakerSegments: variant.run({ segments, labels, vectors, totalSec }),
          countPath: 'unknown'
        })
        await appendResult({
          tag: `${TAG}.${variant.name}.s${seed}`,
          dataset,
          countPath: 'unknown',
          result
        })
      }
    }
  }
}

if (require.main === module) {
  main().catch((error) => fail(error instanceof Error ? error.message : String(error)))
}

// 화자 분리 2차 실험 중 임베딩 캐시만으로 도는 군집·후처리 변형 (docs/diarization-experiments.md 3-3절, E1·E2·E3).
// 제품 코드(@meeting-stt/core/cluster)는 건드리지 않고 변형을 여기에 둔다. 채택되면 SSOT 수정 뒤 제품으로 옮긴다.
// 사용: nice -n 15 pnpm --filter meeting-stt exec tsx scripts/diarExpCluster.ts --exp=base|seed|E1|E2|E3
//       [--dataset=D1,D3s] [--path=known,unknown]
import { existsSync } from 'node:fs'

import {
  CENTROID_MERGE_MIN_COSINE,
  clusterEmbeddings,
  compactLabels,
  kMeans,
  l2Normalize,
  mergeCloseClusters,
  speakerLabelOf,
  type ChunkEmbedding,
  type TimeSpan
} from '@meeting-stt/core/cluster'
import type { SpeakerSegment } from '@shared/types'

import {
  cliPathFor,
  clusterCountOf,
  embeddingCachePathOf,
  loadReclusterInputs,
  selectDatasets,
  type DiarDataset,
  type SpeakerCountPath
} from './diarDatasets'
import { appendResult, evaluateSegments, loadEvalContext, type EvalResult } from './diarEval'
import { cosineMatrix, dot, symmetricEigen } from './diarExpLinalg'
import { fail, info } from './log'

const KMEANS_SEED = 20260925
export const NOISE_SEEDS = [KMEANS_SEED, 1, 2, 3, 4]
/** 사후 추가: 재시작을 늘리면 참석자 수 없음 경로의 시드 편차가 줄어드는지 본다 (앱은 10회) */
const STABLE_RESTARTS = 50

/** E1a NME-SC: 행마다 남길 이웃 수 p의 후보 (조각 수 대비 비율) */
const NMESC_NEIGHBOR_RATIOS = [0.01, 0.02, 0.03, 0.05, 0.075, 0.1, 0.125, 0.15, 0.2, 0.25, 0.3]
const NMESC_MIN_NEIGHBORS = 2
const MAX_SPEAKERS = 12
const MIN_SPEAKERS = 2
/** E1c: 전체 발화 시간의 이 비율 미만인 클러스터는 가까운 클러스터가 있으면 흡수한다 */
const RELATIVE_ABSORB_MAX_SHARE = 0.01
const RELATIVE_ABSORB_MIN_COSINE = 0.6
/** E2a: 화자 전환 한 번에 물리는 벌점 (코사인 단위) */
const SWITCH_PENALTIES = [0.05, 0.1, 0.2, 0.3, 0.5]
const VBX_ROUNDS = 3
/** E3a: PCA 화이트닝 차원 */
const WHITEN_DIMS = [32, 64, 128]
const WHITEN_EPSILON = 1e-8
/** E3b: 이 길이 이상인 조각만으로 중심을 잡는다 */
const LONG_CHUNK_MIN_SEC = 4

export interface ClusterInput {
  chunks: TimeSpan[]
  embeddings: ChunkEmbedding[]
  /** L2 정규화한 임베딩 (embeddings와 같은 순서) */
  vectors: Float32Array[]
  clusterCount: number
}

interface VariantOutput {
  labels: number[]
  note?: string
}

interface Variant {
  name: string
  run: (input: ClusterInput) => VariantOutput
}

export const centroidsOf = ({ vectors, labels }: { vectors: Float32Array[]; labels: number[] }) => {
  const sums = new Map<number, Float32Array>()
  vectors.forEach((vector, index) => {
    const sum = sums.get(labels[index]) ?? new Float32Array(vector.length)
    for (let d = 0; d < vector.length; d += 1) sum[d] += vector[d]
    sums.set(labels[index], sum)
  })
  return new Map([...sums].map(([label, sum]) => [label, l2Normalize(sum)] as const))
}

export const segmentsOf = ({
  input,
  labels
}: {
  input: Pick<ClusterInput, 'chunks' | 'embeddings'>
  labels: number[]
}): SpeakerSegment[] => {
  const compact = compactLabels(labels)
  return input.embeddings.map(({ chunkIndex }, index) => ({
    start: input.chunks[chunkIndex].start,
    end: input.chunks[chunkIndex].end,
    speaker: speakerLabelOf(compact[index])
  }))
}

const baseLabels = ({ embeddings, clusterCount }: ClusterInput, seed = KMEANS_SEED) =>
  clusterEmbeddings({ embeddings: embeddings.map((e) => e.vector), clusterCount, seed })

/** k-means 뒤에 현재 앱과 같은 중심 병합 보호를 건다. 병합은 항상 원래 임베딩 공간에서 잰다 */
const kMeansWithMerge = ({
  clusterSpace,
  mergeSpace,
  k
}: {
  clusterSpace: Float32Array[]
  mergeSpace: Float32Array[]
  k: number
}) =>
  mergeCloseClusters({
    vectors: mergeSpace,
    labels: kMeans({ vectors: clusterSpace, k }),
    minCosine: CENTROID_MERGE_MIN_COSINE
  })

// ───────── E1. 화자 수 자동 추정 ─────────

/** 행마다 유사도 상위 p개만 1로 남기고 대칭화한 그래프의 라플라시안 고유값 (오름차순) */
const laplacianEigenvalues = ({
  ranked,
  size,
  neighbors
}: {
  ranked: Int32Array[]
  size: number
  neighbors: number
}) => {
  const laplacian = new Float64Array(size * size)
  for (let i = 0; i < size; i += 1) {
    for (let r = 0; r < neighbors; r += 1) {
      const j = ranked[i][r]
      laplacian[i * size + j] -= 0.5
      laplacian[j * size + i] -= 0.5
    }
  }
  for (let i = 0; i < size; i += 1) {
    let degree = 0
    for (let j = 0; j < size; j += 1) degree -= laplacian[i * size + j]
    laplacian[i * size + i] += degree
  }
  return symmetricEigen({ matrix: laplacian, size }).values
}

/** NME-SC (Park et al. 2019): 고유값 간격을 최대 고유값으로 나눈 값 대비 p가 가장 작은 p를 고르고, 그때의 최대 간격 위치가 화자 수다 */
const estimateSpeakersByNmeSc = (vectors: Float32Array[]) => {
  const size = vectors.length
  const similarities = cosineMatrix(vectors)
  const ranked = Array.from({ length: size }, (_, i) =>
    Int32Array.from({ length: size }, (_, j) => j).sort(
      (a, b) => similarities[i * size + b] - similarities[i * size + a]
    )
  )
  const candidates = [
    ...new Set(
      NMESC_NEIGHBOR_RATIOS.map((ratio) =>
        Math.min(size - 1, Math.max(NMESC_MIN_NEIGHBORS, Math.round(ratio * size)))
      )
    )
  ]

  let best = { ratio: Infinity, speakers: 1, neighbors: 0 }
  for (const neighbors of candidates) {
    const values = laplacianEigenvalues({ ranked, size, neighbors })
    const gaps = values
      .slice(0, Math.min(MAX_SPEAKERS, size - 1))
      .map((value, index) => values[index + 1] - value)
    const maxGap = Math.max(...gaps)
    const ratio = neighbors / (maxGap / (values[size - 1] + WHITEN_EPSILON) + WHITEN_EPSILON)
    if (ratio < best.ratio) best = { ratio, speakers: gaps.indexOf(maxGap) + 1, neighbors }
  }
  return best
}

/** 코사인 거리 실루엣 평균 */
const silhouetteOf = ({
  similarities,
  labels
}: {
  similarities: Float32Array
  labels: number[]
}) => {
  const size = labels.length
  const clusters = [...new Set(labels)]
  const counts = new Map(clusters.map((c) => [c, labels.filter((l) => l === c).length]))
  let total = 0
  for (let i = 0; i < size; i += 1) {
    const sums = new Map<number, number>(clusters.map((c) => [c, 0]))
    for (let j = 0; j < size; j += 1) {
      if (j !== i) sums.set(labels[j], (sums.get(labels[j]) ?? 0) + 1 - similarities[i * size + j])
    }
    const ownCount = (counts.get(labels[i]) ?? 1) - 1
    if (ownCount === 0) continue
    const own = (sums.get(labels[i]) ?? 0) / ownCount
    const nearest = Math.min(
      ...clusters
        .filter((c) => c !== labels[i])
        .map((c) => (sums.get(c) ?? 0) / (counts.get(c) ?? 1))
    )
    total += (nearest - own) / Math.max(own, nearest)
  }
  return total / size
}

const estimateSpeakersBySilhouette = (vectors: Float32Array[]) => {
  const similarities = cosineMatrix(vectors)
  let best = { score: -Infinity, speakers: MIN_SPEAKERS }
  for (let k = MIN_SPEAKERS; k <= Math.min(MAX_SPEAKERS, vectors.length - 1); k += 1) {
    const score = silhouetteOf({ similarities, labels: kMeans({ vectors, k }) })
    if (score > best.score) best = { score, speakers: k }
  }
  return best
}

const absorbSmallClusters = ({ input, labels }: { input: ClusterInput; labels: number[] }) => {
  const lengthOf = (index: number) => {
    const chunk = input.chunks[input.embeddings[index].chunkIndex]
    return chunk.end - chunk.start
  }
  const totalSec = labels.reduce((sum, _, index) => sum + lengthOf(index), 0)
  let current = [...labels]
  let absorbed = 0

  for (;;) {
    const centroids = centroidsOf({ vectors: input.vectors, labels: current })
    if (centroids.size < 2) break
    const seconds = new Map<number, number>()
    current.forEach((label, index) =>
      seconds.set(label, (seconds.get(label) ?? 0) + lengthOf(index))
    )

    const target = [...seconds]
      .filter(([, sec]) => sec / totalSec < RELATIVE_ABSORB_MAX_SHARE)
      .map(([label]) => {
        const own = centroids.get(label) ?? new Float32Array(0)
        const nearest = [...centroids]
          .filter(([other]) => other !== label)
          .map(([other, centroid]) => ({ other, cosine: dot(own, centroid) }))
          .reduce((a, b) => (b.cosine > a.cosine ? b : a))
        return { label, ...nearest }
      })
      .filter(({ cosine }) => cosine >= RELATIVE_ABSORB_MIN_COSINE)
      .reduce<{ label: number; other: number; cosine: number } | null>(
        (a, b) => (!a || b.cosine > a.cosine ? b : a),
        null
      )
    if (!target) break

    current = current.map((label) => (label === target.label ? target.other : label))
    absorbed += 1
  }
  return { labels: current, note: `흡수 ${absorbed}개` }
}

const nmescCache = new WeakMap<Float32Array[], ReturnType<typeof estimateSpeakersByNmeSc>>()

const cachedNmeSc = (vectors: Float32Array[]) => {
  const cached = nmescCache.get(vectors)
  if (cached) return cached
  const estimate = estimateSpeakersByNmeSc(vectors)
  nmescCache.set(vectors, estimate)
  return estimate
}

/**
 * 사후 추가(2026-10-01): NME-SC가 화자 수를 적게 잡으면 실제 화자가 합쳐진다. 추정값에 여유를 더해 K로 쓰고
 * 남는 클러스터는 지금처럼 중심 병합에 맡긴다. 12로 과분할하는 것보다 덜 쪼개면서 과소 추정을 막으려는 것이다.
 */
const nmescMarginVariant = (margin: number): Variant => ({
  name: `nmescPlus${margin}`,
  run: ({ vectors }) => {
    const k = Math.min(MAX_SPEAKERS, cachedNmeSc(vectors).speakers + margin)
    return {
      labels: kMeansWithMerge({ clusterSpace: vectors, mergeSpace: vectors, k }),
      note: `K ${k}`
    }
  }
})

const E1_VARIANTS: Variant[] = [
  {
    name: 'nmesc',
    run: ({ vectors }) => {
      const { speakers, neighbors } = estimateSpeakersByNmeSc(vectors)
      const k = Math.max(1, speakers)
      return {
        labels: kMeansWithMerge({ clusterSpace: vectors, mergeSpace: vectors, k }),
        note: `K추정 ${k} (p=${neighbors})`
      }
    }
  },
  {
    name: 'silhouette',
    run: ({ vectors }) => {
      const { speakers, score } = estimateSpeakersBySilhouette(vectors)
      return {
        labels: kMeansWithMerge({ clusterSpace: vectors, mergeSpace: vectors, k: speakers }),
        note: `K추정 ${speakers} (실루엣 ${score.toFixed(3)})`
      }
    }
  },
  { name: 'relAbsorb', run: (input) => absorbSmallClusters({ input, labels: baseLabels(input) }) }
]

// ───────── E2. 시간 연속성 재정리 ─────────

/** 조각 순서(시작 시각 순)에 Viterbi를 돌려 조각별 클러스터를 다시 고른다. 점수 = 중심 코사인 합 − 전환 횟수 × 벌점 */
const smoothByViterbi = ({
  input,
  labels,
  penalty
}: {
  input: ClusterInput
  labels: number[]
  penalty: number
}) => {
  const centroids = [...centroidsOf({ vectors: input.vectors, labels })]
  const order = input.embeddings
    .map((embedding, index) => ({ index, start: input.chunks[embedding.chunkIndex].start }))
    .sort((a, b) => a.start - b.start)
    .map(({ index }) => index)
  const states = centroids.length
  const back: Int32Array[] = []
  let scores = new Float64Array(states)

  order.forEach((vectorIndex, step) => {
    const emission = centroids.map(([, centroid]) => dot(input.vectors[vectorIndex], centroid))
    const bestPrevious = scores.indexOf(Math.max(...scores))
    const next = new Float64Array(states)
    const pointers = new Int32Array(states)
    for (let s = 0; s < states; s += 1) {
      const isStayBetter = step === 0 || scores[s] >= scores[bestPrevious] - penalty
      pointers[s] = isStayBetter ? s : bestPrevious
      next[s] =
        emission[s] + (step === 0 ? 0 : isStayBetter ? scores[s] : scores[bestPrevious] - penalty)
    }
    back.push(pointers)
    scores = next
  })

  const smoothed = new Array<number>(labels.length)
  let state = scores.indexOf(Math.max(...scores))
  for (let step = order.length - 1; step >= 0; step -= 1) {
    smoothed[order[step]] = centroids[state][0]
    state = back[step][state]
  }
  return smoothed
}

const viterbiVariant = (penalty: number): Variant => ({
  name: `viterbi${penalty}`,
  run: (input) => ({ labels: smoothByViterbi({ input, labels: baseLabels(input), penalty }) })
})

/** VBx를 단순화한 것: Viterbi 결과로 중심을 다시 잡고 Viterbi를 되풀이한다 (사후확률 대신 경로 라벨로 재추정) */
const vbxVariant = (penalty: number): Variant => ({
  name: `vbx${penalty}`,
  run: (input) => {
    let labels = baseLabels(input)
    for (let round = 0; round < VBX_ROUNDS; round += 1) {
      labels = smoothByViterbi({ input, labels, penalty })
    }
    return { labels }
  }
})

const E2_VARIANTS: Variant[] = [
  ...SWITCH_PENALTIES.map(viterbiVariant),
  ...SWITCH_PENALTIES.map(vbxVariant)
]

// ───────── E3. 회의 내부 적응 ─────────

/** 회의 임베딩의 평균을 빼고 PCA 상위 dims 방향으로 화이트닝한 뒤 다시 정규화한다 */
const whiten = ({ vectors, dims }: { vectors: Float32Array[]; dims: number }) => {
  const dim = vectors[0].length
  const mean = new Float64Array(dim)
  for (const vector of vectors)
    for (let d = 0; d < dim; d += 1) mean[d] += vector[d] / vectors.length

  const covariance = new Float64Array(dim * dim)
  for (const vector of vectors) {
    for (let a = 0; a < dim; a += 1) {
      const centered = vector[a] - mean[a]
      for (let b = 0; b <= a; b += 1) covariance[a * dim + b] += centered * (vector[b] - mean[b])
    }
  }
  for (let a = 0; a < dim; a += 1) {
    for (let b = 0; b <= a; b += 1) {
      covariance[a * dim + b] /= vectors.length
      covariance[b * dim + a] = covariance[a * dim + b]
    }
  }

  const { values, vectors: axes } = symmetricEigen({
    matrix: covariance,
    size: dim,
    withVectors: true
  })
  const kept = Math.min(dims, vectors.length - 1, dim)
  const top = Array.from({ length: kept }, (_, i) => dim - 1 - i).filter(
    (index) => values[index] > WHITEN_EPSILON
  )

  return vectors.map((vector) =>
    l2Normalize(
      Float32Array.from(top, (index) => {
        let projection = 0
        for (let d = 0; d < dim; d += 1) projection += (vector[d] - mean[d]) * axes[index][d]
        return projection / Math.sqrt(values[index])
      })
    )
  )
}

/** 긴 조각만으로 k-means 중심을 잡고 모든 조각을 가장 가까운 중심에 붙인다. 긴 조각이 모자라면 null */
const clusterByLongChunks = ({ input, space }: { input: ClusterInput; space: Float32Array[] }) => {
  const longIndexes = input.embeddings
    .map(({ chunkIndex }, index) => ({ index, chunk: input.chunks[chunkIndex] }))
    .filter(({ chunk }) => chunk.end - chunk.start >= LONG_CHUNK_MIN_SEC)
    .map(({ index }) => index)
  if (longIndexes.length < input.clusterCount * 2) return null

  const longVectors = longIndexes.map((index) => space[index])
  const centroids = [
    ...centroidsOf({
      vectors: longVectors,
      labels: kMeans({ vectors: longVectors, k: input.clusterCount })
    })
  ]
  const labels = space.map(
    (vector) =>
      centroids
        .map(([label, centroid]) => ({ label, cosine: dot(vector, centroid) }))
        .reduce((a, b) => (b.cosine > a.cosine ? b : a)).label
  )
  return { labels, longCount: longIndexes.length }
}

const longChunkVariant = ({ name, dims }: { name: string; dims?: number }): Variant => ({
  name,
  run: (input) => {
    const space = dims ? whiten({ vectors: input.vectors, dims }) : input.vectors
    const result = clusterByLongChunks({ input, space })
    if (!result) return { labels: baseLabels(input), note: '긴 조각 부족 → 기준선' }
    return {
      labels: mergeCloseClusters({ vectors: input.vectors, labels: result.labels }),
      note: `긴 조각 ${result.longCount}/${input.vectors.length}`
    }
  }
})

const E3_VARIANTS: Variant[] = [
  ...WHITEN_DIMS.map<Variant>((dims) => ({
    name: `whiten${dims}`,
    run: (input) => ({
      labels: kMeansWithMerge({
        clusterSpace: whiten({ vectors: input.vectors, dims }),
        mergeSpace: input.vectors,
        k: input.clusterCount
      })
    })
  })),
  longChunkVariant({ name: 'long4' }),
  longChunkVariant({ name: 'whiten64long4', dims: 64 })
]

const EXPERIMENTS: Record<string, { tag: string; variants: Variant[]; paths: SpeakerCountPath[] }> =
  {
    base: {
      tag: 'r2.base',
      variants: [{ name: '', run: (input) => ({ labels: baseLabels(input) }) }],
      paths: ['known', 'unknown']
    },
    seed: {
      tag: 'r2.seed',
      variants: NOISE_SEEDS.map((seed) => ({
        name: `s${seed}`,
        run: (input) => ({ labels: baseLabels(input, seed) })
      })),
      paths: ['known', 'unknown']
    },
    E1: { tag: 'r2.E1', variants: E1_VARIANTS, paths: ['unknown'] },
    E1x: { tag: 'r2.E1', variants: [1, 2, 3].map(nmescMarginVariant), paths: ['unknown'] },
    stab: {
      tag: 'r2.stab',
      variants: NOISE_SEEDS.map((seed) => ({
        name: `r${STABLE_RESTARTS}.s${seed}`,
        run: ({ vectors, clusterCount }) => ({
          labels: mergeCloseClusters({
            vectors,
            labels: kMeans({ vectors, k: clusterCount, seed, restarts: STABLE_RESTARTS })
          })
        })
      })),
      paths: ['known', 'unknown']
    },
    E2: { tag: 'r2.E2', variants: E2_VARIANTS, paths: ['known', 'unknown'] },
    E3: { tag: 'r2.E3', variants: E3_VARIANTS, paths: ['known', 'unknown'] }
  }

/** D1에서 1차 실험부터 문제였던 화자 쌍의 혼동 글자 수 (E3 채택 기준) */
const WATCHED_PAIRS = [
  ['준', '루덴스'],
  ['유월', '이스타']
]

export const watchedConfusionNote = (result: EvalResult) => {
  if (!result.scored || !result.score) return ''
  const { mapping } = result.score
  return WATCHED_PAIRS.map(([a, b]) => {
    const confused = result.scored
      .filter((piece) => {
        const mapped = mapping.get(piece.hyp)
        return (piece.refs[0] === a && mapped === b) || (piece.refs[0] === b && mapped === a)
      })
      .reduce((sum, piece) => sum + piece.weight, 0)
    return `${a}↔${b} ${confused}자`
  }).join(', ')
}

export const loadClusterInput = async ({
  dataset,
  countPath
}: {
  dataset: DiarDataset
  countPath: SpeakerCountPath
}): Promise<ClusterInput | null> => {
  const cliPath = cliPathFor({ dataset, countPath })
  if (!existsSync(cliPath) || !existsSync(embeddingCachePathOf(cliPath))) return null

  const { chunks, embeddings } = await loadReclusterInputs({ dataset, countPath })
  return {
    chunks,
    embeddings,
    vectors: embeddings.map((embedding) => l2Normalize(embedding.vector)),
    clusterCount: clusterCountOf({ dataset, countPath })
  }
}

const main = async () => {
  const argv = process.argv.slice(2)
  const valueOf = (name: string) => argv.find((arg) => arg.startsWith(`--${name}=`))?.split('=')[1]
  const experiment = EXPERIMENTS[valueOf('exp') ?? '']
  if (!experiment) return fail(`--exp=${Object.keys(EXPERIMENTS).join('|')} 를 주세요`)
  const paths = (valueOf('path')?.split(',') as SpeakerCountPath[] | undefined) ?? experiment.paths

  for (const dataset of selectDatasets(valueOf('dataset'))) {
    const context = await loadEvalContext(dataset)
    for (const countPath of paths) {
      const input = await loadClusterInput({ dataset, countPath })
      if (!input) {
        info(`[${dataset.id}/${countPath}] 고정 입력이 없어 건너뜁니다 (diarExpPrepare.ts)`)
        continue
      }
      for (const variant of experiment.variants) {
        const { labels, note } = variant.run(input)
        const result = evaluateSegments({
          context,
          speakerSegments: segmentsOf({ input, labels }),
          countPath
        })
        await appendResult({
          tag: [experiment.tag, variant.name].filter(Boolean).join('.'),
          dataset,
          countPath,
          result,
          note: [note, dataset.id === 'D1' ? watchedConfusionNote(result) : '']
            .filter(Boolean)
            .join(' · ')
        })
      }
    }
  }
}

if (require.main === module) {
  main().catch((error) => fail(error instanceof Error ? error.message : String(error)))
}

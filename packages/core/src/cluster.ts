import type { SpeakerSegment } from './types'

/**
 * 화자 재군집. sherpa-onnx CLI가 낸 화자 구간의 라벨을 버리고, 구간을 짧은 조각으로 잘라 다시 뽑은 임베딩을
 * k-means + 중심 병합으로 묶어 라벨을 새로 붙인다. CLI 내장 complete-linkage는 튀는 임베딩 하나가 클러스터를
 * 차지해 실제 화자 둘을 합친다 (docs/diarization-clustering-results.md, references/architecture.md "화자 재군집").
 * 순수 함수라 데스크탑(sherpa-onnx-node 임베딩)과 브라우저 앱이 같이 쓸 수 있다.
 */

/** 재임베딩 조각의 최대 길이. pyannote 창 조각(1~2초)보다 길어야 임베딩이 안정된다. 3초와 5초는 결과가 같다 */
export const RECLUSTER_CHUNK_MAX_SEC = 5

/** 참석자 수를 모를 때 일부러 과분할하는 클러스터 수. 중심 병합이 여분을 되돌린다 */
export const OVERSPLIT_CLUSTER_COUNT = 12

/**
 * 군집 뒤 중심 코사인이 이 값 이상인 클러스터 쌍을 합친다. 쪼개진 같은 화자는 0.7~0.9, 실제 화자끼리는 0.7 미만이다.
 * 0.7이 조금 더 잘 합치지만 UI에 화자 분리가 없어 덜 합치는 쪽(0.75)을 택했다. 임베딩 모델(ERes2Net)에 묶인 값이다.
 */
export const CENTROID_MERGE_MIN_COSINE = 0.75

const KMEANS_RESTARTS = 10
const KMEANS_MAX_ITERATIONS = 100
/** 결과가 실행마다 달라지지 않도록 고정한다 */
const KMEANS_SEED = 20260925
const SPEAKER_LABEL_DIGITS = 2
const UINT32_RANGE = 4294967296

export interface TimeSpan {
  start: number
  end: number
}

/** 조각 하나의 임베딩. 너무 짧아 임베딩을 못 뽑은 조각은 목록에 없다 */
export interface ChunkEmbedding {
  chunkIndex: number
  vector: Float32Array
}

interface SplitIntoChunksParams {
  segments: TimeSpan[]
  maxChunkSec?: number
}

/** 구간을 시작 시각 순으로 늘어놓고 각각을 maxChunkSec 이하 조각으로 균등 분할한다. 라벨은 보지 않는다 */
export const splitIntoChunks = ({
  segments,
  maxChunkSec = RECLUSTER_CHUNK_MAX_SEC
}: SplitIntoChunksParams): TimeSpan[] =>
  segments
    .toSorted((a, b) => a.start - b.start)
    .flatMap(({ start, end }) => {
      const length = end - start
      if (length <= 0) return []

      const parts = Math.max(1, Math.ceil(length / maxChunkSec))
      const step = length / parts

      return Array.from({ length: parts }, (_, index) => ({
        start: start + index * step,
        end: index === parts - 1 ? end : start + (index + 1) * step
      }))
    })

/** L2 정규화. 영벡터는 그대로 둔다 */
export const l2Normalize = (vector: Float32Array) => {
  let sumSquares = 0
  for (let i = 0; i < vector.length; i += 1) sumSquares += vector[i] * vector[i]

  const norm = Math.sqrt(sumSquares)
  if (norm === 0) return Float32Array.from(vector)

  const normalized = new Float32Array(vector.length)
  for (let i = 0; i < vector.length; i += 1) normalized[i] = vector[i] / norm

  return normalized
}

const dot = (a: Float32Array, b: Float32Array) => {
  let sum = 0
  for (let i = 0; i < a.length; i += 1) sum += a[i] * b[i]
  return sum
}

const squaredDistance = (a: Float32Array, b: Float32Array) => {
  let sum = 0
  for (let i = 0; i < a.length; i += 1) {
    const diff = a[i] - b[i]
    sum += diff * diff
  }
  return sum
}

/** mulberry32. 시드가 같으면 같은 수열을 낸다 */
const createRandom = (seed: number) => {
  let state = seed >>> 0

  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / UINT32_RANGE
  }
}

interface KMeansContext {
  vectors: Float32Array[]
  k: number
  random: () => number
}

/** k-means++: 이미 고른 중심에서 먼 점일수록 다음 중심으로 뽑힐 확률이 높다 */
const initializeCentroids = ({ vectors, k, random }: KMeansContext) => {
  const centroids = [Float32Array.from(vectors[Math.floor(random() * vectors.length)])]
  const nearestSquared = vectors.map((vector) => squaredDistance(vector, centroids[0]))

  while (centroids.length < k) {
    const total = nearestSquared.reduce((sum, value) => sum + value, 0)
    let pick = vectors.length - 1
    if (total > 0) {
      let threshold = random() * total
      pick = nearestSquared.findIndex((value) => {
        threshold -= value
        return threshold <= 0
      })
      if (pick === -1) pick = vectors.length - 1
    }

    const centroid = Float32Array.from(vectors[pick])
    centroids.push(centroid)
    vectors.forEach((vector, index) => {
      nearestSquared[index] = Math.min(nearestSquared[index], squaredDistance(vector, centroid))
    })
  }

  return centroids
}

const nearestCentroidIndex = ({
  vector,
  centroids
}: {
  vector: Float32Array
  centroids: Float32Array[]
}) =>
  centroids.reduce(
    (best, centroid, index) => {
      const distance = squaredDistance(vector, centroid)
      return distance < best.distance ? { index, distance } : best
    },
    { index: 0, distance: Infinity }
  )

/** 라벨별 평균 벡터. 빈 클러스터는 자기 중심에서 가장 먼 점으로 다시 심는다 */
const recomputeCentroids = ({
  vectors,
  labels,
  centroids
}: {
  vectors: Float32Array[]
  labels: number[]
  centroids: Float32Array[]
}) => {
  const dim = vectors[0].length
  const sums = centroids.map(() => new Float64Array(dim))
  const counts = new Array<number>(centroids.length).fill(0)

  vectors.forEach((vector, index) => {
    const label = labels[index]
    counts[label] += 1
    for (let d = 0; d < dim; d += 1) sums[label][d] += vector[d]
  })

  return centroids.map((_, label) => {
    if (counts[label] === 0) {
      const farthest = vectors.reduce(
        (best, vector, index) => {
          const distance = squaredDistance(vector, centroids[labels[index]])
          return distance > best.distance ? { index, distance } : best
        },
        { index: 0, distance: -Infinity }
      )
      return Float32Array.from(vectors[farthest.index])
    }

    const centroid = new Float32Array(dim)
    for (let d = 0; d < dim; d += 1) centroid[d] = sums[label][d] / counts[label]
    return centroid
  })
}

/** Lloyd 반복 한 번의 실행. 라벨과 관성(중심까지 제곱 거리 합)을 돌려준다 */
const runKMeansOnce = ({ vectors, k, random }: KMeansContext) => {
  let centroids = initializeCentroids({ vectors, k, random })
  let labels = vectors.map((vector) => nearestCentroidIndex({ vector, centroids }).index)

  for (let iteration = 0; iteration < KMEANS_MAX_ITERATIONS; iteration += 1) {
    centroids = recomputeCentroids({ vectors, labels, centroids })
    const next = vectors.map((vector) => nearestCentroidIndex({ vector, centroids }).index)
    const isConverged = next.every((label, index) => label === labels[index])
    labels = next
    if (isConverged) break
  }

  const inertia = vectors.reduce(
    (sum, vector, index) => sum + squaredDistance(vector, centroids[labels[index]]),
    0
  )

  return { labels, inertia }
}

interface KMeansParams {
  /** L2 정규화된 벡터들 */
  vectors: Float32Array[]
  k: number
  seed?: number
  restarts?: number
}

/** 여러 번 재시작해 관성이 가장 작은 결과를 고른다 (sklearn `n_init`과 같은 뜻) */
export const kMeans = ({
  vectors,
  k,
  seed = KMEANS_SEED,
  restarts = KMEANS_RESTARTS
}: KMeansParams) => {
  if (vectors.length === 0) return []

  const clusterCount = Math.max(1, Math.min(k, vectors.length))
  if (clusterCount === 1) return vectors.map(() => 0)

  const random = createRandom(seed)
  let best: { labels: number[]; inertia: number } | null = null

  for (let attempt = 0; attempt < restarts; attempt += 1) {
    const result = runKMeansOnce({ vectors, k: clusterCount, random })
    if (!best || result.inertia < best.inertia) best = result
  }

  return best?.labels ?? []
}

const uniqueLabels = (labels: number[]) => [...new Set(labels)]

/** 라벨별 정규화 중심 */
const centroidsOf = ({ vectors, labels }: { vectors: Float32Array[]; labels: number[] }) =>
  new Map(
    uniqueLabels(labels).map((label) => {
      const members = vectors.filter((_, index) => labels[index] === label)
      const sum = new Float32Array(vectors[0].length)
      for (const member of members) for (let d = 0; d < sum.length; d += 1) sum[d] += member[d]
      return [label, l2Normalize(sum)] as const
    })
  )

interface MergeCloseClustersParams {
  vectors: Float32Array[]
  labels: number[]
  minCosine?: number
}

/**
 * 중심 코사인이 minCosine 이상인 클러스터 쌍을 가장 가까운 것부터 반복해 합친다.
 * K를 실제보다 크게 줬을 때 쪼개진 같은 화자를 되돌리는 보호막이다.
 */
export const mergeCloseClusters = ({
  vectors,
  labels,
  minCosine = CENTROID_MERGE_MIN_COSINE
}: MergeCloseClustersParams) => {
  let current = [...labels]

  for (;;) {
    const centroids = [...centroidsOf({ vectors, labels: current })]
    if (centroids.length < 2) return current

    let best = { from: -1, into: -1, cosine: -Infinity }
    for (let i = 0; i < centroids.length; i += 1) {
      for (let j = i + 1; j < centroids.length; j += 1) {
        const cosine = dot(centroids[i][1], centroids[j][1])
        if (cosine > best.cosine) best = { from: centroids[j][0], into: centroids[i][0], cosine }
      }
    }
    if (best.cosine < minCosine) return current

    current = current.map((label) => (label === best.from ? best.into : label))
  }
}

/** 라벨을 등장 순서대로 0, 1, 2…로 다시 매긴다 */
export const compactLabels = (labels: number[]) => {
  const order = new Map<number, number>()

  return labels.map((label) => {
    const existing = order.get(label)
    if (existing !== undefined) return existing

    order.set(label, order.size)
    return order.size - 1
  })
}

interface ClusterEmbeddingsParams {
  embeddings: Float32Array[]
  clusterCount: number
  mergeMinCosine?: number
  seed?: number
}

/** 정규화 → k-means → 중심 병합 → 라벨 압축. 조각이 K보다 적으면 조각 수만큼만 나눈다 */
export const clusterEmbeddings = ({
  embeddings,
  clusterCount,
  mergeMinCosine = CENTROID_MERGE_MIN_COSINE,
  seed = KMEANS_SEED
}: ClusterEmbeddingsParams) => {
  const vectors = embeddings.map(l2Normalize)
  const labels = kMeans({ vectors, k: clusterCount, seed })

  return compactLabels(mergeCloseClusters({ vectors, labels, minCosine: mergeMinCosine }))
}

export const speakerLabelOf = (index: number) =>
  `speaker_${String(index).padStart(SPEAKER_LABEL_DIGITS, '0')}`

interface ReclusterChunksParams {
  chunks: TimeSpan[]
  embeddings: ChunkEmbedding[]
  clusterCount: number
  mergeMinCosine?: number
}

/**
 * 조각 임베딩을 군집해 조각마다 새 화자 라벨을 붙인 화자 구간을 만든다.
 * 임베딩이 없는 조각은 결과에서 빠진다 — 병합 단계가 이웃 화자로 메운다.
 */
export const reclusterChunks = ({
  chunks,
  embeddings,
  clusterCount,
  mergeMinCosine
}: ReclusterChunksParams): SpeakerSegment[] => {
  const labels = clusterEmbeddings({
    embeddings: embeddings.map((embedding) => embedding.vector),
    clusterCount,
    mergeMinCosine
  })

  return embeddings.map(({ chunkIndex }, index) => ({
    start: chunks[chunkIndex].start,
    end: chunks[chunkIndex].end,
    speaker: speakerLabelOf(labels[index])
  }))
}

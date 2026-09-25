import { describe, expect, it } from 'vitest'

import {
  clusterEmbeddings,
  compactLabels,
  kMeans,
  l2Normalize,
  mergeCloseClusters,
  reclusterChunks,
  speakerLabelOf,
  splitIntoChunks
} from './cluster'

const DIM = 8

/** 축 하나에 몰린 기준 벡터에 작은 결정적 잡음을 더한다. 같은 축끼리는 코사인 0.99 이상, 다른 축과는 0에 가깝다 */
const vectorOn = ({ axis, noise }: { axis: number; noise: number }) => {
  const vector = new Float32Array(DIM)
  vector[axis] = 1
  for (let d = 0; d < DIM; d += 1) if (d !== axis) vector[d] = ((noise * (d + 1)) % 7) * 0.01
  return vector
}

const groupOf = ({ axis, size }: { axis: number; size: number }) =>
  Array.from({ length: size }, (_, i) => vectorOn({ axis, noise: i + 1 }))

const isPartitionEqual = ({ labels, groups }: { labels: number[]; groups: number[] }) =>
  labels.every((label, i) =>
    labels.every((other, j) => (groups[i] === groups[j]) === (label === other))
  )

describe('splitIntoChunks', () => {
  it('최대 길이를 넘는 구간을 균등 분할한다', () => {
    const chunks = splitIntoChunks({ segments: [{ start: 10, end: 22 }], maxChunkSec: 5 })

    expect(chunks).toEqual([
      { start: 10, end: 14 },
      { start: 14, end: 18 },
      { start: 18, end: 22 }
    ])
  })

  it('짧은 구간은 그대로 두고 시작 시각 순으로 정렬한다', () => {
    const chunks = splitIntoChunks({
      segments: [
        { start: 30, end: 33 },
        { start: 0, end: 5 }
      ]
    })

    expect(chunks).toEqual([
      { start: 0, end: 5 },
      { start: 30, end: 33 }
    ])
  })

  it('길이가 0 이하인 구간은 버린다', () => {
    expect(splitIntoChunks({ segments: [{ start: 3, end: 3 }] })).toEqual([])
  })
})

describe('l2Normalize', () => {
  it('길이를 1로 맞춘다', () => {
    const normalized = l2Normalize(Float32Array.from([3, 4]))

    expect(normalized[0]).toBeCloseTo(0.6)
    expect(normalized[1]).toBeCloseTo(0.8)
  })

  it('영벡터는 그대로 둔다', () => {
    expect([...l2Normalize(new Float32Array(3))]).toEqual([0, 0, 0])
  })
})

describe('kMeans', () => {
  const groups = [0, 0, 0, 0, 1, 1, 1, 2, 2, 2, 2, 2]
  const vectors = groups.map((axis, i) => vectorOn({ axis, noise: i + 1 })).map(l2Normalize)

  it('잘 갈라진 세 무리를 정확히 나눈다', () => {
    const labels = kMeans({ vectors, k: 3 })

    expect(new Set(labels).size).toBe(3)
    expect(isPartitionEqual({ labels, groups })).toBe(true)
  })

  it('시드가 같으면 결과가 같다', () => {
    expect(kMeans({ vectors, k: 3 })).toEqual(kMeans({ vectors, k: 3 }))
  })

  it('K가 벡터 수보다 크면 벡터 수로 줄인다', () => {
    const labels = kMeans({ vectors: vectors.slice(0, 2), k: 5 })

    expect(new Set(labels).size).toBe(2)
  })

  it('K가 1이면 전부 같은 라벨이고 빈 입력은 빈 배열이다', () => {
    expect(kMeans({ vectors, k: 1 })).toEqual(vectors.map(() => 0))
    expect(kMeans({ vectors: [], k: 3 })).toEqual([])
  })
})

describe('mergeCloseClusters', () => {
  it('중심이 가까운 클러스터를 합친다', () => {
    const vectors = [...groupOf({ axis: 0, size: 3 }), ...groupOf({ axis: 0, size: 3 })].map(
      l2Normalize
    )
    const labels = [0, 0, 0, 1, 1, 1]

    expect(new Set(mergeCloseClusters({ vectors, labels })).size).toBe(1)
  })

  it('중심이 먼 클러스터는 두지 않는다', () => {
    const vectors = [...groupOf({ axis: 0, size: 3 }), ...groupOf({ axis: 1, size: 3 })].map(
      l2Normalize
    )
    const labels = [0, 0, 0, 1, 1, 1]

    expect(mergeCloseClusters({ vectors, labels })).toEqual(labels)
  })

  it('임계값을 낮추면 합치고 원본 배열은 바꾸지 않는다', () => {
    const vectors = [...groupOf({ axis: 0, size: 3 }), ...groupOf({ axis: 1, size: 3 })].map(
      l2Normalize
    )
    const labels = [0, 0, 0, 1, 1, 1]
    const merged = mergeCloseClusters({ vectors, labels, minCosine: -1 })

    expect(new Set(merged).size).toBe(1)
    expect(labels).toEqual([0, 0, 0, 1, 1, 1])
  })
})

describe('compactLabels', () => {
  it('등장 순서대로 0부터 다시 매긴다', () => {
    expect(compactLabels([5, 5, 2, 5, 9, 2])).toEqual([0, 0, 1, 0, 2, 1])
  })
})

describe('clusterEmbeddings', () => {
  it('참석자 수를 과하게 줘도 병합 보호가 실제 무리 수로 되돌린다', () => {
    const groups = [0, 0, 0, 0, 0, 1, 1, 1, 1, 1]
    const embeddings = groups.map((axis, i) => vectorOn({ axis, noise: i + 1 }))

    const labels = clusterEmbeddings({ embeddings, clusterCount: 6 })

    expect(new Set(labels).size).toBe(2)
    expect(isPartitionEqual({ labels, groups })).toBe(true)
  })

  it('참석자 수를 적게 주면 그 수만큼만 나온다', () => {
    const embeddings = [...groupOf({ axis: 0, size: 3 }), ...groupOf({ axis: 1, size: 3 })]

    expect(new Set(clusterEmbeddings({ embeddings, clusterCount: 1 })).size).toBe(1)
  })
})

describe('reclusterChunks', () => {
  it('조각 시각에 새 화자 라벨을 붙이고 임베딩 없는 조각은 뺀다', () => {
    const chunks = [
      { start: 0, end: 5 },
      { start: 5, end: 8 },
      { start: 8, end: 12 }
    ]
    const embeddings = [
      { chunkIndex: 0, vector: vectorOn({ axis: 0, noise: 1 }) },
      { chunkIndex: 2, vector: vectorOn({ axis: 1, noise: 2 }) }
    ]

    const segments = reclusterChunks({ chunks, embeddings, clusterCount: 2 })

    expect(segments).toEqual([
      { start: 0, end: 5, speaker: 'speaker_00' },
      { start: 8, end: 12, speaker: 'speaker_01' }
    ])
  })

  it('라벨 형식은 두 자리 번호다', () => {
    expect(speakerLabelOf(3)).toBe('speaker_03')
    expect(speakerLabelOf(12)).toBe('speaker_12')
  })
})

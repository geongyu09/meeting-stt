// E8 화자 프로필 (docs/diarization-experiments.md 4절). 같은 사람이 나오는 회의 두 편이 없어 한 회의를 반으로 나눈다.
// 앞 절반의 정답 라벨로 화자별 중심(프로필)을 만들고, 뒤 절반에서 군집 안정화와 이름 자동 지정을 잰다.
// 사용: nice -n 15 pnpm --filter meeting-stt exec tsx scripts/diarExpProfile.ts [--dataset=D1] [--split=3000]
import { clusterEmbeddings, l2Normalize } from '@meeting-stt/core/cluster'

import { selectDatasets, type SpeakerCountPath } from './diarDatasets'
import { appendResult, evaluateSegments, loadEvalContext, type EvalContext } from './diarEval'
import { centroidsOf, loadClusterInput, segmentsOf, type ClusterInput } from './diarExpCluster'
import { dot } from './diarExpLinalg'
import { activeSpeakersAt, type Reference } from './diarScore'
import { fail, info } from './log'

const TAG = 'r2.E8'
const DEFAULT_SPLIT_SEC = 3000
const COUNT_PATHS: SpeakerCountPath[] = ['known', 'unknown']
/** 클러스터 중심과 프로필의 코사인이 이 값 이상이면 그 사람으로 본다 */
const NAME_MIN_COSINES = [0.5, 0.6, 0.7]
/** 프로필을 만들려면 앞 절반에서 최소 이만큼은 말했어야 한다 */
const PROFILE_MIN_CHUNKS = 5
const LLOYD_MAX_ITERATIONS = 50
const PERCENT = 100
const PROFILE_PREFIX = 'profile:'

const midOf = ({ input, index }: { input: ClusterInput; index: number }) => {
  const chunk = input.chunks[input.embeddings[index].chunkIndex]
  return (chunk.start + chunk.end) / 2
}

/** 한쪽 절반의 조각만 남긴 입력 */
const sliceInput = ({
  input,
  keep
}: {
  input: ClusterInput
  keep: (mid: number) => boolean
}): ClusterInput => {
  const indexes = input.embeddings
    .map((_, index) => index)
    .filter((index) => keep(midOf({ input, index })))
  return {
    ...input,
    embeddings: indexes.map((index) => input.embeddings[index]),
    vectors: indexes.map((index) => input.vectors[index])
  }
}

/** 앞 절반 조각에 정답 화자를 붙여 화자별 중심을 만든다. 사용자가 지난 회의에서 이름을 붙여 둔 상태를 흉내 낸다 */
const buildProfiles = ({ input, reference }: { input: ClusterInput; reference: Reference }) => {
  const bySpeaker = new Map<string, Float32Array[]>()
  input.vectors.forEach((vector, index) => {
    const [speaker] = activeSpeakersAt({ reference, sec: midOf({ input, index }) })
    if (speaker) bySpeaker.set(speaker, [...(bySpeaker.get(speaker) ?? []), vector])
  })

  return new Map(
    [...bySpeaker]
      .filter(([, vectors]) => vectors.length >= PROFILE_MIN_CHUNKS)
      .map(([speaker, vectors]) => {
        const sum = new Float32Array(vectors[0].length)
        for (const vector of vectors) for (let d = 0; d < sum.length; d += 1) sum[d] += vector[d]
        return [speaker, l2Normalize(sum)] as const
      })
  )
}

const nearestOf = ({ vector, centroids }: { vector: Float32Array; centroids: Float32Array[] }) =>
  centroids
    .map((centroid, index) => ({ index, cosine: dot(vector, centroid) }))
    .reduce((a, b) => (b.cosine > a.cosine ? b : a))

/** 프로필 중심에서 출발하는 Lloyd 반복 (코사인). 초기값이 고정이라 시드 편차가 없다 */
const kMeansFromProfiles = ({
  vectors,
  profiles
}: {
  vectors: Float32Array[]
  profiles: Float32Array[]
}) => {
  let centroids = profiles
  let labels = vectors.map((vector) => nearestOf({ vector, centroids }).index)
  for (let iteration = 0; iteration < LLOYD_MAX_ITERATIONS; iteration += 1) {
    const updated = centroidsOf({ vectors, labels })
    centroids = centroids.map((centroid, index) => updated.get(index) ?? centroid)
    const next = vectors.map((vector) => nearestOf({ vector, centroids }).index)
    if (next.every((label, index) => label === labels[index])) break
    labels = next
  }
  return labels
}

interface NamingParams {
  context: EvalContext
  input: ClusterInput
  labels: number[]
  profiles: Map<string, Float32Array>
  minCosine: number
  range: { start: number; end: number }
  countPath: SpeakerCountPath
}

/** 클러스터마다 가장 가까운 프로필 이름을 붙이고, 이름이 붙은 글자 중 정답 비율(정밀도)과 붙은 비율을 잰다 */
const scoreNaming = ({
  context,
  input,
  labels,
  profiles,
  minCosine,
  range,
  countPath
}: NamingParams) => {
  const names = [...profiles.keys()]
  const profileCentroids = [...profiles.values()]
  const clusterNames = new Map(
    [...centroidsOf({ vectors: input.vectors, labels })].map(([label, centroid]) => {
      const nearest = nearestOf({ vector: centroid, centroids: profileCentroids })
      return [
        label,
        nearest.cosine >= minCosine ? `${PROFILE_PREFIX}${names[nearest.index]}` : `cluster${label}`
      ]
    })
  )
  const speakerSegments = input.embeddings.map(({ chunkIndex }, index) => ({
    start: input.chunks[chunkIndex].start,
    end: input.chunks[chunkIndex].end,
    speaker: clusterNames.get(labels[index]) ?? 'cluster'
  }))
  const { scored = [] } = evaluateSegments({ context, speakerSegments, countPath, range })

  const total = scored.reduce((sum, piece) => sum + piece.weight, 0)
  const named = scored.filter((piece) => piece.hyp.startsWith(PROFILE_PREFIX))
  const namedWeight = named.reduce((sum, piece) => sum + piece.weight, 0)
  const correct = named
    .filter((piece) => piece.refs.includes(piece.hyp.slice(PROFILE_PREFIX.length)))
    .reduce((sum, piece) => sum + piece.weight, 0)
  /** 프로필에 없는 화자의 글자가 프로필 이름으로 붙은 비율 */
  const outsiders = scored.filter((piece) => !piece.refs.some((ref) => profiles.has(ref)))
  const outsiderWeight = outsiders.reduce((sum, piece) => sum + piece.weight, 0)
  const outsiderNamed = outsiders
    .filter((piece) => piece.hyp.startsWith(PROFILE_PREFIX))
    .reduce((sum, piece) => sum + piece.weight, 0)

  return {
    precision: namedWeight ? correct / namedWeight : 0,
    coverage: total ? namedWeight / total : 0,
    outsiderWeight,
    outsiderNamedRate: outsiderWeight ? outsiderNamed / outsiderWeight : 0
  }
}

const formatNaming = (naming: ReturnType<typeof scoreNaming>) =>
  `정밀도 ${(naming.precision * PERCENT).toFixed(1)}% · 지정률 ${(naming.coverage * PERCENT).toFixed(1)}% · 프로필 밖 화자 ${naming.outsiderWeight}자 중 오지정 ${(naming.outsiderNamedRate * PERCENT).toFixed(1)}%`

const main = async () => {
  const argv = process.argv.slice(2)
  const valueOf = (name: string) => argv.find((arg) => arg.startsWith(`--${name}=`))?.split('=')[1]
  const splitSec = Number(valueOf('split') ?? DEFAULT_SPLIT_SEC)
  const [dataset] = selectDatasets(valueOf('dataset') ?? 'D1')
  const context = await loadEvalContext(dataset)
  const { reference } = context
  if (!reference) return fail(`${dataset.id}에는 정답본이 없습니다`)
  const range = { start: splitSec, end: Infinity }

  for (const countPath of COUNT_PATHS) {
    const full = await loadClusterInput({ dataset, countPath })
    if (!full) return fail(`${dataset.id}/${countPath} 고정 입력이 없습니다`)
    const profiles = buildProfiles({
      input: sliceInput({ input: full, keep: (mid) => mid < splitSec }),
      reference
    })
    const later = sliceInput({ input: full, keep: (mid) => mid >= splitSec })
    info(
      `[${countPath}] 프로필 ${profiles.size}명: ${[...profiles.keys()].join(', ')} · 뒤 절반 조각 ${later.vectors.length}개`
    )

    const evaluate = async ({
      name,
      labels,
      note = ''
    }: {
      name: string
      labels: number[]
      note?: string
    }) => {
      const result = evaluateSegments({
        context,
        speakerSegments: segmentsOf({ input: later, labels }),
        countPath,
        range
      })
      await appendResult({ tag: `${TAG}.${name}`, dataset, countPath, result, note })
    }

    // 기준선: 뒤 절반만 지금 앱 방식으로 군집
    const baseLabels = clusterEmbeddings({
      embeddings: later.embeddings.map((embedding) => embedding.vector),
      clusterCount: later.clusterCount
    })
    await evaluate({ name: 'half.base', labels: baseLabels })
    for (const minCosine of NAME_MIN_COSINES) {
      const naming = scoreNaming({
        context,
        input: later,
        labels: baseLabels,
        profiles,
        minCosine,
        range,
        countPath
      })
      info(`  이름 지정(기준 군집, 코사인≥${minCosine}): ${formatNaming(naming)}`)
    }

    // 프로필을 초기 중심으로 쓰는 k-means
    const seededLabels = kMeansFromProfiles({
      vectors: later.vectors,
      profiles: [...profiles.values()]
    })
    await evaluate({
      name: 'half.profileInit',
      labels: seededLabels,
      note: `프로필 ${profiles.size}명`
    })
    for (const minCosine of NAME_MIN_COSINES) {
      const naming = scoreNaming({
        context,
        input: later,
        labels: seededLabels,
        profiles,
        minCosine,
        range,
        countPath
      })
      info(`  이름 지정(프로필 초기화, 코사인≥${minCosine}): ${formatNaming(naming)}`)
    }

    // 새 참석자 흉내: 화자 한 명씩 프로필에서 빼고 그 사람 글자가 다른 이름으로 붙는 비율
    for (const absent of profiles.keys()) {
      const partial = new Map([...profiles].filter(([speaker]) => speaker !== absent))
      const naming = scoreNaming({
        context,
        input: later,
        labels: baseLabels,
        profiles: partial,
        minCosine: 0.6,
        range,
        countPath
      })
      info(`  ${absent} 없는 프로필(기준 군집, 코사인≥0.6): ${formatNaming(naming)}`)
    }
  }
}

main().catch((error) => fail(error instanceof Error ? error.message : String(error)))

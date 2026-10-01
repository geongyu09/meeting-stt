// E6 마이크·시스템 소리 채널 단서 (docs/diarization-experiments.md 4절). 온라인 회의에서 섞기 전 두 소리의
// 에너지 비율로 조각을 로컬(마이크)·원격(시스템)으로 가르고, 반대 채널끼리는 같은 화자로 묶지 않는다.
// 사용: nice -n 15 pnpm --filter meeting-stt exec tsx scripts/diarExpChannel.ts [--dataset=D4s] [--path=known,unknown]
import { readFile } from 'node:fs/promises'

import {
  CENTROID_MERGE_MIN_COSINE,
  clusterEmbeddings,
  kMeans,
  mergeCloseClusters
} from '@meeting-stt/core/cluster'

import { readWavPcm } from '../src/main/pipeline/normalize'
import { loadReference, selectDatasets, type SpeakerCountPath } from './diarDatasets'
import { appendResult, evaluateSegments, loadEvalContext } from './diarEval'
import { centroidsOf, loadClusterInput, segmentsOf, type ClusterInput } from './diarExpCluster'
import { dot } from './diarExpLinalg'
import { activeSpeakersAt } from './diarScore'
import { fail, info } from './log'

const TAG = 'r2.E6'
const COUNT_PATHS: SpeakerCountPath[] = ['known', 'unknown']
/** 마이크가 시스템보다 이만큼 크면 로컬, 이만큼 작으면 원격으로 본다. 사이는 겹침이라 판단하지 않는다 */
const LOCAL_MIN_RATIO_DB = 10
const REMOTE_MAX_RATIO_DB = -3
const RMS_FLOOR = 1e-4
const INT16_MAX = 32767
/** 한 클러스터 안에서 소수 채널 쪽이 이 비율 미만이면 쪼개지 않고 같은 채널의 다른 클러스터로 보낸다 */
const SPLIT_MIN_SHARE = 0.1
const PERCENT = 100

type Channel = 'local' | 'remote' | 'mixed'

const rmsOver = ({
  pcm,
  sampleRate,
  start,
  end
}: {
  pcm: Int16Array
  sampleRate: number
  start: number
  end: number
}) => {
  const from = Math.max(0, Math.floor(start * sampleRate))
  const to = Math.min(pcm.length, Math.floor(end * sampleRate))
  let sumSquares = 0
  for (let i = from; i < to; i += 1) sumSquares += (pcm[i] / INT16_MAX) ** 2
  return Math.sqrt(sumSquares / Math.max(1, to - from))
}

const nearestLabel = ({
  vector,
  centroids
}: {
  vector: Float32Array
  centroids: [number, Float32Array][]
}) =>
  centroids
    .map(([label, centroid]) => ({ label, cosine: dot(vector, centroid) }))
    .reduce((a, b) => (b.cosine > a.cosine ? b : a)).label

interface ChannelInput extends ClusterInput {
  channels: Channel[]
}

/** 가장 가까운 같은 채널 클러스터 쌍. 서로 다른 채널끼리는 후보가 아니다 */
const closestSameChannelPair = ({
  vectors,
  labels,
  channelOfLabel
}: {
  vectors: Float32Array[]
  labels: number[]
  channelOfLabel: Map<number, Channel>
}) => {
  const centroids = [...centroidsOf({ vectors, labels })]
  let best = { from: -1, into: -1, cosine: -Infinity }
  for (let i = 0; i < centroids.length; i += 1) {
    for (let j = i + 1; j < centroids.length; j += 1) {
      if (channelOfLabel.get(centroids[i][0]) !== channelOfLabel.get(centroids[j][0])) continue
      const cosine = dot(centroids[i][1], centroids[j][1])
      if (cosine > best.cosine) best = { from: centroids[j][0], into: centroids[i][0], cosine }
    }
  }
  return best
}

/** 기준 군집의 각 클러스터를 채널로 쪼갠 뒤, 같은 채널 안에서만 다시 합친다 (cannot-link) */
const splitByChannel = ({
  input,
  countPath
}: {
  input: ChannelInput
  countPath: SpeakerCountPath
}) => {
  const base = clusterEmbeddings({
    embeddings: input.embeddings.map((e) => e.vector),
    clusterCount: input.clusterCount
  })
  const keyOf = (label: number, channel: Channel) => label * 2 + (channel === 'local' ? 0 : 1)
  const sizes = new Map<number, number>()
  base.forEach((label, index) => {
    if (input.channels[index] === 'mixed') return
    const key = keyOf(label, input.channels[index])
    sizes.set(key, (sizes.get(key) ?? 0) + 1)
  })
  const clusterSize = (label: number) =>
    (sizes.get(label * 2) ?? 0) + (sizes.get(label * 2 + 1) ?? 0)
  const isKept = (key: number) =>
    (sizes.get(key) ?? 0) / Math.max(1, clusterSize(key >> 1)) >= SPLIT_MIN_SHARE

  // 큰 쪽만 먼저 라벨을 정하고, 소수 쪽·겹침 조각은 뒤에서 가까운 중심으로 보낸다
  const UNSET = -1
  let labels = base.map((label, index) => {
    const channel = input.channels[index]
    return channel !== 'mixed' && isKept(keyOf(label, channel)) ? keyOf(label, channel) : UNSET
  })
  const channelOfLabel = new Map<number, Channel>(
    [...new Set(labels)]
      .filter((label) => label !== UNSET)
      .map((label) => [label, label % 2 === 0 ? 'local' : 'remote'])
  )
  const setIndexes = labels.flatMap((label, index) => (label === UNSET ? [] : [index]))
  const seeded = [
    ...centroidsOf({
      vectors: setIndexes.map((index) => input.vectors[index]),
      labels: setIndexes.map((index) => labels[index])
    })
  ]
  labels = labels.map((label, index) => {
    if (label !== UNSET) return label
    const channel = input.channels[index]
    const candidates = seeded.filter(
      ([other]) => channel === 'mixed' || channelOfLabel.get(other) === channel
    )
    return nearestLabel({
      vector: input.vectors[index],
      centroids: candidates.length ? candidates : seeded
    })
  })

  for (;;) {
    const count = new Set(labels).size
    const pair = closestSameChannelPair({ vectors: input.vectors, labels, channelOfLabel })
    const shouldMerge =
      pair.from !== -1 &&
      (pair.cosine >= CENTROID_MERGE_MIN_COSINE ||
        (countPath === 'known' && count > input.clusterCount))
    if (!shouldMerge) break
    labels = labels.map((label) => (label === pair.from ? pair.into : label))
  }
  return labels
}

/** 로컬 조각은 한 사람으로 두고 원격 조각만 군집한다 (혼자 자기 자리에서 접속한 경우) */
const localAsOne = ({ input, countPath }: { input: ChannelInput; countPath: SpeakerCountPath }) => {
  const LOCAL_LABEL = 0
  const remoteIndexes = input.channels.flatMap((channel, index) =>
    channel === 'remote' ? [index] : []
  )
  const remoteVectors = remoteIndexes.map((index) => input.vectors[index])
  const remoteCount = countPath === 'known' ? input.clusterCount - 1 : input.clusterCount
  const remoteLabels = mergeCloseClusters({
    vectors: remoteVectors,
    labels: kMeans({ vectors: remoteVectors, k: remoteCount })
  }).map((label) => label + 1)

  const labels = input.channels.map<number>((channel) => (channel === 'local' ? LOCAL_LABEL : -1))
  remoteIndexes.forEach((index, order) => {
    labels[index] = remoteLabels[order]
  })
  const known = labels.flatMap((label, index) => (label === -1 ? [] : [index]))
  const centroids = [
    ...centroidsOf({
      vectors: known.map((index) => input.vectors[index]),
      labels: known.map((index) => labels[index])
    })
  ]
  return labels.map((label, index) =>
    label === -1 ? nearestLabel({ vector: input.vectors[index], centroids }) : label
  )
}

const main = async () => {
  const argv = process.argv.slice(2)
  const valueOf = (name: string) => argv.find((arg) => arg.startsWith(`--${name}=`))?.split('=')[1]
  const paths = (valueOf('path')?.split(',') as SpeakerCountPath[] | undefined) ?? COUNT_PATHS

  for (const dataset of selectDatasets(valueOf('dataset') ?? 'D4s')) {
    if (!dataset.channelPaths) return fail(`${dataset.id}에는 마이크·시스템 소리가 따로 없습니다`)
    const mic = readWavPcm(await readFile(dataset.channelPaths.mic))
    const system = readWavPcm(await readFile(dataset.channelPaths.system))
    const context = await loadEvalContext(dataset)
    const reference = await loadReference(dataset)
    // 모의 회의는 정답 RTTM의 첫 화자가 아니라 SIM_SPECS의 첫 화자가 로컬이다. 마이크 트랙에서 가장 크게 들리는 화자로 찾는다
    for (const countPath of paths) {
      const base = await loadClusterInput({ dataset, countPath })
      if (!base) {
        info(`[${dataset.id}/${countPath}] 고정 입력이 없어 건너뜁니다`)
        continue
      }
      const channels = base.embeddings.map<Channel>(({ chunkIndex }) => {
        const span = base.chunks[chunkIndex]
        const micRms = rmsOver({ ...mic, ...span })
        const systemRms = rmsOver({ ...system, ...span })
        const ratioDb = 20 * Math.log10((micRms + RMS_FLOOR) / (systemRms + RMS_FLOOR))
        if (ratioDb >= LOCAL_MIN_RATIO_DB) return 'local'
        return ratioDb <= REMOTE_MAX_RATIO_DB ? 'remote' : 'mixed'
      })
      const input: ChannelInput = { ...base, channels }

      const counts = { local: 0, remote: 0, mixed: 0 }
      const localRefs = new Map<string, number>()
      channels.forEach((channel, index) => {
        counts[channel] += 1
        if (channel !== 'local' || !reference) return
        const span = base.chunks[base.embeddings[index].chunkIndex]
        const [ref] = activeSpeakersAt({ reference, sec: (span.start + span.end) / 2 })
        if (ref) localRefs.set(ref, (localRefs.get(ref) ?? 0) + 1)
      })
      const topLocal = Math.max(0, ...localRefs.values())
      const channelNote = `조각 로컬 ${counts.local}·원격 ${counts.remote}·겹침 ${counts.mixed} · 로컬 판정 순도 ${((topLocal / Math.max(1, counts.local)) * PERCENT).toFixed(1)}%`

      const variants = [
        { name: 'split', labels: splitByChannel({ input, countPath }) },
        { name: 'localOne', labels: localAsOne({ input, countPath }) }
      ]
      for (const { name, labels } of variants) {
        const result = evaluateSegments({
          context,
          speakerSegments: segmentsOf({ input, labels }),
          countPath
        })
        await appendResult({ tag: `${TAG}.${name}`, dataset, countPath, result, note: channelNote })
      }
    }
  }
}

main().catch((error) => fail(error instanceof Error ? error.message : String(error)))

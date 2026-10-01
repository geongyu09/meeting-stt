// E4 경계 정밀화 (docs/diarization-experiments.md 4절). 화자가 바뀌는 지점 주변을 짧은 창으로 다시 임베딩해
// 양쪽 화자 중심과의 유사도가 뒤집히는 곳으로 경계를 옮기고, Whisper 단어 사이 틈에 맞춘다.
// 사용: nice -n 15 pnpm --filter meeting-stt exec tsx scripts/diarExpBoundary.ts [--dataset=D5,D1] [--path=known,unknown]
import { clusterEmbeddings, l2Normalize, type TimeSpan } from '@meeting-stt/core/cluster'
import type { SpeakerSegment, SttSegment } from '@shared/types'

import { cliPathFor, embedWithCache, selectDatasets, type SpeakerCountPath } from './diarDatasets'
import { appendResult, evaluateSegments, loadEvalContext } from './diarEval'
import { centroidsOf, loadClusterInput, segmentsOf } from './diarExpCluster'
import { dot } from './diarExpLinalg'
import { fail, info } from './log'

const TAG = 'r2.E4'
const COUNT_PATHS: SpeakerCountPath[] = ['known', 'unknown']
/** 이웃한 두 구간의 틈이 이보다 작을 때만 화자 전환점으로 본다 */
const ADJACENT_MAX_GAP_SEC = 0.5
/** 두 구간이 이보다 많이 겹치면 겹쳐 말한 것으로 보고 건드리지 않는다 */
const OVERLAP_TOLERANCE_SEC = 0.05
const SEARCH_RADIUS_SEC = 2
const WINDOW_SEC = 1.5
const WINDOW_HOP_SEC = 0.25
/** 경계를 옮겨도 양쪽 구간이 이만큼은 남아야 한다 */
const MIN_SIDE_SEC = 0.5
const WORD_SNAP_RADIUS_SEC = 0.3

interface ChangePoint {
  /** 시작 순으로 늘어놓은 구간에서 앞 구간의 위치. 뒤 구간은 +1 */
  index: number
  at: number
  centers: number[]
}

const findChangePoints = (sorted: SpeakerSegment[]) =>
  sorted.flatMap<ChangePoint>((before, index) => {
    const after = sorted[index + 1]
    if (!after || after.speaker === before.speaker) return []
    if (after.start - before.end > ADJACENT_MAX_GAP_SEC) return []
    // 겹쳐 말한 구간은 그대로 둔다. 경계를 하나로 합치면 겹침이 사라져 놓친 발화가 는다 (1차 구현에서 확인)
    if (before.end - after.start > OVERLAP_TOLERANCE_SEC) return []

    const at = (before.end + after.start) / 2
    const low = Math.max(before.start + MIN_SIDE_SEC, at - SEARCH_RADIUS_SEC)
    const high = Math.min(after.end - MIN_SIDE_SEC, at + SEARCH_RADIUS_SEC)
    if (high <= low) return []

    const count = Math.floor((high - low) / WINDOW_HOP_SEC) + 1
    return [
      { index, at, centers: Array.from({ length: count }, (_, k) => low + k * WINDOW_HOP_SEC) }
    ]
  })

/** 창 점수(앞 화자 유사도 − 뒤 화자 유사도)가 양수에서 음수로 가장 깔끔하게 갈리는 지점 */
const bestSplit = ({ centers, margins }: { centers: number[]; margins: number[] }) => {
  const total = margins.reduce((sum, value) => sum + value, 0)
  let best = { score: -total, at: centers[0] - WINDOW_HOP_SEC / 2 }
  let prefix = 0
  margins.forEach((margin, k) => {
    prefix += margin
    const score = prefix - (total - prefix)
    if (score > best.score) best = { score, at: centers[k] + WINDOW_HOP_SEC / 2 }
  })
  return best.at
}

/** Whisper 단어 사이 틈의 가운데 시각들 (시작 순) */
const wordGapsOf = (segments: SttSegment[]) => {
  const words = segments.flatMap((segment) => segment.words ?? [segment])
  return words.slice(1).map((word, i) => (words[i].end + word.start) / 2)
}

const snapToWordGap = ({ at, gaps }: { at: number; gaps: number[] }) => {
  const nearest = gaps.reduce(
    (best, gap) => (Math.abs(gap - at) < Math.abs(best - at) ? gap : best),
    Infinity
  )
  return Math.abs(nearest - at) <= WORD_SNAP_RADIUS_SEC ? nearest : at
}

const moveBoundaries = ({
  sorted,
  boundaries
}: {
  sorted: SpeakerSegment[]
  boundaries: Map<number, number>
}) => {
  const moved = sorted.map((segment) => ({ ...segment }))
  for (const [index, at] of boundaries) {
    const clamped = Math.min(
      Math.max(at, moved[index].start + MIN_SIDE_SEC / 2),
      moved[index + 1].end - MIN_SIDE_SEC / 2
    )
    moved[index].end = clamped
    moved[index + 1].start = clamped
  }
  return moved.filter((segment) => segment.end > segment.start)
}

const main = async () => {
  const argv = process.argv.slice(2)
  const valueOf = (name: string) => argv.find((arg) => arg.startsWith(`--${name}=`))?.split('=')[1]
  const paths = (valueOf('path')?.split(',') as SpeakerCountPath[] | undefined) ?? COUNT_PATHS

  for (const dataset of selectDatasets(valueOf('dataset') ?? 'D5')) {
    const context = await loadEvalContext(dataset)
    const gaps = wordGapsOf(context.segments)
    for (const countPath of paths) {
      const input = await loadClusterInput({ dataset, countPath })
      if (!input) {
        info(`[${dataset.id}/${countPath}] 고정 입력이 없어 건너뜁니다`)
        continue
      }
      const labels = clusterEmbeddings({
        embeddings: input.embeddings.map((embedding) => embedding.vector),
        clusterCount: input.clusterCount
      })
      const sorted = segmentsOf({ input, labels }).toSorted((a, b) => a.start - b.start)
      const centroidOfSpeaker = new Map<string, Float32Array>()
      const bySpeaker = segmentsOf({ input, labels })
      const speakerNames = [...new Set(bySpeaker.map((segment) => segment.speaker))]
      const nameIndex = bySpeaker.map((segment) => speakerNames.indexOf(segment.speaker))
      for (const [index, centroid] of centroidsOf({ vectors: input.vectors, labels: nameIndex })) {
        centroidOfSpeaker.set(speakerNames[index], centroid)
      }

      const points = findChangePoints(sorted)
      const windows = points.flatMap<TimeSpan>(({ centers }) =>
        centers.map((center) => ({
          start: Math.max(0, center - WINDOW_SEC / 2),
          end: center + WINDOW_SEC / 2
        }))
      )
      const { embeddings, elapsedSec } = await embedWithCache({
        wavPath: dataset.normPath,
        chunks: windows,
        cachePath: cliPathFor({ dataset, countPath }).replace(/\.txt$/, '.boundary.emb.json')
      })
      const vectorOfWindow = new Map(
        embeddings.map(({ chunkIndex, vector }) => [chunkIndex, l2Normalize(vector)])
      )

      const refined = new Map<number, number>()
      let cursor = 0
      for (const point of points) {
        const before = centroidOfSpeaker.get(sorted[point.index].speaker)
        const after = centroidOfSpeaker.get(sorted[point.index + 1].speaker)
        const margins = point.centers.map((_, k) => {
          const vector = vectorOfWindow.get(cursor + k)
          return vector && before && after ? dot(vector, before) - dot(vector, after) : 0
        })
        cursor += point.centers.length
        refined.set(point.index, bestSplit({ centers: point.centers, margins }))
      }

      const variants = [
        { name: 'emb', boundaries: refined },
        {
          name: 'embWord',
          boundaries: new Map(
            [...refined].map(([index, at]) => [index, snapToWordGap({ at, gaps })])
          )
        },
        {
          name: 'word',
          boundaries: new Map(points.map(({ index, at }) => [index, snapToWordGap({ at, gaps })]))
        }
      ]
      const note = `전환점 ${points.length}개 · 창 ${windows.length}개${elapsedSec ? ` · 임베딩 ${elapsedSec.toFixed(1)}초` : ''}`
      for (const { name, boundaries } of variants) {
        const speakerSegments = moveBoundaries({ sorted, boundaries })
        const result = evaluateSegments({ context, speakerSegments, countPath })
        await appendResult({ tag: `${TAG}.${name}`, dataset, countPath, result, note })
      }
    }
  }
}

main().catch((error) => fail(error instanceof Error ? error.message : String(error)))

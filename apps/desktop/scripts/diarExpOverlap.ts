// E5 겹침 구간 처리 (docs/diarization-experiments.md 4절). CLI 구간이 겹치는 시간 범위를 군집에서 빼고,
// 중심이 정해진 뒤 겹침 부분은 겹치기 직전 화자를 이어받게 한다. 조각이 달라지므로 임베딩을 새로 뽑는다(캐시).
// 사용: nice -n 15 pnpm --filter meeting-stt exec tsx scripts/diarExpOverlap.ts [--dataset=D1,D3s] [--path=known,unknown]
import { existsSync } from 'node:fs'

import { clusterEmbeddings, splitIntoChunks, type TimeSpan } from '@meeting-stt/core/cluster'
import { assignSpeakers } from '@meeting-stt/core/merge'
import type { SpeakerSegment } from '@shared/types'

import {
  cliPathFor,
  clusterCountOf,
  embedWithCache,
  loadCliSegments,
  selectDatasets,
  type SpeakerCountPath
} from './diarDatasets'
import { appendResult, evaluateSegments, loadEvalContext } from './diarEval'
import { segmentsOf, watchedConfusionNote } from './diarExpCluster'
import { fail, info } from './log'

const TAG = 'r2.E5'
const COUNT_PATHS: SpeakerCountPath[] = ['known', 'unknown']
/** 겹침을 잘라 내고 남은 토막이 이보다 짧으면 임베딩이 불안정해 버린다 */
const MIN_CLEAN_SPAN_SEC = 0.3
const PERCENT = 100

/** 구간이 둘 이상 겹치는 시간 범위들 (시작 순, 서로 겹치지 않음) */
export const overlapRangesOf = (segments: TimeSpan[]) => {
  const events = segments
    .flatMap(({ start, end }) => [
      { sec: start, delta: 1 },
      { sec: end, delta: -1 }
    ])
    .sort((a, b) => a.sec - b.sec || a.delta - b.delta)
  const ranges: TimeSpan[] = []
  let active = 0
  let openedAt = 0
  for (const { sec, delta } of events) {
    const next = active + delta
    if (active < 2 && next >= 2) openedAt = sec
    if (active >= 2 && next < 2 && sec > openedAt) ranges.push({ start: openedAt, end: sec })
    active = next
  }
  return ranges
}

const subtractRanges = ({ span, ranges }: { span: TimeSpan; ranges: TimeSpan[] }) => {
  const pieces: TimeSpan[] = []
  let cursor = span.start
  for (const range of ranges) {
    if (range.end <= cursor || range.start >= span.end) continue
    if (range.start > cursor) pieces.push({ start: cursor, end: range.start })
    cursor = Math.max(cursor, range.end)
  }
  if (cursor < span.end) pieces.push({ start: cursor, end: span.end })
  return pieces.filter((piece) => piece.end - piece.start >= MIN_CLEAN_SPAN_SEC)
}

const unionSec = (segments: TimeSpan[]) => {
  let total = 0
  let coveredUntil = -Infinity
  for (const { start, end } of segments.toSorted((a, b) => a.start - b.start)) {
    if (end <= coveredUntil) continue
    total += end - Math.max(start, coveredUntil)
    coveredUntil = end
  }
  return total
}

/** 겹침 범위마다 그 직전에 끝난 조각의 화자를 이어받는다. 앞에 조각이 없으면 가장 가까운 뒤 조각 */
const labelOverlaps = ({
  ranges,
  clean
}: {
  ranges: TimeSpan[]
  clean: SpeakerSegment[]
}): SpeakerSegment[] => {
  const sorted = clean.toSorted((a, b) => a.end - b.end)
  return ranges.flatMap((range) => {
    const before = sorted.findLast((segment) => segment.end <= range.start + MIN_CLEAN_SPAN_SEC)
    const after = clean.find((segment) => segment.start >= range.end - MIN_CLEAN_SPAN_SEC)
    const owner = before ?? after
    return owner ? [{ ...range, speaker: owner.speaker }] : []
  })
}

/** (b) 겹침 범위 안의 단어는 바로 앞 단어의 화자를 따른다 */
const assignWithOverlapCarry =
  (ranges: TimeSpan[]): typeof assignSpeakers =>
  (params) => {
    const pieces = assignSpeakers(params)
    const isInOverlap = (sec: number) =>
      ranges.some((range) => range.start <= sec && sec < range.end)
    return pieces.reduce<typeof pieces>((carried, piece) => {
      const previous = carried.at(-1)
      const mid = (piece.start + piece.end) / 2
      return [
        ...carried,
        previous && isInOverlap(mid) ? { ...piece, speaker: previous.speaker } : piece
      ]
    }, [])
  }

const main = async () => {
  const argv = process.argv.slice(2)
  const valueOf = (name: string) => argv.find((arg) => arg.startsWith(`--${name}=`))?.split('=')[1]
  const paths = (valueOf('path')?.split(',') as SpeakerCountPath[] | undefined) ?? COUNT_PATHS

  for (const dataset of selectDatasets(valueOf('dataset'))) {
    const context = await loadEvalContext(dataset)
    for (const countPath of paths) {
      const cliPath = cliPathFor({ dataset, countPath })
      if (!existsSync(cliPath)) {
        info(`[${dataset.id}/${countPath}] CLI 구간이 없어 건너뜁니다`)
        continue
      }
      const cliSegments = await loadCliSegments(cliPath)
      const ranges = overlapRangesOf(cliSegments)
      const overlapSec = ranges.reduce((sum, range) => sum + range.end - range.start, 0)
      const overlapNote = `겹침 ${overlapSec.toFixed(1)}초 (${((overlapSec / unionSec(cliSegments)) * PERCENT).toFixed(2)}%)`

      const chunks = splitIntoChunks({
        segments: cliSegments.flatMap((span) => subtractRanges({ span, ranges }))
      })
      const { embeddings } = await embedWithCache({
        wavPath: dataset.normPath,
        chunks,
        cachePath: cliPath.replace(/\.txt$/, '.noovl.emb.c5.json')
      })
      const labels = clusterEmbeddings({
        embeddings: embeddings.map((embedding) => embedding.vector),
        clusterCount: clusterCountOf({ dataset, countPath })
      })
      const clean = segmentsOf({ input: { chunks, embeddings }, labels })
      const speakerSegments = [...clean, ...labelOverlaps({ ranges, clean })].toSorted(
        (a, b) => a.start - b.start
      )

      const variants = [
        { name: 'cut', assign: assignSpeakers },
        { name: 'cutCarry', assign: assignWithOverlapCarry(ranges) }
      ]
      for (const { name, assign } of variants) {
        const result = evaluateSegments({ context, speakerSegments, countPath, assign })
        await appendResult({
          tag: `${TAG}.${name}`,
          dataset,
          countPath,
          result,
          note: [overlapNote, dataset.id === 'D1' ? watchedConfusionNote(result) : '']
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

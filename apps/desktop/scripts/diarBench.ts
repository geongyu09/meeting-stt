// 화자 분리 결과를 클로바 노트 화자 정답본과 비교한다.
// STT 결과(whisper JSON)는 고정하고 화자 구간(sherpa-onnx stdout 형식)만 바꿔 가며 병합 뒤 화자 정확도를 잰다.
// 사용: pnpm --filter meeting-stt exec tsx scripts/diarBench.ts --diar=<구간.txt> [--stt=<whisper.json>]
//       [--ref=<정답.txt>] [--tag=이름] [--absorb] [--range=시작초-끝초] [--offset=초] [--dump=<파일>]
// 정답본 형식: `화자 MM:SS`(1시간부터 `화자 H:MM:SS`) 헤더 줄 뒤에 그 화자의 문장이 이어지고, 빈 줄로 턴이 나뉜다.
import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

import { assignSpeakers, mergeUtterances } from '@meeting-stt/core/merge'
import type { MergedUtterance, SpeakerPiece, SpeakerSegment, SttSegment } from '@shared/types'

import { parseDiarizeOutput } from '../src/main/pipeline/diarize'
import { parseWhisperOutput } from '../src/main/pipeline/whisper'
import { normalizeForCer } from './cer'
import { fail, info } from './log'
import { FIXTURES_DIR, OUTPUT_DIR } from './paths'

const REFERENCE_DIR = path.join(FIXTURES_DIR, 'reference')
const RESULTS_PATH = path.join(OUTPUT_DIR, 'diarBench.tsv')
const DEFAULT_STT = path.join(OUTPUT_DIR, 'jun-meeting.baseline.json')
const DEFAULT_REF = path.join(REFERENCE_DIR, 'jun-meeting.clova-speakers.txt')
/** 클로바 노트는 1시간 전에는 `MM:SS`, 1시간부터는 `H:MM:SS`로 적는다 */
const TURN_HEADER_PATTERN = /^(.+?) (?:(\d{1,2}):)?(\d{1,2}):(\d{2})$/
const SEC_PER_MIN = 60
const SEC_PER_HOUR = 3600
const PERCENT = 100
/** 정답 턴 경계는 초 단위로 내림돼 있어 경계 근처 단어는 어느 쪽이든 맞을 수 있다 */
const BOUNDARY_TOLERANCE_SEC = 2

interface BenchOptions {
  diarPath: string
  sttPath: string
  referencePath: string
  tag: string
  isMinorSpeakerAbsorbed: boolean
  range?: { start: number; end: number }
  offsetSec: number
  dumpPath?: string
}

interface ReferenceTurn {
  speaker: string
  start: number
  end: number
  text: string
}

const parseOptions = (argv: string[]): BenchOptions => {
  const valueOf = (name: string) => {
    const prefix = `--${name}=`
    return argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length)
  }
  const diarPath = valueOf('diar')
  if (!diarPath) return fail('--diar=<화자 구간 파일> 을 주세요')

  const range = valueOf('range')
  const [rangeStart, rangeEnd] = range ? range.split('-').map(Number) : []

  return {
    diarPath,
    sttPath: valueOf('stt') ?? DEFAULT_STT,
    referencePath: valueOf('ref') ?? DEFAULT_REF,
    tag: valueOf('tag') ?? path.basename(diarPath, '.txt'),
    isMinorSpeakerAbsorbed: argv.includes('--absorb'),
    range: range ? { start: rangeStart, end: rangeEnd } : undefined,
    offsetSec: Number(valueOf('offset') ?? 0),
    dumpPath: valueOf('dump')
  }
}

/** 헤더 줄의 시각을 턴 시작으로, 다음 턴 시작을 턴 끝으로 본다 (정답본에 끝 시각이 없다) */
export const parseReferenceTurns = (text: string): ReferenceTurn[] => {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/)
  const turns: ReferenceTurn[] = []

  for (const line of lines) {
    const matched = line.match(TURN_HEADER_PATTERN)
    if (matched) {
      turns.push({
        speaker: matched[1],
        start:
          Number(matched[2] ?? 0) * SEC_PER_HOUR +
          Number(matched[3]) * SEC_PER_MIN +
          Number(matched[4]),
        end: Infinity,
        text: ''
      })
      continue
    }
    const current = turns.at(-1)
    if (current && line.trim()) current.text = `${current.text} ${line.trim()}`.trim()
  }

  return turns.map((turn, index) => ({ ...turn, end: turns[index + 1]?.start ?? Infinity }))
}

const referenceSpeakerAt = ({ turns, sec }: { turns: ReferenceTurn[]; sec: number }) => {
  let low = 0
  let high = turns.length - 1
  while (low < high) {
    const mid = (low + high + 1) >> 1
    if (turns[mid].start <= sec) low = mid
    else high = mid - 1
  }
  return turns[low]
}

/** 병합 뒤 발화의 화자를 단어 조각에 되돌려 붙인다. 사용자가 보는 결과 그대로 채점하기 위해서다 */
const labelPiecesByUtterance = ({
  pieces,
  utterances
}: {
  pieces: SpeakerPiece[]
  utterances: MergedUtterance[]
}) => {
  let cursor = 0
  return pieces.map((piece) => {
    const mid = (piece.start + piece.end) / 2
    while (cursor < utterances.length - 1 && utterances[cursor].endSec < mid) cursor += 1
    return { ...piece, speaker: utterances[cursor].speakerLabel }
  })
}

interface Confusion {
  /** hyp 라벨 → ref 라벨 → 글자 수 */
  matrix: Map<string, Map<string, number>>
  total: number
}

const addWeight = ({
  matrix,
  hyp,
  ref,
  weight
}: {
  matrix: Confusion['matrix']
  hyp: string
  ref: string
  weight: number
}) => {
  const row = matrix.get(hyp) ?? new Map<string, number>()
  row.set(ref, (row.get(ref) ?? 0) + weight)
  matrix.set(hyp, row)
}

/** hyp 라벨과 ref 라벨을 일대일로 짝지을 때 맞는 글자 수를 최대로 하는 배정 (헝가리안, 최대화) */
const bestOneToOne = (confusion: Confusion) => {
  const hypLabels = [...confusion.matrix.keys()]
  const refLabels = [...new Set([...confusion.matrix.values()].flatMap((row) => [...row.keys()]))]
  const size = Math.max(hypLabels.length, refLabels.length)
  const gain = (i: number, j: number) =>
    i < hypLabels.length && j < refLabels.length
      ? (confusion.matrix.get(hypLabels[i])?.get(refLabels[j]) ?? 0)
      : 0
  const maxGain = Math.max(1, ...hypLabels.flatMap((_, i) => refLabels.map((_, j) => gain(i, j))))
  const cost = (i: number, j: number) => maxGain - gain(i, j)

  // 정사각 행렬 헝가리안 (최소화). 1-based potentials
  const u = new Array<number>(size + 1).fill(0)
  const v = new Array<number>(size + 1).fill(0)
  const p = new Array<number>(size + 1).fill(0)
  const way = new Array<number>(size + 1).fill(0)
  for (let i = 1; i <= size; i += 1) {
    p[0] = i
    let j0 = 0
    const minv = new Array<number>(size + 1).fill(Infinity)
    const used = new Array<boolean>(size + 1).fill(false)
    do {
      used[j0] = true
      const i0 = p[j0]
      let delta = Infinity
      let j1 = 0
      for (let j = 1; j <= size; j += 1) {
        if (used[j]) continue
        const current = cost(i0 - 1, j - 1) - u[i0] - v[j]
        if (current < minv[j]) {
          minv[j] = current
          way[j] = j0
        }
        if (minv[j] < delta) {
          delta = minv[j]
          j1 = j
        }
      }
      for (let j = 0; j <= size; j += 1) {
        if (used[j]) {
          u[p[j]] += delta
          v[j] -= delta
        } else minv[j] -= delta
      }
      j0 = j1
    } while (p[j0] !== 0)
    do {
      const j1 = way[j0]
      p[j0] = p[j1]
      j0 = j1
    } while (j0)
  }

  const mapping = new Map<string, string>()
  for (let j = 1; j <= size; j += 1) {
    const i = p[j] - 1
    if (i < hypLabels.length && j - 1 < refLabels.length && gain(i, j - 1) > 0) {
      mapping.set(hypLabels[i], refLabels[j - 1])
    }
  }
  return mapping
}

const sumMapped = ({
  confusion,
  mapping
}: {
  confusion: Confusion
  mapping: Map<string, string>
}) =>
  [...confusion.matrix].reduce(
    (sum, [hyp, row]) => sum + (mapping.has(hyp) ? (row.get(mapping.get(hyp) ?? '') ?? 0) : 0),
    0
  )

/** 각 hyp 라벨을 가장 많이 겹치는 ref 라벨로 보내는 다대일 배정의 정답 비율 (순도) */
const purityOf = (confusion: Confusion) =>
  [...confusion.matrix.values()].reduce((sum, row) => sum + Math.max(...row.values()), 0)

interface ScoreParams {
  pieces: SpeakerPiece[]
  turns: ReferenceTurn[]
  options: BenchOptions
}

const scorePieces = ({ pieces, turns, options }: ScoreParams) => {
  const all: Confusion = { matrix: new Map(), total: 0 }
  const core: Confusion = { matrix: new Map(), total: 0 }

  for (const piece of pieces) {
    const mid = (piece.start + piece.end) / 2 + options.offsetSec
    if (options.range && (mid < options.range.start || mid >= options.range.end)) continue
    const weight = normalizeForCer(piece.text).length
    if (!weight) continue

    const turn = referenceSpeakerAt({ turns, sec: mid })
    addWeight({ matrix: all.matrix, hyp: piece.speaker, ref: turn.speaker, weight })
    all.total += weight

    const isNearBoundary =
      mid - turn.start < BOUNDARY_TOLERANCE_SEC || turn.end - mid < BOUNDARY_TOLERANCE_SEC
    if (isNearBoundary) continue
    addWeight({ matrix: core.matrix, hyp: piece.speaker, ref: turn.speaker, weight })
    core.total += weight
  }

  const mapping = bestOneToOne(all)
  return {
    mapping,
    accuracy: sumMapped({ confusion: all, mapping }) / all.total,
    coreAccuracy: sumMapped({ confusion: core, mapping }) / core.total,
    purity: purityOf(all) / all.total,
    confusion: all
  }
}

/**
 * 병합을 거치지 않은 화자 구간 자체를 시간 단위로 채점한다 (발화 시간 가중, 정답 턴 경계로 잘라 누적).
 * STT·병합의 영향을 뺀 화자 분리 단독 품질을 보기 위한 보조 지표다.
 */
const scoreSegmentsByTime = ({
  speakerSegments,
  turns
}: {
  speakerSegments: SpeakerSegment[]
  turns: ReferenceTurn[]
}) => {
  const confusion: Confusion = { matrix: new Map(), total: 0 }
  for (const segment of speakerSegments) {
    let cursor = segment.start
    while (cursor < segment.end) {
      const turn = referenceSpeakerAt({ turns, sec: cursor })
      const sliceEnd = Math.min(segment.end, turn.end)
      const weight = sliceEnd - cursor
      addWeight({ matrix: confusion.matrix, hyp: segment.speaker, ref: turn.speaker, weight })
      confusion.total += weight
      cursor = sliceEnd
    }
  }
  const mapping = bestOneToOne(confusion)
  return sumMapped({ confusion, mapping }) / confusion.total
}

const countSpeakerChanges = (utterances: MergedUtterance[]) =>
  utterances.filter((u, i) => i > 0 && u.speakerLabel !== utterances[i - 1].speakerLabel).length

const formatConfusion = ({
  confusion,
  mapping
}: {
  confusion: Confusion
  mapping: Map<string, string>
}) => {
  const refLabels = [
    ...new Set([...confusion.matrix.values()].flatMap((row) => [...row.keys()]))
  ].sort()
  const rows = [...confusion.matrix]
    .map(([hyp, row]) => ({ hyp, row, total: [...row.values()].reduce((a, b) => a + b, 0) }))
    .sort((a, b) => b.total - a.total)
  const header = ['hyp → ref', ...refLabels, '합계'].join('\t')
  const lines = rows.map(({ hyp, row, total }) =>
    [
      `${hyp}${mapping.has(hyp) ? `(=${mapping.get(hyp)})` : ''}`,
      ...refLabels.map((ref) => String(row.get(ref) ?? 0)),
      String(total)
    ].join('\t')
  )
  return [header, ...lines].join('\n')
}

const main = async () => {
  const options = parseOptions(process.argv.slice(2))
  const segments: SttSegment[] = parseWhisperOutput(await readFile(options.sttPath))
  const speakerSegments: SpeakerSegment[] = parseDiarizeOutput(
    await readFile(options.diarPath, 'utf-8')
  )
  if (!speakerSegments.length) return fail(`${options.diarPath} 에 화자 구간이 없습니다`)
  const turns = parseReferenceTurns(await readFile(options.referencePath, 'utf-8'))

  const pieces = assignSpeakers({
    segments,
    speakerSegments,
    isMinorSpeakerAbsorbed: options.isMinorSpeakerAbsorbed
  })
  const utterances = mergeUtterances(pieces)
  const labeled = labelPiecesByUtterance({ pieces, utterances })
  const score = scorePieces({ pieces: labeled, turns, options })

  const hypSpeakers = new Set(speakerSegments.map((s) => s.speaker)).size
  const refSpeakers = new Set(turns.map((t) => t.speaker)).size
  const refChanges = turns.length - 1
  const hypChanges = countSpeakerChanges(utterances)
  const acc = (score.accuracy * PERCENT).toFixed(2)
  const coreAcc = (score.coreAccuracy * PERCENT).toFixed(2)
  const purity = (score.purity * PERCENT).toFixed(2)
  const finalSpeakers = new Set(utterances.map((u) => u.speakerLabel)).size
  const timeAcc = (scoreSegmentsByTime({ speakerSegments, turns }) * PERCENT).toFixed(2)

  info(
    `[${options.tag}] 화자 정확도 ${acc}% (경계 ±${BOUNDARY_TOLERANCE_SEC}초 제외 ${coreAcc}%) · 순도 ${purity}%`
  )
  info(
    `  구간 시간 정확도 ${timeAcc}% · hyp 화자 ${hypSpeakers}명(결과 ${finalSpeakers}명) / ref ${refSpeakers}명 · 발화 ${utterances.length}개 · 화자 전환 ${hypChanges}회 / ref ${refChanges}회 · 채점 글자 ${score.confusion.total}`
  )
  info(formatConfusion({ confusion: score.confusion, mapping: score.mapping }))

  await mkdir(OUTPUT_DIR, { recursive: true })
  const header =
    'date\ttag\tdiar\tabsorb\trange\taccuracy%\tcoreAccuracy%\tpurity%\ttimeAccuracy%\thypSpeakers\tfinalSpeakers\tutterances\tspeakerChanges\n'
  const row = [
    new Date().toISOString(),
    options.tag,
    path.basename(options.diarPath),
    options.isMinorSpeakerAbsorbed,
    options.range ? `${options.range.start}-${options.range.end}` : 'all',
    acc,
    coreAcc,
    purity,
    timeAcc,
    hypSpeakers,
    finalSpeakers,
    utterances.length,
    hypChanges
  ].join('\t')
  try {
    await readFile(RESULTS_PATH)
  } catch {
    await writeFile(RESULTS_PATH, header, 'utf-8')
  }
  await appendFile(RESULTS_PATH, `${row}\n`, 'utf-8')

  if (options.dumpPath) {
    const mapped = utterances.map((u) => ({ ...u, mappedTo: score.mapping.get(u.speakerLabel) }))
    await writeFile(options.dumpPath, `${JSON.stringify(mapped, null, 2)}\n`, 'utf-8')
  }
}

main().catch((error) => fail(error instanceof Error ? error.message : String(error)))

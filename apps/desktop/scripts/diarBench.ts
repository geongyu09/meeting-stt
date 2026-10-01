// 화자 분리 결과를 클로바 노트 화자 정답본과 비교한다.
// STT 결과(whisper JSON)는 고정하고 화자 구간(sherpa-onnx stdout 형식)만 바꿔 가며 병합 뒤 화자 정확도를 잰다.
// 사용: pnpm --filter meeting-stt exec tsx scripts/diarBench.ts --diar=<구간.txt> [--stt=<whisper.json>]
//       [--ref=<정답.txt>] [--tag=이름] [--absorb] [--range=시작초-끝초] [--offset=초] [--dump=<파일>]
// 정답본 형식: `화자 MM:SS`(1시간부터 `화자 H:MM:SS`) 헤더 줄 뒤에 그 화자의 문장이 이어지고, 빈 줄로 턴이 나뉜다.
import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

import { assignSpeakers, mergeUtterances } from '@meeting-stt/core/merge'
import type { MergedUtterance, SpeakerSegment, SttSegment } from '@shared/types'

import { parseDiarizeOutput } from '../src/main/pipeline/diarize'
import { parseWhisperOutput } from '../src/main/pipeline/whisper'
import {
  formatConfusion,
  labelPiecesByUtterance,
  parseReferenceTurns,
  scorablePieces,
  scoreCharacters,
  scoreSegmentsByTime,
  type Reference
} from './diarScore'
import { fail, info } from './log'
import { FIXTURES_DIR, OUTPUT_DIR } from './paths'

const REFERENCE_DIR = path.join(FIXTURES_DIR, 'reference')
const RESULTS_PATH = path.join(OUTPUT_DIR, 'diarBench.tsv')
const DEFAULT_STT = path.join(OUTPUT_DIR, 'jun-meeting.baseline.json')
const DEFAULT_REF = path.join(REFERENCE_DIR, 'jun-meeting.clova-speakers.txt')
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

const countSpeakerChanges = (utterances: MergedUtterance[]) =>
  utterances.filter((u, i) => i > 0 && u.speakerLabel !== utterances[i - 1].speakerLabel).length

const main = async () => {
  const options = parseOptions(process.argv.slice(2))
  const segments: SttSegment[] = parseWhisperOutput(await readFile(options.sttPath))
  const speakerSegments: SpeakerSegment[] = parseDiarizeOutput(
    await readFile(options.diarPath, 'utf-8')
  )
  if (!speakerSegments.length) return fail(`${options.diarPath} 에 화자 구간이 없습니다`)
  const reference: Reference = {
    format: 'clova',
    turns: parseReferenceTurns(await readFile(options.referencePath, 'utf-8'))
  }
  const turns = reference.turns

  const pieces = assignSpeakers({
    segments,
    speakerSegments,
    isMinorSpeakerAbsorbed: options.isMinorSpeakerAbsorbed
  })
  const utterances = mergeUtterances(pieces)
  const labeled = labelPiecesByUtterance({ pieces, utterances })
  const score = scoreCharacters(
    scorablePieces({
      pieces: labeled,
      reference,
      boundaryToleranceSec: BOUNDARY_TOLERANCE_SEC,
      offsetSec: options.offsetSec,
      range: options.range
    })
  )

  const hypSpeakers = new Set(speakerSegments.map((s) => s.speaker)).size
  const refSpeakers = new Set(turns.map((t) => t.speaker)).size
  const refChanges = turns.length - 1
  const hypChanges = countSpeakerChanges(utterances)
  const acc = (score.accuracy * PERCENT).toFixed(2)
  const coreAcc = (score.coreAccuracy * PERCENT).toFixed(2)
  const purity = (score.purity * PERCENT).toFixed(2)
  const finalSpeakers = new Set(utterances.map((u) => u.speakerLabel)).size
  const timeAcc = (scoreSegmentsByTime({ speakerSegments, reference }) * PERCENT).toFixed(2)

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

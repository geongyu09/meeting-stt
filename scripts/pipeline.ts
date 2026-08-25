import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { formatTranscript } from '@shared/format'
import { assignSpeakers, mergeUtterances } from '@shared/merge'
import type { SpeakerSegment, SttSegment } from '@shared/types'

import {
  buildDiarizeArgs,
  parseDiarizeOutput,
  parseDiarizeProgress
} from '../src/main/pipeline/diarize'
import {
  buildWhisperArgs,
  parseWhisperOutput,
  parseWhisperProgress
} from '../src/main/pipeline/whisper'
import { fail, info, warn } from './log'
import {
  AUDIO_DIR,
  DIARIZE_BIN,
  EMBEDDING_MODEL,
  OUTPUT_DIR,
  SEGMENTATION_MODEL,
  VAD_MODEL,
  WHISPER_BIN,
  WHISPER_MODEL
} from './paths'
import { run } from './shell'

/** 코어가 적으면 STT와 화자 분리를 동시에 돌리는 게 오히려 느리다 (references/pitfalls.md) */
const PARALLEL_MIN_CORES = 8
const RESERVED_CORES = 2
const PROGRESS_STEP_PERCENT = 20
/** --dtw 값을 생략했을 때 쓰는 정렬 헤드 프리셋 (기본 모델 기준) */
const DEFAULT_DTW_PRESET = 'large.v3.turbo'

interface CliOptions {
  audioPath: string
  modelPath: string
  useVad: boolean
  dtwPreset?: string
  speakerCount?: number
  clusterThreshold?: number
}

const parseCliOptions = (argv: string[]): CliOptions => {
  const positional = argv.filter((arg) => !arg.startsWith('--'))
  const valueOf = (name: string) => argv.find((arg) => arg.startsWith(`--${name}=`))?.split('=')[1]

  const speakers = valueOf('speakers')
  const threshold = valueOf('threshold')

  const wantsDtw = argv.some((arg) => arg === '--dtw' || arg.startsWith('--dtw='))

  return {
    audioPath: positional[0] ?? path.join(AUDIO_DIR, 'synthetic-meeting.wav'),
    modelPath: valueOf('model') ?? WHISPER_MODEL,
    useVad: !argv.includes('--no-vad'),
    dtwPreset: wantsDtw ? (valueOf('dtw') ?? DEFAULT_DTW_PRESET) : undefined,
    speakerCount: speakers ? Number(speakers) : undefined,
    clusterThreshold: threshold ? Number(threshold) : undefined
  }
}

/** 진행률 로그가 쏟아지므로 20%마다 한 번만 남긴다 */
const makeProgressReporter = (label: string) => {
  let lastReported = -PROGRESS_STEP_PERCENT

  return (percent: number | null) => {
    if (percent === null || percent < lastReported + PROGRESS_STEP_PERCENT) return
    lastReported = Math.floor(percent / PROGRESS_STEP_PERCENT) * PROGRESS_STEP_PERCENT
    info(`  ${label} ${Math.round(percent)}%`)
  }
}

const threadCount = () => Math.max(1, os.cpus().length - RESERVED_CORES)

interface RunSttParams {
  options: CliOptions
  outputPath: string
}

const runStt = async ({ options, outputPath }: RunSttParams) => {
  const report = makeProgressReporter('STT')
  const args = buildWhisperArgs({
    modelPath: options.modelPath,
    audioPath: options.audioPath,
    outputPath,
    threads: threadCount(),
    vadModelPath: options.useVad ? VAD_MODEL : undefined,
    dtwPreset: options.dtwPreset
  })

  const startedAt = performance.now()
  const result = await run({
    command: WHISPER_BIN,
    args,
    onStderrLine: (line) => report(parseWhisperProgress(line))
  })
  if (result.code !== 0) {
    throw new Error(`whisper-cli 비정상 종료 (${result.code})\n${result.stderr.slice(-800)}`)
  }

  const segments = parseWhisperOutput(await readFile(`${outputPath}.json`))
  return { segments, elapsedMs: performance.now() - startedAt }
}

const runDiarization = async ({ options }: { options: CliOptions }) => {
  const report = makeProgressReporter('화자 분리')
  const args = buildDiarizeArgs({
    segmentationModelPath: SEGMENTATION_MODEL,
    embeddingModelPath: EMBEDDING_MODEL,
    audioPath: options.audioPath,
    threads: threadCount(),
    speakerCount: options.speakerCount,
    clusterThreshold: options.clusterThreshold
  })

  const startedAt = performance.now()
  const result = await run({
    command: DIARIZE_BIN,
    args,
    onStderrLine: (line) => report(parseDiarizeProgress(line))
  })
  if (result.code !== 0) {
    throw new Error(`화자 분리 비정상 종료 (${result.code})\n${result.stderr.slice(-800)}`)
  }

  return {
    speakerSegments: parseDiarizeOutput(result.stdout),
    elapsedMs: performance.now() - startedAt
  }
}

const ensureInputs = (options: CliOptions) => {
  const required = [
    [WHISPER_BIN, '`pnpm tsx scripts/setupBin.ts`'],
    [DIARIZE_BIN, '`pnpm tsx scripts/setupBin.ts`'],
    [options.modelPath, '`pnpm tsx scripts/setupModels.ts`'],
    [SEGMENTATION_MODEL, '`pnpm tsx scripts/setupModels.ts`'],
    [EMBEDDING_MODEL, '`pnpm tsx scripts/setupModels.ts`']
  ] as const

  for (const [target, hint] of required) {
    if (!existsSync(target)) fail(`${target} 이(가) 없습니다. ${hint} 를 먼저 실행해 주세요`)
  }
  if (options.useVad && !existsSync(VAD_MODEL)) {
    fail(`${VAD_MODEL} 이(가) 없습니다. --no-vad로 끄거나 setupModels.ts를 실행해 주세요`)
  }
  if (!existsSync(options.audioPath)) {
    fail(
      `${options.audioPath} 이(가) 없습니다. \`pnpm tsx scripts/makeFixture.ts\` 로 만들 수 있습니다`
    )
  }
}

interface ReportParams {
  segments: SttSegment[]
  speakerSegments: SpeakerSegment[]
  sttMs: number
  diarizeMs: number
  totalMs: number
  outputPath: string
}

const writeReport = async ({
  segments,
  speakerSegments,
  sttMs,
  diarizeMs,
  totalMs,
  outputPath
}: ReportParams) => {
  const utterances = mergeUtterances(assignSpeakers({ segments, speakerSegments }))
  const transcript = formatTranscript({ utterances })

  await writeFile(`${outputPath}.transcript.txt`, `${transcript}\n`, 'utf-8')
  await writeFile(
    `${outputPath}.result.json`,
    `${JSON.stringify({ segments, speakerSegments, utterances }, null, 2)}\n`,
    'utf-8'
  )

  const speakers = new Set(speakerSegments.map((segment) => segment.speaker))
  info('')
  info(transcript)
  info('')
  info(
    `세그먼트 ${segments.length}개 · 화자 구간 ${speakerSegments.length}개 · 발화 ${utterances.length}개`
  )
  info(`감지된 화자 ${speakers.size}명: ${[...speakers].join(', ')}`)
  info(
    `STT ${(sttMs / 1000).toFixed(1)}초 · 화자 분리 ${(diarizeMs / 1000).toFixed(1)}초 · 전체 ${(totalMs / 1000).toFixed(1)}초`
  )
  info(`결과: ${outputPath}.transcript.txt, ${outputPath}.result.json`)
}

const main = async () => {
  const options = parseCliOptions(process.argv.slice(2))
  ensureInputs(options)
  await mkdir(OUTPUT_DIR, { recursive: true })

  const variant = [options.useVad ? 'vad' : 'novad', options.dtwPreset ? 'dtw' : 'nodtw'].join('-')
  const outputPath = path.join(OUTPUT_DIR, `${path.basename(options.audioPath, '.wav')}.${variant}`)
  const isParallel = os.cpus().length >= PARALLEL_MIN_CORES

  info(`입력: ${options.audioPath}`)
  info(
    `모델: ${path.basename(options.modelPath)} · VAD ${options.useVad ? '사용' : '미사용'} · DTW ${options.dtwPreset ?? '미사용'} · ${isParallel ? '병렬' : '순차'} 실행 (코어 ${os.cpus().length})`
  )
  if (!options.useVad) warn('VAD를 끄면 무음 구간에서 환각 문장이 생길 수 있습니다')

  const startedAt = performance.now()
  const [stt, diarization] = isParallel
    ? await Promise.all([runStt({ options, outputPath }), runDiarization({ options })])
    : [await runStt({ options, outputPath }), await runDiarization({ options })]

  await writeReport({
    segments: stt.segments,
    speakerSegments: diarization.speakerSegments,
    sttMs: stt.elapsedMs,
    diarizeMs: diarization.elapsedMs,
    totalMs: performance.now() - startedAt,
    outputPath
  })
}

main().catch((error: unknown) => {
  fail(error instanceof Error ? error.message : String(error))
})

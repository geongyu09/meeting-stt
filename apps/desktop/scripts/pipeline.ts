import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import {
  OVERSPLIT_CLUSTER_COUNT,
  reclusterChunks,
  splitIntoChunks
} from '@meeting-stt/core/cluster'
import { formatTranscript } from '@meeting-stt/core/format'
import { assignSpeakers, mergeUtterances } from '@meeting-stt/core/merge'
import type { SpeakerSegment, SttSegment } from '@shared/types'

import {
  buildDiarizeArgs,
  parseDiarizeOutput,
  parseDiarizeProgress
} from '../src/main/pipeline/diarize'
import { normalizeWavFile } from '../src/main/pipeline/normalize'
import { embedChunks } from '../src/main/pipeline/speakerEmbedding'
import { threadPlan } from '../src/main/bin/threads'
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
const PROGRESS_STEP_PERCENT = 20
/** --dtw 값을 생략했을 때 쓰는 정렬 헤드 프리셋 (기본 모델 기준) */
const DEFAULT_DTW_PRESET = 'large.v3.turbo'

interface CliOptions {
  audioPath: string
  modelPath: string
  useVad: boolean
  useNormalize: boolean
  dtwPreset?: string
  speakerCount?: number
  clusterThreshold?: number
  /** 앱과 같이 CLI 라벨을 버리고 재임베딩 + k-means로 다시 군집한다. `--no-recluster`로 CLI 군집 그대로 본다 */
  useRecluster: boolean
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
    useNormalize: !argv.includes('--no-normalize'),
    dtwPreset: wantsDtw ? (valueOf('dtw') ?? DEFAULT_DTW_PRESET) : undefined,
    speakerCount: speakers ? Number(speakers) : undefined,
    clusterThreshold: threshold ? Number(threshold) : undefined,
    useRecluster: !argv.includes('--no-recluster')
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

interface RunSttParams {
  options: CliOptions
  outputPath: string
}

const runStt = async ({ options, outputPath }: RunSttParams) => {
  const report = makeProgressReporter('STT')
  const { stt } = await threadPlan()
  const args = buildWhisperArgs({
    modelPath: options.modelPath,
    audioPath: options.audioPath,
    outputPath,
    threads: stt,
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
  const { diarize } = await threadPlan()
  const args = buildDiarizeArgs({
    segmentationModelPath: SEGMENTATION_MODEL,
    embeddingModelPath: EMBEDDING_MODEL,
    audioPath: options.audioPath,
    threads: diarize,
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

  const cliSegments = parseDiarizeOutput(result.stdout)
  const speakerSegments = options.useRecluster
    ? reclusterLikeApp({ cliSegments, options, threads: diarize })
    : cliSegments

  return { speakerSegments, elapsedMs: performance.now() - startedAt }
}

interface ReclusterLikeAppParams {
  cliSegments: SpeakerSegment[]
  options: CliOptions
  threads: number
}

/** 앱의 `pipeline/recluster.ts`와 같은 흐름. 스크립트는 utilityProcess 없이 동기로 임베딩한다 */
const reclusterLikeApp = ({ cliSegments, options, threads }: ReclusterLikeAppParams) => {
  const chunks = splitIntoChunks({ segments: cliSegments })
  if (options.speakerCount === 1 || chunks.length < 2) return cliSegments

  const startedAt = performance.now()
  const { embeddings } = embedChunks({
    modelPath: EMBEDDING_MODEL,
    audioPath: options.audioPath,
    chunks,
    threads
  })
  const clusterCount = options.speakerCount ?? OVERSPLIT_CLUSTER_COUNT
  const speakerSegments = reclusterChunks({ chunks, embeddings, clusterCount })
  info(
    `  재군집: 조각 ${chunks.length}개 → K=${clusterCount} → 화자 ${new Set(speakerSegments.map((s) => s.speaker)).size}명 (${((performance.now() - startedAt) / 1000).toFixed(1)}초)`
  )

  return speakerSegments
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

/** 원거리 마이크 녹음은 음량이 작아 whisper가 구간을 통째로 놓친다 → STT 전에 RMS 게인 정규화 */
const normalizeInput = async ({
  options,
  outputPath
}: {
  options: CliOptions
  outputPath: string
}) => {
  const normalizedPath = `${outputPath}.norm.wav`
  const result = await normalizeWavFile({
    inputPath: options.audioPath,
    outputPath: normalizedPath
  })
  info(
    `정규화: 발화 RMS ${result.speechRmsDb.toFixed(1)} dBFS → 게인 ${result.gainDb.toFixed(1)} dB · 클리핑 ${(result.clippedRatio * 100).toFixed(3)}%`
  )
  return { ...options, audioPath: normalizedPath }
}

const main = async () => {
  const cliOptions = parseCliOptions(process.argv.slice(2))
  ensureInputs(cliOptions)
  await mkdir(OUTPUT_DIR, { recursive: true })

  const variant = [
    cliOptions.useNormalize ? 'norm' : 'nonorm',
    cliOptions.useVad ? 'vad' : 'novad',
    cliOptions.dtwPreset ? 'dtw' : 'nodtw'
  ].join('-')
  const outputPath = path.join(
    OUTPUT_DIR,
    `${path.basename(cliOptions.audioPath, '.wav')}.${variant}`
  )
  const isParallel = os.cpus().length >= PARALLEL_MIN_CORES

  info(`입력: ${cliOptions.audioPath}`)
  info(
    `모델: ${path.basename(cliOptions.modelPath)} · 정규화 ${cliOptions.useNormalize ? '사용' : '미사용'} · VAD ${cliOptions.useVad ? '사용' : '미사용'} · DTW ${cliOptions.dtwPreset ?? '미사용'} · ${isParallel ? '병렬' : '순차'} 실행 (코어 ${os.cpus().length})`
  )
  if (!cliOptions.useVad) warn('VAD를 끄면 무음 구간에서 환각 문장이 생길 수 있습니다')
  if (!cliOptions.useNormalize)
    warn('정규화를 끄면 작은 음량의 녹음에서 문장이 통째로 빠질 수 있습니다')

  const startedAt = performance.now()
  const options = cliOptions.useNormalize
    ? await normalizeInput({ options: cliOptions, outputPath })
    : cliOptions
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

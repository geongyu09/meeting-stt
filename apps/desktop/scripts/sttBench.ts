// STT만 돌려 정답 전사본과의 CER·반복 환각·처리 시간을 잰다. 화자 분리는 하지 않는다.
// 사용: pnpm --filter meeting-stt exec tsx scripts/sttBench.ts <audio.wav> [--tag=이름] [--model=경로]
//       [--bin=whisper-cli 경로] [--ref=정답.txt] [--extra="-mc 0 -sns"] [--no-vad]
//       [--prompt-file=용어.txt] (공백이 든 프롬프트는 --extra로 못 넘겨 파일로 받는다)
//       [--chunked=global|each] (녹음 중 STT 흉내: 20~25초 조각마다 whisper-cli를 따로 돌린다, src/main/audio/sttChunks.ts)
// 정답은 기본으로 scripts/fixtures/reference/<오디오 이름>.txt 를 쓴다.
import { existsSync } from 'node:fs'
import { appendFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'

import { CHUNK_SAMPLES, rmsOf, SAMPLE_RATE_HZ } from '@shared/audio'
import type { SttSegment } from '@shared/types'

import {
  EMPTY_STT_CHUNKER,
  flushSttChunker,
  pushSttChunk,
  type SttPiece
} from '../src/main/audio/sttChunks'
import { threadPlan } from '../src/main/bin/threads'
import { normalizeWavBuffer, normalizeWavFile, readWavPcm } from '../src/main/pipeline/normalize'
import {
  buildWhisperArgs,
  parseWhisperOutput,
  parseWhisperProgress
} from '../src/main/pipeline/whisper'
import { computeCer, normalizeForCer } from './cer'
import { fail, info } from './log'
import { FIXTURES_DIR, OUTPUT_DIR, VAD_MODEL, WHISPER_BIN, WHISPER_MODEL } from './paths'
import { run } from './shell'
import { buildWavHeader } from './wav'

const REFERENCE_DIR = path.join(FIXTURES_DIR, 'reference')
const RESULTS_PATH = path.join(OUTPUT_DIR, 'sttBench.tsv')
const PROGRESS_STEP_PERCENT = 10
const MS_PER_SEC = 1000
const PERCENT = 100
const INT16_SCALE = 32768
const REPEAT_WINDOW_SEGMENTS = 4
/**
 * global: 파일 전체로 정규화한 뒤 자른다(게인이 지금 파이프라인과 같아 자르기 효과만 본다).
 * each: 원본을 잘라 조각마다 따로 정규화한다(녹음 중에는 전체 음량을 모르므로 실제로 할 수 있는 쪽).
 */
const CHUNK_MODES = ['global', 'each'] as const

type ChunkMode = (typeof CHUNK_MODES)[number]

const isChunkMode = (value: string): value is ChunkMode =>
  CHUNK_MODES.some((mode) => mode === value)

interface BenchOptions {
  audioPath: string
  tag: string
  modelPath: string
  binPath: string
  referencePath: string
  extraArgs: string[]
  promptPath?: string
  useVad: boolean
  chunkMode?: ChunkMode
}

const parseOptions = (argv: string[]): BenchOptions => {
  const audioPath = argv.find((arg) => !arg.startsWith('--'))
  if (!audioPath) return fail('오디오 경로를 주세요')

  const valueOf = (name: string) => {
    const prefix = `--${name}=`
    return argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length)
  }
  const baseName = path.basename(audioPath, '.wav')
  const chunked = valueOf('chunked')
  if (chunked !== undefined && !isChunkMode(chunked)) {
    return fail(`--chunked는 ${CHUNK_MODES.join(' | ')} 중 하나입니다`)
  }

  return {
    audioPath,
    tag: valueOf('tag') ?? 'baseline',
    modelPath: valueOf('model') ?? WHISPER_MODEL,
    binPath: valueOf('bin') ?? WHISPER_BIN,
    referencePath: valueOf('ref') ?? path.join(REFERENCE_DIR, `${baseName}.txt`),
    extraArgs: (valueOf('extra') ?? '').split(' ').filter(Boolean),
    promptPath: valueOf('prompt-file'),
    useVad: !argv.includes('--no-vad'),
    chunkMode: chunked
  }
}

/** 정규화본은 입력이 같으면 결과도 같으므로 한 번 만들어 재사용한다 */
const ensureNormalized = async (audioPath: string) => {
  const normalizedPath = path.join(OUTPUT_DIR, `${path.basename(audioPath, '.wav')}.norm.wav`)
  if (existsSync(normalizedPath)) return normalizedPath

  const result = await normalizeWavFile({ inputPath: audioPath, outputPath: normalizedPath })
  info(
    `정규화: 발화 RMS ${result.speechRmsDb.toFixed(1)} dBFS → 게인 ${result.gainDb.toFixed(1)} dB`
  )
  return normalizedPath
}

/**
 * 최근 몇 세그먼트 안에 글자가 똑같은 세그먼트가 있으면 반복 환각으로 본다.
 * 한 문장만 반복하지 않고 "6월이." / "한."처럼 두세 문장이 번갈아 도는 고리도 있어서 직전 하나만 보면 놓친다.
 * 사람이 같은 말을 연달아 할 때(네, 네)도 걸리지만 그 길이는 몇 초라 수백 초짜리 환각과 구분된다.
 */
const measureRepetition = (segments: SttSegment[]) => {
  const texts = segments.map((segment) => normalizeForCer(segment.text))

  return segments.reduce(
    (acc, segment, index) => {
      const recent = texts.slice(Math.max(0, index - REPEAT_WINDOW_SEGMENTS), index)
      const isRepeat = texts[index] !== '' && recent.includes(texts[index])
      if (!isRepeat) return acc
      return { count: acc.count + 1, seconds: acc.seconds + (segment.end - segment.start) }
    },
    { count: 0, seconds: 0 }
  )
}

interface WhisperOnceParams {
  options: BenchOptions
  audioPath: string
  /** 확장자를 뺀 출력 경로. whisper-cli가 .json을 붙인다 */
  outputPath: string
  onProgress?: (percent: number) => void
}

const whisperOnce = async ({ options, audioPath, outputPath, onProgress }: WhisperOnceParams) => {
  const { stt } = await threadPlan()
  const promptArgs = options.promptPath
    ? ['--prompt', (await readFile(options.promptPath, 'utf-8')).trim()]
    : []
  const args = [
    ...buildWhisperArgs({
      modelPath: options.modelPath,
      audioPath,
      outputPath,
      threads: stt,
      vadModelPath: options.useVad ? VAD_MODEL : undefined
    }),
    ...promptArgs,
    ...options.extraArgs
  ]

  const startedAt = performance.now()
  const result = await run({
    command: options.binPath,
    args,
    onStderrLine: (line) => {
      const percent = parseWhisperProgress(line)
      if (percent !== null) onProgress?.(percent)
    }
  })
  if (result.code !== 0) {
    fail(`whisper-cli 비정상 종료 (${result.code})\n${result.stderr.slice(-800)}`)
  }

  return {
    segments: parseWhisperOutput(await readFile(`${outputPath}.json`)),
    elapsedSec: (performance.now() - startedAt) / MS_PER_SEC
  }
}

interface ChunkResult {
  startSec: number
  durationSec: number
  /** 모델 로드를 포함한 whisper-cli 한 번의 시간 */
  elapsedSec: number
  isForced: boolean
  segments: SttSegment[]
}

interface RunChunkedParams {
  options: BenchOptions
  mode: ChunkMode
  normalizedPath: string
  outputPath: string
}

interface ChunkCut {
  startSample: number
  sampleCount: number
  isForced: boolean
}

/** 녹음기가 보는 원본 음량으로 앱과 같은 조각 나누기를 돌린다. 샘플은 버리고 위치만 남긴다 */
const cutsOf = (pcm: Int16Array) => {
  const cuts: ChunkCut[] = []
  const keep = ({ startSample, samples, isForced }: SttPiece) =>
    cuts.push({ startSample, sampleCount: samples.length, isForced })
  let chunker = EMPTY_STT_CHUNKER

  for (let start = 0; start < pcm.length; start += CHUNK_SAMPLES) {
    const samples = Float32Array.from(
      pcm.subarray(start, start + CHUNK_SAMPLES),
      (sample) => sample / INT16_SCALE
    )
    const next = pushSttChunk({ chunker, samples, rms: rmsOf(samples) })
    chunker = next.chunker
    if (next.piece) keep(next.piece)
  }
  const tail = flushSttChunker(chunker).piece
  if (tail) keep(tail)

  return cuts
}

/**
 * 녹음 중 STT를 흉내 낸다. 쉼은 녹음기가 보는 원본 음량으로 찾고, 조각마다 whisper-cli를 새로 띄운다.
 * 시간을 조각마다 재는 이유는 녹음보다 빨리 처리되는지와 정지 뒤 남는 마지막 조각 시간을 보기 위해서다.
 */
const runChunked = async ({ options, mode, normalizedPath, outputPath }: RunChunkedParams) => {
  const raw = readWavPcm(await readFile(options.audioPath)).pcm
  const source = mode === 'global' ? readWavPcm(await readFile(normalizedPath)).pcm : raw
  const cuts = cutsOf(raw)
  const chunkDir = `${outputPath}.chunks`
  await mkdir(chunkDir, { recursive: true })

  const chunks: ChunkResult[] = []
  for (const [index, cut] of cuts.entries()) {
    const startSample = cut.startSample
    const pcm = source.subarray(startSample, startSample + cut.sampleCount)
    const body = Buffer.from(pcm.buffer, pcm.byteOffset, pcm.byteLength)
    const wav = Buffer.concat([buildWavHeader({ dataBytes: body.length }), body])
    const wavPath = path.join(chunkDir, `${index}.wav`)
    await writeFile(wavPath, mode === 'each' ? normalizeWavBuffer(wav).buffer : wav)

    const stt = await whisperOnce({
      options,
      audioPath: wavPath,
      outputPath: path.join(chunkDir, String(index))
    })
    await rm(wavPath)
    const startSec = startSample / SAMPLE_RATE_HZ
    chunks.push({
      startSec,
      durationSec: pcm.length / SAMPLE_RATE_HZ,
      elapsedSec: stt.elapsedSec,
      isForced: cut.isForced,
      segments: stt.segments.map(({ start, end, text }) => ({
        start: start + startSec,
        end: end + startSec,
        text
      }))
    })
    if ((index + 1) % PROGRESS_STEP_PERCENT === 0) info(`  조각 ${index + 1}/${cuts.length}`)
  }

  return chunks
}

const sumOf = (values: number[]) => values.reduce((total, value) => total + value, 0)

const reportChunks = (chunks: ChunkResult[]) => {
  const elapsed = chunks.map((chunk) => chunk.elapsedSec)
  const realtimeFactors = chunks.map((chunk) => chunk.elapsedSec / chunk.durationSec)
  const forcedCount = chunks.filter((chunk) => chunk.isForced).length
  const avgDurationSec = sumOf(chunks.map((chunk) => chunk.durationSec)) / chunks.length

  info(
    `조각 ${chunks.length}개 · 강제 자름 ${forcedCount}개 · 평균 길이 ${avgDurationSec.toFixed(1)}초`
  )
  info(
    `조각 처리 평균 ${(sumOf(elapsed) / chunks.length).toFixed(2)}초 · 최대 ${Math.max(...elapsed).toFixed(2)}초 · ` +
      `실시간 대비 최대 ${Math.max(...realtimeFactors).toFixed(3)}배 · 마지막 조각 ${elapsed.at(-1)?.toFixed(2)}초`
  )
}

interface TranscribeParams {
  options: BenchOptions
  normalizedPath: string
  outputPath: string
}

const transcribe = async ({ options, normalizedPath, outputPath }: TranscribeParams) => {
  if (!options.chunkMode) {
    let lastReported = -PROGRESS_STEP_PERCENT
    return whisperOnce({
      options,
      audioPath: normalizedPath,
      outputPath,
      onProgress: (percent) => {
        if (percent < lastReported + PROGRESS_STEP_PERCENT) return
        lastReported = percent
        info(`  STT ${percent}%`)
      }
    })
  }

  const chunks = await runChunked({ options, mode: options.chunkMode, normalizedPath, outputPath })
  const stats = chunks.map(({ startSec, durationSec, elapsedSec, isForced }) => ({
    startSec,
    durationSec,
    elapsedSec,
    isForced
  }))
  await writeFile(`${outputPath}.chunks.json`, JSON.stringify(stats, null, 2))
  reportChunks(chunks)

  return {
    segments: chunks.flatMap((chunk) => chunk.segments),
    elapsedSec: sumOf(chunks.map((chunk) => chunk.elapsedSec))
  }
}

const main = async () => {
  const options = parseOptions(process.argv.slice(2))
  for (const target of [options.audioPath, options.binPath, options.modelPath]) {
    if (!existsSync(target)) fail(`${target} 이(가) 없습니다`)
  }
  await mkdir(OUTPUT_DIR, { recursive: true })

  info(`입력 ${options.audioPath} · 태그 ${options.tag} · 모델 ${path.basename(options.modelPath)}`)
  info(`바이너리 ${options.binPath} · 추가 인자 ${options.extraArgs.join(' ') || '없음'}`)
  info(`조각 모드 ${options.chunkMode ?? '없음 (파일 전체 한 번)'}`)

  const normalizedPath = await ensureNormalized(options.audioPath)
  const outputPath = path.join(
    OUTPUT_DIR,
    `${path.basename(options.audioPath, '.wav')}.${options.tag}`
  )
  const stt = await transcribe({ options, normalizedPath, outputPath })
  const text = stt.segments.map((segment) => segment.text).join('\n')
  await writeFile(`${outputPath}.txt`, `${text}\n`, 'utf-8')
  const repetition = measureRepetition(stt.segments)
  // 정답이 없는 녹음(금토로 등)은 반복 환각·글자 수·시간만 잰다
  const score = existsSync(options.referencePath)
    ? computeCer({
        hypothesis: text,
        reference: await readFile(options.referencePath, 'utf-8')
      })
    : null
  const hypothesisChars = normalizeForCer(text).length
  const cerPercent = score ? (score.cer * PERCENT).toFixed(2) : '-'

  info('')
  if (score) {
    info(
      `CER ${cerPercent}% (치환 ${score.substitutions} · 삭제 ${score.deletions} · 삽입 ${score.insertions})`
    )
  } else {
    info(`정답 전사본이 없어 CER은 건너뜀 (${options.referencePath})`)
  }
  info(`글자 수 정답 ${score?.referenceChars ?? '-'} · 인식 ${hypothesisChars}`)
  info(`반복 세그먼트 ${repetition.count}개 · ${repetition.seconds.toFixed(0)}초`)
  info(`처리 시간 ${stt.elapsedSec.toFixed(1)}초`)
  info(`결과 ${outputPath}.txt`)

  if (!existsSync(RESULTS_PATH)) {
    await writeFile(
      RESULTS_PATH,
      'date\taudio\ttag\tmodel\textra\tcer%\tsub\tdel\tins\trefChars\thypChars\trepeatSegs\trepeatSec\tsttSec\n'
    )
  }
  await appendFile(
    RESULTS_PATH,
    [
      new Date().toISOString(),
      path.basename(options.audioPath),
      options.tag,
      path.basename(options.modelPath),
      options.extraArgs.join(' '),
      cerPercent,
      score?.substitutions ?? '-',
      score?.deletions ?? '-',
      score?.insertions ?? '-',
      score?.referenceChars ?? '-',
      hypothesisChars,
      repetition.count,
      repetition.seconds.toFixed(0),
      stt.elapsedSec.toFixed(1)
    ].join('\t') + '\n'
  )
}

main().catch((error: unknown) => {
  fail(error instanceof Error ? error.message : String(error))
})

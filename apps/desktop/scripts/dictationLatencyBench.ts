// 받아쓰기(음성 입력) 지연 측정. Zeroth 낭독 문장을 목표 길이(3·8·15·20·30초)만큼 이어 붙여 구간 WAV를 만들고,
// 앱과 같은 실행부(`src/main/audio/whisperOnce.ts`: 정규화 → whisper-cli turbo + VAD)로 spawn → 텍스트까지의
// 벽시계 시간을 잰다. 용어 프롬프트 유무를 나눠 재고, 결과로 `DICTATION_MAX_WINDOW_SEC`와 2초 목표를 판정한다
// (references/architecture.md "받아쓰기" > "측정", 기록은 docs/dictation-results.md).
// 사용: pnpm --filter meeting-stt exec tsx scripts/dictationLatencyBench.ts [--repeat=3] [--threads=4]
//       [--model=경로] [--terms=30] [--durations=3,8,15,20,30]
// 먼저 scripts/research/zerothExtract.py로 화자별 WAV와 색인을 뽑아 둔다.
import { existsSync } from 'node:fs'
import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

import { TERM_READINGS } from '@meeting-stt/core/termReadings'

import { transcribeOnce, type WhisperOnceTarget } from '../src/main/audio/whisperOnce'
import { threadPlan } from '../src/main/bin/threads'
import { readWavPcm } from '../src/main/pipeline/normalize'
import type { TermPrompt } from '../src/main/pipeline/whisper'
import { buildTermPrompt, readWhisperVocab } from '../src/main/pipeline/whisperPrompt'
import { computeCer } from './cer'
import { fail, info } from './log'
import { FIXTURES_DIR, OUTPUT_DIR, VAD_MODEL, WHISPER_BIN, WHISPER_MODEL } from './paths'
import { SAMPLE_RATE_HZ } from './wav'

const ZEROTH_DIR = path.join(FIXTURES_DIR, 'datasets', 'zeroth')
const CLIP_DIR = path.join(OUTPUT_DIR, 'dictation')
const RESULTS_PATH = path.join(CLIP_DIR, 'latency.tsv')
const TEMP_DIR = path.join(CLIP_DIR, 'tmp')

const DEFAULT_DURATIONS_SEC = [3, 8, 15, 20, 30]
const DEFAULT_REPEAT = 3
const DEFAULT_TERM_COUNT = 30
/** 문장 사이 쉼. 받아쓰기 확정 조건(1초 침묵)보다 짧아야 한 구간으로 묶인다 */
const SENTENCE_GAP_SEC = 0.5
/** 구간 끝에 붙는 침묵. 확정은 끝이 1초 조용할 때 일어나므로 실제 구간도 이만큼을 포함한다 */
const TRAILING_SILENCE_SEC = 1
/** 목표 길이에서 이만큼까지는 넘어도 문장을 더 넣는다 */
const FIT_TOLERANCE_SEC = 1.5
/** zerothConcat.py와 다른 시드 — 같은 문장이 CER 비교 셋(zeroth100)과 겹치지 않게 한다 */
const SEED = 7
const INT16_SCALE = 32768
const MS_PER_SEC = 1000
const PERCENT = 100

interface ZerothItem {
  id: string
  speaker: number
  split: string
  sec: number
  text: string
}

interface Clip {
  targetSec: number
  actualSec: number
  samples: Float32Array
  reference: string
  sentenceCount: number
  /** 가장 짧은 문장보다 짧은 목표라 문장 중간을 잘랐다. 지연만 유효하고 CER은 재지 않는다 */
  isCut: boolean
}

interface BenchOptions {
  repeat: number
  threads?: number
  modelPath: string
  termCount: number
  durationsSec: number[]
}

const parseOptions = (argv: string[]): BenchOptions => {
  const valueOf = (name: string) => {
    const prefix = `--${name}=`
    return argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length)
  }
  const threads = valueOf('threads')

  return {
    repeat: Number(valueOf('repeat') ?? DEFAULT_REPEAT),
    threads: threads ? Number(threads) : undefined,
    modelPath: valueOf('model') ?? WHISPER_MODEL,
    termCount: Number(valueOf('terms') ?? DEFAULT_TERM_COUNT),
    durationsSec: (valueOf('durations') ?? DEFAULT_DURATIONS_SEC.join(','))
      .split(',')
      .map(Number)
      .filter((value) => value > 0)
  }
}

/** 고정 시드 난수(mulberry32). 돌릴 때마다 같은 문장을 고른다 */
const createRandom = (seed: number) => {
  let state = seed >>> 0

  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let value = Math.imul(state ^ (state >>> 15), 1 | state)
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value

    return ((value ^ (value >>> 14)) >>> 0) / 4294967296
  }
}

const shuffle = <T>({ items, random }: { items: T[]; random: () => number }) =>
  items
    .map((item) => ({ item, key: random() }))
    .toSorted((a, b) => a.key - b.key)
    .map(({ item }) => item)

const readZerothSamples = async (item: ZerothItem) => {
  const file = path.join(ZEROTH_DIR, 'wav', String(item.speaker), `${item.id}.wav`)
  const { pcm, sampleRate } = readWavPcm(await readFile(file))
  if (sampleRate !== SAMPLE_RATE_HZ) fail(`${item.id}: ${sampleRate}Hz`)

  return Float32Array.from(pcm, (sample) => sample / INT16_SCALE)
}

const silenceOf = (seconds: number) => new Float32Array(Math.round(seconds * SAMPLE_RATE_HZ))

const concatSamples = (parts: Float32Array[]) => {
  const samples = new Float32Array(parts.reduce((total, part) => total + part.length, 0))
  parts.reduce((offset, part) => {
    samples.set(part, offset)

    return offset + part.length
  }, 0)

  return samples
}

/** 목표 길이와 가장 가까운 문장 조합을 고른다. 남은 길이에 가장 잘 맞는 문장을 하나씩 더한다 */
const pickSentences = ({
  pool,
  used,
  targetSec
}: {
  pool: ZerothItem[]
  used: Set<string>
  targetSec: number
}) => {
  const picked: ZerothItem[] = []
  let remaining = targetSec - TRAILING_SILENCE_SEC
  for (;;) {
    const candidates = pool.filter(
      (item) => !used.has(item.id) && item.sec + SENTENCE_GAP_SEC <= remaining + FIT_TOLERANCE_SEC
    )
    if (!candidates.length) break

    const best = candidates.reduce((closest, item) =>
      Math.abs(item.sec + SENTENCE_GAP_SEC - remaining) <
      Math.abs(closest.sec + SENTENCE_GAP_SEC - remaining)
        ? item
        : closest
    )
    picked.push(best)
    used.add(best.id)
    remaining -= best.sec + SENTENCE_GAP_SEC
    if (remaining < FIT_TOLERANCE_SEC) break
  }

  return picked
}

/**
 * 목표 길이에 맞춰 문장을 통째로 이어 붙인다. 문장을 자르지 않아 정답 전사본이 그대로 맞는다.
 * Zeroth 문장은 가장 짧은 것이 4.6초라 그보다 짧은 목표(3초)는 한 문장을 잘라 만들고 CER은 재지 않는다
 */
const buildClips = async ({ durationsSec }: { durationsSec: number[] }) => {
  const index = JSON.parse(
    await readFile(path.join(ZEROTH_DIR, 'index.json'), 'utf-8')
  ) as ZerothItem[]
  const pool = shuffle({
    items: index.filter((item) => item.split === 'test'),
    random: createRandom(SEED)
  })
  const used = new Set<string>()

  const clips: Clip[] = []
  for (const targetSec of durationsSec) {
    const fitted = pickSentences({ pool, used, targetSec })
    const isCut = fitted.length === 0
    const picked = isCut ? [pool.find((item) => !used.has(item.id)) as ZerothItem] : fitted
    if (isCut) used.add(picked[0].id)

    const parts = (await Promise.all(picked.map(readZerothSamples))).flatMap((samples) => [
      samples,
      silenceOf(SENTENCE_GAP_SEC)
    ])
    const speech = isCut
      ? parts[0].subarray(0, Math.round((targetSec - TRAILING_SILENCE_SEC) * SAMPLE_RATE_HZ))
      : concatSamples(parts)
    const samples = concatSamples([speech, silenceOf(TRAILING_SILENCE_SEC)])
    clips.push({
      targetSec,
      actualSec: samples.length / SAMPLE_RATE_HZ,
      samples,
      reference: picked.map((item) => item.text).join(' '),
      sentenceCount: picked.length,
      isCut
    })
  }

  return clips
}

/** 검수한 용어 사전 앞쪽 N개를 팀 용어 사전이라고 가정한다. 토큰 수는 앱과 같은 방식으로 센다 */
const buildBenchTermPrompt = async ({
  modelPath,
  termCount
}: {
  modelPath: string
  termCount: number
}): Promise<TermPrompt> => {
  const vocab = await readWhisperVocab(modelPath)
  const { prompt, tokenCount, droppedCount } = buildTermPrompt({
    terms: Object.keys(TERM_READINGS).slice(0, termCount),
    vocab
  })
  if (droppedCount) fail(`용어 ${termCount}개가 프롬프트 예산을 넘습니다`)

  return { text: prompt, tokenCount }
}

interface RunCellParams {
  clip: Clip
  target: WhisperOnceTarget
  termPrompt?: TermPrompt
  repeat: number
}

const median = (values: number[]) => {
  const sorted = values.toSorted((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)

  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}

/** 같은 구간을 반복해 돌리고 중앙값을 쓴다. 첫 실행은 파일 캐시가 비어 느릴 수 있다 */
const runCell = async ({ clip, target, termPrompt, repeat }: RunCellParams) => {
  const elapsed: number[] = []
  let text = ''
  for (let index = 0; index < repeat; index += 1) {
    const startedAt = performance.now()
    text = await transcribeOnce({
      samples: clip.samples,
      dir: TEMP_DIR,
      fileBase: `clip${clip.targetSec}`,
      target,
      termPrompt
    })
    elapsed.push((performance.now() - startedAt) / MS_PER_SEC)
  }
  const cer = clip.isCut ? null : computeCer({ hypothesis: text, reference: clip.reference }).cer

  return {
    medianSec: median(elapsed),
    minSec: Math.min(...elapsed),
    maxSec: Math.max(...elapsed),
    cer,
    text
  }
}

const main = async () => {
  const options = parseOptions(process.argv.slice(2))
  for (const file of [
    WHISPER_BIN,
    options.modelPath,
    VAD_MODEL,
    path.join(ZEROTH_DIR, 'index.json')
  ]) {
    if (!existsSync(file)) fail(`${file} 이(가) 없습니다`)
  }
  await mkdir(TEMP_DIR, { recursive: true })

  const threads = options.threads ?? (await threadPlan()).stt
  const target: WhisperOnceTarget = {
    whisperBin: WHISPER_BIN,
    whisperModel: options.modelPath,
    vadModel: VAD_MODEL,
    threads
  }
  const termPrompt = await buildBenchTermPrompt({
    modelPath: options.modelPath,
    termCount: options.termCount
  })
  info(
    `모델 ${path.basename(options.modelPath)} · 스레드 ${threads} · 반복 ${options.repeat} · 용어 ${options.termCount}개(${termPrompt.tokenCount}토큰)`
  )

  const clips = await buildClips({ durationsSec: options.durationsSec })
  clips.forEach((clip) =>
    info(
      `구간 ${clip.targetSec}초 → 실제 ${clip.actualSec.toFixed(1)}초, ${clip.sentenceCount}문장${clip.isCut ? ' (문장 중간을 자름)' : ''}`
    )
  )

  if (!existsSync(RESULTS_PATH)) {
    await writeFile(
      RESULTS_PATH,
      'date\tmodel\tthreads\ttargetSec\tactualSec\tprompt\tmedianSec\tminSec\tmaxSec\tcer%\ttext\n'
    )
  }

  info('')
  info('구간\t실제\t프롬프트\t중앙값\t최소\t최대\tCER')
  for (const clip of clips) {
    for (const variant of [
      { label: 'none', termPrompt: undefined },
      { label: `terms${options.termCount}`, termPrompt }
    ]) {
      const result = await runCell({
        clip,
        target,
        termPrompt: variant.termPrompt,
        repeat: options.repeat
      })
      info(
        [
          `${clip.targetSec}초`,
          `${clip.actualSec.toFixed(1)}초`,
          variant.label,
          `${result.medianSec.toFixed(2)}초`,
          `${result.minSec.toFixed(2)}초`,
          `${result.maxSec.toFixed(2)}초`,
          result.cer === null ? '-(잘림)' : `${(result.cer * PERCENT).toFixed(1)}%`
        ].join('\t')
      )
      await appendFile(
        RESULTS_PATH,
        [
          new Date().toISOString(),
          path.basename(options.modelPath),
          threads,
          clip.targetSec,
          clip.actualSec.toFixed(2),
          variant.label,
          result.medianSec.toFixed(3),
          result.minSec.toFixed(3),
          result.maxSec.toFixed(3),
          result.cer === null ? '-' : (result.cer * PERCENT).toFixed(2),
          result.text.replace(/\t/g, ' ')
        ].join('\t') + '\n'
      )
    }
  }
  info('')
  info(`결과 ${RESULTS_PATH}`)
}

main().catch((error: unknown) => {
  fail(error instanceof Error ? error.message : String(error))
})

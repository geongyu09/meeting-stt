// 녹음 품질 측정 2절 (docs/recording-quality-results.md).
// 실제 회의(jun-meeting) 앞부분을 조건 하나씩 나쁘게 만든 뒤 앱과 같은 경로(정규화 → whisper)로 인식해 CER을 잰다.
// 사용: nice -n 15 pnpm --filter meeting-stt exec tsx scripts/qualityDegradeBench.ts [--minutes=15] [--only=base,pink-10]
//       [--keep-wav] (앱 캡처 경로 실험의 입력으로 쓰려고 나쁘게 만든 WAV를 남긴다)
//       [--score=<wav> --tag=<이름>] (밖에서 만든 WAV를 같은 발췌 정답으로 채점한다. 앱이 녹음한 WAV용)
import { existsSync } from 'node:fs'
import { appendFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'

import { normalizeWavFile } from '../src/main/pipeline/normalize'
import { buildWhisperArgs, parseWhisperOutput } from '../src/main/pipeline/whisper'
import { computeCer } from './cer'
import { EXPERIMENT_THREADS } from './diarDatasets'
import { fail, info } from './log'
import { FIXTURES_DIR, VAD_MODEL, WHISPER_BIN, WHISPER_MODEL } from './paths'
import { loadMeetingTurns, loadWav, MEETING_AUDIO_PATH, QUALITY_DIR } from './qualityData'
import { applyGainDb, babbleOf, lowpass, mixNoise, pinkNoise } from './qualityDegrade'
import { measureQuality } from './qualityMetrics'
import { run } from './shell'
import { writeWav } from './wav'

const RESULTS_PATH = path.join(QUALITY_DIR, 'degrade.tsv')
const RESULTS_HEADER =
  'date\tminutes\tid\tspeechDb\tnoiseDb\twidthDb\tclip%\tnormGainDb\tnormClip%\tcer%\tsub\tdel\tins\thypChars\tsttSec\n'
const BABBLE_SOURCES = ['sim-2a', 'sim-3a', 'sim-3b', 'sim-5a'].map((id) =>
  path.join(FIXTURES_DIR, 'datasets', 'sim', `${id}.wav`)
)
const DEFAULT_MINUTES = 15
const NOISE_SEED = 20261002
const NICE_LEVEL = '15'
const SEC_PER_MIN = 60
const MS_PER_SEC = 1000
const PERCENT = 100
/** 블루투스 통화 모드(8kHz 표본화) 마이크의 대역 */
const NARROWBAND_CUTOFF_HZ = 3400

const ATTENUATIONS_DB = [12, 24, 30, 36, 42]
const PINK_SNRS_DB = [25, 20, 15, 10, 5, 0]
const BABBLE_SNRS_DB = [20, 15, 10, 5]
const CLIP_GAINS_DB = [12, 20, 28]
/** 원거리 녹음 흉내: 잡음이 섞인 채로 전체가 작게 녹음된 경우 */
const FAR_SNR_DB = 10
const FAR_ATTENUATION_DB = 30

interface Condition {
  id: string
  apply: (pcm: Int16Array) => Int16Array
}

interface Excerpt {
  pcm: Int16Array
  sampleRate: number
  reference: string
  minutes: number
}

/** 발췌 끝을 턴 경계에 맞춘다 — 정답 턴의 시작 시각이 1초 해상도라 턴 중간에서 자르면 정답 글자를 가를 수 없다 */
const loadExcerpt = async (minutes: number): Promise<Excerpt> => {
  const turns = await loadMeetingTurns()
  const cutoff = turns.find((turn) => turn.start >= minutes * SEC_PER_MIN)?.start
  if (cutoff === undefined) return fail(`${minutes}분 뒤에 시작하는 턴이 없습니다`)

  const { pcm, sampleRate } = await loadWav(MEETING_AUDIO_PATH)

  return {
    pcm: pcm.subarray(0, cutoff * sampleRate),
    sampleRate,
    reference: turns
      .filter((turn) => turn.start < cutoff)
      .map((turn) => turn.chars.join(''))
      .join(''),
    minutes
  }
}

const buildConditions = async ({ pcm, sampleRate }: Excerpt): Promise<Condition[]> => {
  const { speechDb } = measureQuality({ pcm, sampleRate })
  const pink = pinkNoise({ length: pcm.length, seed: NOISE_SEED })
  const sources = await Promise.all(BABBLE_SOURCES.map(async (file) => (await loadWav(file)).pcm))
  const babble = babbleOf({ sources, length: pcm.length })
  const withNoise = (noise: Float32Array, snrDb: number) => (input: Int16Array) =>
    mixNoise({ pcm: input, noise, speechDb, snrDb })

  return [
    { id: 'base', apply: (input) => input },
    ...ATTENUATIONS_DB.map((db) => ({
      id: `att-${db}`,
      apply: (input: Int16Array) => applyGainDb({ pcm: input, gainDb: -db })
    })),
    ...PINK_SNRS_DB.map((snr) => ({ id: `pink-${snr}`, apply: withNoise(pink, snr) })),
    ...BABBLE_SNRS_DB.map((snr) => ({ id: `babble-${snr}`, apply: withNoise(babble, snr) })),
    ...CLIP_GAINS_DB.map((db) => ({
      id: `clip+${db}`,
      apply: (input: Int16Array) => applyGainDb({ pcm: input, gainDb: db })
    })),
    {
      id: `lowpass-${NARROWBAND_CUTOFF_HZ}`,
      apply: (input) => lowpass({ pcm: input, cutoffHz: NARROWBAND_CUTOFF_HZ, sampleRate })
    },
    {
      id: `far-pink${FAR_SNR_DB}-att${FAR_ATTENUATION_DB}`,
      apply: (input) =>
        applyGainDb({ pcm: withNoise(pink, FAR_SNR_DB)(input), gainDb: -FAR_ATTENUATION_DB })
    }
  ]
}

/** 같은 조건을 다시 돌리면 whisper 결과는 재사용한다 (정규화와 지표는 싸서 매번 다시 잰다) */
const transcribe = async ({ normPath, outputPath }: { normPath: string; outputPath: string }) => {
  if (existsSync(`${outputPath}.json`)) return 0

  const startedAt = performance.now()
  const result = await run({
    command: 'nice',
    args: [
      '-n',
      NICE_LEVEL,
      WHISPER_BIN,
      ...buildWhisperArgs({
        modelPath: WHISPER_MODEL,
        audioPath: normPath,
        outputPath,
        threads: EXPERIMENT_THREADS,
        vadModelPath: VAD_MODEL
      })
    ]
  })
  if (result.code !== 0) {
    fail(`whisper-cli 비정상 종료 (${result.code})\n${result.stderr.slice(-800)}`)
  }

  return (performance.now() - startedAt) / MS_PER_SEC
}

interface RunConditionParams {
  id: string
  pcm: Int16Array
  excerpt: Excerpt
  isWavKept: boolean
}

const runCondition = async ({ id, pcm, excerpt, isWavKept }: RunConditionParams) => {
  const stem = path.join(QUALITY_DIR, `m${excerpt.minutes}.${id}`)
  const rawPath = `${stem}.wav`
  const normPath = `${stem}.norm.wav`
  const metrics = measureQuality({ pcm, sampleRate: excerpt.sampleRate })

  await writeWav({
    filePath: rawPath,
    pcm: Buffer.from(pcm.buffer, pcm.byteOffset, pcm.byteLength)
  })
  const normalized = await normalizeWavFile({ inputPath: rawPath, outputPath: normPath })
  const sttSec = await transcribe({ normPath, outputPath: stem })
  await Promise.all([isWavKept ? undefined : rm(rawPath), rm(normPath)])

  const hypothesis = parseWhisperOutput(await readFile(`${stem}.json`))
    .map((segment) => segment.text)
    .join('\n')
  const score = computeCer({ hypothesis, reference: excerpt.reference })

  return [
    id,
    metrics.speechDb.toFixed(1),
    metrics.noiseDb.toFixed(1),
    metrics.snrDb.toFixed(1),
    (metrics.clipRatio * PERCENT).toFixed(3),
    normalized.gainDb.toFixed(1),
    (normalized.clippedRatio * PERCENT).toFixed(3),
    (score.cer * PERCENT).toFixed(2),
    score.substitutions,
    score.deletions,
    score.insertions,
    score.hypothesisChars,
    sttSec.toFixed(1)
  ].join('\t')
}

const main = async () => {
  const valueOf = (name: string) =>
    process.argv.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3)
  const minutes = Number(valueOf('minutes') ?? DEFAULT_MINUTES)
  const only = valueOf('only')?.split(',')
  const scorePath = valueOf('score')
  const isWavKept = process.argv.includes('--keep-wav')

  await mkdir(QUALITY_DIR, { recursive: true })
  if (!existsSync(RESULTS_PATH)) await writeFile(RESULTS_PATH, RESULTS_HEADER)

  const excerpt = await loadExcerpt(minutes)
  const report = async (row: string) => {
    info(row)
    await appendFile(RESULTS_PATH, `${new Date().toISOString()}\t${minutes}\t${row}\n`)
  }
  info(RESULTS_HEADER.split('\t').slice(2).join('\t').trimEnd())

  if (scorePath) {
    const { pcm } = await loadWav(scorePath)
    const id = valueOf('tag') ?? path.basename(scorePath, '.wav')
    return report(await runCondition({ id, pcm, excerpt, isWavKept: true }))
  }

  const conditions = (await buildConditions(excerpt)).filter(
    (condition) => !only || only.includes(condition.id)
  )
  info(
    `발췌 ${(excerpt.pcm.length / excerpt.sampleRate).toFixed(0)}초 · 정답 ${excerpt.reference.length}자 · 조건 ${conditions.length}개`
  )

  // 팬 소음을 피하려고 조건을 하나씩 차례로 돌린다
  for (const condition of conditions) {
    const pcm = condition.apply(excerpt.pcm)
    await report(await runCondition({ id: condition.id, pcm, excerpt, isWavKept }))
  }
}

main().catch((error: unknown) => {
  fail(error instanceof Error ? error.message : String(error))
})

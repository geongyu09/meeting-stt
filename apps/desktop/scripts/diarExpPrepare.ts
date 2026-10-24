// 데이터셋마다 고정 입력을 한 번 만든다: 정규화 → STT → CLI 화자 분리(참석자 수 / 12) → 재임베딩 캐시.
// 있는 산출물은 건너뛰고, 단계별 시간을 output/exp/<id>.times.json에 남긴다 (docs/diarization-experiments.md 3-4절).
// 사용: nice -n 15 pnpm --filter meeting-stt exec tsx scripts/diarExpPrepare.ts [--dataset=D3s,D5] [--path=unknown]
import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

import { buildDiarizeArgs } from '../src/main/pipeline/diarize'
import { normalizeWavFile } from '../src/main/pipeline/normalize'
import { buildWhisperArgs } from '../src/main/pipeline/whisper'
import {
  EXPERIMENT_THREADS,
  EXP_DIR,
  cliPathFor,
  loadReclusterInputs,
  selectDatasets,
  type DiarDataset,
  type SpeakerCountPath
} from './diarDatasets'
import { fail, info } from './log'
import {
  DIARIZE_BIN,
  EMBEDDING_MODEL,
  SEGMENTATION_MODEL,
  VAD_MODEL,
  WHISPER_BIN,
  WHISPER_MODEL
} from './paths'
import { run } from './shell'

const MS_PER_SEC = 1000
const COUNT_PATHS: SpeakerCountPath[] = ['known', 'unknown']

type StageTimes = Record<string, number>

const timed = async <T>(work: () => Promise<T>) => {
  const startedAt = performance.now()
  const value = await work()
  return { value, sec: (performance.now() - startedAt) / MS_PER_SEC }
}

const ensureNormalized = async (dataset: DiarDataset) => {
  if (existsSync(dataset.normPath)) return
  const result = await normalizeWavFile({
    inputPath: dataset.sourcePath,
    outputPath: dataset.normPath
  })
  info(`  정규화: 발화 ${result.speechRmsDb.toFixed(1)} dBFS → 게인 ${result.gainDb.toFixed(1)} dB`)
}

const ensureStt = async ({ dataset, times }: { dataset: DiarDataset; times: StageTimes }) => {
  if (existsSync(dataset.sttPath)) return
  const { value, sec } = await timed(() =>
    run({
      command: WHISPER_BIN,
      args: buildWhisperArgs({
        modelPath: WHISPER_MODEL,
        audioPath: dataset.normPath,
        outputPath: dataset.sttPath.replace(/\.json$/, ''),
        threads: EXPERIMENT_THREADS,
        vadModelPath: VAD_MODEL,
        language: dataset.language
      })
    })
  )
  if (value.code !== 0) throw new Error(`whisper-cli 비정상 종료\n${value.stderr.slice(-400)}`)
  times.sttSec = sec
  info(`  STT ${sec.toFixed(1)}초`)
}

const ensureCli = async ({
  dataset,
  countPath,
  times
}: {
  dataset: DiarDataset
  countPath: SpeakerCountPath
  times: StageTimes
}) => {
  const cliPath = cliPathFor({ dataset, countPath })
  if (existsSync(cliPath)) return
  const { value, sec } = await timed(() =>
    run({
      command: DIARIZE_BIN,
      args: buildDiarizeArgs({
        segmentationModelPath: SEGMENTATION_MODEL,
        embeddingModelPath: EMBEDDING_MODEL,
        audioPath: dataset.normPath,
        threads: EXPERIMENT_THREADS,
        speakerCount: countPath === 'known' ? dataset.speakerCount : undefined
      })
    })
  )
  if (value.code !== 0) throw new Error(`화자 분리 비정상 종료\n${value.stderr.slice(-400)}`)
  await writeFile(cliPath, value.stdout, 'utf-8')
  times[`cliSec.${countPath}`] = sec
  info(`  CLI(${countPath}) ${sec.toFixed(1)}초`)
}

const prepare = async ({
  dataset,
  countPaths
}: {
  dataset: DiarDataset
  countPaths: SpeakerCountPath[]
}) => {
  info(`[${dataset.id}]`)
  const timesPath = path.join(EXP_DIR, `${dataset.id}.times.json`)
  const times: StageTimes = existsSync(timesPath)
    ? (JSON.parse(await readFile(timesPath, 'utf-8')) as StageTimes)
    : {}

  await ensureNormalized(dataset)
  await ensureStt({ dataset, times })
  for (const countPath of countPaths) {
    await ensureCli({ dataset, countPath, times })
    const { embedSec, chunks } = await loadReclusterInputs({ dataset, countPath })
    if (embedSec) times[`embedSec.${countPath}`] = embedSec
    times[`chunks.${countPath}`] = chunks.length
  }
  await writeFile(timesPath, `${JSON.stringify(times, null, 2)}\n`, 'utf-8')
}

const main = async () => {
  const selector = process.argv.find((arg) => arg.startsWith('--dataset='))?.slice(10)
  const countPaths =
    (process.argv
      .find((arg) => arg.startsWith('--path='))
      ?.slice(7)
      .split(',') as SpeakerCountPath[] | undefined) ?? COUNT_PATHS
  await mkdir(EXP_DIR, { recursive: true })
  for (const dataset of selectDatasets(selector)) await prepare({ dataset, countPaths })
}

main().catch((error) => fail(error instanceof Error ? error.message : String(error)))

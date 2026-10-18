// E10 분할 창 간격 (docs/diarization-experiments.md 4절). CLI의 창 간격 비율만 바꿔 구간을 다시 뽑고,
// 앱과 같은 재임베딩 + 재군집 + 병합으로 채점한다. 비율 0.1은 기준선(기존 CLI 구간·임베딩 캐시)이다.
// 사용: nice -n 15 pnpm --filter meeting-stt exec tsx scripts/diarExpShift.ts [--dataset=D1] [--path=known,unknown] [--ratio=0.1,0.25,0.5,1] [--seeds]
import { existsSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

import { clusterEmbeddings, reclusterChunks, splitIntoChunks } from '@meeting-stt/core/cluster'

import { buildDiarizeArgs } from '../src/main/pipeline/diarize'
import {
  EXPERIMENT_THREADS,
  EXP_DIR,
  cliPathFor,
  clusterCountOf,
  embedWithCache,
  embeddingCachePathOf,
  loadCliSegments,
  selectDatasets,
  type DiarDataset,
  type SpeakerCountPath
} from './diarDatasets'
import { appendResult, evaluateSegments, loadEvalContext } from './diarEval'
import { NOISE_SEEDS, segmentsOf } from './diarExpCluster'
import { fail, info } from './log'
import { DIARIZE_BIN, EMBEDDING_MODEL, SEGMENTATION_MODEL } from './paths'
import { run } from './shell'

const TAG = 'r2.E10'
const COUNT_PATHS: SpeakerCountPath[] = ['known', 'unknown']
/** sherpa-onnx 기본값. 기준선 CLI 구간은 이 값으로 뽑은 것이다 */
const BASELINE_RATIO = 0.1
const DEFAULT_RATIOS = [BASELINE_RATIO, 0.25, 0.5, 1]
const MS_PER_SEC = 1000

type Times = Record<string, number>

const timesPathOf = (dataset: DiarDataset) => path.join(EXP_DIR, `${dataset.id}.times.json`)

const loadTimes = async (dataset: DiarDataset): Promise<Times> =>
  existsSync(timesPathOf(dataset))
    ? (JSON.parse(await readFile(timesPathOf(dataset), 'utf-8')) as Times)
    : {}

const shiftCliPathOf = ({
  dataset,
  countPath,
  ratio
}: {
  dataset: DiarDataset
  countPath: SpeakerCountPath
  ratio: number
}) => {
  const baselinePath = cliPathFor({ dataset, countPath })
  return ratio === BASELINE_RATIO
    ? baselinePath
    : baselinePath.replace(/\.txt$/, `.shift${ratio}.txt`)
}

/** 기준선 시간은 diarExpPrepare가 남긴 키, 변형은 `.shift<비율>`을 붙인 키에 둔다 */
const timeKeyOf = ({
  stage,
  countPath,
  ratio
}: {
  stage: 'cliSec' | 'embedSec'
  countPath: SpeakerCountPath
  ratio: number
}) => (ratio === BASELINE_RATIO ? `${stage}.${countPath}` : `${stage}.${countPath}.shift${ratio}`)

const ensureShiftCli = async ({
  dataset,
  countPath,
  ratio,
  times
}: {
  dataset: DiarDataset
  countPath: SpeakerCountPath
  ratio: number
  times: Times
}) => {
  const cliPath = shiftCliPathOf({ dataset, countPath, ratio })
  if (existsSync(cliPath)) return cliPath

  const startedAt = performance.now()
  const result = await run({
    command: DIARIZE_BIN,
    args: buildDiarizeArgs({
      segmentationModelPath: SEGMENTATION_MODEL,
      embeddingModelPath: EMBEDDING_MODEL,
      audioPath: dataset.normPath,
      threads: EXPERIMENT_THREADS,
      speakerCount: countPath === 'known' ? dataset.speakerCount : undefined,
      windowShiftRatio: ratio
    })
  })
  if (result.code !== 0) throw new Error(`화자 분리 비정상 종료\n${result.stderr.slice(-400)}`)

  const sec = (performance.now() - startedAt) / MS_PER_SEC
  await writeFile(cliPath, result.stdout, 'utf-8')
  times[timeKeyOf({ stage: 'cliSec', countPath, ratio })] = sec
  info(`  [${dataset.id}/${countPath}] 비율 ${ratio} CLI ${sec.toFixed(1)}초`)
  return cliPath
}

const runVariant = async ({
  dataset,
  countPath,
  ratio,
  times,
  context,
  isSeedSweep
}: {
  dataset: DiarDataset
  countPath: SpeakerCountPath
  ratio: number
  times: Times
  context: Awaited<ReturnType<typeof loadEvalContext>>
  /** 시드 잡음 바닥과 같은 시드 5개로 각각 채점한다 (태그 `r2.E10s.shift<비율>.s<시드>`) */
  isSeedSweep: boolean
}) => {
  const cliPath = await ensureShiftCli({ dataset, countPath, ratio, times })
  const chunks = splitIntoChunks({ segments: await loadCliSegments(cliPath) })
  const { embeddings, elapsedSec } = await embedWithCache({
    wavPath: dataset.normPath,
    chunks,
    cachePath: embeddingCachePathOf(cliPath)
  })
  const embedKey = timeKeyOf({ stage: 'embedSec', countPath, ratio })
  if (elapsedSec) times[embedKey] = elapsedSec

  const clusterCount = clusterCountOf({ dataset, countPath })
  const cliSec = times[timeKeyOf({ stage: 'cliSec', countPath, ratio })]
  const embedSec = times[embedKey]
  const note = `CLI ${cliSec?.toFixed(1) ?? '?'}초 · 임베딩 ${embedSec?.toFixed(1) ?? '?'}초 · 조각 ${chunks.length}개`

  if (!isSeedSweep) {
    const speakerSegments = reclusterChunks({ chunks, embeddings, clusterCount })
    const result = evaluateSegments({ context, speakerSegments, countPath })
    await appendResult({ tag: `${TAG}.shift${ratio}`, dataset, countPath, result, note })
    return
  }

  // 조각이 바뀌면 k-means 시드의 운도 다시 뽑힌다. 시드 하나끼리 비교하면 그 흔들림이 효과로 보인다
  const vectors = embeddings.map((embedding) => embedding.vector)
  for (const seed of NOISE_SEEDS) {
    const labels = clusterEmbeddings({ embeddings: vectors, clusterCount, seed })
    const speakerSegments = segmentsOf({ input: { chunks, embeddings }, labels })
    const result = evaluateSegments({ context, speakerSegments, countPath })
    await appendResult({ tag: `${TAG}s.shift${ratio}.s${seed}`, dataset, countPath, result, note })
  }
}

const main = async () => {
  const argv = process.argv.slice(2)
  const valueOf = (name: string) => argv.find((arg) => arg.startsWith(`--${name}=`))?.split('=')[1]
  const paths = (valueOf('path')?.split(',') as SpeakerCountPath[] | undefined) ?? COUNT_PATHS
  const ratios = valueOf('ratio')?.split(',').map(Number) ?? DEFAULT_RATIOS
  if (ratios.some((ratio) => !(ratio > 0 && ratio <= 1))) return fail('--ratio는 0 초과 1 이하')
  const isSeedSweep = argv.includes('--seeds')

  for (const dataset of selectDatasets(valueOf('dataset'))) {
    const context = await loadEvalContext(dataset)
    const times = await loadTimes(dataset)
    for (const countPath of paths) {
      for (const ratio of ratios) {
        await runVariant({ dataset, countPath, ratio, times, context, isSeedSweep })
        // 변형 하나가 몇 분씩 걸리므로 중간에 끊겨도 잰 시간이 남게 매번 쓴다
        await writeFile(timesPathOf(dataset), `${JSON.stringify(times, null, 2)}\n`, 'utf-8')
      }
    }
  }
}

if (require.main === module) {
  main().catch((error) => fail(error instanceof Error ? error.message : String(error)))
}

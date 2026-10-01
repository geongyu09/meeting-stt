// 화자 구간을 데이터셋 정답과 비교해 2차 실험 지표를 모두 낸다 (docs/diarization-experiments.md 3-2절).
// 사용: pnpm --filter meeting-stt exec tsx scripts/diarEval.ts --dataset=<ID> --diar=<구간.txt> --tag=r2.<실험>.<변형>
//       [--path=known|unknown] [--confusion]
// 실험 스크립트(diarExp*.ts)는 evaluateSegments·appendResult를 직접 부른다.
import { existsSync } from 'node:fs'
import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

import { assignSpeakers, mergeUtterances } from '@meeting-stt/core/merge'
import type { MergedUtterance, SpeakerSegment, SttSegment } from '@shared/types'

import {
  EXP_DIR,
  loadCliSegments,
  loadReference,
  loadSttSegments,
  selectDatasets,
  type DiarDataset,
  type SpeakerCountPath
} from './diarDatasets'
import {
  computeDer,
  editCostOf,
  formatConfusion,
  labelPiecesByUtterance,
  scorablePieces,
  scoreCharacters,
  type Reference
} from './diarScore'
import { fail, info } from './log'

const RESULTS_PATH = path.join(EXP_DIR, 'diarExp.tsv')
const PERCENT = 100
/** 정답 턴 경계 근처 글자는 어느 쪽이든 맞을 수 있다. 1차 실험과 같은 값 */
const BOUNDARY_TOLERANCE_SEC = 2

export interface EvalContext {
  dataset: DiarDataset
  segments: SttSegment[]
  reference?: Reference
}

export const loadEvalContext = async (dataset: DiarDataset): Promise<EvalContext> => ({
  dataset,
  segments: await loadSttSegments(dataset),
  reference: await loadReference(dataset)
})

const countSpeakerChanges = (utterances: MergedUtterance[]) =>
  utterances.filter((u, i) => i > 0 && u.speakerLabel !== utterances[i - 1].speakerLabel).length

/** 정답에서 화자가 바뀌는 횟수. 겹침이 있는 RTTM은 시작 순으로 늘어놓고 센다 */
const countReferenceChanges = (reference: Reference) =>
  reference.turns.filter((turn, i) => i > 0 && turn.speaker !== reference.turns[i - 1].speaker)
    .length

interface EvaluateParams {
  context: EvalContext
  speakerSegments: SpeakerSegment[]
  countPath: SpeakerCountPath
  /** 병합 단계를 바꾸는 실험(E5b)이 조각 배정을 가로챌 때 쓴다 */
  assign?: typeof assignSpeakers
  /** 이 시각 범위의 글자만 채점한다 (E8: 회의 뒤쪽 절반) */
  range?: { start: number; end: number }
  /** 병합이 끝난 발화의 화자를 바꾸는 실험(E7)이 쓴다 */
  relabel?: (utterances: MergedUtterance[]) => MergedUtterance[]
}

/** 앱과 같은 병합(참석자 수 없음 경로는 군소 화자 흡수)을 거친 결과로 채점한다 */
export const evaluateSegments = ({
  context,
  speakerSegments,
  countPath,
  assign = assignSpeakers,
  range,
  relabel = (utterances) => utterances
}: EvaluateParams) => {
  const { segments, reference, dataset } = context
  const pieces = assign({
    segments,
    speakerSegments,
    isMinorSpeakerAbsorbed: countPath === 'unknown'
  })
  const utterances = relabel(mergeUtterances(pieces))
  const finalSpeakers = new Set(utterances.map((u) => u.speakerLabel)).size
  const base = {
    finalSpeakers,
    refSpeakers: dataset.speakerCount,
    speakerCountError: Math.abs(finalSpeakers - dataset.speakerCount),
    utterances: utterances.length,
    speakerChanges: countSpeakerChanges(utterances)
  }
  if (!reference) {
    return {
      ...base,
      scored: undefined,
      score: undefined,
      utteranceList: utterances,
      editCost: undefined,
      referenceChanges: undefined,
      der: undefined
    }
  }

  const scored = scorablePieces({
    pieces: labelPiecesByUtterance({ pieces, utterances }),
    reference,
    boundaryToleranceSec: BOUNDARY_TOLERANCE_SEC,
    range
  })
  const score = scoreCharacters(scored)
  const refSpeakers = new Set(reference.turns.map((turn) => turn.speaker)).size

  return {
    ...base,
    refSpeakers,
    speakerCountError: Math.abs(finalSpeakers - refSpeakers),
    scored,
    score,
    utteranceList: utterances,
    editCost: editCostOf(scored),
    referenceChanges: countReferenceChanges(reference),
    der: reference.format === 'rttm' ? computeDer({ speakerSegments, reference }) : undefined
  }
}

export type EvalResult = ReturnType<typeof evaluateSegments>

const percent = (value?: number) => (value === undefined ? '' : (value * PERCENT).toFixed(2))

const HEADER = [
  'date',
  'tag',
  'dataset',
  'path',
  'accuracy%',
  'coreAccuracy%',
  'purity%',
  'merges',
  'reassigns',
  'editCost',
  'finalSpeakers',
  'refSpeakers',
  'speakerChanges',
  'refChanges',
  'DER%',
  'miss%',
  'falseAlarm%',
  'confusion%',
  'note'
].join('\t')

interface AppendParams {
  tag: string
  dataset: DiarDataset
  countPath: SpeakerCountPath
  result: EvalResult
  note?: string
}

export const formatResultLine = ({ tag, dataset, countPath, result }: AppendParams) =>
  [
    `[${tag}.${dataset.id}/${countPath}]`,
    result.score ? `정확도 ${percent(result.score.accuracy)}%` : '정답본 없음',
    result.score ? `경계 제외 ${percent(result.score.coreAccuracy)}%` : '',
    result.editCost
      ? `편집 ${result.editCost.total}(병합 ${result.editCost.merges}+재배정 ${result.editCost.reassigns})`
      : '',
    `화자 ${result.finalSpeakers}/${result.refSpeakers}`,
    result.der ? `DER ${percent(result.der.der)}% (혼동 ${percent(result.der.confusion)}%)` : ''
  ]
    .filter(Boolean)
    .join(' · ')

/** 결과 한 줄을 화면과 diarExp.tsv에 남긴다. 태그는 `r2.<실험>.<변형>.<데이터셋>` */
export const appendResult = async (params: AppendParams) => {
  const { tag, dataset, countPath, result, note = '' } = params
  info(formatResultLine(params))

  await mkdir(EXP_DIR, { recursive: true })
  if (!existsSync(RESULTS_PATH)) await writeFile(RESULTS_PATH, `${HEADER}\n`, 'utf-8')
  const row = [
    new Date().toISOString(),
    `${tag}.${dataset.id}`,
    dataset.id,
    countPath,
    percent(result.score?.accuracy),
    percent(result.score?.coreAccuracy),
    percent(result.score?.purity),
    result.editCost?.merges ?? '',
    result.editCost?.reassigns ?? '',
    result.editCost?.total ?? '',
    result.finalSpeakers,
    result.refSpeakers,
    result.speakerChanges,
    result.referenceChanges ?? '',
    percent(result.der?.der),
    percent(result.der?.miss),
    percent(result.der?.falseAlarm),
    percent(result.der?.confusion),
    note
  ].join('\t')
  await appendFile(RESULTS_PATH, `${row}\n`, 'utf-8')
}

const main = async () => {
  const argv = process.argv.slice(2)
  const valueOf = (name: string) => {
    const prefix = `--${name}=`
    return argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length)
  }
  const diarPath = valueOf('diar')
  const datasetId = valueOf('dataset')
  if (!diarPath || !datasetId) return fail('--dataset=<ID> --diar=<화자 구간 파일> 을 주세요')

  const [dataset] = selectDatasets(datasetId)
  const countPath: SpeakerCountPath = valueOf('path') === 'unknown' ? 'unknown' : 'known'
  const context = await loadEvalContext(dataset)
  const speakerSegments = diarPath.endsWith('.rttm')
    ? (await readFile(diarPath, 'utf-8'))
        .split('\n')
        .map((line) => line.trim().split(/\s+/))
        .filter((fields) => fields[0] === 'SPEAKER')
        .map((fields) => ({
          start: Number(fields[3]),
          end: Number(fields[3]) + Number(fields[4]),
          speaker: fields[7]
        }))
    : await loadCliSegments(diarPath)
  const result = evaluateSegments({ context, speakerSegments, countPath })

  await appendResult({
    tag: valueOf('tag') ?? path.basename(diarPath, '.txt'),
    dataset,
    countPath,
    result
  })
  if (argv.includes('--confusion') && result.score) {
    info(formatConfusion({ confusion: result.score.confusion, mapping: result.score.mapping }))
  }
}

if (require.main === module) {
  main().catch((error) => fail(error instanceof Error ? error.message : String(error)))
}

// 녹음 품질 측정 1·3절 (docs/recording-quality-results.md).
//   survey   — 가진 녹음마다 음량·바닥 잡음·클리핑 지표를 뽑는다
//   speakers — 실제 회의(jun-meeting) 안에서 화자·턴 음량·시간대별로 CER이 어떻게 다른지 본다
// 사용: nice -n 15 pnpm --filter meeting-stt exec tsx scripts/qualitySurvey.ts <survey|speakers>
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'

import { frameSamplesOf } from '@meeting-stt/core/normalize'

import { normalizeForCer } from './cer'
import { alignErrors } from './cerAlign'
import { DATASETS } from './diarDatasets'
import { fail, info } from './log'
import {
  loadMeetingTurns,
  loadWav,
  MEETING_AUDIO_PATH,
  MEETING_STT_TEXT_PATH,
  type ReferenceTurnText
} from './qualityData'
import { frameRmsOf, measureQuality, noiseDbOf, speechDbOf } from './qualityMetrics'

const PERCENT = 100
/** 1초 해상도의 턴 시각으로 음량을 재려면 턴이 이 정도는 길어야 옆 사람 소리가 덜 섞인다 */
const MIN_LEVEL_TURN_SEC = 3
const WINDOW_SEC = 300
/** 짧은 맞장구는 음량과 무관하게 잘 틀린다. 음량의 영향만 보려고 이보다 긴 턴만 따로 본다 */
const LONG_TURN_CHARS = 60
/** 턴 음량 구간의 경계(dBFS). 마지막 구간은 이보다 큰 전부 */
const LEVEL_BIN_EDGES_DB = [-35, -30, -25, -20]

const runSurvey = async () => {
  info('id\t길이(분)\t발화dBFS\t바닥dBFS\t폭dB\t클리핑%\t무음%')

  for (const dataset of DATASETS) {
    if (!existsSync(dataset.sourcePath)) continue
    const metrics = measureQuality(await loadWav(dataset.sourcePath))
    info(
      [
        dataset.id,
        (metrics.durationSec / 60).toFixed(1),
        metrics.speechDb.toFixed(1),
        metrics.noiseDb.toFixed(1),
        metrics.snrDb.toFixed(1),
        (metrics.clipRatio * PERCENT).toFixed(3),
        (metrics.silentRatio * PERCENT).toFixed(1)
      ].join('\t')
    )
  }
}

interface TurnScore {
  turn: ReferenceTurnText
  errors: number
  deletions: number
  /** 턴 구간의 발화 음량. 턴이 너무 짧으면 NaN */
  speechDb: number
}

interface ScoreGroup {
  label: string
  scores: TurnScore[]
}

const sumOf = (values: number[]) => values.reduce((acc, value) => acc + value, 0)

const formatGroup = ({ label, scores }: ScoreGroup, frames: Float32Array, frameSec: number) => {
  const chars = sumOf(scores.map((score) => score.turn.chars.length))
  const errors = sumOf(scores.map((score) => score.errors))
  const deletions = sumOf(scores.map((score) => score.deletions))
  // 그룹에 속한 턴의 프레임을 모아 한 번에 잰다 (턴별 값의 평균이 아니다)
  const groupFrames = Float32Array.from(
    scores.flatMap((score) => [
      ...frames.subarray(
        Math.floor(score.turn.start / frameSec),
        Math.floor(Math.min(score.turn.end, frames.length * frameSec) / frameSec)
      )
    ])
  )

  return [
    label,
    scores.length,
    chars,
    chars ? ((errors / chars) * PERCENT).toFixed(1) : '-',
    chars ? ((deletions / chars) * PERCENT).toFixed(1) : '-',
    groupFrames.length ? speechDbOf(groupFrames).toFixed(1) : '-'
  ].join('\t')
}

const scoreTurns = async () => {
  const turns = await loadMeetingTurns()
  const reference = turns.flatMap((turn) => turn.chars)
  const hypothesis = [...normalizeForCer(await readFile(MEETING_STT_TEXT_PATH, 'utf-8'))]
  const { substitutions, deletions, insertions } = alignErrors({ hypothesis, reference })
  const { pcm, sampleRate } = await loadWav(MEETING_AUDIO_PATH)
  const frames = frameRmsOf({ pcm, sampleRate })
  const frameSec = frameSamplesOf({ sampleRate }) / sampleRate

  let offset = 0
  const scores = turns.map<TurnScore>((turn) => {
    const end = offset + turn.chars.length
    const deleted = sumOf([...deletions.subarray(offset, end)])
    const errors =
      deleted +
      sumOf([...substitutions.subarray(offset, end)]) +
      sumOf([...insertions.subarray(offset, end)])
    offset = end
    const turnFrames = frames.subarray(
      Math.floor(turn.start / frameSec),
      Math.floor(Math.min(turn.end, frames.length * frameSec) / frameSec)
    )
    const isLongEnough = turn.end - turn.start >= MIN_LEVEL_TURN_SEC

    return {
      turn,
      errors,
      deletions: deleted,
      speechDb: isLongEnough ? speechDbOf(turnFrames) : NaN
    }
  })

  return { scores, frames, frameSec }
}

const levelBinOf = (speechDb: number) => {
  const index = LEVEL_BIN_EDGES_DB.findIndex((edge) => speechDb < edge)
  if (index === 0) return `< ${LEVEL_BIN_EDGES_DB[0]}`
  if (index === -1) return `>= ${LEVEL_BIN_EDGES_DB.at(-1)}`
  return `${LEVEL_BIN_EDGES_DB[index - 1]} ~ ${LEVEL_BIN_EDGES_DB[index]}`
}

const groupBy = (scores: TurnScore[], keyOf: (score: TurnScore) => string) => {
  const groups = new Map<string, TurnScore[]>()
  for (const score of scores) groups.set(keyOf(score), [...(groups.get(keyOf(score)) ?? []), score])
  return [...groups.entries()].map<ScoreGroup>(([label, grouped]) => ({ label, scores: grouped }))
}

const runSpeakers = async () => {
  const { scores, frames, frameSec } = await scoreTurns()
  const header = '\t턴\t글자\tCER%\t삭제%\t발화dBFS'
  const print = (title: string, groups: ScoreGroup[]) => {
    info(`\n${title}${header}`)
    groups.forEach((group) => info(formatGroup(group, frames, frameSec)))
  }

  info(`전체 바닥 잡음 ${noiseDbOf(frames).toFixed(1)} dBFS`)
  print('전체', [{ label: '전체', scores }])
  print(
    '화자',
    groupBy(scores, (score) => score.turn.speaker)
  )
  const leveled = scores.filter((score) => Number.isFinite(score.speechDb))
  const byLevel = (targets: TurnScore[]) =>
    groupBy(targets, (score) => levelBinOf(score.speechDb)).toSorted(
      (a, b) => a.scores[0].speechDb - b.scores[0].speechDb
    )
  print('턴 음량', byLevel(leveled))
  print(
    `턴 음량 (${LONG_TURN_CHARS}자 이상)`,
    byLevel(leveled.filter((score) => score.turn.chars.length >= LONG_TURN_CHARS))
  )
  print(
    '시간대(5분)',
    groupBy(scores, (score) =>
      String(Math.floor(score.turn.start / WINDOW_SEC) * (WINDOW_SEC / 60))
    )
  )
}

const main = async () => {
  const command = process.argv[2]
  if (command === 'survey') return runSurvey()
  if (command === 'speakers') return runSpeakers()
  return fail('survey 또는 speakers 중 하나를 주세요')
}

main().catch((error: unknown) => {
  fail(error instanceof Error ? error.message : String(error))
})

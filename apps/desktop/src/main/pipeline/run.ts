import { existsSync } from 'node:fs'
import { readdir, readFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { speakerLabelOf } from '@meeting-stt/core/cluster'
import { assignSpeakers, mergeUtterances } from '@meeting-stt/core/merge'
import { termNameOf } from '@shared/glossary'
import type { PipelineStage, SpeakerSegment, SttSegment } from '@shared/types'
import { diarizeBinPath, whisperBinPath } from '../bin/paths'
import { runBinary } from '../bin/spawn'
import { threadPlan } from '../bin/threads'
import { info } from '../log'
import { missingModelLabels, modelPath } from '../models/paths'
import { buildDiarizeArgs, parseDiarizeOutput, parseDiarizeProgress } from './diarize'
import { measureWavFileQuality, normalizeWavFile } from './normalize'
import { reclusterSpeakers } from './recluster'
import { buildWhisperArgs, parseWhisperOutput, parseWhisperProgress } from './whisper'
import { resolveTermPrompt } from './whisperPrompt'
import { t } from '../locale'

/** 코어가 적으면 STT와 화자 분리를 동시에 돌리는 게 오히려 느리다 (references/pitfalls.md) */
const PARALLEL_MIN_CORES = 8
const WHISPER_OUTPUT_SUFFIX = '.whisper'
const NORMALIZED_SUFFIX = '.norm.wav'
const FULL_PERCENT = 100
/**
 * 화자 분리 단계 안에서 CLI가 차지하는 몫. 나머지는 재임베딩이다 (창 간격 0.25에서 시간이 약 8 : 2).
 * 별도 단계를 두면 IPC 계약·진행률 UI가 함께 바뀐다 (references/architecture.md "화자 재군집")
 */
const DIARIZE_CLI_PERCENT = 80

interface ProgressParams {
  stage: PipelineStage
  percent: number
}

interface RunPipelineParams {
  audioPath: string
  /** 있으면 화자 분리를 num-clusters로 고정한다. 없으면 임계값 폴백 (references/architecture.md) */
  speakerCount?: number
  /** 조용히 처리. 화자 분리 스레드를 줄이고 STT와 순차로 돌린다 (references/architecture.md) */
  isQuiet: boolean
  /** 메모는 화자 분리를 spawn하지 않는다 (references/features/assistant.md "녹음 종류 (회의 / 메모)") */
  isMemo: boolean
  /** 전역 용어 사전 줄. 인식 단계 프롬프트로 쓴다 (references/architecture.md "인식 단계 용어 프롬프트") */
  glossaryTerms: string[]
  /** 메모 녹음의 녹음 중 STT 결과. null이거나 비었으면 파일 전체로 인식한다 (references/features/recording.md "녹음 중 STT (메모)") */
  recordingStt?: Promise<SttSegment[] | null>
  onProgress: (progress: ProgressParams) => void
}

const isPipelineArtifact = (fileName: string) =>
  fileName.endsWith(NORMALIZED_SUFFIX) || fileName.endsWith(`${WHISPER_OUTPUT_SUFFIX}.json`)

/**
 * 잡 중간에 앱이 죽으면 finally가 돌지 않아 정규화본·whisper JSON이 남는다.
 * 앱 시작 시 한 번 지운다. 원본 WAV는 건드리지 않는다 (references/architecture.md)
 */
export const removeStalePipelineArtifacts = async ({ dir }: { dir: string }) => {
  if (!existsSync(dir)) return 0

  const stale = (await readdir(dir)).filter(isPipelineArtifact)
  await Promise.all(stale.map((fileName) => rm(path.join(dir, fileName), { force: true })))

  return stale.length
}

/** 실행 파일·모델이 없으면 spawn 전에 한국어로 안내하고 멈춘다 */
const ensureReady = () => {
  const missingBins = [whisperBinPath(), diarizeBinPath()].filter((bin) => !existsSync(bin))
  if (missingBins.length) {
    throw new Error(t().main.pipeline.binariesMissing({ paths: missingBins.join(', ') }))
  }

  const missingModels = missingModelLabels()
  if (missingModels.length) {
    throw new Error(t().main.pipeline.modelsNotReady({ labels: missingModels.join(', ') }))
  }
}

interface RunSttParams {
  audioPath: string
  outputPath: string
  glossaryTerms: string[]
  onProgress: (progress: ProgressParams) => void
}

const runStt = async ({ audioPath, outputPath, glossaryTerms, onProgress }: RunSttParams) => {
  const { stt } = await threadPlan()
  const whisperModelPath = modelPath('whisper')
  const termPrompt = await resolveTermPrompt({
    terms: glossaryTerms.map(termNameOf),
    whisperModelPath
  })

  await runBinary({
    command: whisperBinPath(),
    args: buildWhisperArgs({
      modelPath: whisperModelPath,
      audioPath,
      outputPath,
      threads: stt,
      vadModelPath: modelPath('vad'),
      termPrompt
    }),
    onStderrLine: (line) => {
      const percent = parseWhisperProgress(line)
      if (percent !== null) onProgress({ stage: 'stt', percent })
    }
  })

  const jsonPath = `${outputPath}.json`
  const segments: SttSegment[] = parseWhisperOutput(await readFile(jsonPath))
  await rm(jsonPath, { force: true })
  // whisper가 마지막 진행률 로그를 남기지 않고 끝나는 경우가 있어 단계 종료를 직접 알린다
  onProgress({ stage: 'stt', percent: FULL_PERCENT })

  return segments
}

interface RunDiarizationParams {
  audioPath: string
  speakerCount?: number
  isQuiet: boolean
  onProgress: (progress: ProgressParams) => void
}

const runDiarization = async ({
  audioPath,
  speakerCount,
  isQuiet,
  onProgress
}: RunDiarizationParams): Promise<SpeakerSegment[]> => {
  const { diarize } = await threadPlan({ isQuiet })

  const { stdout } = await runBinary({
    command: diarizeBinPath(),
    args: buildDiarizeArgs({
      segmentationModelPath: modelPath('segmentation'),
      embeddingModelPath: modelPath('embedding'),
      audioPath,
      threads: diarize,
      speakerCount
    }),
    onStderrLine: (line) => {
      const percent = parseDiarizeProgress(line)
      if (percent !== null) {
        onProgress({ stage: 'diarize', percent: (percent * DIARIZE_CLI_PERCENT) / FULL_PERCENT })
      }
    }
  })
  onProgress({ stage: 'diarize', percent: DIARIZE_CLI_PERCENT })

  // CLI 라벨은 버리고 구간만 쓴다. 군집은 재임베딩 + k-means로 다시 한다
  const speakerSegments = await reclusterSpeakers({
    speakerSegments: parseDiarizeOutput(stdout),
    audioPath,
    speakerCount,
    threads: diarize,
    onProgress: ({ done, total }) =>
      onProgress({
        stage: 'diarize',
        percent: DIARIZE_CLI_PERCENT + ((FULL_PERCENT - DIARIZE_CLI_PERCENT) * done) / total
      })
  })

  onProgress({ stage: 'diarize', percent: FULL_PERCENT })

  return speakerSegments
}

interface TranscribeParams {
  audioPath: string
  outputPath: string
  speakerCount?: number
  isQuiet: boolean
  glossaryTerms: string[]
  onProgress: (progress: ProgressParams) => void
}

/**
 * 코어가 넉넉하면 STT와 화자 분리를 같이 돌린다.
 * 조용히 처리할 때는 GPU(STT)와 CPU(화자 분리) 발열이 한 방열판에 겹치지 않게 순차로 돌린다.
 */
const transcribeAndDiarize = async ({
  audioPath,
  outputPath,
  speakerCount,
  isQuiet,
  glossaryTerms,
  onProgress
}: TranscribeParams) =>
  !isQuiet && os.cpus().length >= PARALLEL_MIN_CORES
    ? Promise.all([
        runStt({ audioPath, outputPath, glossaryTerms, onProgress }),
        runDiarization({ audioPath, speakerCount, isQuiet, onProgress })
      ])
    : ([
        await runStt({ audioPath, outputPath, glossaryTerms, onProgress }),
        await runDiarization({ audioPath, speakerCount, isQuiet, onProgress })
      ] as const)

/**
 * 메모는 혼자 하는 기록이라 화자 분리 대신 녹음 전체를 덮는 화자 구간 하나를 병합에 넘긴다 — 병합 코드는 그대로다.
 * 진행률 단계 구성을 바꾸지 않도록 화자 분리 단계는 100%로 한 번 알린다
 */
const memoSpeakersOf = ({
  segments,
  onProgress
}: Pick<RunPipelineParams, 'onProgress'> & { segments: SttSegment[] }) => {
  onProgress({ stage: 'diarize', percent: FULL_PERCENT })
  const end = segments.reduce((latest, segment) => Math.max(latest, segment.end), 0)
  const speakerSegments: SpeakerSegment[] = [{ start: 0, end, speaker: speakerLabelOf(0) }]

  return [segments, speakerSegments] as const
}

const transcribeMemo = async ({
  audioPath,
  outputPath,
  glossaryTerms,
  onProgress
}: Omit<TranscribeParams, 'speakerCount' | 'isQuiet'>) =>
  memoSpeakersOf({
    segments: await runStt({ audioPath, outputPath, glossaryTerms, onProgress }),
    onProgress
  })

/** 녹음 중 STT가 끝난 메모는 정규화본·whisper 없이 원본에서 품질 지표만 잰다 */
const mergeRecognizedMemo = async ({
  audioPath,
  segments,
  onProgress
}: Pick<RunPipelineParams, 'audioPath' | 'onProgress'> & { segments: SttSegment[] }) => {
  info(`녹음 중 STT 결과로 처리: 세그먼트 ${segments.length}개`)
  onProgress({ stage: 'stt', percent: FULL_PERCENT })
  const audioQuality = await measureWavFileQuality({ inputPath: audioPath })
  const [, speakerSegments] = memoSpeakersOf({ segments, onProgress })
  onProgress({ stage: 'merge', percent: 0 })
  const utterances = mergeUtterances(
    assignSpeakers({ segments, speakerSegments, isMinorSpeakerAbsorbed: false })
  )

  return { utterances, audioQuality }
}

/**
 * WAV 한 개를 회의록 발화 목록과 원본의 품질 지표로 바꾼다. Phase 1 검증 스크립트(scripts/pipeline.ts)와 같은 흐름이며,
 * 파라미터는 docs/phase1-results.md에서 확정한 기본값(정규화 + turbo-q5 + VAD 켬 + DTW 끔)을 쓴다.
 */
export const runPipeline = async ({
  audioPath,
  speakerCount,
  isQuiet,
  isMemo,
  glossaryTerms,
  recordingStt,
  onProgress
}: RunPipelineParams) => {
  ensureReady()

  const outputPath = `${audioPath}${WHISPER_OUTPUT_SUFFIX}`
  const normalizedPath = `${audioPath}${NORMALIZED_SUFFIX}`

  onProgress({ stage: 'stt', percent: 0 })
  // 정지 직후면 꼬리 조각이 끝나기를 기다린다
  const recognized = isMemo ? await recordingStt : undefined
  if (recognized?.length)
    return mergeRecognizedMemo({ audioPath, segments: recognized, onProgress })
  if (recordingStt) info('녹음 중 STT 결과 없음: 파일 전체로 인식')

  // whisper는 입력 음량을 정규화하지 않아 작게 녹음된 발화를 통째로 놓친다 (docs/phase1-results.md)
  const { speechRmsDb, gainDb, audioQuality } = await normalizeWavFile({
    inputPath: audioPath,
    outputPath: normalizedPath
  })
  info(
    `음량 정규화: 발화 ${speechRmsDb.toFixed(1)}dBFS → 게인 ${gainDb.toFixed(1)}dB (바닥 잡음 ${audioQuality.noiseDb.toFixed(1)}dBFS)`
  )

  try {
    info(
      isMemo
        ? '화자 분리: 메모라 건너뜀'
        : speakerCount
          ? `화자 분리: 참석자 ${speakerCount}명`
          : '화자 분리: 참석자 수 없음, 과분할 뒤 병합으로 추정'
    )
    if (isQuiet && !isMemo) info('조용히 처리: 화자 분리 스레드를 줄이고 순차 실행')
    const [segments, speakerSegments] = isMemo
      ? await transcribeMemo({ audioPath: normalizedPath, outputPath, glossaryTerms, onProgress })
      : await transcribeAndDiarize({
          audioPath: normalizedPath,
          outputPath,
          speakerCount,
          isQuiet,
          glossaryTerms,
          onProgress
        })

    onProgress({ stage: 'merge', percent: 0 })

    // 참석자 수로 자른 클러스터는 전부 실제 화자다. 흡수하면 짧게 말한 참석자가 사라진다
    const utterances = mergeUtterances(
      assignSpeakers({
        segments,
        speakerSegments,
        isMinorSpeakerAbsorbed: !isMemo && !speakerCount
      })
    )

    return { utterances, audioQuality }
  } finally {
    // 원본에서 다시 만들 수 있는 파생물이라 실패해도 남기지 않는다 (references/architecture.md)
    await rm(normalizedPath, { force: true })
  }
}

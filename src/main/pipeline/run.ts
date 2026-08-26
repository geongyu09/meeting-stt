import { existsSync } from 'node:fs'
import { readdir, readFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { assignSpeakers, mergeUtterances } from '@shared/merge'
import type { PipelineStage, SpeakerSegment, SttSegment } from '@shared/types'
import { diarizeBinPath, whisperBinPath } from '../bin/paths'
import { runBinary } from '../bin/spawn'
import { info } from '../log'
import { missingModelLabels, modelPath } from '../models/paths'
import { buildDiarizeArgs, parseDiarizeOutput, parseDiarizeProgress } from './diarize'
import { normalizeWavFile } from './normalize'
import { buildWhisperArgs, parseWhisperOutput, parseWhisperProgress } from './whisper'

/** 코어가 적으면 STT와 화자 분리를 동시에 돌리는 게 오히려 느리다 (references/pitfalls.md) */
const PARALLEL_MIN_CORES = 8
const RESERVED_CORES = 2
const WHISPER_OUTPUT_SUFFIX = '.whisper'
const NORMALIZED_SUFFIX = '.norm.wav'
const FULL_PERCENT = 100

interface ProgressParams {
  stage: PipelineStage
  percent: number
}

interface RunPipelineParams {
  audioPath: string
  onProgress: (progress: ProgressParams) => void
}

const threadCount = () => Math.max(1, os.cpus().length - RESERVED_CORES)

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
    throw new Error(
      `실행 파일이 없습니다: ${missingBins.join(', ')}. \`pnpm tsx scripts/setupBin.ts\`로 준비해 주세요`
    )
  }

  const missingModels = missingModelLabels()
  if (missingModels.length) {
    throw new Error(`모델이 준비되지 않았습니다: ${missingModels.join(', ')}`)
  }
}

interface RunSttParams {
  audioPath: string
  outputPath: string
  onProgress: (progress: ProgressParams) => void
}

const runStt = async ({ audioPath, outputPath, onProgress }: RunSttParams) => {
  await runBinary({
    command: whisperBinPath(),
    args: buildWhisperArgs({
      modelPath: modelPath('whisper'),
      audioPath,
      outputPath,
      threads: threadCount(),
      vadModelPath: modelPath('vad')
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

const runDiarization = async ({
  audioPath,
  onProgress
}: Omit<RunSttParams, 'outputPath'>): Promise<SpeakerSegment[]> => {
  const { stdout } = await runBinary({
    command: diarizeBinPath(),
    args: buildDiarizeArgs({
      segmentationModelPath: modelPath('segmentation'),
      embeddingModelPath: modelPath('embedding'),
      audioPath,
      threads: threadCount()
    }),
    onStderrLine: (line) => {
      const percent = parseDiarizeProgress(line)
      if (percent !== null) onProgress({ stage: 'diarize', percent })
    }
  })

  onProgress({ stage: 'diarize', percent: FULL_PERCENT })

  return parseDiarizeOutput(stdout)
}

interface TranscribeParams {
  audioPath: string
  outputPath: string
  onProgress: (progress: ProgressParams) => void
}

/** 코어가 넉넉하면 STT와 화자 분리를 같이 돌린다 */
const transcribeAndDiarize = async ({ audioPath, outputPath, onProgress }: TranscribeParams) =>
  os.cpus().length >= PARALLEL_MIN_CORES
    ? Promise.all([
        runStt({ audioPath, outputPath, onProgress }),
        runDiarization({ audioPath, onProgress })
      ])
    : ([
        await runStt({ audioPath, outputPath, onProgress }),
        await runDiarization({ audioPath, onProgress })
      ] as const)

/**
 * WAV 한 개를 회의록 발화 목록으로 바꾼다. Phase 1 검증 스크립트(scripts/pipeline.ts)와 같은 흐름이며,
 * 파라미터는 docs/phase1-results.md에서 확정한 기본값(정규화 + turbo-q5 + VAD 켬 + DTW 끔)을 쓴다.
 */
export const runPipeline = async ({ audioPath, onProgress }: RunPipelineParams) => {
  ensureReady()

  const outputPath = `${audioPath}${WHISPER_OUTPUT_SUFFIX}`
  const normalizedPath = `${audioPath}${NORMALIZED_SUFFIX}`

  onProgress({ stage: 'stt', percent: 0 })

  // whisper는 입력 음량을 정규화하지 않아 작게 녹음된 발화를 통째로 놓친다 (docs/phase1-results.md)
  const { speechRmsDb, gainDb } = await normalizeWavFile({
    inputPath: audioPath,
    outputPath: normalizedPath
  })
  info(`음량 정규화: 발화 ${speechRmsDb.toFixed(1)}dBFS → 게인 ${gainDb.toFixed(1)}dB`)

  try {
    const [segments, speakerSegments] = await transcribeAndDiarize({
      audioPath: normalizedPath,
      outputPath,
      onProgress
    })

    onProgress({ stage: 'merge', percent: 0 })

    return mergeUtterances(assignSpeakers({ segments, speakerSegments }))
  } finally {
    // 원본에서 다시 만들 수 있는 파생물이라 실패해도 남기지 않는다 (references/architecture.md)
    await rm(normalizedPath, { force: true })
  }
}

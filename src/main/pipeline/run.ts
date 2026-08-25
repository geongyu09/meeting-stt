import { existsSync } from 'node:fs'
import { readFile, rm } from 'node:fs/promises'
import os from 'node:os'
import { assignSpeakers, mergeUtterances } from '@shared/merge'
import type { PipelineStage, SpeakerSegment, SttSegment } from '@shared/types'
import { diarizeBinPath, whisperBinPath } from '../bin/paths'
import { runBinary } from '../bin/spawn'
import { missingModelLabels, modelPath } from '../models/paths'
import { buildDiarizeArgs, parseDiarizeOutput, parseDiarizeProgress } from './diarize'
import { buildWhisperArgs, parseWhisperOutput, parseWhisperProgress } from './whisper'

/** 코어가 적으면 STT와 화자 분리를 동시에 돌리는 게 오히려 느리다 (references/pitfalls.md) */
const PARALLEL_MIN_CORES = 8
const RESERVED_CORES = 2
const WHISPER_OUTPUT_SUFFIX = '.whisper'

interface ProgressParams {
  stage: PipelineStage
  percent: number
}

interface RunPipelineParams {
  audioPath: string
  onProgress: (progress: ProgressParams) => void
}

const threadCount = () => Math.max(1, os.cpus().length - RESERVED_CORES)

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

  return parseDiarizeOutput(stdout)
}

/**
 * WAV 한 개를 회의록 발화 목록으로 바꾼다. Phase 1 검증 스크립트(scripts/pipeline.ts)와 같은 흐름이며,
 * 파라미터는 docs/phase1-results.md에서 확정한 기본값(turbo-q5 + VAD 켬 + DTW 끔)을 쓴다.
 */
export const runPipeline = async ({ audioPath, onProgress }: RunPipelineParams) => {
  ensureReady()

  const outputPath = `${audioPath}${WHISPER_OUTPUT_SUFFIX}`
  const isParallel = os.cpus().length >= PARALLEL_MIN_CORES

  onProgress({ stage: 'stt', percent: 0 })
  const [segments, speakerSegments] = isParallel
    ? await Promise.all([
        runStt({ audioPath, outputPath, onProgress }),
        runDiarization({ audioPath, onProgress })
      ])
    : [
        await runStt({ audioPath, outputPath, onProgress }),
        await runDiarization({ audioPath, onProgress })
      ]

  onProgress({ stage: 'merge', percent: 0 })

  return mergeUtterances(assignSpeakers({ segments, speakerSegments }))
}

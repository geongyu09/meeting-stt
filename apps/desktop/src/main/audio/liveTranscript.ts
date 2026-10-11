import { existsSync } from 'node:fs'
import path from 'node:path'
import { app } from 'electron'
import type { LiveTranscriptLine, LiveTranscriptState } from '@shared/ipc'
import { whisperBinPath } from '../bin/paths'
import { threadPlan } from '../bin/threads'
import { t } from '../locale'
import { messageOf, warn } from '../log'
import { liveWhisperModelPath, modelPath } from '../models/paths'
import {
  dropLiveChunks,
  EMPTY_LIVE_WINDOW,
  liveSamplesOf,
  markLiveRunStarted,
  planLiveRun,
  pushLiveChunk
} from './liveWindow'
import { transcribeOnce } from './whisperOnce'

/**
 * 녹음 화면의 라이브 받아쓰기. 녹음 세션이 넘기는 청크를 짧은 구간으로 모아 whisper-cli를 다시 돌린다.
 * 결과는 저장하지 않는 미리보기이고 회의록은 정지 후 파이프라인이 만든다
 * (references/architecture.md "라이브 받아쓰기").
 */

/** 이벤트에 싣는 확정 문장 수. 화면은 최근 것만 보면 된다 */
const LIVE_MAX_LINES = 50
const LIVE_DIR_NAME = 'meeting-stt-live'
const LIVE_FILE_BASE = 'window'

let isEnabled = false
let lines: LiveTranscriptLine[] = []
let partial = ''
let errorMessage: string | undefined
let pending = EMPTY_LIVE_WINDOW
let nextLineId = 1
let isRunning = false
let hasWarned = false
/** 녹음이 바뀌거나 보기를 끄면 올린다. 도는 중이던 실행의 결과는 번호가 다르면 버린다 */
let generation = 0

export const getLiveTranscriptState = (): LiveTranscriptState => ({
  isEnabled,
  lines,
  partial,
  ...(errorMessage ? { errorMessage } : {})
})

const clearWindow = () => {
  generation += 1
  pending = EMPTY_LIVE_WINDOW
  partial = ''
}

/** 녹음 시작·정지 때 부른다. 보기 모드는 그대로 둔다 */
export const resetLiveTranscript = () => {
  clearWindow()
  lines = []
  errorMessage = undefined
  nextLineId = 1
  hasWarned = false
}

/** 끄면 인식을 멈추고 확정된 줄은 남긴다. 다시 켜면 그때부터 듣는다 */
export const setLiveTranscriptEnabled = (next: boolean) => {
  isEnabled = next
  clearWindow()
  errorMessage = undefined
}

const liveDir = () => path.join(app.getPath('temp'), LIVE_DIR_NAME)

/** 실행부는 받아쓰기와 공용(`whisperOnce.ts`)이고, 여기서는 경로 해석과 준비 확인만 한다 */
const transcribe = async (samples: Float32Array) => {
  const whisperModel = liveWhisperModelPath()
  const vadModel = modelPath('vad')
  if (![whisperBinPath(), whisperModel, vadModel].every((file) => existsSync(file))) {
    throw new Error(t().main.recording.liveUnavailable)
  }

  const { stt } = await threadPlan()

  return transcribeOnce({
    samples,
    dir: liveDir(),
    fileBase: LIVE_FILE_BASE,
    target: { whisperBin: whisperBinPath(), whisperModel, vadModel, threads: stt }
  })
}

interface ApplyResultParams {
  text: string
  chunkCount: number
  isFinal: boolean
}

const applyResult = ({ text, chunkCount, isFinal }: ApplyResultParams) => {
  errorMessage = undefined
  if (!isFinal) {
    partial = text
    return
  }

  if (text) lines = [...lines, { id: nextLineId++, text }].slice(-LIVE_MAX_LINES)
  partial = ''
  pending = dropLiveChunks({ window: pending, count: chunkCount })
}

const handleFailure = (caught: unknown) => {
  errorMessage = t().main.recording.liveUnavailable
  // 구간마다 다시 시도하므로 같은 실패가 계속 쌓이지 않게 녹음마다 한 번만 남긴다
  if (hasWarned) return
  hasWarned = true
  warn(`라이브 받아쓰기 실패: ${messageOf(caught)}`)
}

/** 한 번에 하나만 돈다. 끝나면 그동안 쌓인 청크로 바로 다음 실행을 살핀다 */
const runNext = () => {
  if (!isEnabled || isRunning) return

  const plan = planLiveRun(pending)
  if (!plan.shouldRun) return

  const runGeneration = generation
  const samples = liveSamplesOf(pending.chunks.slice(0, plan.chunkCount))
  pending = markLiveRunStarted(pending)
  isRunning = true

  transcribe(samples)
    .then((text) => {
      if (runGeneration === generation) applyResult({ text, ...plan })
    })
    .catch((caught: unknown) => {
      if (runGeneration === generation) handleFailure(caught)
    })
    .finally(() => {
      isRunning = false
      runNext()
    })
}

/** 녹음 세션이 청크를 받을 때마다 부른다. 보기가 꺼져 있으면 아무것도 하지 않는다 */
export const feedLiveTranscript = ({ samples, rms }: { samples: Float32Array; rms: number }) => {
  if (!isEnabled) return

  pending = pushLiveChunk({ window: pending, samples, rms })
  runNext()
}

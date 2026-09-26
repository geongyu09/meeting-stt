import { existsSync } from 'node:fs'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { app } from 'electron'
import { gainDbFor } from '@meeting-stt/core/normalize'
import { SAMPLE_RATE_HZ } from '@shared/audio'
import type { LiveTranscriptLine, LiveTranscriptState } from '@shared/ipc'
import { whisperBinPath } from '../bin/paths'
import { runBinary } from '../bin/spawn'
import { threadPlan } from '../bin/threads'
import { t } from '../locale'
import { messageOf, warn } from '../log'
import { liveWhisperModelPath, modelPath } from '../models/paths'
import { applyGain, measureSpeechRmsDb } from '../pipeline/normalize'
import {
  dropLiveChunks,
  EMPTY_LIVE_WINDOW,
  liveSamplesOf,
  liveTextOf,
  markLiveRunStarted,
  planLiveRun,
  pushLiveChunk
} from './liveWindow'
import { buildWavHeader, float32ToInt16 } from './wavWriter'

/**
 * 녹음 화면의 라이브 받아쓰기. 녹음 세션이 넘기는 청크를 짧은 구간으로 모아 whisper-cli를 다시 돌린다.
 * 결과는 저장하지 않는 미리보기이고 회의록은 정지 후 파이프라인이 만든다
 * (references/architecture.md "라이브 받아쓰기").
 */

/** 이벤트에 싣는 확정 문장 수. 화면은 최근 것만 보면 된다 */
const LIVE_MAX_LINES = 50
const LIVE_LANGUAGE = 'ko'
/** 파이프라인과 같은 이유로 이전 창의 출력을 문맥으로 넘기지 않는다 (whisper.ts) */
const LIVE_MAX_CONTEXT_TOKENS = 0
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

/** 파이프라인과 같은 RMS 게인 정규화 — 원거리 마이크에서 whisper가 말을 놓치는 문제는 라이브에도 있다 */
const buildNormalizedWav = (samples: Float32Array) => {
  const raw = float32ToInt16(samples)
  const pcm = new Int16Array(raw.buffer, raw.byteOffset, raw.length / Int16Array.BYTES_PER_ELEMENT)
  const gainDb = gainDbFor(measureSpeechRmsDb({ pcm, sampleRate: SAMPLE_RATE_HZ }))
  const { pcm: normalized } = applyGain({ pcm, gainDb })
  const body = Buffer.from(normalized.buffer, normalized.byteOffset, normalized.byteLength)

  return Buffer.concat([buildWavHeader({ dataBytes: body.length }), body])
}

const transcribe = async (samples: Float32Array) => {
  const whisperModel = liveWhisperModelPath()
  const vadModel = modelPath('vad')
  if (![whisperBinPath(), whisperModel, vadModel].every((file) => existsSync(file))) {
    throw new Error(t().main.recording.liveUnavailable)
  }

  const dir = liveDir()
  const audioPath = path.join(dir, `${LIVE_FILE_BASE}.wav`)
  const outputBase = path.join(dir, LIVE_FILE_BASE)
  const { stt } = await threadPlan()

  await mkdir(dir, { recursive: true })
  await writeFile(audioPath, buildNormalizedWav(samples))

  try {
    await runBinary({
      command: whisperBinPath(),
      args: [
        ...['-m', whisperModel, '-f', audioPath, '-l', LIVE_LANGUAGE, '-t', String(stt)],
        ...['-mc', String(LIVE_MAX_CONTEXT_TOKENS), '-nt', '-np'],
        ...['--vad', '--vad-model', vadModel, '-otxt', '-of', outputBase]
      ]
    })
    // stdout은 청크 경계에서 한글 바이트가 잘릴 수 있어 결과 파일을 UTF-8로 읽는다
    return liveTextOf(await readFile(`${outputBase}.txt`, 'utf-8'))
  } finally {
    await Promise.all([rm(audioPath, { force: true }), rm(`${outputBase}.txt`, { force: true })])
  }
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

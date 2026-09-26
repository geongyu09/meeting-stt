import { SAMPLE_RATE_HZ } from '@shared/audio'

/**
 * 라이브 받아쓰기의 구간 나누기. 청크(약 0.5초)를 "현재 구간"에 쌓고, 언제 whisper를 다시 돌리고
 * 언제 결과를 확정할지 정한다. 실행(spawn)은 `liveTranscript.ts`가 한다
 * (references/architecture.md "라이브 받아쓰기").
 */

/** 직전 실행 이후 새 오디오가 이만큼 쌓여야 다시 인식한다 */
export const LIVE_STEP_SEC = 1.5
/** 구간이 이 길이에 닿으면 말이 이어져도 확정한다 */
export const LIVE_MAX_WINDOW_SEC = 12
/** 구간 끝이 이만큼 조용하면 말이 끝난 것으로 보고 확정한다 */
export const LIVE_COMMIT_SILENCE_SEC = 1
/** 청크 RMS가 소음 바닥의 이 배수(+9.5 dB)를 넘으면 말소리로 본다 */
export const LIVE_SPEECH_RATIO = 3
/** 소음 바닥을 재는 최근 청크 수. 청크 0.5초 기준 약 20초 */
export const LIVE_NOISE_HISTORY_CHUNKS = 40
/** 디지털 무음(0)이 바닥이 되면 작은 잡음까지 말소리로 잡힌다 */
export const LIVE_MIN_NOISE_FLOOR_RMS = 0.0005
/**
 * 이 RMS(-34 dBFS) 이상이면 소음 바닥과 무관하게 말소리로 본다. 녹음 시작부터 쉬지 않고 말하면
 * 조용한 청크가 아직 없어 바닥이 말소리 크기로 잡히기 때문이다
 */
export const LIVE_LOUD_RMS = 0.02

export interface LiveChunk {
  samples: Float32Array
  rms: number
  isSpeech: boolean
}

export interface LiveWindow {
  /** 마지막 확정 이후의 오디오 */
  chunks: LiveChunk[]
  /** 소음 바닥 계산용 최근 청크 RMS. 확정해도 비우지 않는다 */
  recentRms: number[]
  /** 직전 실행을 시작한 뒤 쌓인 초 */
  sinceRunSec: number
}

export const EMPTY_LIVE_WINDOW: LiveWindow = { chunks: [], recentRms: [], sinceRunSec: 0 }

const secondsOf = (sampleCount: number) => sampleCount / SAMPLE_RATE_HZ

const chunksSecOf = (chunks: LiveChunk[]) =>
  secondsOf(chunks.reduce((total, chunk) => total + chunk.samples.length, 0))

export const noiseFloorOf = (recentRms: number[]) =>
  Math.max(LIVE_MIN_NOISE_FLOOR_RMS, recentRms.length ? Math.min(...recentRms) : 0)

interface PushLiveChunkParams {
  window: LiveWindow
  samples: Float32Array
  rms: number
}

/**
 * 청크를 구간에 더한다. 말소리가 하나도 없는 구간은 마지막 청크만 남기고 버린다 —
 * 조용한 동안 구간이 자라지도, whisper를 부르지도 않게 한다.
 */
export const pushLiveChunk = ({ window, samples, rms }: PushLiveChunkParams) => {
  const recentRms = [...window.recentRms, rms].slice(-LIVE_NOISE_HISTORY_CHUNKS)
  const isSpeech = rms >= LIVE_LOUD_RMS || rms > noiseFloorOf(recentRms) * LIVE_SPEECH_RATIO
  const chunks = [...window.chunks, { samples, rms, isSpeech }]
  const hasSpeech = chunks.some((chunk) => chunk.isSpeech)

  return {
    chunks: hasSpeech ? chunks : chunks.slice(-1),
    recentRms,
    sinceRunSec: window.sinceRunSec + secondsOf(samples.length)
  }
}

const trailingSilenceSecOf = (chunks: LiveChunk[]) => {
  const lastSpeechIndex = chunks.findLastIndex((chunk) => chunk.isSpeech)

  return chunksSecOf(chunks.slice(lastSpeechIndex + 1))
}

export interface LiveRunPlan {
  shouldRun: boolean
  /** 인식에 넣을 앞쪽 청크 수. 확정하면 이만큼만 구간에서 뺀다 */
  chunkCount: number
  /** 이번 결과를 확정 문장으로 올릴지 */
  isFinal: boolean
}

/** 지금 구간으로 인식을 돌릴지, 돌린다면 결과를 확정할지 정한다 */
export const planLiveRun = (window: LiveWindow): LiveRunPlan => {
  const { chunks } = window
  const hasSpeech = chunks.some((chunk) => chunk.isSpeech)
  const isFinal =
    chunksSecOf(chunks) >= LIVE_MAX_WINDOW_SEC ||
    trailingSilenceSecOf(chunks) >= LIVE_COMMIT_SILENCE_SEC

  return {
    shouldRun: hasSpeech && (isFinal || window.sinceRunSec >= LIVE_STEP_SEC),
    chunkCount: chunks.length,
    isFinal
  }
}

export const markLiveRunStarted = (window: LiveWindow) => ({ ...window, sinceRunSec: 0 })

/** 확정된 앞쪽 청크를 뺀다. 인식하는 동안 들어온 뒤쪽 청크는 다음 구간 앞에 남는다 */
export const dropLiveChunks = ({ window, count }: { window: LiveWindow; count: number }) => ({
  ...window,
  chunks: window.chunks.slice(count)
})

export const liveSamplesOf = (chunks: LiveChunk[]) => {
  const samples = new Float32Array(chunks.reduce((total, chunk) => total + chunk.samples.length, 0))
  chunks.reduce((offset, chunk) => {
    samples.set(chunk.samples, offset)

    return offset + chunk.samples.length
  }, 0)

  return samples
}

/** whisper `-otxt` 결과를 한 줄로. 세그먼트마다 줄이 바뀌고 앞에 공백이 붙는다 */
export const liveTextOf = (raw: string) =>
  raw
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .join(' ')

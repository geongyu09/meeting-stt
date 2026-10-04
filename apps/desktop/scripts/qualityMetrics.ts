// 녹음 품질 지표 (docs/recording-quality-results.md). 측정 스크립트 전용이고,
// 제품에 쓰기로 한 지표만 나중에 packages/core로 올린다.
import { frameSamplesOf, toDb } from '@meeting-stt/core/normalize'

const INT16_MAX = 32767
/** 음량 정규화와 같은 분위수 — 프레임 RMS의 상위 10% 지점을 발화 음량으로 본다 */
const SPEECH_PERCENTILE = 0.9
/** 프레임 RMS의 하위 10% 지점을 바닥 잡음으로 본다 */
const NOISE_PERCENTILE = 0.1
/** 16bit가 표현하는 가장 작은 음량. 디지털 무음(-Infinity)을 표에 적을 수 있게 여기서 자른다 */
const DB_FLOOR = -96
/** 이 값 이상이면 잘린 샘플로 본다 (풀스케일 바로 아래) */
const CLIP_LEVEL = 32700
/** 이보다 작은 프레임은 소리가 사실상 없는 것으로 센다 */
const SILENT_FRAME_DB = -70

interface PcmParams {
  pcm: Int16Array
  sampleRate: number
}

/** 50ms 프레임마다의 RMS(풀스케일 1 기준). 정규화와 같은 프레임 길이를 쓴다 */
export const frameRmsOf = ({ pcm, sampleRate }: PcmParams) => {
  const frameSamples = frameSamplesOf({ sampleRate })
  const frames = new Float32Array(Math.floor(pcm.length / frameSamples))

  for (let frame = 0; frame < frames.length; frame += 1) {
    let sumSquares = 0
    const start = frame * frameSamples
    for (let i = start; i < start + frameSamples; i += 1) {
      const sample = pcm[i] / INT16_MAX
      sumSquares += sample * sample
    }
    frames[frame] = Math.sqrt(sumSquares / frameSamples)
  }

  return frames
}

/** 분위수 지점의 값을 dBFS로. 프레임이 없으면 NaN */
export const percentileDbOf = ({ frames, ratio }: { frames: Float32Array; ratio: number }) => {
  if (frames.length === 0) return NaN

  const sorted = Float32Array.from(frames).sort()
  const index = Math.min(sorted.length - 1, Math.floor(sorted.length * ratio))

  return Math.max(DB_FLOOR, toDb(sorted[index]))
}

export const speechDbOf = (frames: Float32Array) =>
  percentileDbOf({ frames, ratio: SPEECH_PERCENTILE })

export const noiseDbOf = (frames: Float32Array) =>
  percentileDbOf({ frames, ratio: NOISE_PERCENTILE })

const clipRatioOf = (pcm: Int16Array) => {
  let clipped = 0
  for (const sample of pcm) {
    if (sample >= CLIP_LEVEL || sample <= -CLIP_LEVEL) clipped += 1
  }
  return pcm.length === 0 ? 0 : clipped / pcm.length
}

export interface QualityMetrics {
  durationSec: number
  speechDb: number
  noiseDb: number
  /** 발화 음량 − 바닥 잡음. 진짜 신호 대 잡음비가 아니라 음량 분포의 폭이다 */
  snrDb: number
  clipRatio: number
  silentRatio: number
}

export const measureQuality = ({ pcm, sampleRate }: PcmParams): QualityMetrics => {
  const frames = frameRmsOf({ pcm, sampleRate })
  const speechDb = speechDbOf(frames)
  const noiseDb = noiseDbOf(frames)
  const silentFrames = frames.filter((rms) => toDb(rms) < SILENT_FRAME_DB).length

  return {
    durationSec: pcm.length / sampleRate,
    speechDb,
    noiseDb,
    snrDb: speechDb - noiseDb,
    clipRatio: clipRatioOf(pcm),
    silentRatio: frames.length === 0 ? 0 : silentFrames / frames.length
  }
}

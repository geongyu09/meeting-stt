/**
 * STT 전에 음량을 맞추는 RMS 게인 정규화.
 * `main`의 `src/main/pipeline/normalize.ts`를 이식했다. 원본은 16bit PCM WAV 버퍼를 읽고 썼지만,
 * 브라우저에서는 이미 디코딩된 `Float32Array`를 다루므로 WAV 파싱 부분을 통째로 뺐다.
 * 상수는 그대로 둬서 데스크탑과 같은 dBFS·게인 값이 나오게 한다 (docs/phase1-results.md).
 */

const FRAME_MS = 50
/** 프레임 RMS 분포에서 이 분위수를 "발화 음량"으로 본다 (무음·잡음 프레임을 배제) */
const SPEECH_RMS_PERCENTILE = 0.9
const TARGET_SPEECH_RMS_DBFS = -20
/** 게인 상한. 이보다 작은 소리는 잡음이 함께 커질 뿐이라 의미가 없다 */
const MAX_GAIN_DB = 30
const MS_PER_SEC = 1000
const FULL_SCALE = 1

const toDb = (linear: number) => 20 * Math.log10(linear)

interface MeasureSpeechRmsDbParams {
  samples: Float32Array
  sampleRate: number
}

/** 발화 구간의 대표 음량(dBFS). 무음뿐이면 -Infinity */
export const measureSpeechRmsDb = ({ samples, sampleRate }: MeasureSpeechRmsDbParams) => {
  const frameSamples = Math.max(1, Math.round((sampleRate * FRAME_MS) / MS_PER_SEC))
  const frameRms: number[] = []

  for (let start = 0; start + frameSamples <= samples.length; start += frameSamples) {
    let sumSquares = 0
    for (let i = start; i < start + frameSamples; i += 1) {
      sumSquares += samples[i] * samples[i]
    }
    frameRms.push(Math.sqrt(sumSquares / frameSamples))
  }
  if (frameRms.length === 0) return -Infinity

  const sorted = frameRms.toSorted((a, b) => a - b)
  const index = Math.min(sorted.length - 1, Math.floor(sorted.length * SPEECH_RMS_PERCENTILE))
  return toDb(sorted[index])
}

/** 발화 음량을 목표치로 올리는(또는 내리는) 게인. 무음이면 0 */
export const gainDbFor = (speechRmsDb: number) =>
  Number.isFinite(speechRmsDb) ? Math.min(TARGET_SPEECH_RMS_DBFS - speechRmsDb, MAX_GAIN_DB) : 0

/**
 * 게인을 **제자리에서** 적용하고 ±1을 넘는 샘플은 하드 클립한다.
 * 71분 16kHz면 배열 하나가 273MB라 복사본을 만들면 피크 메모리가 두 배가 된다.
 */
export const applyGainInPlace = ({
  samples,
  gainDb
}: {
  samples: Float32Array
  gainDb: number
}) => {
  const gain = 10 ** (gainDb / 20)
  let clippedCount = 0

  for (let i = 0; i < samples.length; i += 1) {
    const scaled = samples[i] * gain
    if (scaled > FULL_SCALE || scaled < -FULL_SCALE) clippedCount += 1
    samples[i] = Math.max(-FULL_SCALE, Math.min(FULL_SCALE, scaled))
  }

  return clippedCount
}

export interface NormalizeResult {
  speechRmsDb: number
  gainDb: number
  clippedRatio: number
  normalizedSpeechRmsDb: number
}

/** 샘플 배열을 제자리에서 정규화하고 측정값을 돌려준다 */
export const normalizeSamples = ({ samples, sampleRate }: MeasureSpeechRmsDbParams) => {
  const speechRmsDb = measureSpeechRmsDb({ samples, sampleRate })
  const gainDb = gainDbFor(speechRmsDb)
  const clippedCount = applyGainInPlace({ samples, gainDb })

  const result: NormalizeResult = {
    speechRmsDb,
    gainDb,
    clippedRatio: samples.length === 0 ? 0 : clippedCount / samples.length,
    normalizedSpeechRmsDb: measureSpeechRmsDb({ samples, sampleRate })
  }

  return result
}

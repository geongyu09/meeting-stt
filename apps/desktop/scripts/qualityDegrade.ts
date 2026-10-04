// 녹음을 일부러 나쁘게 만드는 변환 (docs/recording-quality-results.md 2절).
// 같은 발췌본에 조건 하나씩만 바꿔서 CER이 어디서부터 무너지는지 본다. 결과가 재현되도록 난수는 시드를 고정한다.
import { gainOf } from '@meeting-stt/core/normalize'

const INT16_MAX = 32767
const UINT32_RANGE = 4294967296

const clampInt16 = (value: number) => Math.max(-INT16_MAX, Math.min(INT16_MAX, Math.round(value)))

/** mulberry32. 시드가 같으면 같은 수열 */
const createRandom = (seed: number) => {
  let state = seed >>> 0

  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let mixed = state
    mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1)
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61)
    return ((mixed ^ (mixed >>> 14)) >>> 0) / UINT32_RANGE
  }
}

/** 게인만 바꾼다. 줄이면 16bit 양자화 손실이 생기고, 키우면 풀스케일을 넘는 샘플이 잘린다 */
export const applyGainDb = ({ pcm, gainDb }: { pcm: Int16Array; gainDb: number }) => {
  const gain = gainOf(gainDb)
  return Int16Array.from(pcm, (sample) => clampInt16(sample * gain))
}

// Paul Kellet의 핑크 잡음 필터 계수. 백색 잡음을 1차 필터 여섯 개에 통과시켜 더하면 -3dB/옥타브가 된다
const PINK_POLES = [0.99886, 0.99332, 0.969, 0.8665, 0.55, -0.7616]
const PINK_GAINS = [0.0555179, 0.0750759, 0.153852, 0.3104856, 0.5329522, -0.016898]
const PINK_DIRECT_GAIN = 0.5362
const PINK_DELAYED_GAIN = 0.115926

/** 회의실 바닥 잡음(공조·팬)에 가까운 핑크 잡음. 크기는 `mixNoise`가 맞춘다 */
export const pinkNoise = ({ length, seed }: { length: number; seed: number }) => {
  const random = createRandom(seed)
  const states = PINK_POLES.map(() => 0)
  const noise = new Float32Array(length)
  let delayed = 0

  for (let i = 0; i < length; i += 1) {
    const white = random() * 2 - 1
    let sum = delayed + white * PINK_DIRECT_GAIN
    for (let k = 0; k < states.length; k += 1) {
      states[k] = PINK_POLES[k] * states[k] + white * PINK_GAINS[k]
      sum += states[k]
    }
    delayed = white * PINK_DELAYED_GAIN
    noise[i] = sum
  }

  return noise
}

const rmsOf = (samples: Float32Array) => {
  let sumSquares = 0
  for (const sample of samples) sumSquares += sample * sample
  return samples.length === 0 ? 0 : Math.sqrt(sumSquares / samples.length)
}

/** 여러 소리를 길이에 맞춰 반복하며 같은 크기로 더한다 (여러 사람이 동시에 떠드는 배경 소리) */
export const babbleOf = ({ sources, length }: { sources: Int16Array[]; length: number }) => {
  const babble = new Float32Array(length)

  for (const source of sources) {
    const scale = 1 / (rmsOf(Float32Array.from(source)) || 1)
    for (let i = 0; i < length; i += 1) babble[i] += source[i % source.length] * scale
  }

  return babble
}

interface MixNoiseParams {
  pcm: Int16Array
  noise: Float32Array
  /** 원본의 발화 음량(dBFS). 잡음 크기를 이 값 기준으로 정한다 */
  speechDb: number
  /** 발화 음량 − 잡음 RMS */
  snrDb: number
}

/** 잡음을 `발화 음량 − snrDb` 크기로 맞춰 더한다 */
export const mixNoise = ({ pcm, noise, speechDb, snrDb }: MixNoiseParams) => {
  const targetRms = gainOf(speechDb - snrDb) * INT16_MAX
  const scale = targetRms / (rmsOf(noise) || 1)

  return Int16Array.from(pcm, (sample, i) => clampInt16(sample + noise[i % noise.length] * scale))
}

const LOWPASS_TAPS = 127

/** 해밍 창을 씌운 sinc 저역 통과 필터 계수 */
const lowpassKernel = ({ cutoffHz, sampleRate }: { cutoffHz: number; sampleRate: number }) => {
  const center = (LOWPASS_TAPS - 1) / 2
  const normalized = (2 * cutoffHz) / sampleRate
  const kernel = Float32Array.from({ length: LOWPASS_TAPS }, (_, i) => {
    const x = i - center
    const sinc = x === 0 ? normalized : Math.sin(Math.PI * normalized * x) / (Math.PI * x)
    return sinc * (0.54 - 0.46 * Math.cos((2 * Math.PI * i) / (LOWPASS_TAPS - 1)))
  })
  const sum = kernel.reduce((acc, value) => acc + value, 0)

  return kernel.map((value) => value / sum)
}

interface LowpassParams {
  pcm: Int16Array
  cutoffHz: number
  sampleRate: number
}

/** 차단 주파수 위를 잘라 낸다. 블루투스 통화 모드 마이크(8kHz 표본화)의 좁은 대역을 흉내 낸다 */
export const lowpass = ({ pcm, cutoffHz, sampleRate }: LowpassParams) => {
  const kernel = lowpassKernel({ cutoffHz, sampleRate })
  const center = (LOWPASS_TAPS - 1) / 2
  const output = new Int16Array(pcm.length)

  for (let i = 0; i < pcm.length; i += 1) {
    let sum = 0
    for (let k = 0; k < LOWPASS_TAPS; k += 1) {
      const index = i + k - center
      if (index >= 0 && index < pcm.length) sum += pcm[index] * kernel[k]
    }
    output[i] = clampInt16(sum)
  }

  return output
}

// 화자 ID가 있는 낭독 음성(Zeroth-Korean)을 이어 붙여 정답이 정확한 모의 회의를 만든다 (docs/diarization-experiments.md 3-1절 D3s·D4s).
// 먼저 scripts/research/zerothExtract.py로 화자별 WAV와 색인을 뽑아 둔다.
// 사용: pnpm --filter meeting-stt exec tsx scripts/diarExpSimulate.ts [--only=sim-2a,onl-3s]
// 출력: scripts/fixtures/datasets/sim/<id>.wav, <id>.rttm, 온라인 조건은 <id>.mic.wav · <id>.system.wav
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

import { readWavPcm } from '../src/main/pipeline/normalize'
import { formatRttm, type ReferenceTurn } from './diarScore'
import { fail, info } from './log'
import { FIXTURES_DIR } from './paths'
import { SAMPLE_RATE_HZ, buildWavHeader } from './wav'

const ZEROTH_DIR = path.join(FIXTURES_DIR, 'datasets', 'zeroth')
export const SIM_DIR = path.join(FIXTURES_DIR, 'datasets', 'sim')

const INT16_MAX = 32767
const SEC_PER_MIN = 60
const UINT32_RANGE = 4294967296

/** 발화 음량을 이 값으로 맞춘 뒤 화자별 차이를 준다. 겹쳐도 클리핑하지 않을 만큼 낮다 */
const UTTERANCE_TARGET_RMS_DB = -26
const SPEAKER_GAIN_RANGE_DB = 6
const NOISE_FLOOR_DB = -50

const SENTENCES_PER_TURN = { min: 1, max: 3 }
const TURN_GAP_SEC = { min: 0.15, max: 0.8 }
const SENTENCE_GAP_SEC = { min: 0.1, max: 0.35 }
const OVERLAP_PROBABILITY = 0.1
const OVERLAP_MAX_SEC = 0.6
const BACKCHANNEL_PROBABILITY = 0.08
const BACKCHANNEL_SEC = { min: 0.4, max: 1.0 }
const FADE_SEC = 0.03

/** 발화 앞뒤 무음을 잘라 정답 경계를 실제 소리에 맞춘다 */
const TRIM_FRAME_SEC = 0.02
const TRIM_RELATIVE_THRESHOLD = 0.05
const TRIM_PAD_SEC = 0.04

/** 원격 참석자의 통화 음질 흉내 (저역 통과) */
const REMOTE_CUTOFF_HZ = 3800
const LOWPASS_TAPS = 101
/** 스피커로 들을 때 원격 소리가 마이크로 되돌아오는 경로: 감쇠 + 지연 + 짧은 잔향 */
const ECHO_GAIN_DB = -12
const ECHO_DELAY_SEC = 0.06
const ECHO_REFLECTIONS = [
  { delaySec: 0.011, gain: 0.5 },
  { delaySec: 0.023, gain: 0.3 },
  { delaySec: 0.041, gain: 0.18 }
]

type OnlineMode = 'headset' | 'speaker'

interface SimSpec {
  id: string
  minutes: number
  /** Zeroth speaker_id. 온라인 조건은 첫 화자가 로컬 마이크, 나머지가 원격이다 */
  speakers: number[]
  /** 다음 화자를 고를 때의 가중치 (없으면 균등). 발화 시간 비율과 거의 같다 */
  weights?: number[]
  /** 화자별 한 턴 문장 수 배율. 연속으로 같은 화자를 고르지 않으므로 발화 비율을 치우치게 하려면 턴을 길게 한다 */
  sentenceScales?: number[]
  online?: OnlineMode
  seed: number
}

export const SIM_SPECS: SimSpec[] = [
  { id: 'sim-2a', minutes: 10, speakers: [118, 104], seed: 2001 },
  { id: 'sim-3a', minutes: 15, speakers: [121, 147, 105], seed: 3001 },
  {
    id: 'sim-3b',
    minutes: 15,
    speakers: [118, 126, 132],
    weights: [0.6, 0.2, 0.2],
    sentenceScales: [2, 1, 1],
    seed: 3002
  },
  { id: 'sim-5a', minutes: 20, speakers: [201, 204, 214, 191, 187], seed: 5001 },
  // onl-3h와 onl-3s는 시드·화자가 같아 내용이 똑같고 되울림만 다르다
  { id: 'onl-3h', minutes: 15, speakers: [192, 207, 135], online: 'headset', seed: 6001 },
  { id: 'onl-3s', minutes: 15, speakers: [192, 207, 135], online: 'speaker', seed: 6001 },
  { id: 'onl-4s', minutes: 15, speakers: [125, 160, 153, 130], online: 'speaker', seed: 6002 }
]

interface IndexEntry {
  id: string
  speaker: number
  sec: number
}

/** mulberry32 */
const createRandom = (seed: number) => {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / UINT32_RANGE
  }
}

const between = ({ random, min, max }: { random: () => number; min: number; max: number }) =>
  min + random() * (max - min)

const dbToGain = (db: number) => 10 ** (db / 20)

const rmsOf = (samples: Float32Array) => {
  let sumSquares = 0
  for (let i = 0; i < samples.length; i += 1) sumSquares += samples[i] * samples[i]
  return Math.sqrt(sumSquares / Math.max(1, samples.length))
}

/** 앞뒤 무음을 잘라 내고 목표 음량으로 맞춘 발화 */
const loadUtterance = async (entry: IndexEntry) => {
  const { pcm } = readWavPcm(
    await readFile(path.join(ZEROTH_DIR, 'wav', String(entry.speaker), `${entry.id}.wav`))
  )
  const frame = Math.round(TRIM_FRAME_SEC * SAMPLE_RATE_HZ)
  const frameRms: number[] = []
  for (let start = 0; start + frame <= pcm.length; start += frame) {
    let sumSquares = 0
    for (let i = start; i < start + frame; i += 1) sumSquares += pcm[i] * pcm[i]
    frameRms.push(Math.sqrt(sumSquares / frame))
  }
  const threshold = Math.max(...frameRms) * TRIM_RELATIVE_THRESHOLD
  const first = frameRms.findIndex((value) => value > threshold)
  const last = frameRms.findLastIndex((value) => value > threshold)
  const pad = Math.round(TRIM_PAD_SEC * SAMPLE_RATE_HZ)
  const from = Math.max(0, first * frame - pad)
  const to = Math.min(pcm.length, (last + 1) * frame + pad)

  const samples = Float32Array.from(pcm.subarray(from, to), (value) => value / INT16_MAX)
  const gain = dbToGain(UTTERANCE_TARGET_RMS_DB) / Math.max(1e-6, rmsOf(samples))
  return samples.map((value) => value * gain)
}

const applyFade = (samples: Float32Array) => {
  const fade = Math.min(Math.round(FADE_SEC * SAMPLE_RATE_HZ), samples.length >> 1)
  const output = Float32Array.from(samples)
  for (let i = 0; i < fade; i += 1) {
    output[i] *= i / fade
    output[output.length - 1 - i] *= i / fade
  }
  return output
}

/** 해밍 창 sinc 저역 통과 */
const lowpass = (samples: Float32Array) => {
  const half = (LOWPASS_TAPS - 1) / 2
  const normalizedCutoff = REMOTE_CUTOFF_HZ / SAMPLE_RATE_HZ
  const taps = Float32Array.from({ length: LOWPASS_TAPS }, (_, n) => {
    const k = n - half
    const sinc =
      k === 0 ? 2 * normalizedCutoff : Math.sin(2 * Math.PI * normalizedCutoff * k) / (Math.PI * k)
    return sinc * (0.54 - 0.46 * Math.cos((2 * Math.PI * n) / (LOWPASS_TAPS - 1)))
  })
  const output = new Float32Array(samples.length)
  for (let i = 0; i < samples.length; i += 1) {
    let sum = 0
    for (let n = 0; n < LOWPASS_TAPS; n += 1) {
      const index = i + half - n
      if (index >= 0 && index < samples.length) sum += samples[index] * taps[n]
    }
    output[i] = sum
  }
  return output
}

const addInto = ({
  track,
  samples,
  offset,
  gain = 1
}: {
  track: Float32Array
  samples: Float32Array
  offset: number
  gain?: number
}) => {
  for (let i = 0; i < samples.length && offset + i < track.length; i += 1) {
    if (offset + i >= 0) track[offset + i] += samples[i] * gain
  }
}

/** 원격 트랙이 스피커 → 방 → 마이크로 되돌아온 소리 */
const echoOf = (system: Float32Array) => {
  const echo = new Float32Array(system.length)
  const base = dbToGain(ECHO_GAIN_DB)
  const paths = [{ delaySec: 0, gain: 1 }, ...ECHO_REFLECTIONS]
  for (const { delaySec, gain } of paths) {
    addInto({
      track: echo,
      samples: system,
      offset: Math.round((ECHO_DELAY_SEC + delaySec) * SAMPLE_RATE_HZ),
      gain: base * gain
    })
  }
  return echo
}

const gaussian = (random: () => number) =>
  Math.sqrt(-2 * Math.log(Math.max(1e-12, random()))) * Math.cos(2 * Math.PI * random())

const writeTrack = async ({ filePath, track }: { filePath: string; track: Float32Array }) => {
  const pcm = Buffer.alloc(track.length * 2)
  for (let i = 0; i < track.length; i += 1) {
    pcm.writeInt16LE(
      Math.max(-INT16_MAX, Math.min(INT16_MAX, Math.round(track[i] * INT16_MAX))),
      i * 2
    )
  }
  await writeFile(filePath, Buffer.concat([buildWavHeader({ dataBytes: pcm.length }), pcm]))
}

const pickWeighted = ({
  random,
  weights,
  excluded
}: {
  random: () => number
  weights: number[]
  excluded: number
}) => {
  const candidates = weights.map((weight, index) => (index === excluded ? 0 : weight))
  let threshold = random() * candidates.reduce((sum, weight) => sum + weight, 0)
  const picked = candidates.findIndex((weight) => {
    threshold -= weight
    return weight > 0 && threshold <= 0
  })
  return picked === -1 ? candidates.findLastIndex((weight) => weight > 0) : picked
}

interface BuildState {
  spec: SimSpec
  random: () => number
  /** 화자별 남은 발화 (앞에서부터 쓴다) */
  queues: IndexEntry[][]
  speakerGains: number[]
  /** 화자별 트랙. 온라인 조건에서 마이크·시스템을 가르기 위해 따로 둔다 */
  tracks: Float32Array[]
  turns: ReferenceTurn[]
}

const nextUtterance = async ({ state, speaker }: { state: BuildState; speaker: number }) => {
  const queue = state.queues[speaker]
  const entry = queue.shift()
  if (!entry)
    return fail(`${state.spec.id}: 화자 ${state.spec.speakers[speaker]}의 발화가 모자랍니다`)
  return loadUtterance(entry)
}

const place = ({
  state,
  speaker,
  samples,
  startSec
}: {
  state: BuildState
  speaker: number
  samples: Float32Array
  startSec: number
}) => {
  addInto({
    track: state.tracks[speaker],
    samples: applyFade(samples),
    offset: Math.round(startSec * SAMPLE_RATE_HZ),
    gain: state.speakerGains[speaker]
  })
  const endSec = startSec + samples.length / SAMPLE_RATE_HZ
  state.turns.push({ speaker: `spk${state.spec.speakers[speaker]}`, start: startSec, end: endSec })
  return endSec
}

/** 한 턴(1~3문장)을 놓고 끝 시각을 돌려준다. 가끔 다른 화자의 짧은 맞장구를 겹친다 */
const placeTurn = async ({
  state,
  speaker,
  startSec
}: {
  state: BuildState
  speaker: number
  startSec: number
}) => {
  const { random } = state
  const sentences = Math.round(
    between({ random, ...SENTENCES_PER_TURN }) * (state.spec.sentenceScales?.[speaker] ?? 1)
  )
  let cursor = startSec
  for (let i = 0; i < sentences; i += 1) {
    if (i > 0) cursor += between({ random, ...SENTENCE_GAP_SEC })
    cursor = place({
      state,
      speaker,
      samples: await nextUtterance({ state, speaker }),
      startSec: cursor
    })
  }

  if (random() < BACKCHANNEL_PROBABILITY && cursor - startSec > BACKCHANNEL_SEC.max * 2) {
    const other = pickWeighted({
      random,
      weights: state.spec.speakers.map(() => 1),
      excluded: speaker
    })
    const length = Math.round(between({ random, ...BACKCHANNEL_SEC }) * SAMPLE_RATE_HZ)
    const snippet = (await nextUtterance({ state, speaker: other })).subarray(0, length)
    const at = between({ random, min: startSec + 0.5, max: cursor - BACKCHANNEL_SEC.max })
    place({ state, speaker: other, samples: snippet, startSec: at })
  }
  return cursor
}

const mergeAdjacentTurns = (turns: ReferenceTurn[]) =>
  turns
    .toSorted((a, b) => a.start - b.start)
    .map((turn) => ({
      ...turn,
      start: Math.max(0, turn.start + TRIM_PAD_SEC),
      end: turn.end - TRIM_PAD_SEC
    }))

const buildMeeting = async ({ spec, index }: { spec: SimSpec; index: IndexEntry[] }) => {
  const random = createRandom(spec.seed)
  const totalSamples = spec.minutes * SEC_PER_MIN * SAMPLE_RATE_HZ
  const state: BuildState = {
    spec,
    random,
    queues: spec.speakers.map((speaker) => index.filter((entry) => entry.speaker === speaker)),
    speakerGains: spec.speakers.map(() =>
      dbToGain(between({ random, min: -SPEAKER_GAIN_RANGE_DB, max: SPEAKER_GAIN_RANGE_DB }))
    ),
    tracks: spec.speakers.map(() => new Float32Array(totalSamples)),
    turns: []
  }
  const weights = spec.weights ?? spec.speakers.map(() => 1)

  let speaker = pickWeighted({ random, weights, excluded: -1 })
  let cursor = 0.5
  const lastStartSec = spec.minutes * SEC_PER_MIN - 30
  while (cursor < lastStartSec) {
    const endSec = await placeTurn({ state, speaker, startSec: cursor })
    const isOverlapped = random() < OVERLAP_PROBABILITY
    cursor = isOverlapped
      ? Math.max(cursor + 0.5, endSec - between({ random, min: 0.1, max: OVERLAP_MAX_SEC }))
      : endSec + between({ random, ...TURN_GAP_SEC })
    speaker = pickWeighted({ random, weights, excluded: speaker })
  }

  return { state, random }
}

const sumTracks = (tracks: Float32Array[], length: number) => {
  const sum = new Float32Array(length)
  for (const track of tracks) addInto({ track: sum, samples: track, offset: 0 })
  return sum
}

const writeMeeting = async ({ spec, index }: { spec: SimSpec; index: IndexEntry[] }) => {
  const { state, random } = await buildMeeting({ spec, index })
  const length = state.tracks[0].length
  const noise = Float32Array.from({ length }, () => gaussian(random) * dbToGain(NOISE_FLOOR_DB))
  const stem = path.join(SIM_DIR, spec.id)

  if (spec.online) {
    const system = sumTracks(state.tracks.slice(1).map(lowpass), length)
    const mic = sumTracks(
      [state.tracks[0], noise, ...(spec.online === 'speaker' ? [echoOf(system)] : [])],
      length
    )
    await writeTrack({ filePath: `${stem}.mic.wav`, track: mic })
    await writeTrack({ filePath: `${stem}.system.wav`, track: system })
    // 앱의 mixSamples와 같이 두 소리를 그대로 더한다
    await writeTrack({ filePath: `${stem}.wav`, track: sumTracks([mic, system], length) })
  } else {
    await writeTrack({
      filePath: `${stem}.wav`,
      track: sumTracks([...state.tracks, noise], length)
    })
  }

  const turns = mergeAdjacentTurns(state.turns)
  await writeFile(`${stem}.rttm`, `${formatRttm({ fileId: spec.id, turns })}\n`, 'utf-8')

  const bySpeaker = new Map<string, number>()
  for (const turn of turns)
    bySpeaker.set(turn.speaker, (bySpeaker.get(turn.speaker) ?? 0) + turn.end - turn.start)
  info(
    `${spec.id}: ${spec.minutes}분 · 정답 구간 ${turns.length}개 · ${[...bySpeaker].map(([speaker, sec]) => `${speaker} ${Math.round(sec)}초`).join(', ')}`
  )
}

const main = async () => {
  const only = process.argv
    .find((arg) => arg.startsWith('--only='))
    ?.slice('--only='.length)
    .split(',')
  const index = JSON.parse(
    await readFile(path.join(ZEROTH_DIR, 'index.json'), 'utf-8')
  ) as IndexEntry[]
  await mkdir(SIM_DIR, { recursive: true })

  for (const spec of SIM_SPECS) {
    if (only && !only.includes(spec.id)) continue
    await writeMeeting({ spec, index })
  }
}

if (require.main === module) {
  main().catch((error) => fail(error instanceof Error ? error.message : String(error)))
}

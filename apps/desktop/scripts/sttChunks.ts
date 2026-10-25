// 녹음 중 STT 실험의 조각 나누기. 녹음기와 같은 청크(약 0.5초)를 라이브 받아쓰기와 같은 기준으로
// 말소리/쉼으로 가르고, 조각이 20초를 넘으면 다음 쉼 청크에서, 쉼이 없으면 25초에서 자른다.
import assert from 'node:assert/strict'

import { CHUNK_SAMPLES, SAMPLE_RATE_HZ, rmsOf } from '@shared/audio'

import { EMPTY_LIVE_WINDOW, pushLiveChunk } from '../src/main/audio/liveWindow'

const MIN_CHUNK_SEC = 20
const MAX_CHUNK_SEC = 25
const INT16_SCALE = 32768

export interface ChunkCut {
  /** 조각 끝(배타). 녹음 청크 번호 */
  end: number
  /** 쉼을 못 찾아 최대 길이에서 자른 조각 */
  isForced: boolean
}

/** 녹음 청크마다 말소리인지. 녹음기는 정규화 전 소리를 보므로 원본 PCM을 넣는다 */
export const speechFlagsOf = (pcm: Int16Array) => {
  let window = EMPTY_LIVE_WINDOW

  return Array.from({ length: Math.ceil(pcm.length / CHUNK_SAMPLES) }, (_, index) => {
    const samples = Float32Array.from(
      pcm.subarray(index * CHUNK_SAMPLES, (index + 1) * CHUNK_SAMPLES),
      (sample) => sample / INT16_SCALE
    )
    // 구간은 쓰지 않고 소음 바닥 기록만 이어 간다
    window = pushLiveChunk({ window: { ...window, chunks: [] }, samples, rms: rmsOf(samples) })

    return window.chunks[0].isSpeech
  })
}

export const planChunkCuts = (speechFlags: boolean[]) => {
  const secondsOf = (chunkCount: number) => (chunkCount * CHUNK_SAMPLES) / SAMPLE_RATE_HZ
  const initial: { cuts: ChunkCut[]; start: number } = { cuts: [], start: 0 }
  const { cuts, start } = speechFlags.reduce((acc, isSpeech, index) => {
    const sec = secondsOf(index + 1 - acc.start)
    if (sec < MAX_CHUNK_SEC && (sec < MIN_CHUNK_SEC || isSpeech)) return acc

    return { cuts: [...acc.cuts, { end: index + 1, isForced: isSpeech }], start: index + 1 }
  }, initial)

  return start < speechFlags.length ? [...cuts, { end: speechFlags.length, isForced: false }] : cuts
}

// 자체 점검: 20초 전의 쉼(10번)은 넘기고 20초 뒤 첫 쉼(44번)에서, 그 뒤 쉼이 없으면 25초(49청크)에서 자른다
assert.deepEqual(
  planChunkCuts(Array.from({ length: 100 }, (_, index) => index !== 10 && index !== 44)),
  [
    { end: 45, isForced: false },
    { end: 94, isForced: true },
    { end: 100, isForced: false }
  ]
)

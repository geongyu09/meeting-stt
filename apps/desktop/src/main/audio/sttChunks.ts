import { SAMPLE_RATE_HZ } from '@shared/audio'
import type { SttSegment } from '@shared/types'

import { judgeSpeech, liveSamplesOf, type LiveChunk } from './liveWindow'

/**
 * 메모 녹음의 녹음 중 STT 조각 나누기. 녹음 청크(약 0.5초)를 라이브 받아쓰기와 같은 판정으로 말소리/쉼으로 가르고,
 * 조각이 20초를 넘으면 다음 쉼 청크 뒤에서, 쉼이 없으면 25초에서 자른다. 인식(spawn)은 `recordingStt.ts`가 한다
 * (references/features/recording.md "녹음 중 STT (메모)", 측정은 docs/stt-tuning-results.md "녹음 중 STT").
 */

/** 이 길이를 넘긴 뒤 첫 쉼 청크에서 자른다 */
export const STT_CHUNK_MIN_SEC = 20
/** 쉼을 못 찾아도 이 길이에 닿으면 자른다 */
export const STT_CHUNK_MAX_SEC = 25

export interface SttChunker {
  /** 소음 바닥 기록. 잘라도 비우지 않는다 */
  recentRms: number[]
  /** 마지막으로 자른 뒤의 청크 */
  pending: LiveChunk[]
  /** `pending` 첫 샘플의 WAV 위치. 일시정지 중 청크는 WAV에도 여기에도 들어오지 않아 시간축이 WAV와 같다 */
  startSample: number
}

export const EMPTY_STT_CHUNKER: SttChunker = { recentRms: [], pending: [], startSample: 0 }

export interface SttPiece {
  startSample: number
  samples: Float32Array
  /** 쉼을 못 찾아 최대 길이에서 자른 조각 */
  isForced: boolean
}

const pieceOf = ({ chunker, isForced }: { chunker: SttChunker; isForced: boolean }) => {
  const samples = liveSamplesOf(chunker.pending)

  return {
    chunker: { ...chunker, pending: [], startSample: chunker.startSample + samples.length },
    piece: { startSample: chunker.startSample, samples, isForced }
  }
}

interface PushSttChunkParams {
  chunker: SttChunker
  samples: Float32Array
  rms: number
}

/** 청크를 더하고, 자를 때가 되면 그 조각을 함께 돌려준다 */
export const pushSttChunk = ({ chunker, samples, rms }: PushSttChunkParams) => {
  const { recentRms, isSpeech } = judgeSpeech({ recentRms: chunker.recentRms, rms })
  const next = { ...chunker, recentRms, pending: [...chunker.pending, { samples, rms, isSpeech }] }
  const sec =
    next.pending.reduce((total, chunk) => total + chunk.samples.length, 0) / SAMPLE_RATE_HZ
  if (sec < STT_CHUNK_MAX_SEC && (sec < STT_CHUNK_MIN_SEC || isSpeech))
    return { chunker: next, piece: undefined }

  return pieceOf({ chunker: next, isForced: isSpeech })
}

/** 정지할 때 마지막으로 자른 뒤 ~ 끝을 꼬리 조각으로. 남은 것이 없으면 조각이 없다 */
export const flushSttChunker = (chunker: SttChunker) =>
  chunker.pending.length ? pieceOf({ chunker, isForced: false }) : { chunker, piece: undefined }

interface ShiftSegmentParams {
  segment: SttSegment
  offsetSec: number
}

/** 조각 안 시각을 녹음 시각으로. 단어 시각도 같이 민다 */
export const shiftSegment = ({ segment, offsetSec }: ShiftSegmentParams): SttSegment => ({
  ...segment,
  start: segment.start + offsetSec,
  end: segment.end + offsetSec,
  ...(segment.words
    ? {
        words: segment.words.map((word) => ({
          ...word,
          start: word.start + offsetSec,
          end: word.end + offsetSec
        }))
      }
    : {})
})

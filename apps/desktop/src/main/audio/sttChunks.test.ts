import { describe, expect, it } from 'vitest'
import { CHUNK_SAMPLES } from '@shared/audio'
import {
  EMPTY_STT_CHUNKER,
  flushSttChunker,
  pushSttChunk,
  shiftSegment,
  type SttChunker,
  type SttPiece
} from './sttChunks'

const SPEECH_RMS = 0.05
const SILENCE_RMS = 0

/** 청크마다 말소리 여부를 받아 조각을 모두 모은다. 정지하면 꼬리까지 */
const cutAll = ({ speechFlags, isStopped }: { speechFlags: boolean[]; isStopped: boolean }) => {
  const initial: { chunker: SttChunker; pieces: SttPiece[] } = {
    chunker: EMPTY_STT_CHUNKER,
    pieces: []
  }
  const { chunker, pieces } = speechFlags.reduce((acc, isSpeech) => {
    const next = pushSttChunk({
      chunker: acc.chunker,
      samples: new Float32Array(CHUNK_SAMPLES),
      rms: isSpeech ? SPEECH_RMS : SILENCE_RMS
    })

    return { chunker: next.chunker, pieces: next.piece ? [...acc.pieces, next.piece] : acc.pieces }
  }, initial)
  if (!isStopped) return pieces

  const tail = flushSttChunker(chunker).piece

  return tail ? [...pieces, tail] : pieces
}

const cutsOf = (pieces: SttPiece[]) =>
  pieces.map(({ startSample, samples, isForced }) => ({
    start: startSample / CHUNK_SAMPLES,
    end: (startSample + samples.length) / CHUNK_SAMPLES,
    isForced
  }))

describe('pushSttChunk', () => {
  it('20초 전의 쉼은 넘기고 20초 뒤 첫 쉼에서, 쉼이 없으면 25초에서 자른다', () => {
    // 청크 0.512초: 20초 = 39.06청크, 25초 = 48.8청크
    const speechFlags = Array.from({ length: 100 }, (_, index) => index !== 10 && index !== 44)

    expect(cutsOf(cutAll({ speechFlags, isStopped: true }))).toEqual([
      { start: 0, end: 45, isForced: false },
      { start: 45, end: 94, isForced: true },
      { start: 94, end: 100, isForced: false }
    ])
  })

  it('녹음 중에는 꼬리를 자르지 않는다', () => {
    const speechFlags = Array.from({ length: 30 }, () => true)

    expect(cutAll({ speechFlags, isStopped: false })).toEqual([])
  })

  it('조각 샘플은 들어온 순서 그대로다', () => {
    const initial = pushSttChunk({
      chunker: EMPTY_STT_CHUNKER,
      samples: Float32Array.of(0.1, 0.2),
      rms: SPEECH_RMS
    })
    const { piece } = flushSttChunker(
      pushSttChunk({ chunker: initial.chunker, samples: Float32Array.of(0.3), rms: SPEECH_RMS })
        .chunker
    )

    expect(piece?.startSample).toBe(0)
    expect(Array.from(piece?.samples ?? [])).toEqual([
      Math.fround(0.1),
      Math.fround(0.2),
      Math.fround(0.3)
    ])
  })
})

describe('flushSttChunker', () => {
  it('남은 청크가 없으면 조각이 없다', () => {
    expect(flushSttChunker(EMPTY_STT_CHUNKER).piece).toBeUndefined()
  })
})

describe('shiftSegment', () => {
  it('세그먼트와 단어 시각을 조각 시작만큼 민다', () => {
    const segment = {
      start: 0,
      end: 1.5,
      text: '안녕 하세요',
      words: [
        { start: 0, end: 0.5, text: '안녕' },
        { start: 0.6, end: 1.5, text: '하세요' }
      ]
    }

    expect(shiftSegment({ segment, offsetSec: 20 })).toEqual({
      start: 20,
      end: 21.5,
      text: '안녕 하세요',
      words: [
        { start: 20, end: 20.5, text: '안녕' },
        { start: 20.6, end: 21.5, text: '하세요' }
      ]
    })
  })

  it('단어가 없는 세그먼트에는 단어를 만들지 않는다', () => {
    expect(shiftSegment({ segment: { start: 1, end: 2, text: '네' }, offsetSec: 5 })).toEqual({
      start: 6,
      end: 7,
      text: '네'
    })
  })
})

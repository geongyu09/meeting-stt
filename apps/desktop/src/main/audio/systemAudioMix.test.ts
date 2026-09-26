import { describe, expect, it } from 'vitest'
import {
  EMPTY_SAMPLE_FIFO,
  MAX_BACKLOG_SAMPLES,
  mixSamples,
  pushSamples,
  takeSamples,
  type SampleFifo
} from './systemAudioMix'

const seq = ({ from, count }: { from: number; count: number }) =>
  Float32Array.from({ length: count }, (_, index) => from + index)

const pushAll = (chunks: Float32Array[]) =>
  chunks.reduce((fifo, samples) => pushSamples({ fifo, samples }), EMPTY_SAMPLE_FIFO)

describe('takeSamples', () => {
  it('여러 청크에 걸쳐 앞에서부터 잘라내고 나머지를 남긴다', () => {
    const fifo = pushAll([seq({ from: 0, count: 3 }), seq({ from: 3, count: 3 })])

    const first = takeSamples({ fifo, count: 4 })
    const second = takeSamples({ fifo: first.fifo, count: 2 })

    expect(Array.from(first.samples)).toEqual([0, 1, 2, 3])
    expect(first.fifo.length).toBe(2)
    expect(Array.from(second.samples)).toEqual([4, 5])
    expect(second.fifo.length).toBe(0)
  })

  it('모자라면 0으로 채우고 FIFO는 비운다', () => {
    const fifo = pushAll([seq({ from: 1, count: 2 })])

    const { samples, fifo: rest } = takeSamples({ fifo, count: 5 })

    expect(Array.from(samples)).toEqual([1, 2, 0, 0, 0])
    expect(rest).toEqual<SampleFifo>({ chunks: [], length: 0 })
  })

  it('빈 FIFO에서는 0만 돌려준다', () => {
    const { samples, fifo } = takeSamples({ fifo: EMPTY_SAMPLE_FIFO, count: 3 })

    expect(Array.from(samples)).toEqual([0, 0, 0])
    expect(fifo.length).toBe(0)
  })

  it('남은 양이 상한을 넘으면 오래된 것부터 버려 상한에 맞춘다', () => {
    const backlog = MAX_BACKLOG_SAMPLES + 10
    const fifo = pushAll([seq({ from: 0, count: 5 }), seq({ from: 5, count: backlog })])

    const { samples, fifo: rest } = takeSamples({ fifo, count: 5 })

    expect(Array.from(samples)).toEqual([0, 1, 2, 3, 4])
    expect(rest.length).toBe(MAX_BACKLOG_SAMPLES)
    expect(rest.chunks[0][0]).toBe(15)
  })

  it('원본 FIFO를 바꾸지 않는다', () => {
    const fifo = pushAll([seq({ from: 0, count: 4 })])

    takeSamples({ fifo, count: 2 })

    expect(fifo.length).toBe(4)
    expect(Array.from(fifo.chunks[0])).toEqual([0, 1, 2, 3])
  })
})

describe('mixSamples', () => {
  it('샘플별로 더하고 ±1로 클립한다', () => {
    const mixed = mixSamples({
      base: Float32Array.from([0.5, -0.5, 0.9, -0.9]),
      overlay: Float32Array.from([0.25, -0.25, 0.5, -0.5])
    })

    expect(Array.from(mixed)).toEqual([0.75, -0.75, 1, -1])
  })

  it('길이는 마이크 청크를 따르고 짧은 쪽은 0으로 본다', () => {
    const mixed = mixSamples({
      base: Float32Array.from([0.1, 0.2, 0.3]),
      overlay: Float32Array.from([1])
    })

    expect(mixed).toHaveLength(3)
    expect(mixed[1]).toBeCloseTo(0.2)
  })
})

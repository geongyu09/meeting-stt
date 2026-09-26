import { SAMPLE_RATE_HZ } from '@shared/audio'

/**
 * 시스템 오디오(스피커 출력)를 마이크 청크와 섞기 위한 순수 함수 (references/architecture.md "시스템 오디오 캡처").
 * 도구가 벽시계 기준 연속 스트림을 주므로 FIFO 하나로 두 스트림의 속도를 맞춘다.
 */

/** 꺼낸 뒤에도 이보다 많이 남아 있으면 시계 차이로 밀린 것이다. 오래된 것을 버려 다시 맞춘다 */
export const MAX_BACKLOG_SAMPLES = SAMPLE_RATE_HZ * 1.5

export interface SampleFifo {
  chunks: Float32Array[]
  /** chunks의 샘플 수 합. 매번 더하지 않으려고 따로 든다 */
  length: number
}

export const EMPTY_SAMPLE_FIFO: SampleFifo = { chunks: [], length: 0 }

export const pushSamples = ({ fifo, samples }: { fifo: SampleFifo; samples: Float32Array }) =>
  samples.length === 0
    ? fifo
    : { chunks: [...fifo.chunks, samples], length: fifo.length + samples.length }

/** 앞에서 count개를 잘라낸다. 모자라면 0으로 채운다 (도구 시작 지연·재시작 구간) */
const sliceFront = ({ fifo, count }: { fifo: SampleFifo; count: number }) => {
  const taken = new Float32Array(count)
  const rest: Float32Array[] = []
  let offset = 0

  fifo.chunks.forEach((chunk) => {
    const needed = count - offset
    if (needed <= 0) {
      rest.push(chunk)
      return
    }
    if (chunk.length <= needed) {
      taken.set(chunk, offset)
      offset += chunk.length
      return
    }
    taken.set(chunk.subarray(0, needed), offset)
    offset = count
    rest.push(chunk.subarray(needed))
  })

  return { taken, rest: { chunks: rest, length: Math.max(0, fifo.length - count) } }
}

/**
 * 마이크 청크와 같은 개수를 꺼낸다. 남은 양이 MAX_BACKLOG_SAMPLES를 넘으면 그만큼 오래된 것을 버린다 —
 * 마이크 시계보다 빠른 스트림이 무한정 뒤로 밀리지 않게 한다.
 */
export const takeSamples = ({ fifo, count }: { fifo: SampleFifo; count: number }) => {
  const { taken, rest } = sliceFront({ fifo, count })
  const excess = rest.length - MAX_BACKLOG_SAMPLES
  if (excess <= 0) return { samples: taken, fifo: rest }

  return { samples: taken, fifo: sliceFront({ fifo: rest, count: excess }).rest }
}

/** 두 스트림을 샘플별로 더하고 ±1로 클립한다. 길이는 첫 번째를 따른다 */
export const mixSamples = ({ base, overlay }: { base: Float32Array; overlay: Float32Array }) => {
  const mixed = new Float32Array(base.length)
  for (let index = 0; index < base.length; index += 1) {
    const sum = base[index] + (overlay[index] ?? 0)
    mixed[index] = Math.max(-1, Math.min(1, sum))
  }

  return mixed
}

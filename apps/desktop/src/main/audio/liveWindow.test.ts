import { describe, expect, it } from 'vitest'
import { SAMPLE_RATE_HZ } from '@shared/audio'
import {
  dropLiveChunks,
  EMPTY_LIVE_WINDOW,
  liveSamplesOf,
  liveTextOf,
  markLiveRunStarted,
  planLiveRun,
  pushLiveChunk,
  type LiveWindow
} from './liveWindow'

const CHUNK_SEC = 0.5
const QUIET_RMS = 0.001
const SPEECH_RMS = 0.01
const LOUD_RMS = 0.05

const chunkOf = (value = 0) => new Float32Array(SAMPLE_RATE_HZ * CHUNK_SEC).fill(value)

const pushAll = ({
  window = EMPTY_LIVE_WINDOW,
  rmsList
}: {
  window?: LiveWindow
  rmsList: number[]
}) =>
  rmsList.reduce(
    (current, rms) => pushLiveChunk({ window: current, samples: chunkOf(), rms }),
    window
  )

const repeat = ({ rms, count }: { rms: number; count: number }) =>
  Array.from({ length: count }, () => rms)

describe('pushLiveChunk', () => {
  it('조용한 구간은 마지막 청크만 남긴다', () => {
    const window = pushAll({ rmsList: repeat({ rms: QUIET_RMS, count: 6 }) })

    expect(window.chunks).toHaveLength(1)
    expect(window.recentRms).toHaveLength(6)
  })

  it('소음 바닥보다 충분히 크면 말소리로 보고 구간을 쌓는다', () => {
    const window = pushAll({
      rmsList: [...repeat({ rms: QUIET_RMS, count: 4 }), SPEECH_RMS, SPEECH_RMS]
    })

    expect(window.chunks.map((chunk) => chunk.isSpeech)).toEqual([false, true, true])
  })

  it('처음부터 크게 말하면 조용한 청크가 없어도 말소리로 본다', () => {
    const window = pushAll({ rmsList: [LOUD_RMS, LOUD_RMS] })

    expect(window.chunks.every((chunk) => chunk.isSpeech)).toBe(true)
  })
})

describe('planLiveRun', () => {
  it('말소리가 없으면 돌리지 않는다', () => {
    expect(planLiveRun(pushAll({ rmsList: repeat({ rms: QUIET_RMS, count: 8 }) })).shouldRun).toBe(
      false
    )
  })

  it('새 오디오가 한 걸음만큼 쌓이면 미확정으로 돌린다', () => {
    const quiet = markLiveRunStarted(pushAll({ rmsList: repeat({ rms: QUIET_RMS, count: 4 }) }))
    const oneChunk = pushAll({ window: quiet, rmsList: [SPEECH_RMS] })
    const enough = pushAll({ window: quiet, rmsList: repeat({ rms: SPEECH_RMS, count: 3 }) })

    expect(planLiveRun(oneChunk).shouldRun).toBe(false)
    expect(planLiveRun(enough)).toEqual({ shouldRun: true, chunkCount: 4, isFinal: false })
  })

  it('말 뒤에 1초 조용하면 확정한다', () => {
    const window = markLiveRunStarted(
      pushAll({ rmsList: [QUIET_RMS, QUIET_RMS, QUIET_RMS, SPEECH_RMS, SPEECH_RMS] })
    )
    const afterPause = pushAll({ window, rmsList: [QUIET_RMS, QUIET_RMS] })

    expect(planLiveRun(afterPause)).toMatchObject({ shouldRun: true, isFinal: true })
  })

  it('구간이 최대 길이에 닿으면 말이 이어져도 확정한다', () => {
    const window = pushAll({ rmsList: repeat({ rms: LOUD_RMS, count: 24 }) })

    expect(planLiveRun(window)).toMatchObject({ shouldRun: true, isFinal: true, chunkCount: 24 })
  })
})

describe('dropLiveChunks', () => {
  it('인식에 넣은 앞쪽만 빼고 그 뒤에 온 청크는 남긴다', () => {
    const window = pushAll({ rmsList: repeat({ rms: LOUD_RMS, count: 5 }) })

    expect(dropLiveChunks({ window, count: 3 }).chunks).toHaveLength(2)
  })
})

describe('liveSamplesOf', () => {
  it('청크를 순서대로 이어 붙인다', () => {
    const samples = liveSamplesOf([
      { samples: new Float32Array([1, 2]), rms: 0, isSpeech: true },
      { samples: new Float32Array([3]), rms: 0, isSpeech: true }
    ])

    expect(Array.from(samples)).toEqual([1, 2, 3])
  })
})

describe('liveTextOf', () => {
  it('세그먼트 줄을 공백 하나로 합친다', () => {
    expect(liveTextOf(' 안녕하세요\n 회의를 시작하겠습니다\n\n')).toBe(
      '안녕하세요 회의를 시작하겠습니다'
    )
  })
})

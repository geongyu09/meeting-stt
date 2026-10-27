import { describe, expect, it } from 'vitest'
import {
  AUTO_STOP_SILENCE_SEC,
  EMPTY_SILENCE_TRACKER,
  pushSilenceChunk,
  type SilenceTracker
} from './silenceStop'

const CHUNK_SEC = 0.5
const SPEECH_RMS = 0.05
const ROOM_NOISE_RMS = 0.001
const CHUNKS_TO_STOP = AUTO_STOP_SILENCE_SEC / CHUNK_SEC

/** 같은 RMS 청크를 여러 번 넣고 마지막 결과를 돌려준다 */
const pushMany = ({
  tracker,
  rms,
  count
}: {
  tracker: SilenceTracker
  rms: number
  count: number
}) =>
  Array.from({ length: count }).reduce<ReturnType<typeof pushSilenceChunk>>(
    (acc) => pushSilenceChunk({ tracker: acc.tracker, rms, chunkSec: CHUNK_SEC }),
    { tracker, isSilentTooLong: false }
  )

describe('pushSilenceChunk', () => {
  it('말소리 없이 기준 시간이 차면 정지를 알린다', () => {
    const almost = pushMany({
      tracker: EMPTY_SILENCE_TRACKER,
      rms: ROOM_NOISE_RMS,
      count: CHUNKS_TO_STOP - 1
    })
    expect(almost.isSilentTooLong).toBe(false)

    const reached = pushSilenceChunk({
      tracker: almost.tracker,
      rms: ROOM_NOISE_RMS,
      chunkSec: CHUNK_SEC
    })
    expect(reached.isSilentTooLong).toBe(true)
  })

  it('말소리 청크가 오면 센 시간을 0부터 다시 센다', () => {
    const quiet = pushMany({
      tracker: EMPTY_SILENCE_TRACKER,
      rms: ROOM_NOISE_RMS,
      count: CHUNKS_TO_STOP - 1
    })
    const spoken = pushSilenceChunk({
      tracker: quiet.tracker,
      rms: SPEECH_RMS,
      chunkSec: CHUNK_SEC
    })

    expect(spoken.tracker.silentSec).toBe(0)
    expect(spoken.isSilentTooLong).toBe(false)
  })

  it('디지털 무음(0)도 말소리가 아니라 무음으로 센다', () => {
    const silent = pushMany({ tracker: EMPTY_SILENCE_TRACKER, rms: 0, count: CHUNKS_TO_STOP })

    expect(silent.isSilentTooLong).toBe(true)
  })
})

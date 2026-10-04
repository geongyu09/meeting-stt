import { describe, expect, it } from 'vitest'

import { SAMPLE_RATE_HZ } from '@shared/audio'

import { createQualityMonitor, type QualityMonitor } from './qualityMonitor'

const SILENCE_DB = -Infinity
const SPEECH_DB = -20
const QUIET_ROOM_DB = -55
const FAR_SPEECH_DB = -30
const LOUD_ROOM_DB = -40

/** RMS가 정확히 `db`인 소리 (부호만 번갈아 바뀌는 일정한 진폭) */
const tone = ({ db, samples }: { db: number; samples: number }) => {
  const amplitude = Number.isFinite(db) ? 10 ** (db / 20) : 0

  return Float32Array.from({ length: samples }, (_, i) => (i % 2 ? -amplitude : amplitude))
}

interface FeedParams {
  monitor: QualityMonitor
  db: number
  sec: number
}

/** 1초짜리 청크로 나눠 넣고 마지막 판정을 돌려준다 */
const feed = ({ monitor, db, sec }: FeedParams) =>
  Array.from({ length: sec }, () => monitor.push(tone({ db, samples: SAMPLE_RATE_HZ }))).at(-1) ??
  null

/** 10초마다 말소리 3초 + 조용한 구간 7초 */
const feedMeeting = ({
  monitor,
  speechDb,
  roomDb,
  sec
}: {
  monitor: QualityMonitor
  speechDb: number
  roomDb: number
  sec: number
}) =>
  Array.from({ length: sec / 10 }, () => {
    feed({ monitor, db: speechDb, sec: 3 })
    return feed({ monitor, db: roomDb, sec: 7 })
  }).at(-1) ?? null

describe('createQualityMonitor', () => {
  it('무음이 20초 이어지기 전에는 판정하지 않고, 20초가 차면 silent다', () => {
    const monitor = createQualityMonitor()

    expect(feed({ monitor, db: SILENCE_DB, sec: 19 })).toBeNull()
    expect(feed({ monitor, db: SILENCE_DB, sec: 1 })).toBe('silent')
  })

  it('소리가 돌아오면 silent가 풀린다', () => {
    const monitor = createQualityMonitor()
    feed({ monitor, db: SILENCE_DB, sec: 30 })

    expect(feed({ monitor, db: SPEECH_DB, sec: 3 })).toBeNull()
  })

  it('청크 길이가 프레임의 배수가 아니어도 남는 샘플을 버리지 않는다', () => {
    const monitor = createQualityMonitor()
    const CHUNK_SAMPLES = 1000
    const chunksFor20Sec = (20 * SAMPLE_RATE_HZ) / CHUNK_SAMPLES
    const results = Array.from({ length: chunksFor20Sec }, () =>
      monitor.push(tone({ db: SILENCE_DB, samples: CHUNK_SAMPLES }))
    )

    expect(results.at(-2)).toBeNull()
    expect(results.at(-1)).toBe('silent')
  })

  it('말소리가 주변 소리 위로 20dB도 솟지 않으면 60초 뒤부터 faint다', () => {
    const monitor = createQualityMonitor()
    const room = { monitor, speechDb: FAR_SPEECH_DB, roomDb: LOUD_ROOM_DB }

    expect(feedMeeting({ ...room, sec: 50 })).toBeNull()
    expect(feedMeeting({ ...room, sec: 10 })).toBe('faint')
  })

  it('말소리가 또렷하면 문제가 없다', () => {
    const monitor = createQualityMonitor()

    expect(
      feedMeeting({ monitor, speechDb: SPEECH_DB, roomDb: QUIET_ROOM_DB, sec: 120 })
    ).toBeNull()
  })

  it('마이크를 가까이 옮기면 faint가 풀린다', () => {
    const monitor = createQualityMonitor()
    feedMeeting({ monitor, speechDb: FAR_SPEECH_DB, roomDb: LOUD_ROOM_DB, sec: 60 })

    expect(
      feedMeeting({ monitor, speechDb: SPEECH_DB, roomDb: QUIET_ROOM_DB, sec: 180 })
    ).toBeNull()
  })

  it('긴 침묵 뒤에 방금 소리가 돌아온 것은 faint로 보지 않는다', () => {
    const monitor = createQualityMonitor()
    feed({ monitor, db: SILENCE_DB, sec: 170 })

    expect(feed({ monitor, db: SPEECH_DB, sec: 10 })).toBeNull()
  })
})

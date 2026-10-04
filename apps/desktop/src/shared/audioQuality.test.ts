import { describe, expect, it } from 'vitest'

import {
  assessAudioQuality,
  audioQualityIssueOf,
  FAINT_WIDTH_DB,
  measureAudioQuality,
  QUALITY_DB_FLOOR,
  SILENT_SPEECH_DBFS
} from './audioQuality'

const rmsOfDb = (db: number) => 10 ** (db / 20)

describe('measureAudioQuality', () => {
  it('프레임의 90퍼센타일을 발화 음량, 10퍼센타일을 바닥 잡음으로 잰다', () => {
    // 말소리 30%(-20dBFS) + 조용한 구간 70%(-55dBFS)
    const frameRms = [...Array(70).fill(rmsOfDb(-55)), ...Array(30).fill(rmsOfDb(-20))]

    const { speechDb, noiseDb } = measureAudioQuality({ frameRms })

    expect(speechDb).toBeCloseTo(-20, 5)
    expect(noiseDb).toBeCloseTo(-55, 5)
  })

  it('디지털 무음은 -Infinity 대신 바닥값으로 자른다', () => {
    expect(measureAudioQuality({ frameRms: Array(10).fill(0) })).toEqual({
      speechDb: QUALITY_DB_FLOOR,
      noiseDb: QUALITY_DB_FLOOR
    })
  })

  it('프레임이 없으면 바닥값을 준다', () => {
    expect(measureAudioQuality({ frameRms: [] })).toEqual({
      speechDb: QUALITY_DB_FLOOR,
      noiseDb: QUALITY_DB_FLOOR
    })
  })
})

describe('assessAudioQuality', () => {
  it('말소리가 바닥 잡음 위로 충분히 솟으면 문제가 없다', () => {
    expect(assessAudioQuality({ speechDb: -17, noiseDb: -53 })).toBeNull()
  })

  it('폭이 임계값보다 좁으면 faint다', () => {
    expect(assessAudioQuality({ speechDb: -42.6, noiseDb: -52.6 })).toBe('faint')
    expect(assessAudioQuality({ speechDb: -20, noiseDb: -20 - FAINT_WIDTH_DB + 0.1 })).toBe('faint')
  })

  it('폭이 임계값과 같으면 문제로 보지 않는다', () => {
    expect(assessAudioQuality({ speechDb: -20, noiseDb: -20 - FAINT_WIDTH_DB })).toBeNull()
  })

  it('음량이 작아도 폭이 넓으면 문제가 없다 (정규화가 복구한다)', () => {
    expect(assessAudioQuality({ speechDb: -52, noiseDb: -86 })).toBeNull()
  })

  it('발화 음량이 무음 기준보다 작으면 폭과 무관하게 silent다', () => {
    expect(assessAudioQuality({ speechDb: SILENT_SPEECH_DBFS - 1, noiseDb: -96 })).toBe('silent')
    expect(assessAudioQuality({ speechDb: -96, noiseDb: -96 })).toBe('silent')
  })
})

describe('audioQualityIssueOf', () => {
  it('저장된 지표를 판정으로 바꾼다', () => {
    expect(audioQualityIssueOf(JSON.stringify({ speechDb: -42.6, noiseDb: -52.6 }))).toBe('faint')
    expect(audioQualityIssueOf(JSON.stringify({ speechDb: -96, noiseDb: -96 }))).toBe('silent')
    expect(audioQualityIssueOf(JSON.stringify({ speechDb: -17, noiseDb: -53 }))).toBeNull()
  })

  it('재지 않은 회의는 문제 없음으로 본다', () => {
    expect(audioQualityIssueOf(null)).toBeNull()
  })

  it('읽을 수 없는 값은 문제 없음으로 본다', () => {
    expect(audioQualityIssueOf('{')).toBeNull()
    expect(audioQualityIssueOf(JSON.stringify({ speechDb: -17 }))).toBeNull()
    expect(audioQualityIssueOf(JSON.stringify({ speechDb: '-17', noiseDb: -53 }))).toBeNull()
    expect(audioQualityIssueOf(JSON.stringify({ speechDb: null, noiseDb: -53 }))).toBeNull()
    expect(audioQualityIssueOf('null')).toBeNull()
  })
})

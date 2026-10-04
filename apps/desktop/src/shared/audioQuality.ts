/**
 * 녹음 품질 지표와 판정 (references/architecture.md "녹음 품질 안내").
 * 녹음 중 안내(main의 품질 모니터)와 사후 표시(파이프라인이 저장한 지표)가 같은 임계값을 쓴다.
 * 임계값의 근거는 docs/recording-quality-results.md.
 */

import { speechRmsDbOf, toDb } from '@meeting-stt/core/normalize'

/** 프레임 RMS 분포에서 이 분위수를 바닥 잡음으로 본다 (아무도 말하지 않을 때의 소리 크기) */
const NOISE_RMS_PERCENTILE = 0.1
/** 16bit가 표현하는 가장 작은 음량. 디지털 무음(-Infinity)은 JSON에 담을 수 없어 여기서 자른다 */
export const QUALITY_DB_FLOOR = -96
/** 발화 음량이 이보다 작으면 소리가 사실상 없다 (음소거·죽은 입력 장치) */
export const SILENT_SPEECH_DBFS = -60
/** 발화 음량 − 바닥 잡음이 이보다 좁으면 말소리가 주변 소리에 묻힌 것이다 (CER 1.6배 이상) */
export const FAINT_WIDTH_DB = 20

/** 원본 녹음에서 잰 값. 단위는 dBFS */
export interface AudioQualityMetrics {
  /** 프레임 RMS의 90퍼센타일. 음량 정규화가 맞추는 값과 같다 */
  speechDb: number
  /** 프레임 RMS의 10퍼센타일 */
  noiseDb: number
}

/** `silent`: 소리가 들어오지 않음, `faint`: 말소리가 주변 소리에 묻힘 */
export type AudioQualityIssue = 'silent' | 'faint'

const clampDb = (db: number) => Math.max(QUALITY_DB_FLOOR, db)

/**
 * 50ms 프레임 RMS(풀스케일 1 기준) 목록에서 발화 음량과 바닥 잡음을 뽑는다.
 * 프레임이 없으면 둘 다 바닥값이다 (판정은 `silent`).
 */
export const measureAudioQuality = ({ frameRms }: { frameRms: number[] }) => {
  if (frameRms.length === 0) return { speechDb: QUALITY_DB_FLOOR, noiseDb: QUALITY_DB_FLOOR }

  const sorted = frameRms.toSorted((a, b) => a - b)
  const noiseRms = sorted[Math.floor(sorted.length * NOISE_RMS_PERCENTILE)]

  return { speechDb: clampDb(speechRmsDbOf({ frameRms })), noiseDb: clampDb(toDb(noiseRms)) }
}

/** 지표를 안내할 문제로 바꾼다. 문제가 없으면 null */
export const assessAudioQuality = ({ speechDb, noiseDb }: AudioQualityMetrics) => {
  // 소리가 없으면 폭을 따질 수 없으므로 먼저 본다
  if (speechDb < SILENT_SPEECH_DBFS) return 'silent'
  if (speechDb - noiseDb < FAINT_WIDTH_DB) return 'faint'

  return null
}

const isAudioQualityMetrics = (value: unknown): value is AudioQualityMetrics => {
  if (typeof value !== 'object' || value === null) return false

  const { speechDb, noiseDb } = value as Record<string, unknown>

  return Number.isFinite(speechDb) && Number.isFinite(noiseDb)
}

/**
 * `meetings.audio_quality`에 저장한 JSON을 안내할 문제로 바꾼다.
 * 재지 않은 회의(null)나 읽을 수 없는 값은 문제 없음(null)으로 본다 — 표시가 빠질 뿐 회의는 열린다.
 */
export const audioQualityIssueOf = (raw: string | null) => {
  if (raw === null) return null

  try {
    const parsed: unknown = JSON.parse(raw)

    return isAudioQualityMetrics(parsed) ? assessAudioQuality(parsed) : null
  } catch {
    // 손상된 값은 지표가 없는 회의와 같게 다룬다 (references/data-model.md "녹음 품질 지표 저장")
    return null
  }
}

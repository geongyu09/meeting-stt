import type { AppSettings, WhisperModelId } from '@shared/types'
import { DEFAULT_WHISPER_MODEL_ID, isWhisperModelId } from '../models/registry'
import { getDb } from './connection'

/** DB 키와 TS 필드명의 변환은 이 파일에서만 한다 (references/data-model.md) */
const AUDIO_KEEP_KEY = 'audio.keep'
const UPDATE_CHECK_KEY = 'update.check'
const STT_MODEL_KEY = 'stt.model'

const DEFAULT_SETTINGS: AppSettings = { isAudioKept: false, isUpdateCheckEnabled: false }

/** 값이 없거나 JSON이 깨져도 undefined로 읽는다. 설정 하나 때문에 앱이 멈추면 안 된다 */
const readValue = (key: string): unknown => {
  const row = getDb().prepare('SELECT value FROM settings WHERE key = ?').get(key) as
    | { value: string }
    | undefined
  if (!row) return undefined

  try {
    return JSON.parse(row.value)
  } catch {
    return undefined
  }
}

const writeValue = ({ key, value }: { key: string; value: unknown }) => {
  getDb()
    .prepare(
      `INSERT INTO settings (key, value) VALUES (@key, @value)
       ON CONFLICT(key) DO UPDATE SET value = @value`
    )
    .run({ key, value: JSON.stringify(value) })
}

const readBoolean = ({ key, fallback }: { key: string; fallback: boolean }) => {
  const value = readValue(key)

  return typeof value === 'boolean' ? value : fallback
}

export const getAppSettings = (): AppSettings => ({
  isAudioKept: readBoolean({ key: AUDIO_KEEP_KEY, fallback: DEFAULT_SETTINGS.isAudioKept }),
  isUpdateCheckEnabled: readBoolean({
    key: UPDATE_CHECK_KEY,
    fallback: DEFAULT_SETTINGS.isUpdateCheckEnabled
  })
})

export const updateAppSettings = ({ isAudioKept, isUpdateCheckEnabled }: AppSettings) => {
  writeValue({ key: AUDIO_KEEP_KEY, value: isAudioKept })
  writeValue({ key: UPDATE_CHECK_KEY, value: isUpdateCheckEnabled })

  return getAppSettings()
}

/**
 * 온보딩·설정에서 고른 음성 인식 모델. `AppSettings`에 넣지 않는다 — 바꾸는 행위가 다운로드를 동반하므로
 * `models:download` 핸들러만 쓴다 (references/data-model.md). 모르는 값은 기본 모델로 읽는다.
 */
export const getWhisperModelId = (): WhisperModelId => {
  const value = readValue(STT_MODEL_KEY)

  return isWhisperModelId(value) ? value : DEFAULT_WHISPER_MODEL_ID
}

export const setWhisperModelId = ({ whisperModelId }: { whisperModelId: WhisperModelId }) =>
  writeValue({ key: STT_MODEL_KEY, value: whisperModelId })

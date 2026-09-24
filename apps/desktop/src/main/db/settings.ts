import type { AppSettings, GlossarySettings, WhisperModelId } from '@shared/types'
import { DEFAULT_WHISPER_MODEL_ID, isWhisperModelId } from '@meeting-stt/models/desktop'
import {
  DEFAULT_RECORDING_SHORTCUT,
  DEFAULT_WIDGET_SHORTCUT,
  isValidAccelerator
} from '@shared/shortcut'
import { DEFAULT_WIDGET_FADE_OPACITY, isWidgetFadeOpacity } from '@shared/widget'
import { getDb } from './connection'

/** DB 키와 TS 필드명의 변환은 이 파일에서만 한다 (references/data-model.md) */
const AUDIO_KEEP_KEY = 'audio.keep'
const UPDATE_CHECK_KEY = 'update.check'
const STT_MODEL_KEY = 'stt.model'
const PIPELINE_QUIET_KEY = 'pipeline.quiet'
const WIDGET_ENABLED_KEY = 'widget.enabled'
const WIDGET_BOUNDS_KEY = 'widget.bounds'
const WIDGET_FADE_KEY = 'widget.fade'
const WIDGET_FADE_OPACITY_KEY = 'widget.fadeOpacity'
const RECORDING_SHORTCUT_KEY = 'shortcut.recording'
const WIDGET_SHORTCUT_KEY = 'shortcut.widget'
const GLOSSARY_TEAM_KEY = 'glossary.team'
const GLOSSARY_TERMS_KEY = 'glossary.terms'

const DEFAULT_SETTINGS: AppSettings = {
  isAudioKept: false,
  isUpdateCheckEnabled: false,
  isQuietProcessing: false,
  isWidgetEnabled: true,
  isWidgetFadeEnabled: true,
  widgetFadeOpacity: DEFAULT_WIDGET_FADE_OPACITY,
  recordingShortcut: DEFAULT_RECORDING_SHORTCUT,
  widgetShortcut: DEFAULT_WIDGET_SHORTCUT
}

/** 값이 없거나 JSON이 깨져도 undefined로 읽는다. 설정 하나 때문에 앱이 멈추면 안 된다 */
const readValue = (key: string): unknown => {
  const row = getDb().prepare('SELECT value FROM settings WHERE key = ?').get(key) as
    { value: string } | undefined
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

const readOpacity = ({ key, fallback }: { key: string; fallback: number }) => {
  const value = readValue(key)

  return isWidgetFadeOpacity(value) ? value : fallback
}

const readShortcut = ({ key, fallback }: { key: string; fallback: string }) => {
  const value = readValue(key)

  return typeof value === 'string' && isValidAccelerator(value) ? value : fallback
}

export const getAppSettings = (): AppSettings => ({
  isAudioKept: readBoolean({ key: AUDIO_KEEP_KEY, fallback: DEFAULT_SETTINGS.isAudioKept }),
  isUpdateCheckEnabled: readBoolean({
    key: UPDATE_CHECK_KEY,
    fallback: DEFAULT_SETTINGS.isUpdateCheckEnabled
  }),
  isQuietProcessing: readBoolean({
    key: PIPELINE_QUIET_KEY,
    fallback: DEFAULT_SETTINGS.isQuietProcessing
  }),
  isWidgetEnabled: readBoolean({
    key: WIDGET_ENABLED_KEY,
    fallback: DEFAULT_SETTINGS.isWidgetEnabled
  }),
  isWidgetFadeEnabled: readBoolean({
    key: WIDGET_FADE_KEY,
    fallback: DEFAULT_SETTINGS.isWidgetFadeEnabled
  }),
  widgetFadeOpacity: readOpacity({
    key: WIDGET_FADE_OPACITY_KEY,
    fallback: DEFAULT_SETTINGS.widgetFadeOpacity
  }),
  recordingShortcut: readShortcut({
    key: RECORDING_SHORTCUT_KEY,
    fallback: DEFAULT_SETTINGS.recordingShortcut
  }),
  widgetShortcut: readShortcut({
    key: WIDGET_SHORTCUT_KEY,
    fallback: DEFAULT_SETTINGS.widgetShortcut
  })
})

export const updateAppSettings = ({
  isAudioKept,
  isUpdateCheckEnabled,
  isQuietProcessing,
  isWidgetEnabled,
  isWidgetFadeEnabled,
  widgetFadeOpacity,
  recordingShortcut,
  widgetShortcut
}: AppSettings) => {
  writeValue({ key: AUDIO_KEEP_KEY, value: isAudioKept })
  writeValue({ key: UPDATE_CHECK_KEY, value: isUpdateCheckEnabled })
  writeValue({ key: PIPELINE_QUIET_KEY, value: isQuietProcessing })
  writeValue({ key: WIDGET_ENABLED_KEY, value: isWidgetEnabled })
  writeValue({ key: WIDGET_FADE_KEY, value: isWidgetFadeEnabled })
  writeValue({ key: WIDGET_FADE_OPACITY_KEY, value: widgetFadeOpacity })
  writeValue({ key: RECORDING_SHORTCUT_KEY, value: recordingShortcut })
  writeValue({ key: WIDGET_SHORTCUT_KEY, value: widgetShortcut })

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

/**
 * 사용자가 옮긴 위젯 패널 위치. `AppSettings`에 넣지 않는다 — 설정 화면에서 고르는 값이 아니라
 * 창을 옮길 때 main이 적어 두는 런타임 상태이고, 읽고 쓰는 쪽이 windows/widget.ts 하나뿐이다
 * (references/data-model.md).
 */
export const getWidgetBounds = () => {
  const value = readValue(WIDGET_BOUNDS_KEY)
  if (!value || typeof value !== 'object') return undefined

  const { x, y } = value as Record<string, unknown>
  if (typeof x !== 'number' || typeof y !== 'number') return undefined

  return { x, y }
}

export const setWidgetBounds = ({ x, y }: { x: number; y: number }) =>
  writeValue({ key: WIDGET_BOUNDS_KEY, value: { x, y } })

/**
 * 전역 용어 사전. `AppSettings`에 넣지 않는다 — 설정 화면의 별도 카테고리가 자기 채널로 읽고 쓴다
 * (references/data-model.md). 형식이 깨진 값은 빈 값으로 읽는다.
 */
export const getGlossarySettings = (): GlossarySettings => {
  const teamDescription = readValue(GLOSSARY_TEAM_KEY)
  const terms = readValue(GLOSSARY_TERMS_KEY)

  return {
    teamDescription: typeof teamDescription === 'string' ? teamDescription : '',
    terms: Array.isArray(terms)
      ? terms.filter((term): term is string => typeof term === 'string')
      : []
  }
}

/** 검증·정리는 호출하는 쪽(`readGlossarySettings`)이 끝낸 값이어야 한다 */
export const updateGlossarySettings = ({ teamDescription, terms }: GlossarySettings) => {
  writeValue({ key: GLOSSARY_TEAM_KEY, value: teamDescription })
  writeValue({ key: GLOSSARY_TERMS_KEY, value: terms })

  return getGlossarySettings()
}

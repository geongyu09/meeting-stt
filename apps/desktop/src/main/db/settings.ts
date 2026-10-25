import type {
  AppSettings,
  AssistantPermissionMode,
  AssistantProvider,
  GlossarySettings,
  LlmApiVendor,
  LlmProvider,
  OpenaiModelId,
  RecordingType,
  Routine,
  WhisperModelId
} from '@shared/types'
import { DEFAULT_WHISPER_MODEL_ID, isWhisperModelId } from '@meeting-stt/models/desktop'
import {
  DEFAULT_RECORDING_TYPE,
  isAudioInputDevice,
  isRecordingType,
  isSpeechVoice
} from '@shared/audio'
import {
  DEFAULT_ASSISTANT_PERMISSION_MODE,
  isAssistantPermissionMode,
  isAssistantProvider
} from '@shared/assistant'
import { parseStoredRoutines } from '@shared/routine'
import {
  DEFAULT_LLM_PROVIDER,
  DEFAULT_OPENAI_MODEL_ID,
  isLlmProvider,
  isCodexModelId,
  isOpenaiModelId
} from '@shared/llm'
import {
  DEFAULT_DICTATION_SHORTCUT,
  DEFAULT_MEMO_SHORTCUT,
  DEFAULT_NEW_CHAT_SHORTCUT,
  DEFAULT_RECORDING_SHORTCUT,
  DEFAULT_WIDGET_SHORTCUT,
  isValidShortcut
} from '@shared/shortcut'
import { DEFAULT_WIDGET_FADE_OPACITY, isWidgetFadeOpacity } from '@shared/widget'
import { DEFAULT_LOCALE, isLocale } from '@shared/i18n'
import { DEFAULT_THEME, isThemePreference } from '@shared/theme'
import { getDb } from './connection'

/** DB 키와 TS 필드명의 변환은 이 파일에서만 한다 (references/data-model.md) */
const AUDIO_KEEP_KEY = 'audio.keep'
const AUDIO_INPUT_DEVICE_KEY = 'audio.inputDevice'
const AUDIO_SYSTEM_CAPTURE_KEY = 'audio.systemCapture'
const SPEECH_VOICE_KEY = 'speech.voice'
const UI_LOCALE_KEY = 'ui.locale'
const UI_THEME_KEY = 'ui.theme'
const UPDATE_CHECK_KEY = 'update.check'
const STT_MODEL_KEY = 'stt.model'
const PIPELINE_QUIET_KEY = 'pipeline.quiet'
const WIDGET_ENABLED_KEY = 'widget.enabled'
const WIDGET_BOUNDS_KEY = 'widget.bounds'
const WIDGET_FADE_KEY = 'widget.fade'
const WIDGET_FADE_OPACITY_KEY = 'widget.fadeOpacity'
const RECORDING_SHORTCUT_KEY = 'shortcut.recording'
const MEMO_SHORTCUT_KEY = 'shortcut.memo'
const RECORDING_TYPE_KEY = 'recording.type'
const WIDGET_SHORTCUT_KEY = 'shortcut.widget'
const DICTATION_SHORTCUT_KEY = 'shortcut.dictation'
const NEW_CHAT_SHORTCUT_KEY = 'shortcut.newChat'
const GLOSSARY_TEAM_KEY = 'glossary.team'
const GLOSSARY_TERMS_KEY = 'glossary.terms'
const GLOSSARY_CORRECTIONS_KEY = 'glossary.corrections'
const REFINE_AUTO_EXTERNAL_KEY = 'refine.autoExternal'
const LLM_PROVIDER_KEY = 'llm.provider'
const LLM_OPENAI_MODEL_KEY = 'llm.openaiModel'
const LLM_CODEX_MODEL_KEY = 'llm.codexModel'
const ASSISTANT_FOLDER_KEY = 'assistant.folder'
const ASSISTANT_PERMISSION_MODE_KEY = 'assistant.permissionMode'
const ASSISTANT_PROVIDER_KEY = 'assistant.provider'
const ASSISTANT_ROUTINES_KEY = 'assistant.routines'
const ASSISTANT_AUTO_ORGANIZE_KEY = 'assistant.autoOrganize'
/** 회사별 암호화 키의 settings 키. Anthropic은 OpenAI 추가 전 이름을 그대로 둬 저장된 키를 잃지 않는다 */
const LLM_API_KEY_KEYS: Record<LlmApiVendor, string> = {
  anthropic: 'llm.claudeApiKey',
  openai: 'llm.openaiApiKey'
}

const DEFAULT_SETTINGS: AppSettings = {
  isAudioKept: false,
  isUpdateCheckEnabled: false,
  isQuietProcessing: false,
  isWidgetEnabled: true,
  isWidgetFadeEnabled: true,
  widgetFadeOpacity: DEFAULT_WIDGET_FADE_OPACITY,
  recordingShortcut: DEFAULT_RECORDING_SHORTCUT,
  memoShortcut: DEFAULT_MEMO_SHORTCUT,
  widgetShortcut: DEFAULT_WIDGET_SHORTCUT,
  dictationShortcut: DEFAULT_DICTATION_SHORTCUT,
  newChatShortcut: DEFAULT_NEW_CHAT_SHORTCUT,
  inputDevice: null,
  speechVoice: null,
  locale: DEFAULT_LOCALE,
  theme: DEFAULT_THEME,
  isAutoRefineExternal: false
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

const deleteValue = ({ key }: { key: string }) => {
  getDb().prepare('DELETE FROM settings WHERE key = ?').run(key)
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

  return typeof value === 'string' && isValidShortcut(value) ? value : fallback
}

/** 모르는 언어 값은 기본 언어로 읽는다 */
const readLocale = ({ key }: { key: string }) => {
  const value = readValue(key)

  return isLocale(value) ? value : DEFAULT_SETTINGS.locale
}

/** 모르는 테마 값은 시스템 설정 따르기로 읽는다 */
const readTheme = ({ key }: { key: string }) => {
  const value = readValue(key)

  return isThemePreference(value) ? value : DEFAULT_SETTINGS.theme
}

/** 모양이 깨진 값은 시스템 기본 마이크(null)로 읽는다 */
const readInputDevice = ({ key }: { key: string }) => {
  const value = readValue(key)

  return isAudioInputDevice(value) ? value : null
}

/** 형식이 틀린 값은 기본 목소리(null)로 읽는다 */
const readSpeechVoice = ({ key }: { key: string }) => {
  const value = readValue(key)

  return isSpeechVoice(value) ? value : null
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
  memoShortcut: readShortcut({
    key: MEMO_SHORTCUT_KEY,
    fallback: DEFAULT_SETTINGS.memoShortcut
  }),
  widgetShortcut: readShortcut({
    key: WIDGET_SHORTCUT_KEY,
    fallback: DEFAULT_SETTINGS.widgetShortcut
  }),
  dictationShortcut: readShortcut({
    key: DICTATION_SHORTCUT_KEY,
    fallback: DEFAULT_SETTINGS.dictationShortcut
  }),
  newChatShortcut: readShortcut({
    key: NEW_CHAT_SHORTCUT_KEY,
    fallback: DEFAULT_SETTINGS.newChatShortcut
  }),
  inputDevice: readInputDevice({ key: AUDIO_INPUT_DEVICE_KEY }),
  speechVoice: readSpeechVoice({ key: SPEECH_VOICE_KEY }),
  locale: readLocale({ key: UI_LOCALE_KEY }),
  theme: readTheme({ key: UI_THEME_KEY }),
  isAutoRefineExternal: readBoolean({
    key: REFINE_AUTO_EXTERNAL_KEY,
    fallback: DEFAULT_SETTINGS.isAutoRefineExternal
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
  memoShortcut,
  widgetShortcut,
  dictationShortcut,
  newChatShortcut,
  inputDevice,
  speechVoice,
  locale,
  theme,
  isAutoRefineExternal
}: AppSettings) => {
  writeValue({ key: AUDIO_KEEP_KEY, value: isAudioKept })
  writeValue({ key: UPDATE_CHECK_KEY, value: isUpdateCheckEnabled })
  writeValue({ key: PIPELINE_QUIET_KEY, value: isQuietProcessing })
  writeValue({ key: WIDGET_ENABLED_KEY, value: isWidgetEnabled })
  writeValue({ key: WIDGET_FADE_KEY, value: isWidgetFadeEnabled })
  writeValue({ key: WIDGET_FADE_OPACITY_KEY, value: widgetFadeOpacity })
  writeValue({ key: RECORDING_SHORTCUT_KEY, value: recordingShortcut })
  writeValue({ key: MEMO_SHORTCUT_KEY, value: memoShortcut })
  writeValue({ key: WIDGET_SHORTCUT_KEY, value: widgetShortcut })
  writeValue({ key: DICTATION_SHORTCUT_KEY, value: dictationShortcut })
  writeValue({ key: NEW_CHAT_SHORTCUT_KEY, value: newChatShortcut })
  writeValue({ key: AUDIO_INPUT_DEVICE_KEY, value: inputDevice })
  writeValue({ key: SPEECH_VOICE_KEY, value: speechVoice })
  writeValue({ key: UI_LOCALE_KEY, value: locale })
  writeValue({ key: UI_THEME_KEY, value: theme })
  writeValue({ key: REFINE_AUTO_EXTERNAL_KEY, value: isAutoRefineExternal })

  return getAppSettings()
}

/**
 * 온라인 회의 소리(스피커 출력) 함께 녹음 (Phase 5-2). `AppSettings`에 넣지 않는다 — 켜는 행위가 값 저장이 아니라
 * 도구 프로브(시스템 권한 창)를 동반하므로 `recording:setSystemAudio`만 쓴다 (references/data-model.md). 기본 꺼짐
 */
export const getSystemAudioEnabled = () =>
  readBoolean({ key: AUDIO_SYSTEM_CAPTURE_KEY, fallback: false })

export const setSystemAudioEnabled = ({ isEnabled }: { isEnabled: boolean }) =>
  writeValue({ key: AUDIO_SYSTEM_CAPTURE_KEY, value: isEnabled })

/**
 * 마지막으로 고른 녹음 종류. `AppSettings`에 넣지 않는다 — 녹음 상태로 두 창에 push되는 값이라
 * `recording:setType`만 쓴다 (references/data-model.md). 모르는 값은 메모로 읽는다
 */
export const getRecordingType = () => {
  const value = readValue(RECORDING_TYPE_KEY)

  return isRecordingType(value) ? value : DEFAULT_RECORDING_TYPE
}

export const setRecordingTypeSetting = ({ type }: { type: RecordingType }) =>
  writeValue({ key: RECORDING_TYPE_KEY, value: type })

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

/** 발화 편집에서 바뀐 단어별 누적 횟수 (references/data-model.md `glossary.corrections`). 깨진 값은 빈 객체로 읽는다 */
export const getCorrectionCounts = (): Record<string, number> => {
  const value = readValue(GLOSSARY_CORRECTIONS_KEY)
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return {}

  return Object.fromEntries(
    Object.entries(value).filter((entry): entry is [string, number] => typeof entry[1] === 'number')
  )
}

export const setCorrectionCounts = (counts: Record<string, number>) =>
  writeValue({ key: GLOSSARY_CORRECTIONS_KEY, value: counts })

/**
 * 요약·용어 초안이 쓰는 LLM 공급자. `AppSettings`에 넣지 않는다 — 키 저장·CLI 탐색이 붙은
 * 별도 카테고리가 자기 채널로 읽고 쓴다 (references/data-model.md). 모르는 값은 로컬로 읽는다.
 */
export const getLlmProvider = (): LlmProvider => {
  const value = readValue(LLM_PROVIDER_KEY)

  return isLlmProvider(value) ? value : DEFAULT_LLM_PROVIDER
}

export const setLlmProvider = ({ provider }: { provider: LlmProvider }) =>
  writeValue({ key: LLM_PROVIDER_KEY, value: provider })

/** `openai-api`가 부르는 GPT 모델. 모르는 값(사라진 모델 id)은 기본값으로 읽는다 */
export const getOpenaiModel = (): OpenaiModelId => {
  const value = readValue(LLM_OPENAI_MODEL_KEY)

  return isOpenaiModelId(value) ? value : DEFAULT_OPENAI_MODEL_ID
}

export const setOpenaiModel = ({ model }: { model: OpenaiModelId }) =>
  writeValue({ key: LLM_OPENAI_MODEL_KEY, value: model })

/** `codex-cli`가 `-m`으로 넘길 모델. 없거나 형식이 틀리면 null(CLI 기본 모델)로 읽는다 */
export const getCodexModel = () => {
  const value = readValue(LLM_CODEX_MODEL_KEY)

  return isCodexModelId(value) ? value : null
}

export const setCodexModel = ({ model }: { model: string | null }) =>
  writeValue({ key: LLM_CODEX_MODEL_KEY, value: model })

/**
 * safeStorage로 암호화한 회사별 API 키(base64). 평문은 여기까지 오지 않는다 —
 * 암호화·복호화는 `src/main/llm/apiKey.ts`가 한다.
 */
export const getEncryptedApiKey = ({ vendor }: { vendor: LlmApiVendor }) => {
  const value = readValue(LLM_API_KEY_KEYS[vendor])

  return typeof value === 'string' && value ? value : null
}

interface SetEncryptedApiKeyParams {
  vendor: LlmApiVendor
  encrypted: string | null
}

export const setEncryptedApiKey = ({ vendor, encrypted }: SetEncryptedApiKeyParams) => {
  if (encrypted === null) {
    deleteValue({ key: LLM_API_KEY_KEYS[vendor] })
    return
  }

  writeValue({ key: LLM_API_KEY_KEYS[vendor], value: encrypted })
}

/**
 * 개인 비서의 작업 폴더. `AppSettings`에 넣지 않는다 — 고르는 행위가 main의 대화상자를 거치고
 * 바꾸면 진행 중 대화를 비운다 (references/data-model.md `assistant.*`). 폴더가 사라져도 값은 지우지 않는다.
 */
export const getAssistantFolder = () => {
  const value = readValue(ASSISTANT_FOLDER_KEY)

  return typeof value === 'string' && value ? value : null
}

export const setAssistantFolder = ({ folder }: { folder: string }) =>
  writeValue({ key: ASSISTANT_FOLDER_KEY, value: folder })

/** 모르는 값은 기본(`acceptEdits`)으로 읽는다 — 권한을 넓히는 쪽으로 잘못 읽으면 안 된다 */
export const getAssistantPermissionMode = (): AssistantPermissionMode => {
  const value = readValue(ASSISTANT_PERMISSION_MODE_KEY)

  return isAssistantPermissionMode(value) ? value : DEFAULT_ASSISTANT_PERMISSION_MODE
}

export const setAssistantPermissionMode = ({
  permissionMode
}: {
  permissionMode: AssistantPermissionMode
}) => writeValue({ key: ASSISTANT_PERMISSION_MODE_KEY, value: permissionMode })

/** 저장한 적이 없거나 모르는 값이면 null — 설치된 첫 CLI로 채우는 것은 `assistant/folder.ts`가 한다 */
export const getAssistantProvider = (): AssistantProvider | null => {
  const value = readValue(ASSISTANT_PROVIDER_KEY)

  return isAssistantProvider(value) ? value : null
}

export const setAssistantProvider = ({ provider }: { provider: AssistantProvider }) =>
  writeValue({ key: ASSISTANT_PROVIDER_KEY, value: provider })

/** 녹음이 처리되면 정리 에이전트를 자동으로 돌릴지. 기본 켜짐 (references/features/assistant.md "녹음 기록 자동 정리") */
export const getAssistantAutoOrganize = () =>
  readBoolean({ key: ASSISTANT_AUTO_ORGANIZE_KEY, fallback: true })

export const setAssistantAutoOrganize = ({ isEnabled }: { isEnabled: boolean }) =>
  writeValue({ key: ASSISTANT_AUTO_ORGANIZE_KEY, value: isEnabled })

/** 루틴 목록 (references/features/assistant.md "루틴"). 형식이 깨진 항목은 버리고 읽는다 */
export const getRoutines = () => parseStoredRoutines(readValue(ASSISTANT_ROUTINES_KEY))

export const setRoutines = (routines: Routine[]) =>
  writeValue({ key: ASSISTANT_ROUTINES_KEY, value: routines })

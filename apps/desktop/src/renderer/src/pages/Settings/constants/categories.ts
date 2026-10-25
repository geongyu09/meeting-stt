import type { SettingsSectionCategory } from '@renderer/modules/widgets/setting/SettingsSection'

/** 설정 모달 왼쪽 nav의 카테고리. 순서는 시안 "설정 · 큰 모달로 열림" (references/features/ui.md "설정 모달") */
export type SettingsCategory =
  | SettingsSectionCategory
  | 'assistant'
  | 'dictation'
  | 'sttModel'
  | 'llm'
  | 'summaryTemplate'
  | 'glossary'

export const SETTINGS_CATEGORIES: SettingsCategory[] = [
  'assistant',
  'speech',
  'appearance',
  'microphone',
  'recording',
  'widget',
  'shortcut',
  'dictation',
  'sttModel',
  'llm',
  'summaryTemplate',
  'glossary',
  'update',
  'language',
  'feedback'
]

export const DEFAULT_SETTINGS_CATEGORY: SettingsCategory = 'assistant'

/** 설정으로 오는 링크가 `location.state.category`로 넘긴 값을 좁힌다. 모르는 값이면 기본 카테고리 */
export const isSettingsCategory = (value: unknown): value is SettingsCategory =>
  typeof value === 'string' && (SETTINGS_CATEGORIES as string[]).includes(value)

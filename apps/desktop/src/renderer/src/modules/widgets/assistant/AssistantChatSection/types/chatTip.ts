import type { Messages } from '@shared/i18n'
import type { AppSettings } from '@shared/types'

export type ChatTipId = keyof Messages['chatTip']['tips']

/** 팁이 기대는 기본 설정 스킬 (references/features/assistant.md "기본 하네스" > "스킬") */
export type ChatTipSkill = keyof Messages['chatTip']['features']

export type ChatTipShortcut = keyof Pick<
  AppSettings,
  'recordingShortcut' | 'widgetShortcut' | 'dictationShortcut' | 'newChatShortcut'
>

export interface ChatTip {
  id: ChatTipId
  /** 이 스킬이 `/` 메뉴에 없으면 스킬을 넣는 안내로 바꿔 보인다 */
  skill?: ChatTipSkill
  /** 문구에 넣는 단축키. 꺼져 있으면 팁을 뺀다 */
  shortcut?: ChatTipShortcut
  /** 녹음 자동 정리가 꺼져 있으면 맞지 않는 팁 */
  needsOrganize?: boolean
}

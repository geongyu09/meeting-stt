import type { IconName } from '@renderer/shared/components/primitives/ui/Icon'

/** `/` 명령 메뉴의 내장 명령 */
export type CommandId =
  'record' | 'importAudio' | 'findRecords' | 'openDocument' | 'newChat' | 'settings'

/** 메뉴 한 줄. `action`이 메뉴를 고른 뒤 할 일을 정한다 */
export interface MenuItem {
  id: string
  icon: IconName
  title: string
  description: string
  /** 스킬 이름·파일 경로처럼 고정폭으로 보여 줄 제목 */
  isMono: boolean
  action: { kind: 'command'; commandId: CommandId } | { kind: 'insert'; text: string }
}

export interface MenuGroup {
  id: string
  title: string
  items: MenuItem[]
}

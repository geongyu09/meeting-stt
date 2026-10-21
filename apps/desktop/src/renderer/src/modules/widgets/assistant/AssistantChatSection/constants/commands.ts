import type { IconName } from '@renderer/shared/components/primitives/ui/Icon'
import { PATHS } from '@renderer/shared/routes/paths'

import type { CommandId } from '../types/menu'

/** 시안의 도우미 순서 그대로 (references/features/ui.md "채팅창 리뉴얼" > "홈") */
export const COMMANDS: { id: CommandId; icon: IconName }[] = [
  { id: 'record', icon: 'mic' },
  { id: 'importAudio', icon: 'upload' },
  { id: 'findRecords', icon: 'search' },
  { id: 'openDocument', icon: 'file' },
  { id: 'newChat', icon: 'pencil' },
  { id: 'settings', icon: 'settings' }
]

// shortcut: 아직 채팅으로 옮기지 않은 기능은 옛 화면으로 보낸다, 기록 패널·설정 모달이 붙으면 지운다
export const COMMAND_PATHS: Record<Extract<CommandId, 'findRecords' | 'settings'>, string> = {
  findRecords: PATHS.meetings,
  settings: PATHS.settings
}

/** 메뉴 한 묶음에 보여 주는 최대 줄 수. 거르면서 줄어든다 */
export const MAX_MENU_ITEMS = 8

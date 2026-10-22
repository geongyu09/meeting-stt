import type { IconName } from '@renderer/shared/components/primitives/ui/Icon'
import { PATHS } from '@renderer/shared/routes/paths'

import type { CommandId } from '../types/menu'

/** `/` 명령 메뉴의 내장 명령 순서 (references/features/ui.md "채팅창 리뉴얼" > "입력 도크") */
export const COMMANDS: { id: CommandId; icon: IconName }[] = [
  { id: 'record', icon: 'mic' },
  { id: 'importAudio', icon: 'upload' },
  { id: 'findRecords', icon: 'search' },
  { id: 'openDocument', icon: 'file' },
  { id: 'routine', icon: 'bolt' },
  { id: 'newChat', icon: 'pencil' },
  { id: 'settings', icon: 'settings' }
]

/** 라우트로 여는 명령. 설정은 채팅 위의 모달 라우트다 (references/features/ui.md "설정 모달") */
export const COMMAND_PATHS: Record<Extract<CommandId, 'settings'>, string> = {
  settings: PATHS.settings
}

/** 메뉴 한 묶음에 보여 주는 최대 줄 수. 거르면서 줄어든다 */
export const MAX_MENU_ITEMS = 8

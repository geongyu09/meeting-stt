import { globalShortcut } from 'electron'
import { warn } from '../log'
import { requestRecordingCommand, toggleWidgetVisible } from './widget'

/** 고정값이다. 커스터마이즈 UI는 만들지 않는다 (references/architecture.md) */
const RECORDING_TOGGLE_ACCELERATOR = 'Alt+Command+R'
const WIDGET_TOGGLE_ACCELERATOR = 'Alt+Command+W'

/**
 * 다른 앱이 이미 잡고 있으면 등록이 실패한다. 이때 앱을 멈추지 않는다 —
 * 단축키가 없어도 패널과 메뉴바로 모든 동작을 할 수 있다 (references/pitfalls.md).
 */
const register = ({ accelerator, action }: { accelerator: string; action: () => void }) => {
  if (globalShortcut.register(accelerator, action)) return

  warn(`전역 단축키 ${accelerator}를 등록하지 못했습니다 (다른 앱이 쓰는 중일 수 있습니다)`)
}

export const registerGlobalShortcuts = () => {
  register({
    accelerator: RECORDING_TOGGLE_ACCELERATOR,
    action: () => requestRecordingCommand({ kind: 'toggle' })
  })
  register({ accelerator: WIDGET_TOGGLE_ACCELERATOR, action: toggleWidgetVisible })
}

export const unregisterGlobalShortcuts = () => {
  globalShortcut.unregisterAll()
}

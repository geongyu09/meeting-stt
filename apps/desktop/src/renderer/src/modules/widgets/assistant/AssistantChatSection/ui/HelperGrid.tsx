import Icon from '@renderer/shared/components/primitives/ui/Icon'
import { useLocale } from '@renderer/shared/provider/context/localeContext'

import { COMMANDS } from '../constants/commands'
import type { CommandId } from '../types/menu'
import styles from './HelperGrid.module.css'

interface HelperGridProps {
  /** 녹음 시작 옆에 보여 줄 단축키 표시(`⌥⌘R`). 아직 모르면 null */
  recordShortcut: string | null
  /** 대화 중 입력 도크 아래의 한 줄. 설명 없이 아이콘과 이름만 */
  isCompact?: boolean
  onCommand: (id: CommandId) => void
}

/** 빈 대화일 때 입력 도크 위에 놓이는 도우미 6개. `/` 명령 메뉴의 내장 명령과 같은 목록이다 */
export default function HelperGrid({
  recordShortcut,
  isCompact = false,
  onCommand
}: HelperGridProps) {
  const { t } = useLocale()
  const labels = t.assistant.chat

  return (
    <nav aria-label={labels.menu.helpers} className={isCompact ? styles.row : styles.helpers}>
      {COMMANDS.map(({ id, icon }) => (
        <button key={id} type="button" className={styles.helper} onClick={() => onCommand(id)}>
          <Icon name={icon} size={18} />
          <span>
            <b>
              {labels.commands[id].label}
              {id === 'record' && recordShortcut ? (
                <span className={styles.key}>{recordShortcut}</span>
              ) : null}
            </b>
            {isCompact ? null : <small>{labels.commands[id].description}</small>}
          </span>
        </button>
      ))}
    </nav>
  )
}

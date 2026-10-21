import Icon from '@renderer/shared/components/primitives/ui/Icon'

import type { MenuGroup, MenuItem } from '../types/menu'
import styles from './CommandMenu.module.css'

interface CommandMenuProps {
  /** textarea의 aria-controls가 가리키는 id */
  id: string
  label: string
  groups: MenuGroup[]
  selectedId: string | null
  /** 옵션 DOM id. textarea의 aria-activedescendant와 맞춘다 */
  optionIdOf: (item: MenuItem) => string
  onPick: (item: MenuItem) => void
}

/** 입력 도크 위로 펼쳐지는 목록. 묶음(명령·스킬·파일)마다 제목을 두고 전체가 listbox 하나다 */
export default function CommandMenu({
  id,
  label,
  groups,
  selectedId,
  optionIdOf,
  onPick
}: CommandMenuProps) {
  return (
    <div id={id} role="listbox" aria-label={label} className={styles.menu}>
      {groups.map((group) => (
        <div key={group.id} role="group" aria-label={group.title}>
          <div className={styles.heading} aria-hidden="true">
            {group.title}
          </div>
          {group.items.map((item) => (
            <div
              key={item.id}
              id={optionIdOf(item)}
              role="option"
              aria-selected={item.id === selectedId}
              className={styles.option}
              // mousedown을 막아야 textarea의 포커스가 유지된다
              onMouseDown={(event) => {
                event.preventDefault()
                onPick(item)
              }}
            >
              <Icon name={item.icon} size={18} />
              <span className={styles.text}>
                <b className={item.isMono ? styles.mono : undefined}>{item.title}</b>
                {item.description ? <small>{item.description}</small> : null}
              </span>
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}

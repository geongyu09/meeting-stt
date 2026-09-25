import { useState, type FocusEvent, type KeyboardEvent } from 'react'
import type { TranscriptFormat } from '@meeting-stt/core/format'
import Button from '@renderer/shared/components/primitives/ui/Button'
import Icon from '@renderer/shared/components/primitives/ui/Icon'
import { useLocale } from '@renderer/shared/provider/context/localeContext'

import styles from './TranscriptActions.module.css'

interface TranscriptActionsProps {
  isCopyEnabled: boolean
  copiedKey: string | null
  onCopy: (params: { format: TranscriptFormat }) => void
  onDelete: () => void
}

type MenuStage = 'closed' | 'open' | 'confirming'

/** 상단 바의 복사·더보기. 회의 삭제는 더보기 안에서 2단계 인라인 확인을 거친다 */
export default function TranscriptActions({
  isCopyEnabled,
  copiedKey,
  onCopy,
  onDelete
}: TranscriptActionsProps) {
  const { t } = useLocale()
  const [menuStage, setMenuStage] = useState<MenuStage>('closed')

  const copyLabel = ({ format, text }: { format: TranscriptFormat; text: string }) =>
    copiedKey === format ? t.transcript.actions.copied : text

  // 메뉴 밖으로 포커스가 나가면 닫는다. 메뉴 안의 버튼 사이 이동은 유지한다
  const handleBlur = (event: FocusEvent<HTMLDivElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget)) setMenuStage('closed')
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') setMenuStage('closed')
  }

  return (
    <>
      <Button
        variant="secondary"
        size="sm"
        disabled={!isCopyEnabled}
        onClick={() => onCopy({ format: 'plain' })}
      >
        <Icon name="copy" size={14} />
        {copyLabel({ format: 'plain', text: t.transcript.actions.copyAll })}
      </Button>
      <Button
        variant="secondary"
        size="sm"
        disabled={!isCopyEnabled}
        onClick={() => onCopy({ format: 'markdown' })}
      >
        <Icon name="markdown" size={14} />
        {copyLabel({ format: 'markdown', text: t.transcript.actions.copyMarkdown })}
      </Button>
      <div className={styles.menuContainer} onBlur={handleBlur} onKeyDown={handleKeyDown}>
        <button
          type="button"
          className={styles.moreButton}
          aria-label={t.transcript.actions.more}
          aria-expanded={menuStage !== 'closed'}
          onClick={() => setMenuStage(menuStage === 'closed' ? 'open' : 'closed')}
        >
          <Icon name="more" />
        </button>
        {menuStage === 'open' ? (
          <div className={styles.menu}>
            <button
              type="button"
              className={styles.menuItem}
              onClick={() => setMenuStage('confirming')}
            >
              {t.transcript.actions.deleteMeeting}
            </button>
          </div>
        ) : null}
        {menuStage === 'confirming' ? (
          <div className={styles.confirm} role="alert">
            <span>{t.transcript.actions.deleteConfirm}</span>
            <span className={styles.confirmActions}>
              <Button variant="secondary" size="sm" onClick={() => setMenuStage('closed')}>
                {t.transcript.actions.cancel}
              </Button>
              <Button variant="danger" size="sm" onClick={onDelete}>
                {t.transcript.actions.confirmDelete}
              </Button>
            </span>
          </div>
        ) : null}
      </div>
    </>
  )
}

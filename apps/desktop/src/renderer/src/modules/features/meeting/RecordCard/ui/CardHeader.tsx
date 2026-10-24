import { useEffect, useRef, useState } from 'react'
import { writeClipboardTextApi } from '@renderer/shared/api/clipboard'
import InlineEditableText from '@renderer/shared/components/composites/InlineEditableText'
import Button from '@renderer/shared/components/primitives/ui/Button'
import Icon from '@renderer/shared/components/primitives/ui/Icon'
import { useLocale } from '@renderer/shared/provider/context/localeContext'

import styles from './CardHeader.module.css'

/** "복사했습니다" 표시를 유지하는 시간 */
const COPIED_FEEDBACK_MS = 2000
const ICON_SIZE = 16

type MenuStep = 'closed' | 'menu' | 'confirm'

interface CardHeaderProps {
  title: string
  meta: string
  /** 기록 복사 버튼이 클립보드에 쓸 전체 평문 */
  copyText: string
  saveError: Error | null
  onRename: (title: string) => void
  onDelete: () => Promise<boolean>
}

/** 제목(인라인 편집)·메타와 기록 복사·더보기(제목 수정, 회의 삭제는 2단계 인라인 확인 — `window.confirm`은 쓰지 않는다) */
export default function CardHeader({
  title,
  meta,
  copyText,
  saveError,
  onRename,
  onDelete
}: CardHeaderProps) {
  const { t } = useLocale()
  const labels = t.transcript.card
  const [isCopied, setIsCopied] = useState(false)
  const [copyError, setCopyError] = useState<string | null>(null)
  const [menuStep, setMenuStep] = useState<MenuStep>('closed')
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const titleRef = useRef<HTMLButtonElement>(null)

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    },
    []
  )

  const copy = async () => {
    try {
      await writeClipboardTextApi({ text: copyText })
      setIsCopied(true)
      setCopyError(null)
      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => setIsCopied(false), COPIED_FEEDBACK_MS)
    } catch (caught) {
      setCopyError(caught instanceof Error ? caught.message : t.common.copyFailed)
    }
  }

  const handleEditTitle = () => {
    setMenuStep('closed')
    titleRef.current?.click()
  }

  const error = copyError ?? saveError?.message

  return (
    <header className={styles.header}>
      <div className={styles.titles}>
        <h2 className={styles.title}>
          <InlineEditableText
            ref={titleRef}
            value={title}
            ariaLabel={t.transcript.header.titleLabel}
            onCommit={onRename}
          />
        </h2>
        <span className={styles.meta}>{meta}</span>
      </div>
      <button
        type="button"
        className={styles.iconButton}
        aria-label={isCopied ? labels.copied : labels.copyRecord}
        onClick={copy}
      >
        <Icon name={isCopied ? 'check' : 'copy'} size={ICON_SIZE} />
      </button>
      <button
        type="button"
        className={styles.iconButton}
        aria-label={labels.more}
        aria-expanded={menuStep !== 'closed'}
        onClick={() => setMenuStep(menuStep === 'closed' ? 'menu' : 'closed')}
      >
        <Icon name="more" size={ICON_SIZE} />
      </button>
      {menuStep === 'menu' ? (
        <div className={styles.menu}>
          <Button variant="secondary" size="sm" onClick={handleEditTitle}>
            {t.transcript.actions.editTitle}
          </Button>
          <Button variant="danger" size="sm" onClick={() => setMenuStep('confirm')}>
            {t.transcript.actions.deleteMeeting}
          </Button>
        </div>
      ) : null}
      {menuStep === 'confirm' ? (
        <div className={styles.menu}>
          <span className={styles.confirmText}>{t.transcript.actions.deleteConfirm}</span>
          <Button variant="secondary" size="sm" onClick={() => setMenuStep('closed')}>
            {t.transcript.actions.cancel}
          </Button>
          <Button variant="danger" size="sm" onClick={() => void onDelete()}>
            {t.transcript.actions.confirmDelete}
          </Button>
        </div>
      ) : null}
      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
    </header>
  )
}

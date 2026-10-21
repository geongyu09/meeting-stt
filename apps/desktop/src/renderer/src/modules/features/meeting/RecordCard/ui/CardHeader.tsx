import { useEffect, useRef, useState } from 'react'
import { writeClipboardTextApi } from '@renderer/shared/api/clipboard'
import Button from '@renderer/shared/components/primitives/ui/Button'
import Icon from '@renderer/shared/components/primitives/ui/Icon'
import { useLocale } from '@renderer/shared/provider/context/localeContext'

import styles from './CardHeader.module.css'

/** "복사했습니다" 표시를 유지하는 시간 */
const COPIED_FEEDBACK_MS = 2000
const ICON_SIZE = 16

type DeleteStep = 'closed' | 'menu' | 'confirm'

interface CardHeaderProps {
  title: string
  meta: string
  /** 기록 복사 버튼이 클립보드에 쓸 전체 평문 */
  copyText: string
  saveError: Error | null
  onDelete: () => Promise<boolean>
}

/** 제목·메타와 기록 복사·더보기(회의 삭제, 2단계 인라인 확인 — `window.confirm`은 쓰지 않는다) */
export default function CardHeader({
  title,
  meta,
  copyText,
  saveError,
  onDelete
}: CardHeaderProps) {
  const { t } = useLocale()
  const labels = t.transcript.card
  const [isCopied, setIsCopied] = useState(false)
  const [copyError, setCopyError] = useState<string | null>(null)
  const [deleteStep, setDeleteStep] = useState<DeleteStep>('closed')
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

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

  const error = copyError ?? saveError?.message

  return (
    <header className={styles.header}>
      <div className={styles.titles}>
        <h2 className={styles.title}>{title}</h2>
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
        aria-expanded={deleteStep !== 'closed'}
        onClick={() => setDeleteStep(deleteStep === 'closed' ? 'menu' : 'closed')}
      >
        <Icon name="more" size={ICON_SIZE} />
      </button>
      {deleteStep === 'menu' ? (
        <div className={styles.menu}>
          <Button variant="danger" size="sm" onClick={() => setDeleteStep('confirm')}>
            {t.transcript.actions.deleteMeeting}
          </Button>
        </div>
      ) : null}
      {deleteStep === 'confirm' ? (
        <div className={styles.menu}>
          <span className={styles.confirmText}>{t.transcript.actions.deleteConfirm}</span>
          <Button variant="secondary" size="sm" onClick={() => setDeleteStep('closed')}>
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

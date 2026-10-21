import { useEffect, useRef, useState } from 'react'
import { writeClipboardTextApi } from '@renderer/shared/api/clipboard'
import Icon from '@renderer/shared/components/primitives/ui/Icon'
import { useLocale } from '@renderer/shared/provider/context/localeContext'

import styles from './CopyAnswerButton.module.css'

/** "복사했습니다" 표시를 유지하는 시간 */
const COPIED_FEEDBACK_MS = 2000

interface CopyAnswerButtonProps {
  /** 답변의 마크다운 원문 그대로 복사한다 */
  text: string
}

export default function CopyAnswerButton({ text }: CopyAnswerButtonProps) {
  const { t } = useLocale()
  const labels = t.assistant.chat
  const [isCopied, setIsCopied] = useState(false)
  const [isFailed, setIsFailed] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    },
    []
  )

  const handleClick = async () => {
    try {
      await writeClipboardTextApi({ text })
      setIsFailed(false)
      setIsCopied(true)
      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => setIsCopied(false), COPIED_FEEDBACK_MS)
    } catch {
      setIsFailed(true)
    }
  }

  return (
    <div className={styles.row}>
      <button
        type="button"
        className={[styles.copy, isCopied ? styles.copied : ''].join(' ')}
        aria-label={isCopied ? labels.copied : labels.copyAnswer}
        title={isCopied ? labels.copied : labels.copyAnswer}
        onClick={handleClick}
      >
        <Icon name={isCopied ? 'check' : 'copy'} size={14} />
      </button>
      {isFailed ? (
        <span className={styles.error} role="alert">
          {t.common.copyFailed}
        </span>
      ) : null}
    </div>
  )
}

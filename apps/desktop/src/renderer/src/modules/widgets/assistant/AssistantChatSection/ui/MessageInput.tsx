import { useState, type FormEvent, type KeyboardEvent } from 'react'
import { MAX_QUESTION_CHARS } from '@shared/assistant'
import Button from '@renderer/shared/components/primitives/ui/Button'
import { useLocale } from '@renderer/shared/provider/context/localeContext'

import styles from './MessageInput.module.css'

interface MessageInputProps {
  isRunning: boolean
  /** 폴더·CLI가 준비되지 않았으면 입력을 막는다 */
  isDisabled: boolean
  onSend: (text: string) => Promise<void>
  onStop: () => void
}

/** 질문 입력. Enter 전송, Shift+Enter 줄바꿈, 한글 조합 중 Enter는 전송하지 않는다 (references/pitfalls.md) */
export default function MessageInput({ isRunning, isDisabled, onSend, onStop }: MessageInputProps) {
  const { t } = useLocale()
  const labels = t.assistant.chat
  const [text, setText] = useState('')
  const [isSending, setIsSending] = useState(false)
  const [sendError, setSendError] = useState<string | null>(null)
  const canSend = !isDisabled && !isRunning && !isSending && text.trim() !== ''

  const submit = async () => {
    if (!canSend) return

    setIsSending(true)
    try {
      await onSend(text)
      setText('')
      setSendError(null)
    } catch (caught) {
      setSendError(caught instanceof Error ? caught.message : labels.sendError)
    } finally {
      setIsSending(false)
    }
  }

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault()
    void submit()
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) return

    event.preventDefault()
    void submit()
  }

  return (
    <form className={styles.form} onSubmit={handleSubmit}>
      {sendError ? (
        <p className={styles.error} role="alert">
          {sendError}
        </p>
      ) : null}
      <div className={styles.row}>
        <textarea
          className={styles.input}
          aria-label={labels.inputLabel}
          placeholder={labels.placeholder}
          value={text}
          maxLength={MAX_QUESTION_CHARS}
          rows={3}
          disabled={isDisabled}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={handleKeyDown}
        />
        {isRunning ? (
          <Button variant="secondary" onClick={onStop}>
            {labels.stop}
          </Button>
        ) : (
          <Button type="submit" variant="accent" disabled={!canSend}>
            {labels.send}
          </Button>
        )}
      </div>
    </form>
  )
}

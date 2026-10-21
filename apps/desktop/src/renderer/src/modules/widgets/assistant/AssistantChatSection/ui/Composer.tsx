import { useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { MAX_QUESTION_CHARS } from '@shared/assistant'
import Icon from '@renderer/shared/components/primitives/ui/Icon'
import { useLocale } from '@renderer/shared/provider/context/localeContext'

import type { CommandId, MenuGroup, MenuItem } from '../types/menu'
import { menuQueryOf, replaceMenuToken } from '../utils/menuQuery'
import CommandMenu from './CommandMenu'
import styles from './Composer.module.css'

/** 이보다 길면 textarea 안에서 스크롤한다 */
const MAX_INPUT_HEIGHT_PX = 200

interface ComposerProps {
  placeholder: string
  isRunning: boolean
  /** 녹음 중이면 마이크 버튼이 눌린 상태다. 누르면 정지한다 */
  isRecording: boolean
  /** 폴더·CLI가 준비되지 않았으면 입력을 막는다 */
  isDisabled: boolean
  /** 끝 토큰(`/`·`@`)으로 묶음을 만든다. 메뉴를 열 필요가 없으면 빈 배열 */
  groupsOf: (query: ReturnType<typeof menuQueryOf>) => MenuGroup[]
  onSend: (text: string) => Promise<void>
  onStop: () => void
  onRecord: () => void
  onCommand: (id: CommandId) => void
}

/**
 * 입력 도크 (references/features/ui.md "채팅창 리뉴얼" > "입력 도크").
 * Enter 전송, Shift+Enter 줄바꿈, 한글 조합 중 Enter는 무시한다 (references/pitfalls.md). 메뉴가 열려 있으면 Enter는 고르기다.
 */
export default function Composer({
  placeholder,
  isRunning,
  isRecording,
  isDisabled,
  groupsOf,
  onSend,
  onStop,
  onRecord,
  onCommand
}: ComposerProps) {
  const { t } = useLocale()
  const labels = t.assistant.chat
  const menuId = useId()
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const [text, setText] = useState('')
  const [isSending, setIsSending] = useState(false)
  const [sendError, setSendError] = useState<string | null>(null)
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [isMenuDismissed, setIsMenuDismissed] = useState(false)

  const query = menuQueryOf(text)
  const groups = query && !isMenuDismissed ? groupsOf(query) : []
  const items = groups.flatMap((group) => group.items)
  const selected = items.length ? items[Math.min(selectedIndex, items.length - 1)] : null
  const optionIdOf = (item: MenuItem) => `${menuId}-${item.id}`
  const canSend = !isDisabled && !isRunning && !isSending && text.trim() !== ''

  // 내용만큼 자라는 1줄 입력. DOM 측정이라 effect다
  useEffect(() => {
    const input = inputRef.current
    if (!input) return
    input.style.height = 'auto'
    input.style.height = `${Math.min(input.scrollHeight, MAX_INPUT_HEIGHT_PX)}px`
  }, [text])

  const changeText = (next: string) => {
    setText(next)
    setSelectedIndex(0)
    setIsMenuDismissed(false)
  }

  const pick = (item: MenuItem) => {
    if (item.action.kind === 'command') {
      changeText('')
      onCommand(item.action.commandId)
      return
    }
    if (query)
      changeText(replaceMenuToken({ text, start: query.start, replacement: item.action.text }))
  }

  const submit = async () => {
    if (!canSend) return

    setIsSending(true)
    try {
      await onSend(text)
      changeText('')
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
    if (event.nativeEvent.isComposing) return

    if (selected) {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault()
        const step = event.key === 'ArrowDown' ? 1 : -1
        setSelectedIndex((items.indexOf(selected) + step + items.length) % items.length)
        return
      }
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault()
        pick(selected)
        return
      }
      if (event.key === 'Escape') {
        event.preventDefault()
        setIsMenuDismissed(true)
        return
      }
    }
    if (event.key !== 'Enter' || event.shiftKey) return

    event.preventDefault()
    void submit()
  }

  return (
    <div className={styles.dock}>
      {sendError ? (
        <p className={styles.error} role="alert">
          {sendError}
        </p>
      ) : null}
      {groups.length ? (
        <CommandMenu
          id={menuId}
          label={groups[0].title}
          groups={groups}
          selectedId={selected?.id ?? null}
          optionIdOf={optionIdOf}
          onPick={pick}
        />
      ) : null}
      <form
        className={[styles.form, groups.length ? styles.withMenu : ''].join(' ')}
        aria-label={labels.title}
        onSubmit={handleSubmit}
      >
        <textarea
          ref={inputRef}
          className={styles.input}
          aria-label={labels.inputLabel}
          aria-controls={groups.length ? menuId : undefined}
          aria-expanded={groups.length > 0}
          aria-activedescendant={selected ? optionIdOf(selected) : undefined}
          placeholder={placeholder}
          value={text}
          maxLength={MAX_QUESTION_CHARS}
          rows={1}
          disabled={isDisabled}
          onChange={(event) => changeText(event.target.value)}
          onKeyDown={handleKeyDown}
        />
        <button
          type="button"
          className={styles.iconButton}
          aria-label={labels.record}
          aria-pressed={isRecording}
          onClick={onRecord}
        >
          <Icon name="mic" size={18} />
        </button>
        {isRunning ? (
          <button
            type="button"
            className={[styles.iconButton, styles.primary].join(' ')}
            aria-label={labels.stop}
            onClick={onStop}
          >
            <Icon name="stop" size={16} />
          </button>
        ) : (
          <button
            type="submit"
            className={[styles.iconButton, styles.primary].join(' ')}
            aria-label={labels.send}
            disabled={!canSend}
          >
            <Icon name="arrowUp" size={18} />
          </button>
        )}
      </form>
    </div>
  )
}

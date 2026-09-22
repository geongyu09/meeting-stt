import { useRef, useState, type KeyboardEvent } from 'react'

interface UseInlineEditParams {
  value: string
  isMultiline: boolean
  onCommit: (next: string) => void
}

type EditKeyboardEvent = KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>

const useInlineEdit = ({ value, isMultiline, onCommit }: UseInlineEditParams) => {
  const [isEditing, setIsEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  // Escape로 취소한 직후 blur가 이어질 수 있어, 취소를 렌더와 무관한 플래그로 남긴다
  const isCancelledRef = useRef(false)

  const startEditing = () => {
    isCancelledRef.current = false
    setDraft(value)
    setIsEditing(true)
  }

  const cancel = () => {
    isCancelledRef.current = true
    setIsEditing(false)
  }

  /** 빈 값은 저장하지 않고 원래 값으로 되돌린다 (references/architecture.md) */
  const commit = () => {
    setIsEditing(false)
    if (isCancelledRef.current) return

    const next = draft.trim()
    if (!next || next === value) return

    onCommit(next)
  }

  const handleKeyDown = (event: EditKeyboardEvent) => {
    if (event.key === 'Escape') {
      cancel()
      return
    }

    if (event.key !== 'Enter') return
    // 여러 줄 편집에서 Enter는 줄바꿈이라 확정은 수식 키와 함께 눌렀을 때만 한다
    if (isMultiline && !event.metaKey && !event.ctrlKey) return

    event.preventDefault()
    commit()
  }

  return { isEditing, draft, setDraft, startEditing, commit, handleKeyDown }
}

export default useInlineEdit

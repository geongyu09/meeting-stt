import type { LoadedDocument } from '../types/document'

interface MergeExternalChangeParams {
  current: LoadedDocument | null
  path: string
  /** 감시 이벤트 뒤 다시 읽은 내용. 읽기에 실패하면(지워짐) null */
  content: string | null
}

/**
 * 감시 이벤트로 다시 읽은 내용을 열린 문서에 반영합니다 (references/architecture.md "개인 비서 모드" > "문서 에디터").
 * 앱이 직접 저장한 직후라 내용이 같으면 그대로, 편집 중이 아니면 새 내용으로, 편집 중이면 덮어쓰지 않고 표시만 한다.
 * @example
 * mergeExternalChange({ current, path: 'a.md', content: '새 내용' })
 */
export const mergeExternalChange = ({ current, path, content }: MergeExternalChangeParams) => {
  if (!current || current.path !== path || content === current.saved) return current
  if (content !== null && current.draft === current.saved) {
    return { ...current, saved: content, draft: content, hasExternalChange: false }
  }

  return { ...current, hasExternalChange: true }
}

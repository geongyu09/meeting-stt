import Icon from '@renderer/shared/components/primitives/ui/Icon'
import { useLocale } from '@renderer/shared/provider/context/localeContext'

import styles from './EditorToolbar.module.css'

interface EditorToolbarProps {
  files: string[]
  openPath: string | null
  onOpenPathChange: (path: string | null) => void
  isDirty: boolean
  isSaving: boolean
  isJustSaved: boolean
  onSave: () => void
  onClose: () => void
}

/** 패널 헤더 — 문서 고르기 · 저장(⌘S) · 닫기. 저장 상태 문구는 저장하지 않은 변경 → 저장했습니다 순서로 바뀐다 */
export default function EditorToolbar({
  files,
  openPath,
  onOpenPathChange,
  isDirty,
  isSaving,
  isJustSaved,
  onSave,
  onClose
}: EditorToolbarProps) {
  const { t } = useLocale()
  const labels = t.assistant.editor
  // 에이전트가 방금 만든 파일은 감시 이벤트로 목록이 갱신되기 전에 열릴 수 있다
  const options = openPath && !files.includes(openPath) ? [openPath, ...files] : files
  const saveState = isDirty ? labels.unsaved : isJustSaved ? labels.saved : null

  return (
    <div className={styles.toolbar}>
      <Icon name="file" />
      <select
        className={styles.select}
        aria-label={labels.fileList}
        value={openPath ?? ''}
        onChange={(event) => onOpenPathChange(event.target.value || null)}
      >
        <option value="">{labels.pickFile}</option>
        {options.map((file) => (
          <option key={file} value={file}>
            {file}
          </option>
        ))}
      </select>
      {saveState ? (
        <span className={styles.saveState} role="status">
          {saveState}
        </span>
      ) : null}
      <button
        type="button"
        className={styles.saveButton}
        disabled={!isDirty || isSaving}
        onClick={onSave}
      >
        {labels.save}
        <span className={styles.key} aria-hidden="true">
          {labels.saveKey}
        </span>
      </button>
      <button
        type="button"
        className={styles.iconButton}
        aria-label={labels.close}
        onClick={onClose}
      >
        <Icon name="close" size={18} />
      </button>
    </div>
  )
}

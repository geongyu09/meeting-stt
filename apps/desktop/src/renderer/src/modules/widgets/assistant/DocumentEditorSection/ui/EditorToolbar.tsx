import Button from '@renderer/shared/components/primitives/ui/Button'
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
}

/** 문서 고르기와 저장. 저장 상태 문구는 저장하지 않은 변경 → 저장했습니다 순서로 바뀐다 */
export default function EditorToolbar({
  files,
  openPath,
  onOpenPathChange,
  isDirty,
  isSaving,
  isJustSaved,
  onSave
}: EditorToolbarProps) {
  const { t } = useLocale()
  const labels = t.assistant.editor
  // 에이전트가 방금 만든 파일은 감시 이벤트로 목록이 갱신되기 전에 열릴 수 있다
  const options = openPath && !files.includes(openPath) ? [openPath, ...files] : files
  const saveState = isDirty ? labels.unsaved : isJustSaved ? labels.saved : null

  return (
    <div className={styles.toolbar}>
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
      <Button variant="secondary" size="sm" disabled={!isDirty || isSaving} onClick={onSave}>
        {labels.save}
      </Button>
    </div>
  )
}

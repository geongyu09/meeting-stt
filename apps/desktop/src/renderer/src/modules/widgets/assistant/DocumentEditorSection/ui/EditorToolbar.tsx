import Icon from '@renderer/shared/components/primitives/ui/Icon'
import { useLocale } from '@renderer/shared/provider/context/localeContext'

import styles from './EditorToolbar.module.css'

interface EditorToolbarProps {
  openPath: string | null
  /** 열린 문서를 닫고 파일 트리로 돌아간다 */
  onBack: () => void
  isDirty: boolean
  isSaving: boolean
  isJustSaved: boolean
  onSave: () => void
  onClose: () => void
}

/** 패널 헤더 — 목록으로 · 문서 경로 · 저장(⌘S) · 닫기. 저장 상태 문구는 저장하지 않은 변경 → 저장했습니다 순서로 바뀐다 */
export default function EditorToolbar({
  openPath,
  onBack,
  isDirty,
  isSaving,
  isJustSaved,
  onSave,
  onClose
}: EditorToolbarProps) {
  const { t } = useLocale()
  const labels = t.assistant.editor
  const saveState = isDirty ? labels.unsaved : isJustSaved ? labels.saved : null

  return (
    <div className={styles.toolbar}>
      {openPath ? (
        <button
          type="button"
          className={`${styles.iconButton} ${styles.backButton}`}
          aria-label={labels.fileList}
          onClick={onBack}
        >
          <Icon name="chevronDown" size={18} />
        </button>
      ) : (
        <Icon name="file" />
      )}
      <span className={styles.title} title={openPath ?? undefined}>
        {openPath ?? labels.title}
      </span>
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

import { useState, type KeyboardEvent } from 'react'
import Button from '@renderer/shared/components/primitives/ui/Button'
import useAssistantStatus from '@renderer/shared/hooks/domain/assistant/useAssistantStatus'
import useWorkspaceFiles from '@renderer/shared/hooks/domain/assistant/useWorkspaceFiles'
import { useLocale } from '@renderer/shared/provider/context/localeContext'

import useDocumentEditor from './model/useDocumentEditor'
import EditorToolbar from './ui/EditorToolbar'
import FileTree from './ui/FileTree'
import { fileTreeOf } from './utils/fileTree'
import styles from './index.module.css'

interface DocumentEditorSectionProps {
  /** 열린 문서. 채팅의 바뀐 파일 칩과 같이 쓰므로 페이지가 든다 */
  openPath: string | null
  onOpenPathChange: (path: string | null) => void
  /** 패널을 닫는다. 페이지가 언마운트하므로 저장하지 않은 변경은 정리 effect가 저장한다 */
  onClose: () => void
}

/**
 * 대화 옆 문서 패널 — 파일 트리 + textarea (references/features/ui.md "채팅창 리뉴얼" > "문서 패널").
 * 에디터 라이브러리는 쓰지 않는다 (SKILL.md 1절 "편집").
 */
export default function DocumentEditorSection({
  openPath,
  onOpenPathChange,
  onClose
}: DocumentEditorSectionProps) {
  const { t } = useLocale()
  const labels = t.assistant.editor
  const { status } = useAssistantStatus()
  const folder = status && !status.folderProblem ? status.folder : null
  const { files, error: listError } = useWorkspaceFiles({ folder })
  const editor = useDocumentEditor({ path: folder ? openPath : null })
  // 문서를 열었다 목록으로 돌아와도 펼친 폴더를 유지하려고 트리 밖에 둔다
  const [expandedPaths, setExpandedPaths] = useState<ReadonlySet<string>>(new Set())

  const handleToggle = (path: string) =>
    setExpandedPaths((current) => {
      const next = new Set(current)
      if (current.has(path)) next.delete(path)
      else next.add(path)
      return next
    })

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (!(event.metaKey || event.ctrlKey) || event.key !== 's') return

    event.preventDefault()
    void editor.save()
  }

  const message = !folder
    ? null
    : listError
      ? labels.listError
      : openPath
        ? editor.loadError
        : files.length
          ? null
          : labels.noFiles
  const isTreeShown = Boolean(folder) && !listError && !openPath && files.length > 0

  return (
    <section className={styles.section} aria-label={labels.title}>
      <EditorToolbar
        openPath={folder ? openPath : null}
        onBack={() => onOpenPathChange(null)}
        isDirty={editor.isDirty}
        isSaving={editor.isSaving}
        isJustSaved={editor.isJustSaved}
        onSave={() => void editor.save()}
        onClose={onClose}
      />
      {editor.hasExternalChange ? (
        <div className={styles.notice} role="status">
          <span>{labels.externalChange}</span>
          <Button variant="secondary" size="sm" onClick={() => void editor.reload()}>
            {labels.reload}
          </Button>
        </div>
      ) : null}
      {editor.saveError ? (
        <p className={styles.error} role="alert">
          {editor.saveError}
        </p>
      ) : null}
      {message ? <p className={styles.message}>{message}</p> : null}
      {isTreeShown ? (
        <nav className={styles.tree} aria-label={labels.fileList}>
          <FileTree
            nodes={fileTreeOf(files)}
            expandedPaths={expandedPaths}
            onToggle={handleToggle}
            onOpen={onOpenPathChange}
          />
        </nav>
      ) : null}
      {openPath && editor.isLoaded ? (
        <textarea
          className={styles.editor}
          aria-label={labels.editorLabel({ path: openPath })}
          value={editor.draft}
          spellCheck={false}
          onChange={(event) => editor.edit(event.target.value)}
          onKeyDown={handleKeyDown}
        />
      ) : null}
    </section>
  )
}

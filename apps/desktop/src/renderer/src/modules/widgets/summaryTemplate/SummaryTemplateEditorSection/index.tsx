import {
  DEFAULT_SUMMARY_TEMPLATE,
  LOCAL_MANY_BLOCKS_THRESHOLD,
  SUMMARY_TEMPLATE_MAX_BLOCKS,
  SUMMARY_TEMPLATE_NAME_MAX_CHARS
} from '@shared/summaryTemplate'
import Button from '@renderer/shared/components/primitives/ui/Button'
import { useLocale } from '@renderer/shared/provider/context/localeContext'

import useTemplateEditor from './model/useTemplateEditor'
import BlockPalette from './ui/BlockPalette'
import BlockStack from './ui/BlockStack'
import TemplateList from './ui/TemplateList'
import TemplatePreview from './ui/TemplatePreview'
import styles from './index.module.css'

/**
 * 준비된 블록을 위에서부터 쌓아 요약 형식을 만든다. 페이지 `/summary-templates`의 본문이다
 * (references/architecture.md "요약 템플릿 > 화면")
 */
export default function SummaryTemplateEditorSection() {
  const { t } = useLocale()
  const labels = t.summaryTemplate.section
  const editor = useTemplateEditor()
  const { draft, stack } = editor

  const renderBuiltIn = () => (
    <>
      <p className={styles.hint}>{labels.builtInHint}</p>
      <TemplatePreview blocks={DEFAULT_SUMMARY_TEMPLATE.blocks} />
      <div className={styles.actions}>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => editor.duplicateTemplate(DEFAULT_SUMMARY_TEMPLATE)}
          disabled={!editor.canCreate}
        >
          {labels.duplicate}
        </Button>
      </div>
    </>
  )

  const renderDeleteActions = () => {
    if (!editor.isConfirmingDelete) {
      return (
        <Button variant="secondary" onClick={() => editor.setIsConfirmingDelete(true)}>
          {labels.delete}
        </Button>
      )
    }

    return (
      <>
        <Button variant="danger" onClick={editor.deleteTemplate}>
          {labels.confirmDelete}
        </Button>
        <Button variant="secondary" onClick={() => editor.setIsConfirmingDelete(false)}>
          {labels.cancel}
        </Button>
      </>
    )
  }

  const renderSaveActions = (draftId: string | undefined) => (
    <div className={styles.actions}>
      <Button onClick={editor.saveTemplate} disabled={editor.isSaving || !editor.isDirty}>
        {editor.isSaving ? labels.saving : labels.save}
      </Button>
      {editor.isDirty && !editor.isSaving && <span className={styles.hint}>{labels.unsaved}</span>}
      <span className={styles.spacer} />
      {draftId ? (
        renderDeleteActions()
      ) : (
        <Button variant="secondary" onClick={editor.deleteTemplate}>
          {labels.close}
        </Button>
      )}
    </div>
  )

  const renderEditor = () => {
    if (!draft) return renderBuiltIn()

    const blockCount = stack.blocks.length

    return (
      <>
        <label className={styles.field}>
          <span className={styles.label}>{labels.nameLabel}</span>
          <input
            className={styles.input}
            maxLength={SUMMARY_TEMPLATE_NAME_MAX_CHARS}
            placeholder={labels.namePlaceholder}
            value={draft.name}
            onChange={(event) => editor.renameDraft(event.target.value)}
          />
        </label>

        <div className={styles.workspaceWrapper}>
          <div className={styles.workspace}>
            <aside className={styles.paletteColumn}>
              <span className={styles.label}>{labels.paletteLabel}</span>
              <span className={styles.hint}>{labels.paletteHint}</span>
              <BlockPalette
                usedKinds={stack.blocks.map(({ kind }) => kind)}
                isFull={blockCount >= SUMMARY_TEMPLATE_MAX_BLOCKS}
                onAdd={stack.addBlock}
              />
            </aside>

            <div className={styles.stackColumn}>
              <div className={styles.field}>
                <span className={styles.label}>
                  {labels.stackLabel}{' '}
                  <span className={styles.count}>
                    {labels.blockCount({ count: blockCount, max: SUMMARY_TEMPLATE_MAX_BLOCKS })}
                  </span>
                </span>
                <span className={styles.hint}>{labels.stackHint}</span>
                <BlockStack
                  blocks={stack.blocks}
                  onUpdate={stack.updateBlock}
                  onInsert={stack.insertBlock}
                  onMove={stack.moveBlock}
                  onRemove={stack.removeBlock}
                />
                {blockCount > LOCAL_MANY_BLOCKS_THRESHOLD && (
                  <p className={styles.warning} role="status">
                    {labels.manyBlocksWarning}
                  </p>
                )}
              </div>

              <TemplatePreview blocks={stack.summaryBlocks} />

              {renderSaveActions(draft.id)}
            </div>
          </div>
        </div>
      </>
    )
  }

  const renderBody = () => {
    if (editor.isLoading) return <p className={styles.hint}>{labels.loading}</p>
    if (editor.loadError) {
      return (
        <p className={styles.error} role="alert">
          {editor.loadError}
        </p>
      )
    }

    return (
      <>
        <TemplateList
          templates={editor.templates}
          activeId={editor.activeId}
          canCreate={editor.canCreate}
          onSelect={editor.selectTemplate}
          onCreate={editor.createTemplate}
        />
        {renderEditor()}
      </>
    )
  }

  return (
    <section className={styles.body} aria-label={labels.title}>
      <p className={styles.hint}>{labels.intro}</p>
      {renderBody()}
      {editor.notice && (
        <p className={styles.notice} role="status">
          {editor.notice}
        </p>
      )}
      {editor.actionError && (
        <p className={styles.error} role="alert">
          {editor.actionError}
        </p>
      )}
    </section>
  )
}

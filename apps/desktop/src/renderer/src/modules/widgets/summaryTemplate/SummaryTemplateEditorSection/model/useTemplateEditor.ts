import { useState } from 'react'
import {
  DEFAULT_SUMMARY_TEMPLATE_ID,
  SUMMARY_TEMPLATE_MAX_COUNT,
  summaryTemplateProblem
} from '@shared/summaryTemplate'
import type { SummaryBlock, SummaryTemplate } from '@shared/types'
import {
  deleteSummaryTemplateApi,
  saveSummaryTemplateApi
} from '@renderer/shared/api/summaryTemplate'
import useSummaryTemplates from '@renderer/shared/hooks/domain/summaryTemplate/useSummaryTemplates'
import { useLocale } from '@renderer/shared/provider/context/localeContext'

import useBlockStack from './useBlockStack'

/** 편집 중인 템플릿의 이름·id. id가 없으면 아직 저장하지 않은 새 템플릿이다 */
interface Draft {
  id?: string
  name: string
}

const messageOf = ({ caught, fallback }: { caught: unknown; fallback: string }) =>
  caught instanceof Error && caught.message ? caught.message : fallback

const sameBlocks = (left: SummaryBlock[], right: SummaryBlock[]) =>
  JSON.stringify(left) === JSON.stringify(right)

/**
 * 설정의 요약 템플릿 카테고리 상태. 기본 템플릿은 보기만 하고(복제만 가능), 사용자 템플릿은 고쳐 저장한다.
 * 다른 템플릿을 고르면 저장하지 않은 변경은 버린다 (references/architecture.md "요약 템플릿 > 화면").
 */
const useTemplateEditor = () => {
  const { t } = useLocale()
  const { templates, isLoading, loadError, replaceTemplates } = useSummaryTemplates()
  const stack = useBlockStack()
  const [draft, setDraft] = useState<Draft | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const saved = draft?.id ? templates.find(({ id }) => id === draft.id) : undefined
  const isDirty =
    draft !== null &&
    (!saved || saved.name !== draft.name.trim() || !sameBlocks(saved.blocks, stack.summaryBlocks))
  const userTemplateCount = templates.filter(({ isBuiltIn }) => !isBuiltIn).length
  const canCreate = userTemplateCount < SUMMARY_TEMPLATE_MAX_COUNT
  const activeId = draft ? (draft.id ?? null) : DEFAULT_SUMMARY_TEMPLATE_ID

  const startEditing = ({ nextDraft, blocks }: { nextDraft: Draft; blocks: SummaryBlock[] }) => {
    setDraft(nextDraft)
    stack.resetBlocks(blocks)
    setIsConfirmingDelete(false)
    setActionError(null)
    setNotice(null)
  }

  const selectTemplate = (template: SummaryTemplate) => {
    if (template.isBuiltIn) {
      setDraft(null)
      setIsConfirmingDelete(false)
      setActionError(null)
      setNotice(null)
      return
    }

    startEditing({ nextDraft: { id: template.id, name: template.name }, blocks: template.blocks })
  }

  const createTemplate = () =>
    startEditing({ nextDraft: { name: t.summaryTemplate.section.newName }, blocks: [] })

  const duplicateTemplate = (template: SummaryTemplate) => {
    const name = template.isBuiltIn ? t.summaryTemplate.defaultName : template.name
    startEditing({
      nextDraft: { name: t.summaryTemplate.section.copyName({ name }) },
      blocks: template.blocks
    })
  }

  const renameDraft = (name: string) => setDraft((prev) => (prev ? { ...prev, name } : prev))

  const saveTemplate = async () => {
    if (!draft) return

    setActionError(null)
    setNotice(null)
    const problem = summaryTemplateProblem({
      name: draft.name,
      blocks: stack.summaryBlocks,
      errors: t.summaryTemplate.errors,
      blockNames: t.summaryTemplate.blocks
    })
    if (problem) {
      setActionError(problem)
      return
    }

    setIsSaving(true)
    try {
      const next = await saveSummaryTemplateApi({
        id: draft.id,
        name: draft.name.trim(),
        blocks: stack.summaryBlocks
      })
      replaceTemplates(next)
      // 새 템플릿은 id를 모르므로 이름으로 찾는다 (사용자 템플릿끼리 이름은 겹치지 않는다)
      const stored = next.find(({ id, name, isBuiltIn }) =>
        draft.id ? id === draft.id : !isBuiltIn && name === draft.name.trim()
      )
      if (stored)
        startEditing({ nextDraft: { id: stored.id, name: stored.name }, blocks: stored.blocks })
      setNotice(t.summaryTemplate.actions.saved({ name: draft.name.trim() }))
    } catch (caught) {
      setActionError(messageOf({ caught, fallback: t.summaryTemplate.actions.saveError }))
    } finally {
      setIsSaving(false)
    }
  }

  const deleteTemplate = async () => {
    if (!draft) return
    // 아직 저장하지 않은 새 템플릿은 지울 것이 없어 편집만 닫는다
    if (!draft.id) {
      setDraft(null)
      return
    }

    setActionError(null)
    try {
      replaceTemplates(await deleteSummaryTemplateApi({ id: draft.id }))
      setDraft(null)
      setIsConfirmingDelete(false)
      setNotice(t.summaryTemplate.actions.deleted({ name: saved?.name ?? draft.name }))
    } catch (caught) {
      setActionError(messageOf({ caught, fallback: t.summaryTemplate.actions.deleteError }))
    }
  }

  return {
    templates,
    isLoading,
    loadError,
    draft,
    stack,
    activeId,
    isDirty,
    canCreate,
    isSaving,
    isConfirmingDelete,
    actionError,
    notice,
    selectTemplate,
    createTemplate,
    duplicateTemplate,
    renameDraft,
    saveTemplate,
    deleteTemplate,
    setIsConfirmingDelete
  }
}

export default useTemplateEditor

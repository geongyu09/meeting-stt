import { useEffect, useState } from 'react'
import { mergeGlossaryTerms } from '@shared/glossary'
import type { GlossarySettings } from '@shared/types'
import { draftGlossaryApi, getGlossaryApi, updateGlossaryApi } from '@renderer/shared/api/glossary'
import { useLocale } from '@renderer/shared/provider/context/localeContext'

import useTermRows from './useTermRows'

const EMPTY_GLOSSARY: GlossarySettings = { teamDescription: '', terms: [] }

const messageOf = ({ caught, fallback }: { caught: unknown; fallback: string }) =>
  caught instanceof Error && caught.message ? caught.message : fallback

/**
 * 설정의 용어 사전 카테고리 상태. 초안은 편집 중인 목록 뒤에 덧붙이기만 하고 저장하지 않는다 —
 * 모델 읽기가 틀릴 수 있어 사용자가 확인한 뒤 저장한다 (references/architecture.md "용어 사전").
 */
const useGlossary = () => {
  const { t } = useLocale()
  const [saved, setSaved] = useState(EMPTY_GLOSSARY)
  const [teamDescription, setTeamDescription] = useState('')
  const { rows, focusId, termLines, resetRows, addRow, updateRow, removeRow, pasteRows } =
    useTermRows()
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [isDrafting, setIsDrafting] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  useEffect(() => {
    getGlossaryApi()
      .then((glossary) => {
        setSaved(glossary)
        setTeamDescription(glossary.teamDescription)
        resetRows(glossary.terms)
      })
      .catch((caught: unknown) =>
        setLoadError(messageOf({ caught, fallback: t.glossary.actions.loadError }))
      )
      .finally(() => setIsLoading(false))
  }, [resetRows, t])

  const isDirty =
    teamDescription !== saved.teamDescription || termLines.join('\n') !== saved.terms.join('\n')

  const saveGlossary = async () => {
    setIsSaving(true)
    setActionError(null)
    setNotice(null)

    try {
      const next = await updateGlossaryApi({ teamDescription, terms: termLines })
      setSaved(next)
      setTeamDescription(next.teamDescription)
      resetRows(next.terms)
      setNotice(t.glossary.actions.saved({ count: next.terms.length }))
    } catch (caught) {
      setActionError(messageOf({ caught, fallback: t.glossary.actions.saveError }))
    } finally {
      setIsSaving(false)
    }
  }

  const draftTerms = async () => {
    setIsDrafting(true)
    setActionError(null)
    setNotice(null)

    try {
      const { terms: additions } = await draftGlossaryApi({ teamDescription })
      const { terms, addedCount } = mergeGlossaryTerms({ current: termLines, additions })
      resetRows(terms)
      setNotice(
        addedCount
          ? t.glossary.actions.drafted({ count: addedCount })
          : t.glossary.actions.nothingToAdd
      )
    } catch (caught) {
      setActionError(messageOf({ caught, fallback: t.glossary.actions.draftError }))
    } finally {
      setIsDrafting(false)
    }
  }

  return {
    teamDescription,
    rows,
    focusId,
    termCount: termLines.length,
    isLoading,
    loadError,
    isDirty,
    isSaving,
    isDrafting,
    actionError,
    notice,
    setTeamDescription,
    addRow,
    updateRow,
    removeRow,
    pasteRows,
    saveGlossary,
    draftTerms
  }
}

export default useGlossary

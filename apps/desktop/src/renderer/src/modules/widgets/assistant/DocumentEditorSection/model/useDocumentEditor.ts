import { useCallback, useEffect, useRef, useState } from 'react'
import { readWorkspaceFileApi, writeWorkspaceFileApi } from '@renderer/shared/api/assistant'
import { onWorkspaceFilesChanged } from '@renderer/shared/api/events'
import { useLocale } from '@renderer/shared/provider/context/localeContext'

import type { LoadedDocument } from '../types/document'
import { mergeExternalChange } from '../utils/mergeExternalChange'

interface UseDocumentEditorParams {
  /** 열 문서의 상대 경로. null이면 아무것도 열지 않는다 */
  path: string | null
}

/**
 * 문서 하나의 읽기·편집·저장 (references/architecture.md "개인 비서 모드" > "문서 에디터").
 * 다른 문서로 바꾸거나 화면을 떠나면 저장하지 않은 변경을 저장한다. 외부 변경 안내 중이면 덮어쓰지 않는다.
 */
const useDocumentEditor = ({ path }: UseDocumentEditorParams) => {
  const { t } = useLocale()
  const labels = t.assistant.editor
  const [doc, setDoc] = useState<LoadedDocument | null>(null)
  const [loadError, setLoadError] = useState<{ path: string; message: string } | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  // "저장했습니다"는 저장한 그 문서에만 보인다. 다른 문서를 열면 사라진다
  const [justSavedPath, setJustSavedPath] = useState<string | null>(null)
  const docRef = useRef(doc)

  useEffect(() => {
    docRef.current = doc
  })

  const load = useCallback(
    (target: string) =>
      readWorkspaceFileApi({ path: target })
        .then(({ content }) => {
          setDoc({ path: target, saved: content, draft: content, hasExternalChange: false })
          setLoadError(null)
        })
        .catch(() => setLoadError({ path: target, message: labels.loadError })),
    [labels]
  )

  useEffect(() => {
    if (!path) return undefined
    load(path)

    return () => {
      const current = docRef.current
      if (!current || current.path !== path) return
      if (current.draft === current.saved || current.hasExternalChange) return
      writeWorkspaceFileApi({ path: current.path, content: current.draft }).catch(() =>
        setSaveError(labels.saveError)
      )
    }
  }, [path, load, labels])

  useEffect(
    () =>
      onWorkspaceFilesChanged(({ paths }) => {
        if (!path || !paths.includes(path)) return
        readWorkspaceFileApi({ path })
          .then(({ content }) =>
            setDoc((current) => mergeExternalChange({ current, path, content }))
          )
          .catch(() => setDoc((current) => mergeExternalChange({ current, path, content: null })))
      }),
    [path]
  )

  const edit = (draft: string) => {
    setDoc((current) => (current ? { ...current, draft } : current))
    setJustSavedPath(null)
  }

  const save = async () => {
    if (!doc || doc.path !== path) return

    const { path: target, draft } = doc
    setIsSaving(true)
    try {
      await writeWorkspaceFileApi({ path: target, content: draft })
      setDoc((current) =>
        current?.path === target ? { ...current, saved: draft, hasExternalChange: false } : current
      )
      setSaveError(null)
      setJustSavedPath(target)
    } catch {
      setSaveError(labels.saveError)
    } finally {
      setIsSaving(false)
    }
  }

  const current = doc?.path === path ? doc : null

  return {
    draft: current?.draft ?? '',
    isLoaded: current !== null,
    isDirty: current !== null && current.draft !== current.saved,
    hasExternalChange: current?.hasExternalChange ?? false,
    loadError: loadError?.path === path ? loadError.message : null,
    saveError,
    isSaving,
    isJustSaved: justSavedPath !== null && justSavedPath === path,
    edit,
    save,
    reload: () => (path ? load(path) : undefined)
  }
}

export default useDocumentEditor

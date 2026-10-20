import { useCallback, useEffect, useState } from 'react'
import { onWorkspaceFilesChanged } from '@renderer/shared/api/events'
import { listWorkspaceFilesApi } from '@renderer/shared/api/assistant'
import { useLocale } from '@renderer/shared/provider/context/localeContext'

interface UseWorkspaceFilesParams {
  /** 작업 폴더. 바뀌면 목록을 다시 읽고, 없으면 읽지 않는다 */
  folder: string | null
}

/** 작업 폴더의 마크다운 문서 목록. 에이전트가 문서를 만들거나 지우면 감시 이벤트로 다시 읽는다 */
const useWorkspaceFiles = ({ folder }: UseWorkspaceFilesParams) => {
  const { t } = useLocale()
  const [files, setFiles] = useState<string[]>([])
  const [error, setError] = useState<Error | null>(null)

  const fetchFiles = useCallback(
    () =>
      listWorkspaceFilesApi()
        .then((next) => {
          setFiles(next)
          setError(null)
        })
        .catch((caught: unknown) =>
          setError(caught instanceof Error ? caught : new Error(t.assistant.editor.listError))
        ),
    [t]
  )

  useEffect(() => {
    if (folder) fetchFiles()
  }, [folder, fetchFiles])

  useEffect(
    () =>
      onWorkspaceFilesChanged(() => {
        if (folder) void fetchFiles()
      }),
    [folder, fetchFiles]
  )

  return { files, error, refetch: fetchFiles }
}

export default useWorkspaceFiles

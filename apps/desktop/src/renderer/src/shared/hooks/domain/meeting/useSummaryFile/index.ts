import { useEffect, useState } from 'react'
import { recordSummaryPathOf } from '@shared/assistant'
import type { OrganizeStage } from '@shared/types'
import { readWorkspaceFileApi, writeWorkspaceFileApi } from '@renderer/shared/api/assistant'
import { onSummaryProgress, onWorkspaceFilesChanged } from '@renderer/shared/api/events'
import { useLocale } from '@renderer/shared/provider/context/localeContext'

interface UseSummaryFileParams {
  meetingId: string
  /** 정리 상태의 원문 경로. 작업 폴더 밖(절대 경로)이면 요약 파일을 다루지 않는다 */
  notePath: string | null
  /** 정리가 끝나면 에이전트가 쓴 요약 파일을 다시 읽는다 — 파일 감시가 꺼져 있을 수 있다 */
  organizeStage: OrganizeStage | null
}

/**
 * 작업 폴더에 있는 이 기록의 요약 파일 (references/features/assistant.md "원문 동기화와 요약 파일").
 * 파일이 없거나 비었으면 content가 null이고, 카드는 DB 요약을 보인다.
 */
const useSummaryFile = ({ meetingId, notePath, organizeStage }: UseSummaryFileParams) => {
  const { t } = useLocale()
  const [content, setContent] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const path = notePath && !notePath.startsWith('/') ? recordSummaryPathOf(notePath) : null

  useEffect(() => {
    if (!path) return

    let isActive = true
    const load = () =>
      readWorkspaceFileApi({ path })
        .then((file) => {
          if (isActive) setContent(file.content.trim() ? file.content : null)
        })
        // 정리가 끝나기 전에는 파일이 아직 없다. DB 요약으로 돌아가는 것이 정상 동작이라 알리지 않는다
        .catch(() => {
          if (isActive) setContent(null)
        })
    load()
    const unsubscribeFiles = onWorkspaceFilesChanged(({ paths }) => {
      if (paths.includes(path)) load()
    })
    // main은 요약 파일을 쓴 뒤 done을 보낸다
    const unsubscribeSummary = onSummaryProgress((event) => {
      if (event.meetingId === meetingId && event.stage === 'done') load()
    })

    return () => {
      isActive = false
      unsubscribeFiles()
      unsubscribeSummary()
    }
  }, [meetingId, path, organizeStage])

  const save = async (next: string) => {
    if (!path) return

    const saved = `${next}\n`
    try {
      await writeWorkspaceFileApi({ path, content: saved })
      setContent(saved)
      setSaveError(null)
    } catch (caught) {
      setSaveError(caught instanceof Error ? caught.message : t.transcript.card.summarySaveFailed)
    }
  }

  return { content: path ? content : null, saveError, save }
}

export default useSummaryFile

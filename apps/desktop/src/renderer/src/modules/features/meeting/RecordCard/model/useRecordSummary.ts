import { useState } from 'react'
import { llmMissingMessage } from '@shared/llm'
import { DEFAULT_SUMMARY_TEMPLATE_ID } from '@shared/summaryTemplate'
import type { OrganizeStage } from '@shared/types'
import useLlmStatus from '@renderer/shared/hooks/domain/llm/useLlmStatus'
import useSummary from '@renderer/shared/hooks/domain/meeting/useSummary'
import useSummaryFile from '@renderer/shared/hooks/domain/meeting/useSummaryFile'
import useSummaryTemplates from '@renderer/shared/hooks/domain/summaryTemplate/useSummaryTemplates'
import { useLocale } from '@renderer/shared/provider/context/localeContext'

interface UseRecordSummaryParams {
  meetingId: string
  initialSummary?: string
  hasTranscript: boolean
  /** 정리 상태의 원문 경로. 옆의 요약 파일이 있으면 그것이 이 기록의 요약이다 */
  notePath: string | null
  organizeStage: OrganizeStage | null
}

/**
 * 기록 카드의 요약 블록과 푸터가 함께 쓰는 요약 상태. 규칙은 회의 상세의 요약 카드와 같다 —
 * 템플릿은 요약할 때마다 고르고 기억하지 않으며, 고른 템플릿이 지워졌으면 기본으로 돌아간다.
 * 작업 폴더에 요약 파일이 있으면 DB 요약 대신 그 파일을 보여 주고 고친다 (references/features/assistant.md "화면").
 */
const useRecordSummary = ({
  meetingId,
  initialSummary,
  hasTranscript,
  notePath,
  organizeStage
}: UseRecordSummaryParams) => {
  const { t } = useLocale()
  const summary = useSummary({ meetingId, initialSummary })
  const summaryFile = useSummaryFile({ meetingId, notePath, organizeStage })
  const { status: llmStatus } = useLlmStatus()
  const { templates } = useSummaryTemplates()
  const [templateId, setTemplateId] = useState(DEFAULT_SUMMARY_TEMPLATE_ID)

  // 상태를 아직 모르면 막지 않는다. 준비 문구는 main과 같은 함수로 만든다 (references/features/llm.md "LLM 공급자")
  const missingMessage = llmStatus ? llmMissingMessage(llmStatus, t.llm) : null
  const providerLabel = llmStatus
    ? t.llm.providerLabels[llmStatus.provider]
    : t.summary.fallbackProvider
  const selectedTemplateId = templates.some(({ id }) => id === templateId)
    ? templateId
    : DEFAULT_SUMMARY_TEMPLATE_ID

  return {
    ...summary,
    summary: summaryFile.content ?? summary.summary,
    error: summaryFile.saveError ?? summary.error,
    isFileSummary: summaryFile.content !== null,
    saveFileSummary: summaryFile.save,
    providerLabel,
    missingMessage,
    templates,
    selectedTemplateId,
    selectTemplate: setTemplateId,
    isCreateDisabled: summary.isRunning || !hasTranscript || missingMessage !== null,
    create: () => summary.createSummary(selectedTemplateId)
  }
}

export default useRecordSummary

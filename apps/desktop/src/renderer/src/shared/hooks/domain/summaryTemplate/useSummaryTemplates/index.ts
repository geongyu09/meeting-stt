import { useEffect, useState } from 'react'
import { DEFAULT_SUMMARY_TEMPLATE } from '@shared/summaryTemplate'
import type { SummaryTemplate } from '@shared/types'
import { getSummaryTemplatesApi } from '@renderer/shared/api/summaryTemplate'
import { useLocale } from '@renderer/shared/provider/context/localeContext'

/**
 * 요약 템플릿 목록. 설정 화면과 요약 카드 두 곳이 쓴다 (references/architecture.md "요약 템플릿 > 화면").
 * 저장·삭제는 갱신된 목록을 돌려주므로 호출한 쪽이 `replaceTemplates`로 넣는다.
 */
const useSummaryTemplates = () => {
  const { t } = useLocale()
  // 불러오기 전·실패 시에도 기본 템플릿은 코드 상수라 고를 수 있다
  const [templates, setTemplates] = useState<SummaryTemplate[]>([DEFAULT_SUMMARY_TEMPLATE])
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  useEffect(() => {
    getSummaryTemplatesApi()
      .then((next) => {
        setTemplates(next)
        setLoadError(null)
      })
      .catch((caught: unknown) =>
        setLoadError(
          caught instanceof Error && caught.message
            ? caught.message
            : t.summaryTemplate.actions.loadError
        )
      )
      .finally(() => setIsLoading(false))
  }, [t])

  return { templates, isLoading, loadError, replaceTemplates: setTemplates }
}

export default useSummaryTemplates

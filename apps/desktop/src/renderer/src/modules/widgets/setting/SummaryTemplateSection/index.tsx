import { useNavigate } from 'react-router'
import SettingGroup from '@renderer/shared/components/primitives/layout/SettingGroup'
import SettingRow from '@renderer/shared/components/primitives/layout/SettingRow'
import Button from '@renderer/shared/components/primitives/ui/Button'
import useSummaryTemplates from '@renderer/shared/hooks/domain/summaryTemplate/useSummaryTemplates'
import { useLocale } from '@renderer/shared/provider/context/localeContext'
import { PATHS } from '@renderer/shared/routes/paths'

/**
 * 설정의 "요약 템플릿" 카테고리. 편집기는 넓은 화면이 필요해 전용 페이지로 보낸다
 * (references/architecture.md "요약 템플릿 > 화면")
 */
export default function SummaryTemplateSection() {
  const { t } = useLocale()
  const navigate = useNavigate()
  const { templates, isLoading } = useSummaryTemplates()
  const labels = t.summaryTemplate.settingsEntry
  const customCount = templates.filter(({ isBuiltIn }) => !isBuiltIn).length

  return (
    <SettingGroup title={t.summaryTemplate.section.title}>
      <SettingRow
        title={labels.title}
        description={
          isLoading ? t.summaryTemplate.section.loading : labels.description({ count: customCount })
        }
        control={
          <Button variant="secondary" size="sm" onClick={() => navigate(PATHS.summaryTemplates)}>
            {labels.manage}
          </Button>
        }
      />
    </SettingGroup>
  )
}

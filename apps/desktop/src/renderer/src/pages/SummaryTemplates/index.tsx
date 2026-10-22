import { useNavigate } from 'react-router'
import SummaryTemplateEditorSection from '@renderer/modules/widgets/summaryTemplate/SummaryTemplateEditorSection'
import TopBar from '@renderer/shared/components/primitives/layout/TopBar'
import Button from '@renderer/shared/components/primitives/ui/Button'
import { useLocale } from '@renderer/shared/provider/context/localeContext'
import { PATHS } from '@renderer/shared/routes/paths'

import styles from './index.module.css'

/** 요약 템플릿 편집 페이지. 설정의 "요약 템플릿" 카테고리에서 들어온다 */
export default function SummaryTemplates() {
  const { t } = useLocale()
  const navigate = useNavigate()
  const title = t.summaryTemplate.section.title

  return (
    <>
      <TopBar title={title}>
        <Button
          variant="secondary"
          size="sm"
          // 설정 모달이 "요약 템플릿" 카테고리로 열리게 한다. replace라야 설정을 닫을 때 이 화면으로 돌아오지 않는다 (references/features/ui.md "설정 모달")
          onClick={() =>
            navigate(PATHS.settings, { replace: true, state: { category: 'summaryTemplate' } })
          }
        >
          {t.summaryTemplate.page.backToSettings}
        </Button>
      </TopBar>
      <div className={styles.scroll}>
        <div className={styles.page}>
          <h1 className={styles.title}>{title}</h1>
          <SummaryTemplateEditorSection />
        </div>
      </div>
    </>
  )
}

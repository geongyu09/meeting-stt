import AutoRefineToggle from '@renderer/modules/features/refine/AutoRefineToggle'
import ModelDownloadSection from '@renderer/modules/widgets/model/ModelDownloadSection'
import SummaryModelSection from '@renderer/modules/widgets/model/SummaryModelSection'
import AssistantSettingSection from '@renderer/modules/widgets/setting/AssistantSettingSection'
import DictationSection from '@renderer/modules/widgets/setting/DictationSection'
import GlossarySection from '@renderer/modules/widgets/setting/GlossarySection'
import LlmSection from '@renderer/modules/widgets/setting/LlmSection'
import RoutineSection from '@renderer/modules/widgets/setting/RoutineSection'
import SettingsSection from '@renderer/modules/widgets/setting/SettingsSection'
import SummaryTemplateSection from '@renderer/modules/widgets/setting/SummaryTemplateSection'
import SettingGroup from '@renderer/shared/components/primitives/layout/SettingGroup'
import { useLocale } from '@renderer/shared/provider/context/localeContext'

import type { SettingsCategory } from '../constants/categories'

interface CategoryContentProps {
  category: SettingsCategory
}

/** 고른 카테고리의 위젯 하나. widgets는 서로 import하지 않으므로 LLM 카테고리의 슬롯은 여기서 넘긴다 */
export default function CategoryContent({ category }: CategoryContentProps) {
  const { t } = useLocale()

  switch (category) {
    case 'assistant':
      // 루틴은 "개인 비서" 아래에 둔다 (references/features/assistant.md "루틴" > "화면")
      return (
        <>
          <AssistantSettingSection />
          <RoutineSection />
        </>
      )
    case 'dictation':
      return <DictationSection />
    case 'sttModel':
      return (
        <SettingGroup title={t.settings.groups.sttModel}>
          <ModelDownloadSection variant="setting" />
        </SettingGroup>
      )
    case 'llm':
      return (
        <LlmSection localModelSlot={<SummaryModelSection />} externalSlot={<AutoRefineToggle />} />
      )
    case 'summaryTemplate':
      return <SummaryTemplateSection />
    case 'glossary':
      return <GlossarySection />
    default:
      return <SettingsSection category={category} />
  }
}

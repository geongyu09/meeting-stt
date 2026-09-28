import { useId } from 'react'
import SettingRow from '@renderer/shared/components/primitives/layout/SettingRow'
import Switch from '@renderer/shared/components/primitives/ui/Switch'
import useSettings from '@renderer/shared/hooks/domain/setting/useSettings'
import { useLocale } from '@renderer/shared/provider/context/localeContext'

/**
 * 외부 LLM 공급자의 자동 문장 교정 스위치 (기본 꺼짐). 켜면 회의가 끝날 때마다 회의록이 그 회사 서버로 전송되므로
 * 요약처럼 사용자가 명시적으로 켜야 한다. 설정의 LLM 섹션이 외부 공급자일 때만 보여 준다
 * (references/architecture.md "회의록 교정")
 */
export default function AutoRefineToggle() {
  const { t } = useLocale()
  const { settings, error, updateSettings } = useSettings()
  const titleId = useId()

  if (!settings) return null

  return (
    <SettingRow
      title={t.refine.autoToggle.title}
      titleId={titleId}
      description={
        <>
          {t.refine.autoToggle.description}
          {error && <span role="alert"> {error.message}</span>}
        </>
      }
      control={
        <Switch
          isChecked={settings.isAutoRefineExternal}
          onChange={(isAutoRefineExternal) => updateSettings({ isAutoRefineExternal })}
          ariaLabelledBy={titleId}
        />
      }
    />
  )
}

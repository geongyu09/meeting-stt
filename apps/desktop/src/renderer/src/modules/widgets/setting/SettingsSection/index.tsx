import type { ReactNode } from 'react'
import UpdateCheck from '@renderer/modules/features/update/UpdateCheck'
import {
  DEFAULT_RECORDING_SHORTCUT,
  DEFAULT_WIDGET_SHORTCUT,
  formatAccelerator
} from '@shared/shortcut'
import {
  MAX_WIDGET_FADE_OPACITY,
  MIN_WIDGET_FADE_OPACITY,
  WIDGET_FADE_OPACITY_STEP
} from '@shared/widget'
import SettingGroup from '@renderer/shared/components/primitives/layout/SettingGroup'
import useSettings from '@renderer/shared/hooks/domain/setting/useSettings'

import OpacitySlider from './ui/OpacitySlider'
import SettingToggle from './ui/SettingToggle'
import ShortcutField from './ui/ShortcutField'
import styles from './index.module.css'

interface SettingsSectionProps {
  /** 단축키와 업데이트 사이에 끼울 카테고리. 설정 화면은 모델 위젯을 넣는다 */
  children?: ReactNode
}

export default function SettingsSection({ children }: SettingsSectionProps) {
  const { settings, isLoading, error, updateSettings } = useSettings()

  // 모델 카테고리는 설정값과 무관하므로 설정을 못 불러와도 보여준다
  if (isLoading && !settings) {
    return (
      <div className={styles.section}>
        <p className={styles.message}>설정을 불러오는 중입니다</p>
        {children}
      </div>
    )
  }
  if (!settings) {
    return (
      <div className={styles.section}>
        <p className={styles.error} role="alert">
          {error?.message ?? '설정을 불러오지 못했습니다'}
        </p>
        {children}
      </div>
    )
  }

  return (
    <div className={styles.section}>
      {error ? (
        <p className={styles.error} role="alert">
          {error.message}
        </p>
      ) : null}
      <SettingGroup title="녹음·처리">
        <SettingToggle
          title="원본 녹음 파일 보관"
          isChecked={settings.isAudioKept}
          onChange={(isAudioKept) => updateSettings({ isAudioKept })}
        >
          꺼 두면 회의록을 만든 뒤 원본 녹음을 지웁니다. 16kHz 녹음은 한 시간에 약 115MB를 차지하며,
          보관하지 않은 회의는 나중에 다시 처리할 수 없습니다.
        </SettingToggle>
        <SettingToggle
          title="조용히 처리"
          isChecked={settings.isQuietProcessing}
          onChange={(isQuietProcessing) => updateSettings({ isQuietProcessing })}
        >
          회의록을 만들 때 CPU를 절반만 써서 발열과 팬 소음을 줄입니다. 대신 처리 시간이 길어지고,
          이미 처리 중인 회의에는 적용되지 않습니다.
        </SettingToggle>
      </SettingGroup>
      <SettingGroup title="녹음 위젯">
        <SettingToggle
          title="녹음 위젯 패널"
          isChecked={settings.isWidgetEnabled}
          onChange={(isWidgetEnabled) => updateSettings({ isWidgetEnabled })}
        >
          화면 오른쪽에 떠 있는 작은 패널에서 회의 중에도 녹음을 시작하고 정지합니다. 꺼도 메뉴바
          아이콘과 {formatAccelerator(settings.recordingShortcut)} 단축키로 녹음할 수 있고,{' '}
          {formatAccelerator(settings.widgetShortcut)}로 패널을 다시 부를 수 있습니다.
        </SettingToggle>
        <SettingToggle
          title="위젯 반투명"
          isChecked={settings.isWidgetFadeEnabled}
          onChange={(isWidgetFadeEnabled) => updateSettings({ isWidgetFadeEnabled })}
        >
          다른 창을 쓰는 동안 위젯을 반투명하게 보여 회의 화면을 덜 가립니다. 패널을 클릭하면 다시
          선명해집니다.
        </SettingToggle>
        <OpacitySlider
          value={settings.widgetFadeOpacity}
          min={MIN_WIDGET_FADE_OPACITY}
          max={MAX_WIDGET_FADE_OPACITY}
          step={WIDGET_FADE_OPACITY_STEP}
          isDisabled={!settings.isWidgetFadeEnabled}
          onChange={(widgetFadeOpacity) => updateSettings({ widgetFadeOpacity })}
        />
      </SettingGroup>
      <SettingGroup title="단축키">
        <ShortcutField
          title="녹음 시작·정지"
          accelerator={settings.recordingShortcut}
          defaultAccelerator={DEFAULT_RECORDING_SHORTCUT}
          onChange={(recordingShortcut) => updateSettings({ recordingShortcut })}
        >
          다른 앱을 쓰는 중에도 이 키로 녹음을 시작하고 정지합니다.
        </ShortcutField>
        <ShortcutField
          title="위젯 표시·숨김"
          accelerator={settings.widgetShortcut}
          defaultAccelerator={DEFAULT_WIDGET_SHORTCUT}
          onChange={(widgetShortcut) => updateSettings({ widgetShortcut })}
        >
          ⌘·⌥·⌃ 중 하나 이상과 문자·숫자·기능키를 함께 누르세요. Esc를 누르면 취소합니다.
        </ShortcutField>
      </SettingGroup>
      {children}
      <SettingGroup title="업데이트">
        <SettingToggle
          title="시작할 때 업데이트 확인"
          isChecked={settings.isUpdateCheckEnabled}
          onChange={(isUpdateCheckEnabled) => updateSettings({ isUpdateCheckEnabled })}
        >
          기본은 꺼짐이며, 켜도 다음 실행부터 확인합니다. 회의 내용은 보내지 않습니다.
        </SettingToggle>
        <UpdateCheck />
      </SettingGroup>
    </div>
  )
}

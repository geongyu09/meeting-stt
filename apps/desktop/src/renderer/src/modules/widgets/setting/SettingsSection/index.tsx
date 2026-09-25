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
import useInputDevices from '@renderer/shared/hooks/domain/recording/useInputDevices'
import useRecordingState from '@renderer/shared/hooks/domain/recording/useRecordingState'
import useSettings from '@renderer/shared/hooks/domain/setting/useSettings'
import { useLocale } from '@renderer/shared/provider/context/localeContext'

import InputDeviceSelect from './ui/InputDeviceSelect'
import LocaleSelect from './ui/LocaleSelect'
import MicrophoneTest from './ui/MicrophoneTest'
import OpacitySlider from './ui/OpacitySlider'
import SettingToggle from './ui/SettingToggle'
import ShortcutField from './ui/ShortcutField'
import styles from './index.module.css'

interface SettingsSectionProps {
  /** 단축키와 업데이트 사이에 끼울 카테고리. 설정 화면은 모델 위젯을 넣는다 */
  children?: ReactNode
}

export default function SettingsSection({ children }: SettingsSectionProps) {
  const { t } = useLocale()
  const { settings, isLoading, error, updateSettings } = useSettings()
  const { devices, isLoading: isDevicesLoading, error: devicesError } = useInputDevices()
  const { isRecording } = useRecordingState()

  // 모델 카테고리는 설정값과 무관하므로 설정을 못 불러와도 보여준다
  if (isLoading && !settings) {
    return (
      <div className={styles.section}>
        <p className={styles.message}>{t.settings.loading}</p>
        {children}
      </div>
    )
  }
  if (!settings) {
    return (
      <div className={styles.section}>
        <p className={styles.error} role="alert">
          {error?.message ?? t.settings.loadError}
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
      <SettingGroup title={t.settings.groups.microphone}>
        <InputDeviceSelect
          value={settings.inputDevice}
          devices={devices}
          isLoading={isDevicesLoading}
          error={devicesError}
          onChange={(inputDevice) => updateSettings({ inputDevice })}
        />
        <MicrophoneTest inputDevice={settings.inputDevice} isRecording={isRecording} />
      </SettingGroup>
      <SettingGroup title={t.settings.groups.recording}>
        <SettingToggle
          title={t.settings.audioKeep.title}
          isChecked={settings.isAudioKept}
          onChange={(isAudioKept) => updateSettings({ isAudioKept })}
        >
          {t.settings.audioKeep.description}
        </SettingToggle>
        <SettingToggle
          title={t.settings.quietProcessing.title}
          isChecked={settings.isQuietProcessing}
          onChange={(isQuietProcessing) => updateSettings({ isQuietProcessing })}
        >
          {t.settings.quietProcessing.description}
        </SettingToggle>
      </SettingGroup>
      <SettingGroup title={t.settings.groups.widget}>
        <SettingToggle
          title={t.settings.widgetPanel.title}
          isChecked={settings.isWidgetEnabled}
          onChange={(isWidgetEnabled) => updateSettings({ isWidgetEnabled })}
        >
          {t.settings.widgetPanel.description({
            recordingShortcut: formatAccelerator(settings.recordingShortcut),
            widgetShortcut: formatAccelerator(settings.widgetShortcut)
          })}
        </SettingToggle>
        <SettingToggle
          title={t.settings.widgetFade.title}
          isChecked={settings.isWidgetFadeEnabled}
          onChange={(isWidgetFadeEnabled) => updateSettings({ isWidgetFadeEnabled })}
        >
          {t.settings.widgetFade.description}
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
      <SettingGroup title={t.settings.groups.shortcut}>
        <ShortcutField
          title={t.settings.recordingShortcut.title}
          accelerator={settings.recordingShortcut}
          defaultAccelerator={DEFAULT_RECORDING_SHORTCUT}
          onChange={(recordingShortcut) => updateSettings({ recordingShortcut })}
        >
          {t.settings.recordingShortcut.description}
        </ShortcutField>
        <ShortcutField
          title={t.settings.widgetShortcut.title}
          accelerator={settings.widgetShortcut}
          defaultAccelerator={DEFAULT_WIDGET_SHORTCUT}
          onChange={(widgetShortcut) => updateSettings({ widgetShortcut })}
        >
          {t.settings.widgetShortcut.description}
        </ShortcutField>
      </SettingGroup>
      {children}
      <SettingGroup title={t.settings.groups.update}>
        <SettingToggle
          title={t.settings.updateCheck.title}
          isChecked={settings.isUpdateCheckEnabled}
          onChange={(isUpdateCheckEnabled) => updateSettings({ isUpdateCheckEnabled })}
        >
          {t.settings.updateCheck.description}
        </SettingToggle>
        <UpdateCheck />
      </SettingGroup>
      <SettingGroup title={t.settings.groups.language}>
        <LocaleSelect value={settings.locale} onChange={(locale) => updateSettings({ locale })} />
      </SettingGroup>
    </div>
  )
}

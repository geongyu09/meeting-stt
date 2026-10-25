import { useNavigate } from 'react-router'
import FeedbackButton from '@renderer/modules/features/feedback/FeedbackButton'
import UpdateCheck from '@renderer/modules/features/update/UpdateCheck'
import {
  DEFAULT_DICTATION_SHORTCUT,
  DEFAULT_MEMO_SHORTCUT,
  DEFAULT_NEW_CHAT_SHORTCUT,
  DEFAULT_RECORDING_SHORTCUT,
  DEFAULT_WIDGET_SHORTCUT
} from '@shared/shortcut'
import {
  MAX_WIDGET_FADE_OPACITY,
  MIN_WIDGET_FADE_OPACITY,
  WIDGET_FADE_OPACITY_STEP
} from '@shared/widget'
import SettingGroup from '@renderer/shared/components/primitives/layout/SettingGroup'
import SettingRow from '@renderer/shared/components/primitives/layout/SettingRow'
import Button from '@renderer/shared/components/primitives/ui/Button'
import useInputDevices from '@renderer/shared/hooks/domain/recording/useInputDevices'
import useRecordingState from '@renderer/shared/hooks/domain/recording/useRecordingState'
import useSettings from '@renderer/shared/hooks/domain/setting/useSettings'
import { useLocale } from '@renderer/shared/provider/context/localeContext'
import { PATHS } from '@renderer/shared/routes/paths'

import InputDeviceSelect from './ui/InputDeviceSelect'
import LocaleSelect from './ui/LocaleSelect'
import MicrophoneTest from './ui/MicrophoneTest'
import OpacitySlider from './ui/OpacitySlider'
import SettingToggle from './ui/SettingToggle'
import ShortcutField from './ui/ShortcutField'
import SystemAudioToggle from './ui/SystemAudioToggle'
import ThemeSelect from './ui/ThemeSelect'
import VoiceSelect from './ui/VoiceSelect'
import styles from './index.module.css'

/** `AppSettings`로 움직이는 설정 카테고리. 나머지 카테고리는 각자 위젯이다 (references/features/ui.md "설정 모달") */
export type SettingsSectionCategory =
  | 'speech'
  | 'appearance'
  | 'microphone'
  | 'recording'
  | 'widget'
  | 'shortcut'
  | 'update'
  | 'language'
  | 'feedback'

interface SettingsSectionProps {
  /** 설정 모달은 카테고리를 한 번에 하나만 그린다 */
  category: SettingsSectionCategory
}

export default function SettingsSection({ category }: SettingsSectionProps) {
  const { t } = useLocale()
  const navigate = useNavigate()
  const { settings, isLoading, error, updateSettings } = useSettings()
  const { devices, isLoading: isDevicesLoading, error: devicesError } = useInputDevices()
  const { isRecording, systemAudio } = useRecordingState()

  if (isLoading && !settings) return <p className={styles.message}>{t.settings.loading}</p>
  if (!settings) {
    return (
      <p className={styles.error} role="alert">
        {error?.message ?? t.settings.loadError}
      </p>
    )
  }

  return (
    <div className={styles.section}>
      {error ? (
        <p className={styles.error} role="alert">
          {error.message}
        </p>
      ) : null}
      {category === 'speech' && (
        <SettingGroup title={t.settings.groups.speech}>
          <VoiceSelect
            value={settings.speechVoice}
            onChange={(speechVoice) => updateSettings({ speechVoice })}
          />
        </SettingGroup>
      )}
      {category === 'appearance' && (
        <SettingGroup title={t.settings.groups.appearance}>
          <ThemeSelect value={settings.theme} onChange={(theme) => updateSettings({ theme })} />
        </SettingGroup>
      )}
      {category === 'microphone' && (
        <SettingGroup title={t.settings.groups.microphone}>
          <InputDeviceSelect
            value={settings.inputDevice}
            devices={devices}
            isLoading={isDevicesLoading}
            error={devicesError}
            onChange={(inputDevice) => updateSettings({ inputDevice })}
          />
          <MicrophoneTest inputDevice={settings.inputDevice} isRecording={isRecording} />
          <SystemAudioToggle systemAudio={systemAudio} isRecording={isRecording} />
        </SettingGroup>
      )}
      {category === 'recording' && (
        <SettingGroup title={t.settings.groups.recording}>
          <SettingToggle
            title={t.settings.audioKeep.title}
            isChecked={settings.isAudioKept}
            onChange={(isAudioKept) => updateSettings({ isAudioKept })}
          >
            {t.settings.audioKeep.description}
          </SettingToggle>
          <SettingRow
            title={t.settings.audioFiles.title}
            description={t.settings.audioFiles.description}
            control={
              <Button
                variant="secondary"
                size="sm"
                onClick={() => navigate(PATHS.recordings, { replace: true })}
              >
                {t.settings.audioFiles.manage}
              </Button>
            }
          />
          <SettingToggle
            title={t.settings.quietProcessing.title}
            isChecked={settings.isQuietProcessing}
            onChange={(isQuietProcessing) => updateSettings({ isQuietProcessing })}
          >
            {t.settings.quietProcessing.description}
          </SettingToggle>
        </SettingGroup>
      )}
      {category === 'widget' && (
        <SettingGroup title={t.settings.groups.widget}>
          <SettingToggle
            title={t.settings.widgetPanel.title}
            isChecked={settings.isWidgetEnabled}
            onChange={(isWidgetEnabled) => updateSettings({ isWidgetEnabled })}
          >
            {t.settings.widgetPanel.description}
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
      )}
      {category === 'shortcut' && (
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
            title={t.settings.memoShortcut.title}
            accelerator={settings.memoShortcut}
            defaultAccelerator={DEFAULT_MEMO_SHORTCUT}
            onChange={(memoShortcut) => updateSettings({ memoShortcut })}
          >
            {t.settings.memoShortcut.description}
          </ShortcutField>
          <ShortcutField
            title={t.settings.widgetShortcut.title}
            accelerator={settings.widgetShortcut}
            defaultAccelerator={DEFAULT_WIDGET_SHORTCUT}
            onChange={(widgetShortcut) => updateSettings({ widgetShortcut })}
          >
            {t.settings.widgetShortcut.description}
          </ShortcutField>
          <ShortcutField
            title={t.settings.dictationShortcut.title}
            accelerator={settings.dictationShortcut}
            defaultAccelerator={DEFAULT_DICTATION_SHORTCUT}
            onChange={(dictationShortcut) => updateSettings({ dictationShortcut })}
          >
            {t.settings.dictationShortcut.description}
          </ShortcutField>
          <ShortcutField
            title={t.settings.newChatShortcut.title}
            accelerator={settings.newChatShortcut}
            defaultAccelerator={DEFAULT_NEW_CHAT_SHORTCUT}
            onChange={(newChatShortcut) => updateSettings({ newChatShortcut })}
          >
            {t.settings.newChatShortcut.description}
          </ShortcutField>
        </SettingGroup>
      )}
      {category === 'update' && (
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
      )}
      {category === 'language' && (
        <SettingGroup title={t.settings.groups.language}>
          <LocaleSelect value={settings.locale} onChange={(locale) => updateSettings({ locale })} />
        </SettingGroup>
      )}
      {category === 'feedback' && (
        <SettingGroup title={t.settings.groups.feedback}>
          <FeedbackButton />
        </SettingGroup>
      )}
    </div>
  )
}

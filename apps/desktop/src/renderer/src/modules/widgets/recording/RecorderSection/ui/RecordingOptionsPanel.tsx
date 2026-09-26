import { MAX_SPEAKER_COUNT, MIN_SPEAKER_COUNT } from '@meeting-stt/core/speakerCount'
import ImportAudioButton from '@renderer/modules/features/meeting/ImportAudioButton'
import SettingGroup from '@renderer/shared/components/primitives/layout/SettingGroup'
import SettingRow from '@renderer/shared/components/primitives/layout/SettingRow'
import Stepper from '@renderer/shared/components/primitives/ui/Stepper'
import Switch from '@renderer/shared/components/primitives/ui/Switch'
import { useLocale } from '@renderer/shared/provider/context/localeContext'

import styles from './RecordingOptionsPanel.module.css'

const SYSTEM_AUDIO_LABEL_ID = 'recorderSystemAudioLabel'

interface SpeakerCountControl {
  text: string
  isValid: boolean
  onChange: (text: string) => void
}

interface SystemAudioControl {
  isEnabled: boolean
  errorMessage?: string
  isBusy: boolean
  onChange: (isEnabled: boolean) => void
}

interface RecordingOptionsPanelProps {
  isRecording: boolean
  speakerCount: SpeakerCountControl
  systemAudio: SystemAudioControl
}

/**
 * 녹음 화면 오른쪽의 입력 패널. 다른 방법(파일 가져오기)을 맨 위에, 이번 녹음의 설정을 그 아래 한 그룹에 모은다.
 * 녹음 중에도 행을 숨기지 않고 비활성으로 바꾸며, 설명 자리는 줄 수를 정해 놓아 문구가 바뀌어도 아래가 밀리지 않는다.
 * 문구가 길어질 수 있는 행(시스템 오디오 오류)이 마지막이라 넘쳐도 다른 행을 밀지 않는다.
 */
export default function RecordingOptionsPanel({
  isRecording,
  speakerCount,
  systemAudio
}: RecordingOptionsPanelProps) {
  const { t: messages } = useLocale()
  const t = messages.recording

  const speakerCountNote = speakerCount.isValid
    ? t.speakerCount.hint
    : t.speakerCount.invalid({ min: MIN_SPEAKER_COUNT, max: MAX_SPEAKER_COUNT })

  return (
    <aside className={styles.panel} aria-label={t.panel.label}>
      <SettingGroup title={t.panel.importTitle}>
        <ImportAudioButton />
      </SettingGroup>

      <SettingGroup title={t.panel.optionsTitle}>
        <SettingRow
          title={t.speakerCount.label}
          description={
            <span className={speakerCount.isValid ? styles.note : styles.errorNote}>
              {speakerCountNote}
            </span>
          }
          control={
            <Stepper
              value={speakerCount.text}
              onChange={speakerCount.onChange}
              min={MIN_SPEAKER_COUNT}
              max={MAX_SPEAKER_COUNT}
              label={t.speakerCount.label}
              placeholder={t.speakerCount.unknown}
              isInvalid={!speakerCount.isValid}
            />
          }
        />
        <SettingRow
          title={t.systemAudio.label}
          titleId={SYSTEM_AUDIO_LABEL_ID}
          description={
            <span
              className={systemAudio.errorMessage ? styles.errorNoteTall : styles.noteTall}
              role={systemAudio.errorMessage ? 'alert' : undefined}
            >
              {systemAudio.errorMessage ?? t.systemAudio.hint}
            </span>
          }
          control={
            <Switch
              isChecked={systemAudio.isEnabled}
              onChange={systemAudio.onChange}
              ariaLabelledBy={SYSTEM_AUDIO_LABEL_ID}
              disabled={isRecording || systemAudio.isBusy}
            />
          }
        />
      </SettingGroup>
    </aside>
  )
}

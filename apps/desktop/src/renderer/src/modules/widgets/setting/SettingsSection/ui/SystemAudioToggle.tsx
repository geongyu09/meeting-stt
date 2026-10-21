import { useId, useState } from 'react'
import type { SystemAudioState } from '@shared/ipc'
import { setSystemAudioApi } from '@renderer/shared/api/recording'
import SettingRow from '@renderer/shared/components/primitives/layout/SettingRow'
import Switch from '@renderer/shared/components/primitives/ui/Switch'
import { useLocale } from '@renderer/shared/provider/context/localeContext'

import styles from './SystemAudioToggle.module.css'

interface SystemAudioToggleProps {
  systemAudio: SystemAudioState
  /** 녹음 중에는 바꿀 수 없다 — 다음 녹음부터 적용되는 값이라 켜도 지금 녹음에는 들어가지 않는다 */
  isRecording: boolean
}

/**
 * 온라인 회의 소리 함께 녹음. 값은 설정 테이블이 아니라 녹음 세션의 것이라 `recording:setSystemAudio`로 바꾼다
 * (references/features/recording.md "시스템 오디오 캡처" > "화면")
 */
export default function SystemAudioToggle({ systemAudio, isRecording }: SystemAudioToggleProps) {
  const { t } = useLocale()
  const labels = t.recording.systemAudio
  const titleId = useId()
  const [isBusy, setIsBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // 켜기는 main이 도구를 잠깐 돌려 권한 창을 띄우므로 끝날 때까지 스위치를 잠근다
  const handleChange = async (isEnabled: boolean) => {
    setIsBusy(true)
    try {
      await setSystemAudioApi({ isEnabled })
      setError(null)
    } catch {
      setError(labels.toggleError)
    } finally {
      setIsBusy(false)
    }
  }

  const message = error ?? systemAudio.errorMessage

  return (
    <SettingRow
      title={labels.label}
      titleId={titleId}
      description={
        <span className={message ? styles.error : undefined} role={message ? 'alert' : undefined}>
          {message ?? labels.hint}
        </span>
      }
      control={
        <Switch
          isChecked={systemAudio.isEnabled}
          onChange={handleChange}
          ariaLabelledBy={titleId}
          disabled={isRecording || isBusy}
        />
      }
    />
  )
}

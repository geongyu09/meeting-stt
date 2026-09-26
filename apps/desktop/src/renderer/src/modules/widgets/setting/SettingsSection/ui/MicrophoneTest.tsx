import type { AudioInputDevice } from '@shared/types'
import SettingRow from '@renderer/shared/components/primitives/layout/SettingRow'
import Button from '@renderer/shared/components/primitives/ui/Button'
import LevelWaveform from '@renderer/shared/components/primitives/ui/LevelWaveform'
import useMicrophoneTest from '@renderer/shared/hooks/domain/recording/useMicrophoneTest'
import { useLocale } from '@renderer/shared/provider/context/localeContext'

import styles from './MicrophoneTest.module.css'

const WAVEFORM_BAR_COUNT = 48

interface MicrophoneTestProps {
  inputDevice: AudioInputDevice | null
  /** 녹음 중에는 테스트를 막는다 — 두 그래프가 마이크를 잡아도 되지만 사용자가 헷갈린다 */
  isRecording: boolean
}

export default function MicrophoneTest({ inputDevice, isRecording }: MicrophoneTestProps) {
  const { t } = useLocale()
  const { isRunning, isStarting, level, status, error, start, stop } = useMicrophoneTest({
    inputDevice
  })

  const renderDescription = () => {
    if (isRecording) return t.settings.microphoneTest.blockedWhileRecording

    return t.settings.microphoneTest.description
  }

  return (
    <SettingRow
      title={t.settings.microphoneTest.title}
      description={renderDescription()}
      control={
        isRunning ? (
          <Button variant="secondary" onClick={() => void stop()}>
            {t.settings.microphoneTest.stop}
          </Button>
        ) : (
          <Button onClick={() => void start()} disabled={isRecording || isStarting}>
            {t.settings.microphoneTest.start}
          </Button>
        )
      }
    >
      {isRunning ? (
        <div className={styles.meter}>
          <LevelWaveform level={level} barCount={WAVEFORM_BAR_COUNT} size="sm" />
          <p className={status === 'silent' ? styles.silent : styles.status} role="status">
            {t.settings.microphoneTest.status[status]}
          </p>
        </div>
      ) : null}
      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
    </SettingRow>
  )
}

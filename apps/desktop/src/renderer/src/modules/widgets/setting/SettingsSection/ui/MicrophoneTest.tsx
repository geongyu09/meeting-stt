import type { AudioInputDevice } from '@shared/types'
import SettingRow from '@renderer/shared/components/primitives/layout/SettingRow'
import Button from '@renderer/shared/components/primitives/ui/Button'
import LevelWaveform from '@renderer/shared/components/primitives/ui/LevelWaveform'
import useMicrophoneTest from '@renderer/shared/hooks/domain/recording/useMicrophoneTest'

import styles from './MicrophoneTest.module.css'

const WAVEFORM_BAR_COUNT = 48
const STATUS_MESSAGES = {
  idle: '',
  listening: '소리가 잘 들어옵니다.',
  silent: '소리가 거의 잡히지 않습니다. 마이크가 음소거되었거나 다른 장치가 선택됐을 수 있습니다.'
} as const

interface MicrophoneTestProps {
  inputDevice: AudioInputDevice | null
  /** 녹음 중에는 테스트를 막는다 — 두 그래프가 마이크를 잡아도 되지만 사용자가 헷갈린다 */
  isRecording: boolean
}

export default function MicrophoneTest({ inputDevice, isRecording }: MicrophoneTestProps) {
  const { isRunning, isStarting, levels, status, error, start, stop } = useMicrophoneTest({
    inputDevice
  })

  const renderDescription = () => {
    if (isRecording) return '녹음 중에는 테스트할 수 없습니다. 녹음을 정지한 뒤 확인해 주세요.'

    return '녹음하지 않고 소리가 들어오는지 확인합니다. 위에서 고른 마이크로 듣습니다.'
  }

  return (
    <SettingRow
      title="마이크 테스트"
      description={renderDescription()}
      control={
        isRunning ? (
          <Button variant="secondary" onClick={() => void stop()}>
            테스트 정지
          </Button>
        ) : (
          <Button onClick={() => void start()} disabled={isRecording || isStarting}>
            테스트 시작
          </Button>
        )
      }
    >
      {isRunning ? (
        <div className={styles.meter}>
          <LevelWaveform levels={levels} barCount={WAVEFORM_BAR_COUNT} size="sm" />
          <p className={status === 'silent' ? styles.silent : styles.status} role="status">
            {STATUS_MESSAGES[status]}
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

import { useNavigate } from 'react-router'
import { formatTimestamp } from '@shared/format'
import Button from '@renderer/shared/components/primitives/ui/Button'
import LevelMeter from '@renderer/shared/components/primitives/ui/LevelMeter'
import useRecorder from '@renderer/shared/hooks/domain/recording/useRecorder'
import { meetingDetailPath } from '@renderer/shared/routes/paths'

import styles from './index.module.css'

export default function RecorderSection() {
  const navigate = useNavigate()
  const { isRecording, isBusy, level, elapsedSec, error, start, stop } = useRecorder()

  const handleStop = async () => {
    const meeting = await stop()
    if (meeting) navigate(meetingDetailPath({ meetingId: meeting.id }))
  }

  return (
    <section className={styles.section}>
      <h2 className={styles.heading}>새 회의 녹음</h2>
      <p className={styles.elapsed}>{formatTimestamp({ sec: elapsedSec })}</p>
      <LevelMeter level={level} />
      {isRecording ? (
        <Button variant="danger" onClick={handleStop} disabled={isBusy}>
          녹음 정지
        </Button>
      ) : (
        <Button onClick={start} disabled={isBusy}>
          녹음 시작
        </Button>
      )}
      {error ? <p className={styles.error}>{error}</p> : null}
      <p className={styles.hint}>
        정지하면 회의록 만들기가 시작되고 회의 상세 화면으로 이동합니다. 인터넷 연결은 쓰지 않습니다
      </p>
    </section>
  )
}

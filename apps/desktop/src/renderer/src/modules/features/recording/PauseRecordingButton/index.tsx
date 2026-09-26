import { useState } from 'react'
import { setRecordingPausedApi } from '@renderer/shared/api/recording'
import Button from '@renderer/shared/components/primitives/ui/Button'
import Icon from '@renderer/shared/components/primitives/ui/Icon'
import { useLocale } from '@renderer/shared/provider/context/localeContext'

import styles from './index.module.css'

const ICON_SIZE = 16

interface PauseRecordingButtonProps {
  isPaused: boolean
  /** 크기는 옆의 정지 버튼 높이에 맞춰 화면마다 정한다 */
  className?: string
  /** 실패 안내를 보여 줄 자리는 화면마다 달라 부모가 정한다. 성공하면 null로 지운다 */
  onError: (message: string | null) => void
}

/**
 * 진행 중 녹음을 일시정지·재개하는 아이콘 버튼. 상태는 main 세션이 들고 있어 두 창이 같은 값을 본다
 * (references/architecture.md "일시정지·재개").
 */
export default function PauseRecordingButton({
  isPaused,
  className,
  onError
}: PauseRecordingButtonProps) {
  const { t: messages } = useLocale()
  const t = messages.recording.pause
  const [isBusy, setIsBusy] = useState(false)

  // disabled로 막으면 Button의 비활성 회색 면이 잠깐 번쩍여 요청 중에는 클릭만 무시한다
  const handleClick = async () => {
    if (isBusy) return

    setIsBusy(true)
    try {
      await setRecordingPausedApi({ isPaused: !isPaused })
      onError(null)
    } catch {
      onError(t.error)
    } finally {
      setIsBusy(false)
    }
  }

  const label = isPaused ? t.resume : t.pause

  return (
    <Button
      variant="secondary"
      className={[styles.button, className].filter(Boolean).join(' ')}
      aria-label={label}
      aria-busy={isBusy}
      title={label}
      onClick={handleClick}
    >
      <Icon name={isPaused ? 'play' : 'pause'} size={ICON_SIZE} />
    </Button>
  )
}

import type { Meeting } from '@shared/types'
import Button from '@renderer/shared/components/primitives/ui/Button'
import { useLocale } from '@renderer/shared/provider/context/localeContext'

import styles from './FailedCard.module.css'

interface FailedCardProps {
  meeting: Meeting
  /** 다시 시도 요청이 실패했을 때의 안내 */
  error: Error | null
  onRetry: () => void
}

/** 회의록을 만들지 못한 카드. 원본이 남아 있으면 저장된 참석자 수로 다시 돌린다 — 보이는 회의록이 없어 확인 없이 돌린다 */
export default function FailedCard({ meeting, error, onRetry }: FailedCardProps) {
  const { t } = useLocale()

  return (
    <div className={styles.body}>
      <b className={styles.title}>{meeting.title}</b>
      <p className={styles.error} role="alert">
        {error?.message ?? meeting.errorMessage ?? t.transcript.status.defaultError}
      </p>
      {meeting.hasAudio ? (
        <div>
          <Button variant="secondary" size="sm" onClick={onRetry}>
            {t.transcript.status.retry}
          </Button>
        </div>
      ) : null}
    </div>
  )
}

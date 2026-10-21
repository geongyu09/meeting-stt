import { useState } from 'react'
import type { MeetingAudioFile } from '@shared/types'
import Badge from '@renderer/shared/components/primitives/ui/Badge'
import Button from '@renderer/shared/components/primitives/ui/Button'
import { useLocale } from '@renderer/shared/provider/context/localeContext'
import { formatBytes } from '@renderer/shared/utils/formatBytes'
import { formatDuration } from '@renderer/shared/utils/formatDuration'
import { formatMeetingDate } from '@renderer/shared/utils/formatMeetingDate'

import styles from './AudioFileRow.module.css'

interface AudioFileRowProps {
  file: MeetingAudioFile
  isSelected: boolean
  isDisabled: boolean
  onSelect: (isSelected: boolean) => void
  onDelete: () => void
}

/** 녹음 파일 한 행. 처리 중인 회의는 파이프라인이 파일을 읽고 있어 체크박스·삭제를 막는다 */
export default function AudioFileRow({
  file,
  isSelected,
  isDisabled,
  onSelect,
  onDelete
}: AudioFileRowProps) {
  const { t, locale } = useLocale()
  const labels = t.recording.files
  const [isConfirming, setIsConfirming] = useState(false)
  // 처리 중이면 지울 수 없고, 파일이 없으면 기록만 정리된다
  const isLocked = isDisabled || file.status === 'processing'
  const status =
    file.status === 'processing'
      ? labels.status.processing
      : file.sizeBytes === null
        ? labels.status.missing
        : file.status === 'error'
          ? labels.status.error
          : null
  const size = formatBytes({ bytes: file.sizeBytes ?? 0 })

  return (
    <li className={styles.item}>
      <div className={styles.row}>
        <input
          type="checkbox"
          className={styles.checkbox}
          aria-label={labels.selectOne({ title: file.title })}
          checked={isSelected}
          disabled={isLocked}
          onChange={(event) => onSelect(event.target.checked)}
        />
        <div className={styles.text}>
          {/* shortcut: 회의 상세 페이지가 없어져 제목은 글자만, 전체 기록 패널을 밖에서 열 수 있게 되면 링크로 */}
          <span className={styles.title}>{file.title}</span>
          <span className={styles.meta}>
            {formatMeetingDate({ epochMs: file.createdAt, locale })} ·{' '}
            {formatDuration({ sec: file.durationSec, locale })} · {size}
          </span>
        </div>
        {status ? (
          <Badge tone={file.status === 'error' ? 'danger' : 'neutral'}>{status}</Badge>
        ) : null}
        {isConfirming ? null : (
          <Button
            variant="secondary"
            size="sm"
            aria-label={labels.deleteLabel({ title: file.title })}
            disabled={isLocked}
            onClick={() => setIsConfirming(true)}
          >
            {labels.delete}
          </Button>
        )}
      </div>
      {isConfirming ? (
        <div className={styles.confirm} role="group">
          <span>{labels.confirm({ count: 1, size })}</span>
          <Button
            variant="danger"
            size="sm"
            onClick={() => {
              setIsConfirming(false)
              onDelete()
            }}
          >
            {labels.delete}
          </Button>
          <Button variant="secondary" size="sm" onClick={() => setIsConfirming(false)}>
            {labels.cancel}
          </Button>
        </div>
      ) : null}
    </li>
  )
}

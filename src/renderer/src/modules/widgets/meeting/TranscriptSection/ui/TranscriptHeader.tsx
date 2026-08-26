import { useState } from 'react'
import { formatTimestamp, type TranscriptFormat } from '@shared/format'
import type { Meeting } from '@shared/types'
import InlineEditableText from '@renderer/shared/components/composites/InlineEditableText'
import Button from '@renderer/shared/components/primitives/ui/Button'
import { formatMeetingDate } from '@renderer/shared/utils/formatMeetingDate'

import styles from './TranscriptHeader.module.css'

interface TranscriptHeaderProps {
  meeting: Meeting
  isCopyEnabled: boolean
  copiedKey: string | null
  onRenameTitle: (title: string) => void
  onCopy: (params: { format: TranscriptFormat }) => void
  onDelete: () => void
}

export default function TranscriptHeader({
  meeting,
  isCopyEnabled,
  copiedKey,
  onRenameTitle,
  onCopy,
  onDelete
}: TranscriptHeaderProps) {
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false)

  const copyLabel = ({ format, text }: { format: TranscriptFormat; text: string }) =>
    copiedKey === format ? '복사했습니다' : text

  return (
    <header className={styles.header}>
      <InlineEditableText
        className={styles.title}
        value={meeting.title}
        ariaLabel="회의 제목"
        onCommit={onRenameTitle}
      />
      <p className={styles.meta}>
        {formatMeetingDate({ epochMs: meeting.createdAt })} ·{' '}
        {formatTimestamp({ sec: meeting.durationSec })}
      </p>
      <div className={styles.actions}>
        <Button
          variant="secondary"
          disabled={!isCopyEnabled}
          onClick={() => onCopy({ format: 'plain' })}
        >
          {copyLabel({ format: 'plain', text: '전체 복사' })}
        </Button>
        <Button
          variant="secondary"
          disabled={!isCopyEnabled}
          onClick={() => onCopy({ format: 'markdown' })}
        >
          {copyLabel({ format: 'markdown', text: '마크다운으로 복사' })}
        </Button>
        {isConfirmingDelete ? null : (
          <Button variant="danger" onClick={() => setIsConfirmingDelete(true)}>
            회의 삭제
          </Button>
        )}
      </div>
      {isConfirmingDelete ? (
        <div className={styles.confirm} role="alert">
          <span>이 회의와 회의록, 원본 녹음이 모두 사라집니다. 되돌릴 수 없습니다.</span>
          <span className={styles.confirmActions}>
            <Button variant="danger" onClick={onDelete}>
              삭제
            </Button>
            <Button variant="secondary" onClick={() => setIsConfirmingDelete(false)}>
              취소
            </Button>
          </span>
        </div>
      ) : null}
    </header>
  )
}

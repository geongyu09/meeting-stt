import { useState } from 'react'
import Button from '@renderer/shared/components/primitives/ui/Button'
import { useLocale } from '@renderer/shared/provider/context/localeContext'
import { formatBytes } from '@renderer/shared/utils/formatBytes'

import useAudioFiles from './model/useAudioFiles'
import AudioFileRow from './ui/AudioFileRow'
import styles from './index.module.css'

/**
 * 보관 중인 녹음 파일을 모아 보고 하나씩 또는 골라서 지운다. 녹음 파일만 지우고 회의록은 남긴다
 * (references/features/recording.md "녹음 파일 관리")
 */
export default function RecordingFileSection() {
  const { t } = useLocale()
  const labels = t.recording.files
  const { files, error, failedCount, isDeleting, deleteFiles } = useAudioFiles()
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [isConfirming, setIsConfirming] = useState(false)

  if (error && !files)
    return (
      <p className={styles.error} role="alert">
        {error}
      </p>
    )
  if (!files) return <p className={styles.muted}>{labels.loading}</p>

  const selectable = files.filter(({ status }) => status !== 'processing')
  const selected = files.filter(({ meetingId }) => selectedIds.includes(meetingId))
  const totalSize = files.reduce((sum, { sizeBytes }) => sum + (sizeBytes ?? 0), 0)
  const selectedSize = selected.reduce((sum, { sizeBytes }) => sum + (sizeBytes ?? 0), 0)
  const isAllSelected = selectable.length > 0 && selected.length === selectable.length

  const handleDelete = async (meetingIds: string[]) => {
    setIsConfirming(false)
    await deleteFiles({ meetingIds })
    setSelectedIds([])
  }

  const handleSelect = ({ meetingId, isSelected }: { meetingId: string; isSelected: boolean }) =>
    setSelectedIds((prev) =>
      isSelected ? [...prev, meetingId] : prev.filter((id) => id !== meetingId)
    )

  if (files.length === 0) {
    return (
      <div className={styles.section}>
        <p className={styles.empty}>{labels.empty}</p>
        <p className={styles.muted}>{labels.emptyHint}</p>
      </div>
    )
  }

  return (
    <div className={styles.section}>
      <p className={styles.summary}>
        {labels.summary({ count: files.length, size: formatBytes({ bytes: totalSize }) })}
      </p>
      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
      {failedCount > 0 ? (
        <p className={styles.error} role="alert">
          {labels.failed({ count: failedCount })}
        </p>
      ) : null}
      <div className={styles.toolbar}>
        {isConfirming ? (
          <>
            <span>
              {labels.confirm({
                count: selected.length,
                size: formatBytes({ bytes: selectedSize })
              })}
            </span>
            <Button variant="danger" size="sm" onClick={() => handleDelete(selectedIds)}>
              {labels.delete}
            </Button>
            <Button variant="secondary" size="sm" onClick={() => setIsConfirming(false)}>
              {labels.cancel}
            </Button>
          </>
        ) : (
          <>
            <label className={styles.selectAll}>
              <input
                type="checkbox"
                className={styles.checkbox}
                checked={isAllSelected}
                disabled={selectable.length === 0 || isDeleting}
                onChange={(event) =>
                  setSelectedIds(
                    event.target.checked ? selectable.map(({ meetingId }) => meetingId) : []
                  )
                }
              />
              {labels.selectAll}
            </label>
            <Button
              variant="secondary"
              size="sm"
              disabled={selected.length === 0 || isDeleting}
              onClick={() => setIsConfirming(true)}
            >
              {labels.deleteSelected({ count: selected.length })}
            </Button>
          </>
        )}
      </div>
      <ul className={styles.list} aria-label={labels.listLabel}>
        {files.map((file) => (
          <AudioFileRow
            key={file.meetingId}
            file={file}
            isSelected={selectedIds.includes(file.meetingId)}
            isDisabled={isDeleting}
            onSelect={(isSelected) => handleSelect({ meetingId: file.meetingId, isSelected })}
            onDelete={() => handleDelete([file.meetingId])}
          />
        ))}
      </ul>
    </div>
  )
}

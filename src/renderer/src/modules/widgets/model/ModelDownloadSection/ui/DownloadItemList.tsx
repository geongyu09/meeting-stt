import type { ModelDownloadProgressEvent } from '@shared/ipc'
import type { ModelKey } from '@shared/types'
import ProgressBar from '@renderer/shared/components/primitives/ui/ProgressBar'
import { formatBytes } from '@renderer/shared/utils/formatBytes'

import type { PlannedItem } from '../utils/downloadPlan'
import styles from './DownloadItemList.module.css'

const FULL_PERCENT = 100

interface DownloadItemListProps {
  items: PlannedItem[]
  progress: Partial<Record<ModelKey, ModelDownloadProgressEvent>>
}

const percentOf = ({
  item,
  progress
}: {
  item: PlannedItem
  progress: DownloadItemListProps['progress']
}) => {
  if (item.isInstalled) return FULL_PERCENT

  return progress[item.key]?.percent ?? 0
}

export default function DownloadItemList({ items, progress }: DownloadItemListProps) {
  return (
    <ul className={styles.list}>
      {items.map((item) => {
        const percent = percentOf({ item, progress })

        return (
          <li key={item.key} className={styles.item}>
            <span className={styles.row}>
              <span>{item.label}</span>
              <span className={styles.meta}>
                {formatBytes({ bytes: item.sizeBytes })} · {percent}%
              </span>
            </span>
            <ProgressBar percent={percent} label={`${item.label} 다운로드 진행률`} />
          </li>
        )
      })}
    </ul>
  )
}

import type { ModelDownloadProgressEvent } from '@shared/ipc'
import type { ModelKey } from '@shared/types'
import Icon from '@renderer/shared/components/primitives/ui/Icon'
import ProgressBar from '@renderer/shared/components/primitives/ui/ProgressBar'
import { formatBytes } from '@renderer/shared/utils/formatBytes'
import { useLocale } from '@renderer/shared/provider/context/localeContext'

import type { PlannedItem } from '../utils/downloadPlan'
import styles from './DownloadItemList.module.css'

const FULL_PERCENT = 100

interface DownloadItemListProps {
  items: PlannedItem[]
  progress: Partial<Record<ModelKey, ModelDownloadProgressEvent>>
  isDownloading: boolean
}

/** 함께 받는 모델 목록. 항목마다 완료·진행률·대기(받기 전에는 용량)를 보여 준다 */
export default function DownloadItemList({
  items,
  progress,
  isDownloading
}: DownloadItemListProps) {
  const { t } = useLocale()
  const renderState = (item: PlannedItem) => {
    const percent = progress[item.key]?.percent

    if (item.isInstalled || percent === FULL_PERCENT) {
      return (
        <span className={styles.done}>
          <Icon name="check" size={13} />
          {t.models.download.itemDone}
        </span>
      )
    }
    if (!isDownloading)
      return <span className={styles.meta}>{formatBytes({ bytes: item.sizeBytes })}</span>
    if (percent === undefined) {
      return <span className={styles.meta}>{t.models.download.itemWaiting}</span>
    }

    return <span className={styles.meta}>{percent}%</span>
  }

  return (
    <div className={styles.box}>
      <span className={styles.heading}>{t.models.download.itemsHeading}</span>
      <ul className={styles.list}>
        {items.map((item) => {
          const percent = progress[item.key]?.percent
          const isInProgress =
            isDownloading && !item.isInstalled && percent !== undefined && percent < FULL_PERCENT

          return (
            <li key={item.key} className={styles.item}>
              <span className={styles.row}>
                <span>{item.label}</span>
                {renderState(item)}
              </span>
              {isInProgress ? (
                <ProgressBar
                  percent={percent}
                  label={t.models.download.itemProgressLabel({ label: item.label })}
                />
              ) : null}
            </li>
          )
        })}
      </ul>
    </div>
  )
}

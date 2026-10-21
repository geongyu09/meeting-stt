import type { ModelDownloadProgressEvent } from '@shared/ipc'
import type { ModelKey } from '@shared/types'
import type { PlannedItem } from '@renderer/shared/utils/planDownload'

const FULL_PERCENT = 100

interface SummarizeDownloadParams {
  items: PlannedItem[]
  progress: Partial<Record<ModelKey, ModelDownloadProgressEvent>>
}

/** 항목별 진행률을 한 줄로 합친다 — 설정 카드는 막대 하나와 "받은 / 전체"만 보여 준다 (features/ui.md "처음 실행") */
export const summarizeDownload = ({ items, progress }: SummarizeDownloadParams) => {
  const isDone = (item: PlannedItem) =>
    item.isInstalled || progress[item.key]?.percent === FULL_PERCENT
  // 서버가 알려 준 총량이 카탈로그 용량과 조금 다를 수 있어 항목 용량을 넘기지 않는다
  const receivedOf = (item: PlannedItem) =>
    isDone(item) ? item.sizeBytes : Math.min(progress[item.key]?.receivedBytes ?? 0, item.sizeBytes)

  const totalBytes = items.reduce((sum, item) => sum + item.sizeBytes, 0)
  const receivedBytes = items.reduce((sum, item) => sum + receivedOf(item), 0)
  const percent =
    totalBytes === 0 ? FULL_PERCENT : Math.round((receivedBytes / totalBytes) * FULL_PERCENT)

  return {
    totalBytes,
    receivedBytes,
    percent,
    doneCount: items.filter(isDone).length,
    totalCount: items.length
  }
}

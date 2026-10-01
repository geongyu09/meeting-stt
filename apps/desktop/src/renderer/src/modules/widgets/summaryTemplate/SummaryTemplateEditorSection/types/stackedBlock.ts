import type { SummaryBlock } from '@shared/types'

/** 쌓인 블록 한 칸. `key`는 리스트 key·순서 바꾸기용이며 저장하지 않는다 */
export interface StackedBlock extends SummaryBlock {
  key: number
}

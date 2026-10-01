import { useCallback, useRef, useState } from 'react'
import { createSummaryBlock } from '@shared/summaryTemplate'
import type { SummaryBlock, SummaryBlockKind } from '@shared/types'

import type { StackedBlock } from '../types/stackedBlock'
import { moveItem } from '../utils/moveItem'

export interface UpdateBlockParams {
  key: number
  patch: Partial<Pick<SummaryBlock, 'heading' | 'description'>>
}

export interface InsertBlockParams {
  kind: SummaryBlockKind
  /** 이 자리 앞에 넣는다. 길이와 같으면 맨 아래 */
  index: number
}

export interface MoveBlockParams {
  from: number
  to: number
}

const toSummaryBlock = ({ kind, heading, description }: StackedBlock): SummaryBlock =>
  kind === 'custom' ? { kind, heading, description } : { kind, heading }

/** 편집 중인 템플릿의 쌓인 블록. 저장 형식(`SummaryBlock[]`)과의 변환은 여기서만 한다 */
const useBlockStack = () => {
  const nextKeyRef = useRef(0)
  const [blocks, setBlocks] = useState<StackedBlock[]>([])

  const resetBlocks = useCallback((next: SummaryBlock[]) => {
    setBlocks(next.map((block) => ({ ...block, key: nextKeyRef.current++ })))
  }, [])

  const addBlock = (kind: SummaryBlockKind) =>
    setBlocks((prev) => [...prev, { ...createSummaryBlock(kind), key: nextKeyRef.current++ }])

  const insertBlock = ({ kind, index }: InsertBlockParams) =>
    setBlocks((prev) => [
      ...prev.slice(0, index),
      { ...createSummaryBlock(kind), key: nextKeyRef.current++ },
      ...prev.slice(index)
    ])

  const removeBlock = (key: number) =>
    setBlocks((prev) => prev.filter((block) => block.key !== key))

  const updateBlock = ({ key, patch }: UpdateBlockParams) =>
    setBlocks((prev) => prev.map((block) => (block.key === key ? { ...block, ...patch } : block)))

  const moveBlock = ({ from, to }: MoveBlockParams) =>
    setBlocks((prev) => moveItem({ items: prev, from, to }))

  const summaryBlocks = blocks.map(toSummaryBlock)

  return {
    blocks,
    summaryBlocks,
    resetBlocks,
    addBlock,
    insertBlock,
    removeBlock,
    updateBlock,
    moveBlock
  }
}

export default useBlockStack

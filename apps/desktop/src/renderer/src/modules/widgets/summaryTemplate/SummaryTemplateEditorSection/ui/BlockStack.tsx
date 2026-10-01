import { useState } from 'react'
import type { DragEvent } from 'react'
import { isSummaryBlockKind } from '@shared/summaryTemplate'
import { useLocale } from '@renderer/shared/provider/context/localeContext'

import { BLOCK_KIND_MIME } from '../constants/blockDrag'
import type { InsertBlockParams, MoveBlockParams, UpdateBlockParams } from '../model/useBlockStack'
import type { StackedBlock } from '../types/stackedBlock'
import { toMoveTarget } from '../utils/toMoveTarget'
import StackedBlockItem from './StackedBlockItem'
import styles from './BlockStack.module.css'

interface BlockStackProps {
  blocks: StackedBlock[]
  onUpdate: (params: UpdateBlockParams) => void
  onInsert: (params: InsertBlockParams) => void
  onMove: (params: MoveBlockParams) => void
  onRemove: (key: number) => void
}

/**
 * 블록을 놓는 곳. 위→아래 순서가 결과 순서다. 블록 모음에서 끌어온 카드는 놓은 자리에 들어가고,
 * 쌓인 블록은 손잡이로 끌어 옮긴다. 놓을 자리는 "i번째 앞 / 끝" 하나로 다룬다
 */
export default function BlockStack({
  blocks,
  onUpdate,
  onInsert,
  onMove,
  onRemove
}: BlockStackProps) {
  const { t } = useLocale()
  const [dragFrom, setDragFrom] = useState<number | null>(null)
  const [dropIndex, setDropIndex] = useState<number | null>(null)

  const isAcceptable = (event: DragEvent) =>
    dragFrom !== null || event.dataTransfer.types.includes(BLOCK_KIND_MIME)

  // 자기 바로 앞·뒤는 제자리라 선을 그리지 않는다
  const isNoop = (index: number) =>
    dragFrom !== null && (index === dragFrom || index === dragFrom + 1)
  const visibleDropIndex = dropIndex !== null && !isNoop(dropIndex) ? dropIndex : null

  const dropEdgeOf = (index: number) => {
    if (visibleDropIndex === index) return 'before'
    if (visibleDropIndex === blocks.length && index === blocks.length - 1) return 'after'
    return null
  }

  const acceptDrag = ({ event, index }: { event: DragEvent; index: number }) => {
    if (!isAcceptable(event)) return
    event.preventDefault()
    event.dataTransfer.dropEffect = dragFrom !== null ? 'move' : 'copy'
    setDropIndex(index)
  }

  const handleItemDragOver = ({
    event,
    index
  }: {
    event: DragEvent<HTMLLIElement>
    index: number
  }) => {
    event.stopPropagation()
    const { top, height } = event.currentTarget.getBoundingClientRect()
    const isLowerHalf = event.clientY > top + height / 2
    acceptDrag({ event, index: isLowerHalf ? index + 1 : index })
  }

  // 블록 사이 틈(ol)에서는 직전 자리를 유지해 선이 끝으로 튀지 않게 한다
  const handleZoneDragOver = (event: DragEvent<HTMLDivElement>) => {
    const isOverZoneItself = event.target === event.currentTarget || !blocks.length
    acceptDrag({ event, index: isOverZoneItself ? blocks.length : (dropIndex ?? blocks.length) })
  }

  const handleDragEnd = () => {
    setDragFrom(null)
    setDropIndex(null)
  }

  const handleDragLeave = (event: DragEvent<HTMLDivElement>) => {
    const { relatedTarget } = event
    if (relatedTarget instanceof Node && event.currentTarget.contains(relatedTarget)) return
    setDropIndex(null)
  }

  // 블록 위에 놓아도 이벤트가 올라와 여기서 한 번만 처리한다
  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    if (!isAcceptable(event)) return
    event.preventDefault()
    const insertAt = dropIndex ?? blocks.length

    if (dragFrom !== null) {
      onMove({ from: dragFrom, to: toMoveTarget({ from: dragFrom, insertAt }) })
    } else {
      const kind = event.dataTransfer.getData(BLOCK_KIND_MIME)
      if (isSummaryBlockKind(kind)) onInsert({ kind, index: insertAt })
    }
    handleDragEnd()
  }

  return (
    <div
      className={styles.dropZone}
      data-drag-active={dropIndex !== null}
      onDragOver={handleZoneDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {blocks.length ? (
        <ol className={styles.stack} aria-label={t.summaryTemplate.section.stackLabel}>
          {blocks.map((block, index) => (
            <StackedBlockItem
              key={block.key}
              block={block}
              position={index + 1}
              isFirst={index === 0}
              isLast={index === blocks.length - 1}
              dropEdge={dropEdgeOf(index)}
              onChange={(patch) => onUpdate({ key: block.key, patch })}
              onMoveUp={() => onMove({ from: index, to: index - 1 })}
              onMoveDown={() => onMove({ from: index, to: index + 1 })}
              onRemove={() => onRemove(block.key)}
              onDragStart={() => setDragFrom(index)}
              onDragOver={(event) => handleItemDragOver({ event, index })}
              onDragEnd={handleDragEnd}
            />
          ))}
        </ol>
      ) : (
        <p className={styles.empty}>{t.summaryTemplate.section.emptyStack}</p>
      )}
    </div>
  )
}

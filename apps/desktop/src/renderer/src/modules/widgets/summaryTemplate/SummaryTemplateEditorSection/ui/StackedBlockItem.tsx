import type { DragEvent } from 'react'
import {
  SUMMARY_BLOCK_DESCRIPTION_MAX_CHARS,
  SUMMARY_BLOCK_HEADING_MAX_CHARS
} from '@shared/summaryTemplate'
import { useLocale } from '@renderer/shared/provider/context/localeContext'

import type { UpdateBlockParams } from '../model/useBlockStack'
import type { StackedBlock } from '../types/stackedBlock'
import styles from './StackedBlockItem.module.css'

interface StackedBlockItemProps {
  block: StackedBlock
  position: number
  isFirst: boolean
  isLast: boolean
  /** 놓을 자리를 알리는 가로 선의 위치 */
  dropEdge: 'before' | 'after' | null
  onChange: (patch: UpdateBlockParams['patch']) => void
  onMoveUp: () => void
  onMoveDown: () => void
  onRemove: () => void
  onDragStart: () => void
  onDragOver: (event: DragEvent<HTMLLIElement>) => void
  onDragEnd: () => void
}

/** 쌓인 블록 한 칸. 손잡이를 끌거나 ↑↓ 버튼으로 옮기고, 제목(과 custom의 설명)을 바로 고친다 */
export default function StackedBlockItem({
  block,
  position,
  isFirst,
  isLast,
  dropEdge,
  onChange,
  onMoveUp,
  onMoveDown,
  onRemove,
  onDragStart,
  onDragOver,
  onDragEnd
}: StackedBlockItemProps) {
  const { t } = useLocale()
  const labels = t.summaryTemplate.block

  // 입력 칸에서 글자를 고르다 카드가 끌려가지 않도록 손잡이만 끌 수 있게 하고, 끌리는 모양은 카드 전체로 보인다
  const handleDragStart = (event: DragEvent<HTMLSpanElement>) => {
    const card = event.currentTarget.closest('li')
    if (card) event.dataTransfer.setDragImage(card, 0, 0)
    event.dataTransfer.effectAllowed = 'move'
    onDragStart()
  }

  return (
    <li className={styles.card} data-drop-edge={dropEdge ?? undefined} onDragOver={onDragOver}>
      <span
        className={styles.handle}
        draggable
        aria-hidden="true"
        onDragStart={handleDragStart}
        onDragEnd={onDragEnd}
      >
        ⠿
      </span>
      <div className={styles.fields}>
        <span className={styles.kind}>{t.summaryTemplate.blocks[block.kind].name}</span>
        <input
          className={styles.input}
          aria-label={labels.headingLabel({ position })}
          maxLength={SUMMARY_BLOCK_HEADING_MAX_CHARS}
          value={block.heading}
          onChange={(event) => onChange({ heading: event.target.value })}
        />
        {block.kind === 'custom' && (
          <input
            className={styles.input}
            aria-label={labels.descriptionLabel({ position })}
            maxLength={SUMMARY_BLOCK_DESCRIPTION_MAX_CHARS}
            placeholder={labels.descriptionPlaceholder}
            value={block.description ?? ''}
            onChange={(event) => onChange({ description: event.target.value })}
          />
        )}
      </div>
      <div className={styles.buttons}>
        <button
          type="button"
          className={styles.iconButton}
          aria-label={labels.moveUp({ position })}
          disabled={isFirst}
          onClick={onMoveUp}
        >
          ↑
        </button>
        <button
          type="button"
          className={styles.iconButton}
          aria-label={labels.moveDown({ position })}
          disabled={isLast}
          onClick={onMoveDown}
        >
          ↓
        </button>
        <button
          type="button"
          className={styles.iconButton}
          aria-label={labels.remove({ position })}
          onClick={onRemove}
        >
          ×
        </button>
      </div>
    </li>
  )
}

import type { DragEvent } from 'react'
import { isRepeatableBlockKind, SUMMARY_BLOCK_KINDS } from '@shared/summaryTemplate'
import type { SummaryBlockKind } from '@shared/types'
import { useLocale } from '@renderer/shared/provider/context/localeContext'

import { BLOCK_KIND_MIME } from '../constants/blockDrag'
import styles from './BlockPalette.module.css'

interface BlockPaletteProps {
  usedKinds: SummaryBlockKind[]
  isFull: boolean
  onAdd: (kind: SummaryBlockKind) => void
}

/**
 * 블록 모음. 끌어서 놓는 곳의 원하는 자리에 넣거나, 누르면 맨 아래에 붙는다(키보드 경로).
 * 이미 넣은 종류는 custom을 빼고 비활성이다
 */
export default function BlockPalette({ usedKinds, isFull, onAdd }: BlockPaletteProps) {
  const { t } = useLocale()

  const handleDragStart = ({
    event,
    kind
  }: {
    event: DragEvent<HTMLButtonElement>
    kind: SummaryBlockKind
  }) => {
    event.dataTransfer.setData(BLOCK_KIND_MIME, kind)
    event.dataTransfer.effectAllowed = 'copy'
  }

  return (
    <ul className={styles.palette} aria-label={t.summaryTemplate.section.paletteLabel}>
      {SUMMARY_BLOCK_KINDS.map((kind) => {
        const { name, description } = t.summaryTemplate.blocks[kind]
        const isDisabled = isFull || (!isRepeatableBlockKind(kind) && usedKinds.includes(kind))

        return (
          <li key={kind}>
            <button
              type="button"
              className={styles.card}
              aria-label={t.summaryTemplate.block.add({ name })}
              disabled={isDisabled}
              draggable={!isDisabled}
              onDragStart={(event) => handleDragStart({ event, kind })}
              onClick={() => onAdd(kind)}
            >
              <span className={styles.name}>{name}</span>
              <span className={styles.description}>{description}</span>
            </button>
          </li>
        )
      })}
    </ul>
  )
}

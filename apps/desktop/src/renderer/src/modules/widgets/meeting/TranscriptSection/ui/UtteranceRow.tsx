import { formatTimestamp } from '@meeting-stt/core/format'
import type { Utterance } from '@shared/types'
import InlineEditableText from '@renderer/shared/components/composites/InlineEditableText'

import type { SpeakerOption } from '../types/transcript'
import styles from './UtteranceRow.module.css'

interface UtteranceRowProps {
  utterance: Utterance
  speakerOptions: SpeakerOption[]
  isCopied: boolean
  onChangeSpeaker: (params: { utteranceId: string; speakerLabel: string }) => void
  onCommitText: (params: { utteranceId: string; text: string }) => void
  onCopy: (params: { utterance: Utterance }) => void
}

export default function UtteranceRow({
  utterance,
  speakerOptions,
  isCopied,
  onChangeSpeaker,
  onCommitText,
  onCopy
}: UtteranceRowProps) {
  return (
    <li className={styles.row}>
      <span className={styles.head}>
        <select
          className={styles.speaker}
          aria-label="화자 변경"
          value={utterance.speakerLabel}
          onChange={(event) =>
            onChangeSpeaker({ utteranceId: utterance.id, speakerLabel: event.target.value })
          }
        >
          {speakerOptions.map(({ label, name }) => (
            <option key={label} value={label}>
              {name}
            </option>
          ))}
        </select>
        <span className={styles.time}>{formatTimestamp({ sec: utterance.startSec })}</span>
        <button
          type="button"
          className={styles.copy}
          aria-label="이 발화 복사"
          onClick={() => onCopy({ utterance })}
        >
          {isCopied ? '복사했습니다' : '복사'}
        </button>
      </span>
      <InlineEditableText
        isMultiline
        className={styles.text}
        value={utterance.text}
        ariaLabel="발화 내용"
        onCommit={(text) => onCommitText({ utteranceId: utterance.id, text })}
      />
    </li>
  )
}

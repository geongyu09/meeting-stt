import { formatTimestamp } from '@meeting-stt/core/format'
import type { Utterance } from '@shared/types'
import InlineEditableText from '@renderer/shared/components/composites/InlineEditableText'
import Icon from '@renderer/shared/components/primitives/ui/Icon'
import { useLocale } from '@renderer/shared/provider/context/localeContext'

import type { SpeakerOption } from '../types/transcript'
import { speakerToneOf } from '../utils/speakerTone'
import styles from './UtteranceRow.module.css'

interface UtteranceRowProps {
  utterance: Utterance
  speakerOptions: SpeakerOption[]
  isCopied: boolean
  onChangeSpeaker: (params: { utteranceId: string; speakerLabel: string }) => void
  onCommitText: (params: { utteranceId: string; text: string }) => void
  onCopy: (params: { utterance: Utterance }) => void
  /** 원본 녹음이 있을 때만 넘긴다. 있으면 시각이 재생 위치 이동 버튼이 된다 */
  onSeek?: (sec: number) => void
}

/** 시각 · (화자 + 본문) · 복사. 복사 버튼은 행에 마우스를 올리거나 포커스가 들어올 때만 보인다 */
export default function UtteranceRow({
  utterance,
  speakerOptions,
  isCopied,
  onChangeSpeaker,
  onCommitText,
  onCopy,
  onSeek
}: UtteranceRowProps) {
  const { t } = useLocale()
  const { utterance: labels } = t.transcript
  const tone = speakerToneOf({ speakerOptions, label: utterance.speakerLabel })
  const timestamp = formatTimestamp({ sec: utterance.startSec })

  return (
    <li className={styles.row}>
      {onSeek ? (
        <button
          type="button"
          className={[styles.time, styles.seek].join(' ')}
          aria-label={labels.seekFrom({ timestamp })}
          title={labels.seekFrom({ timestamp })}
          onClick={() => onSeek(utterance.startSec)}
        >
          {timestamp}
        </button>
      ) : (
        <span className={styles.time}>{timestamp}</span>
      )}
      <div className={styles.body}>
        <span className={[styles.speaker, styles[`tone${tone}`]].join(' ')}>
          <span className={styles.dot} aria-hidden="true" />
          <select
            className={styles.speakerSelect}
            aria-label={labels.changeSpeaker}
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
          <Icon name="chevronDown" size={12} />
        </span>
        <InlineEditableText
          isMultiline
          className={styles.text}
          value={utterance.text}
          ariaLabel={labels.textLabel}
          onCommit={(text) => onCommitText({ utteranceId: utterance.id, text })}
        />
      </div>
      <button
        type="button"
        className={[styles.copy, isCopied ? styles.copied : ''].join(' ')}
        aria-label={isCopied ? labels.copied : labels.copyThis}
        title={isCopied ? labels.copied : labels.copyThis}
        onClick={() => onCopy({ utterance })}
      >
        <Icon name={isCopied ? 'check' : 'copy'} size={14} />
      </button>
    </li>
  )
}

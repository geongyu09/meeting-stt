import { useState } from 'react'
import InlineEditableText from '@renderer/shared/components/composites/InlineEditableText'
import Button from '@renderer/shared/components/primitives/ui/Button'
import { useLocale } from '@renderer/shared/provider/context/localeContext'

import type { SpeakerOption } from '../types/transcript'
import { speakerToneOf } from '../utils/speakerTone'
import styles from './SpeakerPanel.module.css'

interface SpeakerPanelProps {
  speakerOptions: SpeakerOption[]
  onRenameSpeaker: (params: { label: string; displayName: string }) => void
  onMergeSpeakers: (params: { fromLabel: string; intoLabel: string }) => void
}

/**
 * 헤더 아래 화자 칩 줄. 이름은 눌러서 바로 고치고, 병합은 "화자 합치기"로 모드를 켠 뒤
 * 칩의 "합치기" → 대상 선택 두 단계를 거친다 (되돌릴 수 없는 동작의 인라인 확인).
 */
export default function SpeakerPanel({
  speakerOptions,
  onRenameSpeaker,
  onMergeSpeakers
}: SpeakerPanelProps) {
  const { t } = useLocale()
  const { speakerPanel: labels } = t.transcript
  const [isMerging, setIsMerging] = useState(false)
  const [mergingLabel, setMergingLabel] = useState<string | null>(null)

  const handleToggleMerge = () => {
    setIsMerging(!isMerging)
    setMergingLabel(null)
  }

  const handleMerge = ({ fromLabel, intoLabel }: { fromLabel: string; intoLabel: string }) => {
    setIsMerging(false)
    setMergingLabel(null)
    onMergeSpeakers({ fromLabel, intoLabel })
  }

  const merging = speakerOptions.find((option) => option.label === mergingLabel)

  return (
    <section className={styles.row} aria-label={labels.sectionLabel}>
      {speakerOptions.map((option) => (
        <span key={option.label} className={styles.chip}>
          <span
            className={[
              styles.dot,
              styles[`tone${speakerToneOf({ speakerOptions, label: option.label })}`]
            ].join(' ')}
            aria-hidden="true"
          />
          <InlineEditableText
            className={styles.name}
            value={option.name}
            ariaLabel={labels.nameLabel({ name: option.name })}
            onCommit={(displayName) => onRenameSpeaker({ label: option.label, displayName })}
          />
          {isMerging ? (
            <button
              type="button"
              className={styles.mergeButton}
              aria-expanded={mergingLabel === option.label}
              onClick={() => setMergingLabel(mergingLabel === option.label ? null : option.label)}
            >
              {mergingLabel === option.label ? labels.cancel : labels.merge}
            </button>
          ) : null}
        </span>
      ))}
      {speakerOptions.length > 1 ? (
        <Button
          variant="secondary"
          size="sm"
          className={styles.toggle}
          aria-expanded={isMerging}
          onClick={handleToggleMerge}
        >
          {isMerging ? labels.finishMerging : labels.startMerging}
        </Button>
      ) : null}
      {merging ? (
        <div className={styles.targets}>
          <span className={styles.targetsLabel}>
            {labels.mergeTargetsLabel({ name: merging.name })}
          </span>
          {speakerOptions
            .filter((option) => option.label !== merging.label)
            .map((option) => (
              <Button
                key={option.label}
                variant="secondary"
                size="sm"
                onClick={() => handleMerge({ fromLabel: merging.label, intoLabel: option.label })}
              >
                {labels.mergeInto({ name: option.name })}
              </Button>
            ))}
        </div>
      ) : null}
    </section>
  )
}

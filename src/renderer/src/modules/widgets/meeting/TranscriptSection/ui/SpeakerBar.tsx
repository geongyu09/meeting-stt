import { useState } from 'react'
import InlineEditableText from '@renderer/shared/components/composites/InlineEditableText'
import Button from '@renderer/shared/components/primitives/ui/Button'

import type { SpeakerOption } from '../types/transcript'
import styles from './SpeakerBar.module.css'

interface SpeakerBarProps {
  speakerOptions: SpeakerOption[]
  onRenameSpeaker: (params: { label: string; displayName: string }) => void
  onMergeSpeakers: (params: { fromLabel: string; intoLabel: string }) => void
}

/** 화자 이름 지정과 병합. 병합은 합칠 대상을 고르는 두 번째 단계가 곧 확인 절차다 */
export default function SpeakerBar({
  speakerOptions,
  onRenameSpeaker,
  onMergeSpeakers
}: SpeakerBarProps) {
  const [mergingLabel, setMergingLabel] = useState<string | null>(null)

  if (!speakerOptions.length) return null

  const handleMerge = ({ fromLabel, intoLabel }: { fromLabel: string; intoLabel: string }) => {
    setMergingLabel(null)
    onMergeSpeakers({ fromLabel, intoLabel })
  }

  return (
    <section className={styles.section} aria-label="화자">
      <h3 className={styles.heading}>화자 {speakerOptions.length}명</h3>
      <ul className={styles.list}>
        {speakerOptions.map(({ label, name }) => (
          <li className={styles.item} key={label}>
            <InlineEditableText
              className={styles.name}
              value={name}
              ariaLabel={`${name} 이름`}
              onCommit={(displayName) => onRenameSpeaker({ label, displayName })}
            />
            {speakerOptions.length > 1 ? (
              <Button
                variant="secondary"
                onClick={() => setMergingLabel(mergingLabel === label ? null : label)}
                aria-expanded={mergingLabel === label}
              >
                {mergingLabel === label ? '취소' : '합치기'}
              </Button>
            ) : null}
            {mergingLabel === label ? (
              <div className={styles.targets}>
                <span className={styles.targetsLabel}>{name}을(를) 누구에게 합칠까요?</span>
                {speakerOptions
                  .filter((option) => option.label !== label)
                  .map((option) => (
                    <Button
                      key={option.label}
                      variant="secondary"
                      onClick={() => handleMerge({ fromLabel: label, intoLabel: option.label })}
                    >
                      {option.name}에 합치기
                    </Button>
                  ))}
              </div>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  )
}

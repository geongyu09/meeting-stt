import { formatTimestamp } from '@shared/format'
import type { Utterance } from '@shared/types'

import styles from './UtteranceRow.module.css'

interface UtteranceRowProps {
  utterance: Utterance
  speakerName: string
}

export default function UtteranceRow({ utterance, speakerName }: UtteranceRowProps) {
  return (
    <li className={styles.row}>
      <span className={styles.head}>
        <span className={styles.speaker}>{speakerName}</span>
        <span className={styles.time}>{formatTimestamp({ sec: utterance.startSec })}</span>
      </span>
      <p className={styles.text}>{utterance.text}</p>
    </li>
  )
}

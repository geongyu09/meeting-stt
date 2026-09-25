import type { RefinePairGroup } from '@shared/types'
import { useLocale } from '@renderer/shared/provider/context/localeContext'

import styles from './PairGroupRow.module.css'

interface PairGroupRowProps {
  group: RefinePairGroup
}

/** 자동으로 고친 쌍 하나. 걸린 발화 전부가 바뀌었으므로 몇 곳인지 함께 보여 준다 */
export default function PairGroupRow({ group }: PairGroupRowProps) {
  const { t } = useLocale()
  const { from, to, utteranceIds } = group

  return (
    <li className={styles.row}>
      <span className={styles.from}>{from}</span>
      <span className={styles.arrow} aria-hidden="true">
        →
      </span>
      <span className={styles.to}>{to}</span>
      <span className={styles.count}>{t.refine.placeCount({ count: utteranceIds.length })}</span>
    </li>
  )
}

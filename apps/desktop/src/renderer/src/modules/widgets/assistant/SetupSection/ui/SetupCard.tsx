import type { ReactNode } from 'react'
import Icon from '@renderer/shared/components/primitives/ui/Icon'
import { useLocale } from '@renderer/shared/provider/context/localeContext'

import styles from './SetupCard.module.css'

const CHECK_ICON_SIZE = 14

interface SetupCardProps {
  step: number
  isDone: boolean
  title: string
  /** 제목 줄 오른쪽 — 버튼이나 짧은 안내 */
  action?: ReactNode
  children: ReactNode
}

/** 처음 실행 설정 카드의 껍데기 — 단계 번호(끝나면 체크), 제목, 오른쪽 동작, 본문 */
export default function SetupCard({ step, isDone, title, action, children }: SetupCardProps) {
  const { t } = useLocale()

  return (
    <section className={styles.card} aria-label={title}>
      <div className={styles.header}>
        <span className={isDone ? styles.stepDone : styles.step}>
          {isDone ? <Icon name="check" size={CHECK_ICON_SIZE} /> : step}
          <span className={styles.srOnly}>
            {isDone ? t.setup.stepDone : t.setup.stepLabel({ step })}
          </span>
        </span>
        <b className={styles.title}>{title}</b>
        {action ? <span className={styles.action}>{action}</span> : null}
      </div>
      <div className={styles.body}>{children}</div>
    </section>
  )
}

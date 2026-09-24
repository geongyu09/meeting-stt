import type { ReactNode } from 'react'

import styles from './SettingGroup.module.css'

interface SettingGroupProps {
  title: string
  children: ReactNode
}

export default function SettingGroup({ title, children }: SettingGroupProps) {
  return (
    <section className={styles.group} aria-label={title}>
      <h2 className={styles.heading}>{title}</h2>
      {children}
    </section>
  )
}

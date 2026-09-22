import type { ButtonHTMLAttributes } from 'react'

import styles from './index.module.css'

export type ButtonVariant = 'primary' | 'secondary' | 'danger'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
}

export default function Button({ variant = 'primary', className, ...rest }: ButtonProps) {
  return (
    <button
      className={[styles.button, styles[variant], className].filter(Boolean).join(' ')}
      {...rest}
    />
  )
}

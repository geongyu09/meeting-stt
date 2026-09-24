import type { ReactNode } from 'react'
import { formatAccelerator } from '@shared/shortcut'
import Button from '@renderer/shared/components/primitives/ui/Button'

import useShortcutCapture from '../model/useShortcutCapture'
import styles from './ShortcutField.module.css'

interface ShortcutFieldProps {
  title: string
  accelerator: string
  defaultAccelerator: string
  onChange: (accelerator: string) => void
  children: ReactNode
}

export default function ShortcutField({
  title,
  accelerator,
  defaultAccelerator,
  onChange,
  children
}: ShortcutFieldProps) {
  const { isCapturing, error, startCapture, stopCapture, handleKeyDown } = useShortcutCapture({
    onCapture: onChange
  })

  return (
    <div className={styles.option}>
      <span className={styles.optionBody}>
        <span className={styles.optionTitle}>{title}</span>
        <span className={styles.optionHint}>{children}</span>
        {error ? (
          <span className={styles.error} role="alert">
            {error.message}
          </span>
        ) : null}
      </span>
      <div className={styles.controls}>
        <button
          type="button"
          className={isCapturing ? styles.captureActive : styles.capture}
          aria-label={`${title} 변경`}
          onClick={startCapture}
          onKeyDown={handleKeyDown}
          onBlur={stopCapture}
        >
          {isCapturing ? '키 조합을 누르세요' : formatAccelerator(accelerator)}
        </button>
        <Button
          type="button"
          variant="secondary"
          disabled={accelerator === defaultAccelerator}
          onClick={() => onChange(defaultAccelerator)}
        >
          기본값
        </Button>
      </div>
    </div>
  )
}

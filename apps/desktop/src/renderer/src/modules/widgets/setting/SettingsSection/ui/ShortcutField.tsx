import type { ReactNode } from 'react'
import { SHORTCUT_OFF, formatAccelerator } from '@shared/shortcut'
import SettingRow from '@renderer/shared/components/primitives/layout/SettingRow'
import { useLocale } from '@renderer/shared/provider/context/localeContext'

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
  const { t } = useLocale()
  const { isCapturing, error, startCapture, stopCapture, handleKeyDown } = useShortcutCapture({
    onCapture: onChange
  })
  const isOff = accelerator === SHORTCUT_OFF
  const label = isOff ? t.settings.shortcutField.off : formatAccelerator(accelerator)

  return (
    <SettingRow
      title={title}
      description={
        <>
          {children}
          {error ? (
            <span className={styles.error} role="alert">
              {' '}
              {error.message}
            </span>
          ) : null}
        </>
      }
      control={
        <>
          <button
            type="button"
            className={isCapturing ? styles.captureActive : styles.capture}
            aria-label={t.settings.shortcutField.changeLabel({ title })}
            onClick={startCapture}
            onKeyDown={handleKeyDown}
            onBlur={stopCapture}
          >
            {isCapturing ? t.settings.shortcutField.pressKeys : label}
          </button>
          {isOff ? null : (
            <button type="button" className={styles.reset} onClick={() => onChange(SHORTCUT_OFF)}>
              {t.settings.shortcutField.turnOff}
            </button>
          )}
          {accelerator === defaultAccelerator ? null : (
            <button
              type="button"
              className={styles.reset}
              onClick={() => onChange(defaultAccelerator)}
            >
              {t.settings.shortcutField.resetTo({
                accelerator: formatAccelerator(defaultAccelerator)
              })}
            </button>
          )}
        </>
      }
    />
  )
}

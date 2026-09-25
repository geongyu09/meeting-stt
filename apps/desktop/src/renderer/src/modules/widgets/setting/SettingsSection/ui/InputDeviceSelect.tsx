import { useId } from 'react'
import type { AudioInputDevice } from '@shared/types'
import SettingRow from '@renderer/shared/components/primitives/layout/SettingRow'
import { useLocale } from '@renderer/shared/provider/context/localeContext'

import styles from './InputDeviceSelect.module.css'

/** select의 "시스템 기본 마이크" 값. deviceId는 빈 문자열일 수 없어 겹치지 않는다 */
const DEFAULT_OPTION_VALUE = ''

interface InputDeviceSelectProps {
  value: AudioInputDevice | null
  devices: AudioInputDevice[]
  isLoading: boolean
  error: Error | null
  onChange: (device: AudioInputDevice | null) => void
}

export default function InputDeviceSelect({
  value,
  devices,
  isLoading,
  error,
  onChange
}: InputDeviceSelectProps) {
  const { t } = useLocale()
  const titleId = useId()
  const isSelectedMissing =
    value !== null && !devices.some((device) => device.deviceId === value.deviceId)

  const handleChange = (deviceId: string) => {
    if (deviceId === DEFAULT_OPTION_VALUE) {
      onChange(null)
      return
    }

    const device = devices.find((candidate) => candidate.deviceId === deviceId)
    if (device) onChange({ deviceId: device.deviceId, label: device.label })
  }

  const renderStatus = () => {
    if (error) {
      return (
        <span className={styles.error} role="alert">
          {error.message}
        </span>
      )
    }
    if (isSelectedMissing) {
      return <span className={styles.warning}>{t.settings.inputDevice.missingWarning}</span>
    }

    return null
  }

  return (
    <SettingRow
      title={t.settings.inputDevice.title}
      titleId={titleId}
      description={
        <>
          {t.settings.inputDevice.description}
          {renderStatus()}
        </>
      }
      control={
        <select
          className={styles.select}
          aria-labelledby={titleId}
          value={value?.deviceId ?? DEFAULT_OPTION_VALUE}
          disabled={isLoading}
          onChange={(event) => handleChange(event.target.value)}
        >
          <option value={DEFAULT_OPTION_VALUE}>{t.settings.inputDevice.systemDefault}</option>
          {devices.map((device) => (
            <option key={device.deviceId} value={device.deviceId}>
              {device.label}
            </option>
          ))}
          {isSelectedMissing ? (
            <option value={value.deviceId} disabled>
              {value.label || t.settings.inputDevice.previouslyChosen}{' '}
              {t.settings.inputDevice.disconnectedSuffix}
            </option>
          ) : null}
        </select>
      }
    />
  )
}

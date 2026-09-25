import { useId } from 'react'
import type { AudioInputDevice } from '@shared/types'
import SettingRow from '@renderer/shared/components/primitives/layout/SettingRow'

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
      return (
        <span className={styles.warning}>
          고른 마이크가 연결돼 있지 않습니다. 지금 녹음하면 시스템 기본 마이크를 씁니다.
        </span>
      )
    }

    return null
  }

  return (
    <SettingRow
      title="입력 장치"
      titleId={titleId}
      description={
        <>
          녹음에 쓸 마이크입니다. 고른 마이크가 연결돼 있지 않으면 시스템 기본 마이크로 녹음합니다.
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
          <option value={DEFAULT_OPTION_VALUE}>시스템 기본 마이크</option>
          {devices.map((device) => (
            <option key={device.deviceId} value={device.deviceId}>
              {device.label}
            </option>
          ))}
          {isSelectedMissing ? (
            <option value={value.deviceId} disabled>
              {value.label || '이전에 고른 마이크'} (연결되지 않음)
            </option>
          ) : null}
        </select>
      }
    />
  )
}

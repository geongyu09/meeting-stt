import { useCallback, useEffect, useState } from 'react'
import type { AudioInputDevice } from '@shared/types'
import { requestMicrophonePermissionApi } from '@renderer/shared/api/recording'

/** Chromium이 끼워 넣는 가상 항목. "시스템 기본 마이크" 선택지가 그 역할이라 목록에서 뺀다 */
const VIRTUAL_DEVICE_IDS = ['default', 'communications']
const LOAD_ERROR_MESSAGE = '마이크 목록을 불러오지 못했습니다'

const isInputDevice = (device: MediaDeviceInfo) =>
  device.kind === 'audioinput' &&
  device.deviceId !== '' &&
  !VIRTUAL_DEVICE_IDS.includes(device.deviceId)

const toInputDevices = (devices: MediaDeviceInfo[]): AudioInputDevice[] =>
  devices.filter(isInputDevice).map((device, index) => ({
    deviceId: device.deviceId,
    label: device.label || `마이크 ${index + 1}`
  }))

const hasUnlabeledDevice = (devices: MediaDeviceInfo[]) =>
  devices.some((device) => device.kind === 'audioinput' && !device.label)

/** 라벨은 권한이 난 뒤에만 온다. 한 번 짧게 열었다 닫으면 그다음 목록부터 이름이 붙는다 */
const unlockLabels = async () => {
  try {
    if (!(await requestMicrophonePermissionApi())) return

    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    stream.getTracks().forEach((track) => track.stop())
  } catch (caught) {
    // 라벨 없이도 목록은 보여줄 수 있다. 여기서 실패해도 테스트·녹음이 같은 안내를 다시 준다
    console.warn('마이크 라벨을 받지 못했습니다', caught)
  }
}

const enumerateInputDevices = async () => {
  const devices = await navigator.mediaDevices.enumerateDevices()
  if (!hasUnlabeledDevice(devices)) return toInputDevices(devices)

  await unlockLabels()

  return toInputDevices(await navigator.mediaDevices.enumerateDevices())
}

/**
 * 설정의 입력 장치 선택지. 장치를 꽂거나 빼면(`devicechange`) 다시 읽는다
 * (references/architecture.md "마이크 입력 장치와 테스트").
 */
const useInputDevices = () => {
  const [devices, setDevices] = useState<AudioInputDevice[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  // effect에서 부르는 함수라 await 대신 프로미스 체인으로 쓴다 (.claude/rules/hook-guide.md)
  const fetchDevices = useCallback(
    () =>
      enumerateInputDevices()
        .then((next) => {
          setDevices(next)
          setError(null)
        })
        .catch((caught: unknown) =>
          setError(caught instanceof Error ? caught : new Error(LOAD_ERROR_MESSAGE))
        )
        .finally(() => setIsLoading(false)),
    []
  )

  const refetch = useCallback(() => {
    setIsLoading(true)

    return fetchDevices()
  }, [fetchDevices])

  useEffect(() => {
    fetchDevices()

    const mediaDevices = navigator.mediaDevices
    mediaDevices.addEventListener('devicechange', fetchDevices)

    return () => mediaDevices.removeEventListener('devicechange', fetchDevices)
  }, [fetchDevices])

  return { devices, isLoading, error, refetch }
}

export default useInputDevices

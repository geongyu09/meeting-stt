import type { UpdateSettingsRequest } from '@shared/ipc'

/**
 * @description 앱 설정을 불러옵니다.
 * @returns 현재 설정
 * @example
 * const settings = await getSettingsApi()
 */
export const getSettingsApi = async () => window.api.settings.get()

/**
 * @description 앱 설정을 저장합니다. 설정 전체를 한 번에 보냅니다.
 * @param isAudioKept - 회의록을 만든 뒤 원본 녹음을 보관할지 여부
 * @param isUpdateCheckEnabled - 앱 시작 시 새 버전을 확인할지 여부 (기본 꺼짐)
 * @param isQuietProcessing - 회의록을 만들 때 속도보다 발열·팬 소음을 줄일지 여부 (기본 꺼짐)
 * @returns 저장된 설정
 * @example
 * const settings = await updateSettingsApi({
 *   isAudioKept: true,
 *   isUpdateCheckEnabled: false,
 *   isQuietProcessing: false
 * })
 */
export const updateSettingsApi = async ({
  isAudioKept,
  isUpdateCheckEnabled,
  isQuietProcessing
}: UpdateSettingsRequest) =>
  window.api.settings.update({ isAudioKept, isUpdateCheckEnabled, isQuietProcessing })

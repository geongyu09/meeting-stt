/**
 * @description 발견한 새 버전을 내려받습니다. 다 받을 때까지 resolve되지 않습니다.
 * @returns 없음
 * @example
 * await downloadUpdateApi()
 */
export const downloadUpdateApi = async () => {
  await window.api.update.download()
}

/**
 * @description 내려받은 새 버전을 설치하며 앱을 다시 시작합니다.
 * @returns 없음
 * @example
 * await installUpdateApi()
 */
export const installUpdateApi = async () => {
  await window.api.update.install()
}

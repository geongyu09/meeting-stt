import { is } from '@electron-toolkit/utils'
import { autoUpdater } from 'electron-updater'
import { info, messageOf, warn } from './log'

/**
 * 자동 업데이트는 **기본이 꺼짐**이다. 설정(`update.check`)을 켠 사용자만 확인한다 —
 * "네트워크는 모델 다운로드 한 번뿐"이라는 약속을 지키기 위해서다 (`references/distribution.md`).
 * 새 버전을 발견해도 내려받지 않고 알리기만 한다.
 */
export const checkForUpdates = async ({ isEnabled }: { isEnabled: boolean }) => {
  if (!isEnabled || is.dev) return null

  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = false

  try {
    const result = await autoUpdater.checkForUpdates()
    const version = result?.updateInfo.version ?? null
    if (version) info(`새 버전이 있습니다: ${version}`)

    return version
  } catch (caught) {
    // 오프라인이 정상 상태인 앱이다. 실패는 로그만 남기고 넘어간다
    warn(`업데이트 확인 실패: ${messageOf(caught)}`)

    return null
  }
}

/** 사용자가 "받기"를 눌렀을 때만 내려받는다. 다 받을 때까지 resolve되지 않는다 */
export const downloadUpdate = async () => {
  await autoUpdater.downloadUpdate()
}

/** 내려받은 설치 파일로 앱을 다시 시작한다. 사용자가 눌렀을 때만 부른다 */
export const installUpdate = () => {
  autoUpdater.quitAndInstall()
}

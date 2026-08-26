import { useEffect, useState } from 'react'
import { onUpdateAvailable } from '@renderer/shared/api/events'
import { downloadUpdateApi, installUpdateApi } from '@renderer/shared/api/update'

/** 'idle'은 새 버전 이벤트를 아직 받지 않은 상태. 배너는 이때 아무것도 그리지 않는다 */
export type UpdateStage = 'idle' | 'available' | 'downloading' | 'downloaded' | 'error'

const DOWNLOAD_ERROR_MESSAGE = '새 버전을 내려받지 못했습니다'
const INSTALL_ERROR_MESSAGE = '새 버전을 설치하지 못했습니다'

const useUpdate = () => {
  const [version, setVersion] = useState<string | null>(null)
  const [stage, setStage] = useState<UpdateStage>('idle')
  const [error, setError] = useState<string | null>(null)

  useEffect(
    () =>
      onUpdateAvailable((event) => {
        setVersion(event.version)
        setStage('available')
      }),
    []
  )

  const download = async () => {
    setStage('downloading')
    setError(null)

    try {
      await downloadUpdateApi()
      setStage('downloaded')
    } catch (caught) {
      setStage('error')
      setError(caught instanceof Error ? caught.message : DOWNLOAD_ERROR_MESSAGE)
    }
  }

  /** 성공하면 앱이 종료되므로 이후 상태는 없다 */
  const install = async () => {
    try {
      await installUpdateApi()
    } catch (caught) {
      setStage('error')
      setError(caught instanceof Error ? caught.message : INSTALL_ERROR_MESSAGE)
    }
  }

  return { version, stage, error, download, install }
}

export default useUpdate

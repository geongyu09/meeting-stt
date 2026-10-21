import { useEffect, useState } from 'react'
import type { MeetingAudioFile } from '@shared/types'
import { deleteMeetingAudioApi, getMeetingAudioFilesApi } from '@renderer/shared/api/meetings'
import { useLocale } from '@renderer/shared/provider/context/localeContext'

/** 보관 중인 녹음 파일 목록과 삭제. 삭제 응답의 목록으로 화면을 맞추고 선택은 호출한 쪽이 비운다 */
const useAudioFiles = () => {
  const { t } = useLocale()
  const [files, setFiles] = useState<MeetingAudioFile[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [failedCount, setFailedCount] = useState(0)
  const [isDeleting, setIsDeleting] = useState(false)

  useEffect(() => {
    getMeetingAudioFilesApi()
      .then(setFiles)
      .catch(() => setError(t.recording.files.loadError))
  }, [t])

  const deleteFiles = async ({ meetingIds }: { meetingIds: string[] }) => {
    setIsDeleting(true)
    setError(null)
    try {
      const result = await deleteMeetingAudioApi({ meetingIds })
      setFiles(result.files)
      setFailedCount(result.failedCount)
    } catch (caught) {
      setError(
        caught instanceof Error && caught.message ? caught.message : t.recording.files.deleteError
      )
    } finally {
      setIsDeleting(false)
    }
  }

  return { files, error, failedCount, isDeleting, deleteFiles }
}

export default useAudioFiles

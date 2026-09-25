import { useState } from 'react'
import { useNavigate } from 'react-router'
import { importMeetingAudioApi } from '@renderer/shared/api/meetings'
import { useLocale } from '@renderer/shared/provider/context/localeContext'
import { meetingDetailPath } from '@renderer/shared/routes/paths'

/** 열기 대화상자를 취소하면 아무 표시 없이 처음 상태로 돌아간다. 성공하면 만들어진 회의 상세로 간다 */
const useAudioImport = () => {
  const { t } = useLocale()
  const navigate = useNavigate()
  const [isImporting, setIsImporting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const importAudio = async () => {
    setIsImporting(true)
    setError(null)
    try {
      const { meeting } = await importMeetingAudioApi()
      if (meeting) navigate(meetingDetailPath({ meetingId: meeting.id }))
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t.recording.importer.failed)
    } finally {
      setIsImporting(false)
    }
  }

  return { isImporting, error, importAudio }
}

export default useAudioImport

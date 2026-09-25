import { useState } from 'react'
import { exportMeetingAudioApi } from '@renderer/shared/api/meetings'
import { useLocale } from '@renderer/shared/provider/context/localeContext'

interface UseRecordingExportParams {
  meetingId: string
}

type ExportStatus = 'idle' | 'exporting' | 'saved'

/** 저장 대화상자를 취소하면 아무 표시 없이 처음 상태로 돌아간다 */
const useRecordingExport = ({ meetingId }: UseRecordingExportParams) => {
  const { t } = useLocale()
  const [status, setStatus] = useState<ExportStatus>('idle')
  const [error, setError] = useState<string | null>(null)

  const exportRecording = async () => {
    setStatus('exporting')
    setError(null)

    try {
      const { isSaved } = await exportMeetingAudioApi({ meetingId })
      setStatus(isSaved ? 'saved' : 'idle')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t.transcript.errors.exportAudio)
      setStatus('idle')
    }
  }

  return {
    isExporting: status === 'exporting',
    isSaved: status === 'saved',
    error,
    exportRecording
  }
}

export default useRecordingExport

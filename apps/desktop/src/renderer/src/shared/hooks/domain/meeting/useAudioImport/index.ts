import { useState } from 'react'
import { importMeetingAudioApi } from '@renderer/shared/api/meetings'
import { useLocale } from '@renderer/shared/provider/context/localeContext'

/**
 * 앱 밖에서 녹음한 파일로 기록을 만든다. 파일 선택·변환은 main이 한다 (references/features/recording.md "녹음 파일 가져오기").
 * 열기 대화상자를 취소하면 아무 표시 없이 처음 상태로 돌아가고, 성공하면 이동하지 않는다 — 대화에 처리 중 기록 카드가 생긴다.
 */
const useAudioImport = () => {
  const { t } = useLocale()
  const [isImporting, setIsImporting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const importAudio = async () => {
    setIsImporting(true)
    setError(null)
    try {
      await importMeetingAudioApi()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t.recording.importer.failed)
    } finally {
      setIsImporting(false)
    }
  }

  return { isImporting, error, importAudio }
}

export default useAudioImport

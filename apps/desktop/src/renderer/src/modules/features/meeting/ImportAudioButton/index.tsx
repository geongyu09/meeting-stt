import SettingRow from '@renderer/shared/components/primitives/layout/SettingRow'
import Button from '@renderer/shared/components/primitives/ui/Button'
import useRecordingState from '@renderer/shared/hooks/domain/recording/useRecordingState'
import { useLocale } from '@renderer/shared/provider/context/localeContext'

import useAudioImport from './model/useAudioImport'
import styles from './index.module.css'

/**
 * 앱 밖에서 녹음한 파일로 회의록을 만든다. 파일 선택·변환은 main이 한다
 * (references/architecture.md "녹음 파일 가져오기").
 * 진행 중인 녹음이 있으면 참석자 수가 그 녹음 몫이라 숨기는 대신 비활성으로 둔다 — 자리가 움직이지 않는다.
 */
export default function ImportAudioButton() {
  const { t: messages } = useLocale()
  const t = messages.recording.importer
  const { isRecording } = useRecordingState()
  const { isImporting, error, importAudio } = useAudioImport()

  return (
    <SettingRow
      title={t.label}
      description={
        <span className={error ? styles.error : styles.note} role={error ? 'alert' : undefined}>
          {error ?? t.hint}
        </span>
      }
      control={
        <Button
          variant="secondary"
          aria-label={t.label}
          disabled={isImporting || isRecording}
          onClick={importAudio}
        >
          {isImporting ? t.importing : t.action}
        </Button>
      }
    />
  )
}

import Button from '@renderer/shared/components/primitives/ui/Button'
import { useLocale } from '@renderer/shared/provider/context/localeContext'

import useAudioImport from './model/useAudioImport'
import styles from './index.module.css'

/**
 * 앱 밖에서 녹음한 파일로 회의록을 만든다. 파일 선택·변환은 main이 한다
 * (references/architecture.md "녹음 파일 가져오기").
 */
export default function ImportAudioButton() {
  const { t: messages } = useLocale()
  const t = messages.recording.importer
  const { isImporting, error, importAudio } = useAudioImport()

  return (
    <div className={styles.container}>
      <Button variant="secondary" disabled={isImporting} onClick={importAudio}>
        {isImporting ? t.importing : t.label}
      </Button>
      <p className={styles.hint}>{t.hint}</p>
      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
    </div>
  )
}

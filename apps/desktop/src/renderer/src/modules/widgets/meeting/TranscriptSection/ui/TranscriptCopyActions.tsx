import type { TranscriptFormat } from '@meeting-stt/core/format'
import Button from '@renderer/shared/components/primitives/ui/Button'
import Icon from '@renderer/shared/components/primitives/ui/Icon'
import { useLocale } from '@renderer/shared/provider/context/localeContext'

import styles from './TranscriptCopyActions.module.css'

interface TranscriptCopyActionsProps {
  isCopyEnabled: boolean
  copiedKey: string | null
  onCopy: (params: { format: TranscriptFormat }) => void
}

/** 회의록 제목 줄 오른쪽의 전체 복사·마크다운 복사 */
export default function TranscriptCopyActions({
  isCopyEnabled,
  copiedKey,
  onCopy
}: TranscriptCopyActionsProps) {
  const { t } = useLocale()

  const copyLabel = ({ format, text }: { format: TranscriptFormat; text: string }) =>
    copiedKey === format ? t.transcript.actions.copied : text

  return (
    <div className={styles.actions}>
      <Button
        variant="secondary"
        size="sm"
        disabled={!isCopyEnabled}
        onClick={() => onCopy({ format: 'plain' })}
      >
        <Icon name="copy" size={14} />
        {copyLabel({ format: 'plain', text: t.transcript.actions.copyAll })}
      </Button>
      <Button
        variant="secondary"
        size="sm"
        disabled={!isCopyEnabled}
        onClick={() => onCopy({ format: 'markdown' })}
      >
        <Icon name="markdown" size={14} />
        {copyLabel({ format: 'markdown', text: t.transcript.actions.copyMarkdown })}
      </Button>
    </div>
  )
}

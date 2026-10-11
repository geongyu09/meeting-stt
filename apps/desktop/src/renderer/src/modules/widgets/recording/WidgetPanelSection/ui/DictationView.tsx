import type { DictationInsertMode, DictationPhase } from '@shared/ipc'
import Button from '@renderer/shared/components/primitives/ui/Button'
import Icon from '@renderer/shared/components/primitives/ui/Icon'
import LevelWaveform from '@renderer/shared/components/primitives/ui/LevelWaveform'
import { useLocale } from '@renderer/shared/provider/context/localeContext'
import { formatClock } from '@renderer/shared/utils/formatClock'

import styles from './DictationView.module.css'

const WAVEFORM_BAR_COUNT = 24

interface DictationViewProps {
  phase: DictationPhase
  elapsedSec: number
  level: number
  insertMode: DictationInsertMode
  lastInsertedText: string
  errorMessage?: string
  isBusy: boolean
  onStop: () => void
  onHide: () => void
}

/**
 * 받아쓰기 중인 위젯 패널. 상태·경과·레벨·마지막으로 넣은 조각·중지를 보여 준다. 새 창을 만들지 않고
 * 그래프 소유자인 패널이 보기만 바꾼다 (references/architecture.md "받아쓰기" > "패널·메뉴바·단축키·설정")
 */
export default function DictationView({
  phase,
  elapsedSec,
  level,
  insertMode,
  lastInsertedText,
  errorMessage,
  isBusy,
  onStop,
  onHide
}: DictationViewProps) {
  const { t: messages } = useLocale()
  const t = messages.dictation
  const isRecognizing = phase === 'recognizing'

  const renderFooter = () => {
    if (errorMessage) {
      return (
        <p className={styles.error} role="alert">
          {errorMessage}
        </p>
      )
    }
    // 권한이 없으면 글이 저절로 들어가지 않는다는 것을 매 조각마다 알려야 한다
    if (insertMode === 'clipboard') {
      return (
        <p className={styles.clipboardHint} role="status">
          {t.widget.clipboardHint}
        </p>
      )
    }

    return (
      <p className={styles.hint}>
        {isRecognizing ? t.widget.recognizingHint : t.widget.listeningHint}
      </p>
    )
  }

  return (
    <section className={styles.section} aria-label={t.widget.sectionLabel}>
      <header className={styles.header}>
        <span
          className={isRecognizing ? styles.recognizingDot : styles.listeningDot}
          aria-hidden="true"
        />
        <span className={styles.title}>
          {isRecognizing ? t.status.recognizing : t.status.listening}
        </span>
        <button
          className={styles.hideButton}
          type="button"
          aria-label={messages.recording.widget.hide}
          onClick={onHide}
        >
          <Icon name="close" size={14} />
        </button>
      </header>
      <div className={styles.clock}>
        <p className={styles.elapsed}>{formatClock({ sec: elapsedSec })}</p>
        <LevelWaveform level={level} barCount={WAVEFORM_BAR_COUNT} size="sm" />
      </div>
      <div className={styles.lastInserted}>
        <span className={styles.lastInsertedLabel}>{t.widget.lastInsertedLabel}</span>
        {/* 자리는 고정하고 내용만 바꾼다. 조각이 들어가기 전에는 비어 있다 */}
        <p className={styles.lastInsertedText} aria-live="polite">
          {lastInsertedText}
        </p>
      </div>
      <Button variant="secondary" className={styles.stopButton} onClick={onStop} disabled={isBusy}>
        <span className={styles.stopIcon} aria-hidden="true" />
        {t.widget.stop}
      </Button>
      {renderFooter()}
    </section>
  )
}

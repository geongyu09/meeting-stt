import { useEffect, useRef, useState } from 'react'
import { getSettingsApi } from '@renderer/shared/api/settings'
import Icon from '@renderer/shared/components/primitives/ui/Icon'
import { useLocale } from '@renderer/shared/provider/context/localeContext'
import { DEFAULT_SPEECH_LANG, loadSpeechVoices } from '@renderer/shared/utils/speechVoices'

import { speechTextOf } from '../utils/speechText'
import styles from './SpeakAnswerButton.module.css'

interface SpeakAnswerButtonProps {
  /** 답변의 마크다운 원문. 읽을 때 기호·코드 블록을 뺀다 */
  text: string
}

/**
 * 답변 읽어주기 (references/features/ui.md "답변 읽어주기"). `speechSynthesis`는 앱에 하나라
 * 다른 답변을 읽기 시작하면 이 버튼의 읽기는 `end`/`error`로 끝나 상태가 돌아온다.
 */
export default function SpeakAnswerButton({ text }: SpeakAnswerButtonProps) {
  const { t } = useLocale()
  const labels = t.assistant.chat
  const [isSpeaking, setIsSpeaking] = useState(false)
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null)

  useEffect(
    () => () => {
      if (utteranceRef.current) speechSynthesis.cancel()
    },
    []
  )

  const handleClick = async () => {
    if (utteranceRef.current) {
      utteranceRef.current = null
      setIsSpeaking(false)
      speechSynthesis.cancel()
      return
    }

    // 설정을 못 읽어도 기본 목소리로는 읽는다
    const speechVoice = await getSettingsApi().then(
      (settings) => settings.speechVoice,
      () => null
    )
    const voice = speechVoice
      ? (await loadSpeechVoices()).find((candidate) => candidate.voiceURI === speechVoice)
      : undefined
    const utterance = new SpeechSynthesisUtterance(speechTextOf(text))
    if (voice) utterance.voice = voice
    utterance.lang = voice?.lang ?? DEFAULT_SPEECH_LANG

    const handleDone = () => {
      if (utteranceRef.current !== utterance) return
      utteranceRef.current = null
      setIsSpeaking(false)
    }
    utterance.onend = handleDone
    utterance.onerror = handleDone

    speechSynthesis.cancel()
    utteranceRef.current = utterance
    setIsSpeaking(true)
    speechSynthesis.speak(utterance)
  }

  const label = isSpeaking ? labels.stopSpeaking : labels.speakAnswer

  return (
    <button
      type="button"
      className={styles.speak}
      aria-label={label}
      aria-pressed={isSpeaking}
      title={label}
      onClick={handleClick}
    >
      <Icon name={isSpeaking ? 'stop' : 'speaker'} size={14} />
    </button>
  )
}

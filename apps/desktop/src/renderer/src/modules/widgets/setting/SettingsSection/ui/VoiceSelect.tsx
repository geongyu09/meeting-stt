import { useEffect, useId, useState } from 'react'
import SettingRow from '@renderer/shared/components/primitives/layout/SettingRow'
import { useLocale } from '@renderer/shared/provider/context/localeContext'
import { loadSpeechVoices } from '@renderer/shared/utils/speechVoices'

import styles from './VoiceSelect.module.css'

/** select의 "기본 목소리" 값. macOS의 voiceURI는 빈 문자열일 수 없어 겹치지 않는다 */
const DEFAULT_OPTION_VALUE = ''

const isKorean = (voice: SpeechSynthesisVoice) => voice.lang.startsWith('ko')

/** 한국어 목소리 먼저, 그다음 언어·이름순 */
const compareVoices = (a: SpeechSynthesisVoice, b: SpeechSynthesisVoice) =>
  Number(isKorean(b)) - Number(isKorean(a)) ||
  a.lang.localeCompare(b.lang) ||
  a.name.localeCompare(b.name)

interface VoiceSelectProps {
  value: string | null
  onChange: (voiceURI: string | null) => void
}

/**
 * 답변 읽어주기 목소리 (references/features/ui.md "답변 읽어주기"). 고른 목소리가 지워졌으면 목록에 없어
 * 기본 목소리로 보이고, 읽을 때도 기본 목소리로 내려간다.
 */
export default function VoiceSelect({ value, onChange }: VoiceSelectProps) {
  const { t } = useLocale()
  const titleId = useId()
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([])

  useEffect(() => {
    let isActive = true
    loadSpeechVoices().then((loaded) => {
      if (isActive) setVoices(loaded.toSorted(compareVoices))
    })

    return () => {
      isActive = false
    }
  }, [])

  return (
    <SettingRow
      title={t.settings.speechVoice.title}
      titleId={titleId}
      description={t.settings.speechVoice.description}
      control={
        <select
          className={styles.select}
          aria-labelledby={titleId}
          value={value ?? DEFAULT_OPTION_VALUE}
          onChange={(event) => onChange(event.target.value || null)}
        >
          <option value={DEFAULT_OPTION_VALUE}>{t.settings.speechVoice.systemDefault}</option>
          {voices.map((voice) => (
            <option key={voice.voiceURI} value={voice.voiceURI}>
              {voice.name} ({voice.lang})
            </option>
          ))}
        </select>
      }
    />
  )
}

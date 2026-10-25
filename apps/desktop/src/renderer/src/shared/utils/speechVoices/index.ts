/** 목소리를 고르지 않았거나 고른 목소리가 지워졌을 때 시스템에 맡기는 언어. 답변은 대개 한국어다 */
export const DEFAULT_SPEECH_LANG = 'ko-KR'

/** `voiceschanged`가 오지 않는 환경(목소리가 하나도 없음)에서 무한히 기다리지 않게 하는 상한 */
const VOICES_WAIT_MS = 1000

/**
 * macOS에 설치된 읽어주기 목소리 목록. Chromium은 처음 부를 때 목록을 비동기로 채워 빈 배열을 주므로
 * 그때만 `voiceschanged`를 한 번 기다린다 (references/features/ui.md "답변 읽어주기").
 * @example
 * const voices = await loadSpeechVoices()
 */
export const loadSpeechVoices = () =>
  new Promise<SpeechSynthesisVoice[]>((resolve) => {
    const voices = speechSynthesis.getVoices()
    if (voices.length) {
      resolve(voices)
      return
    }

    const handleChange = () => {
      clearTimeout(timer)
      resolve(speechSynthesis.getVoices())
    }
    const timer = setTimeout(() => {
      speechSynthesis.removeEventListener('voiceschanged', handleChange)
      resolve(speechSynthesis.getVoices())
    }, VOICES_WAIT_MS)
    speechSynthesis.addEventListener('voiceschanged', handleChange, { once: true })
  })

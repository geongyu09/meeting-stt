import { useEffect, useState, type RefObject } from 'react'

interface UseAudioPlayerParams {
  audioRef: RefObject<HTMLAudioElement | null>
}

interface AudioPlayerState {
  isPlaying: boolean
  isLoadFailed: boolean
  currentTimeSec: number
  durationSec: number
}

const INITIAL_STATE: AudioPlayerState = {
  isPlaying: false,
  isLoadFailed: false,
  currentTimeSec: 0,
  durationSec: 0
}

/**
 * 숨긴 `<audio>`의 재생 상태를 커스텀 플레이어가 그릴 수 있게 이벤트로 구독한다
 * (references/architecture.md "녹음본 재생·내보내기·다시 인식"). 발화 시각 클릭(useAudioSeek)으로 바뀐 위치도 같은 이벤트로 들어온다.
 */
const useAudioPlayer = ({ audioRef }: UseAudioPlayerParams) => {
  const [state, setState] = useState<AudioPlayerState>(INITIAL_STATE)

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return

    const syncTime = () =>
      setState((prev) => ({
        ...prev,
        currentTimeSec: audio.currentTime,
        // 메타데이터를 읽기 전이나 스트림 길이를 모를 때 NaN·Infinity가 온다
        durationSec: Number.isFinite(audio.duration) ? audio.duration : prev.durationSec
      }))
    const handlePlay = () => setState((prev) => ({ ...prev, isPlaying: true }))
    const handlePause = () => setState((prev) => ({ ...prev, isPlaying: false }))
    const handleError = () =>
      setState((prev) => ({ ...prev, isPlaying: false, isLoadFailed: true }))

    audio.addEventListener('timeupdate', syncTime)
    audio.addEventListener('durationchange', syncTime)
    audio.addEventListener('seeked', syncTime)
    audio.addEventListener('play', handlePlay)
    audio.addEventListener('pause', handlePause)
    audio.addEventListener('ended', handlePause)
    audio.addEventListener('error', handleError)
    syncTime()

    return () => {
      audio.removeEventListener('timeupdate', syncTime)
      audio.removeEventListener('durationchange', syncTime)
      audio.removeEventListener('seeked', syncTime)
      audio.removeEventListener('play', handlePlay)
      audio.removeEventListener('pause', handlePause)
      audio.removeEventListener('ended', handlePause)
      audio.removeEventListener('error', handleError)
    }
  }, [audioRef])

  const toggle = () => {
    const audio = audioRef.current
    if (!audio) return

    // 버튼이 보여 주는 상태(play·pause 이벤트로 맞춘 값)를 기준으로 뒤집는다
    if (state.isPlaying) {
      audio.pause()
      return
    }
    // 불러오기 실패는 error 이벤트가 따로 알린다
    audio.play().catch(() => console.error('녹음을 재생하지 못했습니다'))
  }

  const seek = (sec: number) => {
    const audio = audioRef.current
    if (!audio) return

    audio.currentTime = sec
    // 슬라이더를 끄는 동안 timeupdate가 오기 전에도 손잡이가 따라오도록 바로 반영한다
    setState((prev) => ({ ...prev, currentTimeSec: sec }))
  }

  return { ...state, toggle, seek }
}

export default useAudioPlayer

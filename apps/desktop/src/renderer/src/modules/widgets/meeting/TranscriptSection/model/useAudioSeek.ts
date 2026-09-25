import { useRef } from 'react'

/**
 * 레일의 `<audio>` 하나를 발화 행이 함께 쓴다. 발화 시각을 누르면 그 지점으로 옮겨 재생한다
 * (references/architecture.md "녹음본 재생·내보내기·다시 인식").
 */
const useAudioSeek = () => {
  const audioRef = useRef<HTMLAudioElement>(null)

  const seekTo = (sec: number) => {
    const audio = audioRef.current
    if (!audio) return

    audio.currentTime = sec
    // 불러오기 실패는 <audio>의 error 이벤트로 패널이 따로 알린다
    audio.play().catch(() => console.error('녹음을 재생하지 못했습니다'))
  }

  return { audioRef, seekTo }
}

export default useAudioSeek

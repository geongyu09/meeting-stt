import { useEffect, useEffectEvent } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router'
import { acceleratorFromKeyInput, SETTINGS_SHORTCUT } from '@shared/shortcut'
import { onRecordingState } from '@renderer/shared/api/events'

import { PATHS } from './paths'

/**
 * 메인 창의 공통 레이아웃. 녹음이 어디서 정지됐든(위젯·메뉴바·단축키) 채팅으로 데려간다 —
 * 기록 카드가 대화에 생기고, 채팅은 `location.state.stoppedMeetingId`로 그 카드 위에 "녹음을 멈췄어요" 줄을 붙인다
 * (references/features/recording.md "채팅 창의 녹음"). 위젯 창은 이 레이아웃 밖에 있어 스스로 이동하지 않는다.
 */
export function MainWindowLayout() {
  const navigate = useNavigate()
  const { pathname } = useLocation()

  useEffect(
    () =>
      onRecordingState(({ stoppedMeetingId }) => {
        if (stoppedMeetingId) navigate(PATHS.assistant, { state: { stoppedMeetingId } })
      }),
    [navigate]
  )

  // ⌘,로 설정 (references/features/ui.md "설정 모달"). 하위 화면은 설정과 기록 한 칸을 나눠 쓰므로 replace
  const handleSettingsKey = useEffectEvent((event: KeyboardEvent) => {
    if (event.defaultPrevented || acceleratorFromKeyInput(event) !== SETTINGS_SHORTCUT) return
    event.preventDefault()
    if (pathname !== PATHS.settings) {
      navigate(PATHS.settings, { replace: pathname !== PATHS.assistant })
    }
  })
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => handleSettingsKey(event)
    window.addEventListener('keydown', handleKeyDown)

    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  return <Outlet />
}

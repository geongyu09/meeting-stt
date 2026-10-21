import { useEffect } from 'react'
import { Outlet, useNavigate } from 'react-router'
import { onRecordingState } from '@renderer/shared/api/events'

import { PATHS } from './paths'

/**
 * 메인 창의 공통 레이아웃. 녹음이 어디서 정지됐든(위젯·메뉴바·단축키) 채팅으로 데려간다 —
 * 기록 카드가 대화에 생기고, 채팅은 `location.state.stoppedMeetingId`로 그 카드 위에 "녹음을 멈췄어요" 줄을 붙인다
 * (references/features/recording.md "채팅 창의 녹음"). 위젯 창은 이 레이아웃 밖에 있어 스스로 이동하지 않는다.
 */
export function MainWindowLayout() {
  const navigate = useNavigate()

  useEffect(
    () =>
      onRecordingState(({ stoppedMeetingId }) => {
        if (stoppedMeetingId) navigate(PATHS.assistant, { state: { stoppedMeetingId } })
      }),
    [navigate]
  )

  return <Outlet />
}

import { useEffect } from 'react'
import { Outlet, useNavigate } from 'react-router'
import { onRecordingState } from '@renderer/shared/api/events'

import { meetingDetailPath } from './paths'

/**
 * 메인 창의 공통 레이아웃. 녹음이 어디서 정지됐든(위젯·메뉴바·단축키) 결과 화면으로 데려간다 —
 * 녹음을 끝낸 직후에 보고 싶은 것은 회의록이다 (references/architecture.md).
 * 위젯 창은 이 레이아웃 밖에 있어 스스로 이동하지 않는다.
 */
export function MainWindowLayout() {
  const navigate = useNavigate()

  useEffect(
    () =>
      onRecordingState(({ stoppedMeetingId }) => {
        if (stoppedMeetingId) navigate(meetingDetailPath({ meetingId: stoppedMeetingId }))
      }),
    [navigate]
  )

  return <Outlet />
}

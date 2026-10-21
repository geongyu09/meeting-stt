import { useEffect } from 'react'
import { Navigate } from 'react-router'
import { controlRecordingApi } from '@renderer/shared/api/recording'
import { PATHS } from '@renderer/shared/routes/paths'

/**
 * 녹음 화면은 없어졌다 — 녹음은 채팅 창 안에서 한다 (references/features/recording.md "채팅 창의 녹음").
 * shortcut: 옛 링크(`/record`)가 아직 남아 있을 수 있어 녹음을 시작하고 채팅으로 보낸다, 옛 페이지를 걷어낼 때 라우트와 함께 지운다
 */
export default function Record() {
  useEffect(() => {
    controlRecordingApi({ kind: 'start' }).catch(() =>
      console.error('녹음 시작 요청을 보내지 못했습니다')
    )
  }, [])

  return <Navigate to={PATHS.assistant} replace />
}

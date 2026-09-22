import { Navigate, Outlet } from 'react-router'
import useModelStatus from '@renderer/shared/hooks/domain/model/useModelStatus'

import { PATHS } from './paths'

/**
 * 필수 모델이 없으면 온보딩으로 보낸다 (references/distribution.md 2절).
 * 레이아웃이 처음 마운트될 때 한 번만 조회한다 — 모델은 온보딩 밖에서 사라지지 않는다.
 * 상태 조회 자체가 실패하면 막지 않는다. 파이프라인이 모델 부재를 한국어로 다시 알린다.
 */
export function RequireModels() {
  const { status, isLoading } = useModelStatus()

  if (isLoading && !status) return null
  if (status && !status.isReady) return <Navigate to={PATHS.onboarding} replace />

  return <Outlet />
}

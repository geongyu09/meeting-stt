import path from 'node:path'
import { app } from 'electron'

/**
 * 교정 중에만 쓰는 프롬프트·문법·출력 파일 자리. 잡이 끝나면 실패해도 지운다 —
 * 회의록과 용어 사전에서 다시 만들 수 있는 파생물이다 (references/architecture.md "회의록 교정").
 */
export const refineWorkDir = ({ meetingId }: { meetingId: string }) =>
  path.join(app.getPath('userData'), 'refine', meetingId)

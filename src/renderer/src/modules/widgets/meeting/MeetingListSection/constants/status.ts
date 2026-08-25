import type { MeetingStatus } from '@shared/types'
import type { BadgeTone } from '@renderer/shared/components/primitives/ui/Badge'

export const MEETING_STATUS_BADGE: Record<MeetingStatus, { label: string; tone: BadgeTone }> = {
  recording: { label: '녹음 중', tone: 'accent' },
  processing: { label: '회의록 만드는 중', tone: 'accent' },
  done: { label: '완료', tone: 'success' },
  error: { label: '오류', tone: 'danger' }
}

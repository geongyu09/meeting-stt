import type { GetMeetingRequest } from '@shared/ipc'

/**
 * @description 회의 목록을 최신순으로 불러옵니다.
 * @returns 회의 목록
 * @example
 * const meetings = await getMeetingsApi()
 */
export const getMeetingsApi = async () => window.api.meetings.list()

/**
 * @description 회의 하나의 상세(회의 정보 + 발화 + 화자)를 불러옵니다.
 * @param meetingId - 회의 ID
 * @returns 회의 상세. 없는 회의면 null
 * @example
 * const detail = await getMeetingApi({ meetingId })
 */
export const getMeetingApi = async ({ meetingId }: GetMeetingRequest) =>
  window.api.meetings.get({ meetingId })

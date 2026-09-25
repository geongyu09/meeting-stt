import type {
  DeleteMeetingRequest,
  ExportMeetingAudioRequest,
  GetMeetingRequest,
  RenameMeetingRequest,
  ReprocessMeetingRequest,
  SearchMeetingsRequest
} from '@shared/ipc'

// Electron은 main에서 던진 에러를 "Error invoking remote method '<채널>': Error: <원문>"으로 감싼다
const REMOTE_ERROR_PREFIX = /^Error invoking remote method '[^']+': (?:Error: )?/

// main이 던진 안내는 원문(현재 UI 언어)으로 쓴다. renderer 쪽 예외는 그대로 넘기고 언어별 안내 문구는 훅이 붙인다 —
// api 래퍼는 훅이 아니라 사전을 읽을 수 없다 (references/architecture.md "UI 언어")
const toUserError = (caught: unknown) => {
  if (!(caught instanceof Error)) return new Error(String(caught))
  if (!REMOTE_ERROR_PREFIX.test(caught.message)) return caught

  return new Error(caught.message.replace(REMOTE_ERROR_PREFIX, ''))
}

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

/**
 * @description 회의 제목을 바꿉니다.
 * @param meetingId - 회의 ID
 * @param title - 새 제목
 * @returns 갱신된 회의 상세
 * @example
 * const detail = await renameMeetingApi({ meetingId, title: '9월 스프린트 회고' })
 */
export const renameMeetingApi = async ({ meetingId, title }: RenameMeetingRequest) =>
  window.api.meetings.rename({ meetingId, title })

/**
 * @description 회의를 지웁니다. 발화·화자와 원본 녹음 파일도 함께 사라집니다.
 * @param meetingId - 회의 ID
 * @returns 없음
 * @example
 * await deleteMeetingApi({ meetingId })
 */
export const deleteMeetingApi = async ({ meetingId }: DeleteMeetingRequest) => {
  await window.api.meetings.delete({ meetingId })
}

/**
 * @description 회의 제목과 발화 텍스트에서 검색어를 찾습니다. 최신순으로 최대 50개를 돌려줍니다.
 * @param query - 검색어. 공백뿐이면 빈 결과
 * @returns 회의와, 발화로 걸렸으면 처음 걸린 발화 하나
 * @example
 * const results = await searchMeetingsApi({ query: '배포' })
 */
export const searchMeetingsApi = async ({ query }: SearchMeetingsRequest) =>
  window.api.meetings.search({ query })

/**
 * @description 남아 있는 원본 녹음으로 회의록을 다시 만듭니다. 화자 이름·직접 고친 내용·교정 결과는 새로 만들어지고 요약은 남습니다.
 * @param meetingId - 회의 ID
 * @param speakerCount - 화자 분리에 쓸 참석자 수. null이면 자동으로 나눕니다
 * @returns 처리 중으로 바뀐 회의 상세. 결과는 파이프라인 진행률 이벤트로 옵니다
 * @example
 * const detail = await reprocessMeetingApi({ meetingId, speakerCount: 4 })
 */
export const reprocessMeetingApi = async ({ meetingId, speakerCount }: ReprocessMeetingRequest) => {
  try {
    return await window.api.meetings.reprocess({ meetingId, speakerCount })
  } catch (caught) {
    throw toUserError(caught)
  }
}

/**
 * @description 원본 녹음을 사용자가 고른 위치에 WAV 파일로 저장합니다.
 * @param meetingId - 회의 ID
 * @returns 저장했으면 isSaved가 true. 저장 대화상자를 취소하면 false
 * @example
 * const { isSaved } = await exportMeetingAudioApi({ meetingId })
 */
export const exportMeetingAudioApi = async ({ meetingId }: ExportMeetingAudioRequest) => {
  try {
    return await window.api.meetings.exportAudio({ meetingId })
  } catch (caught) {
    throw toUserError(caught)
  }
}

/**
 * @description 앱 밖에서 녹음한 오디오·영상 파일을 골라 회의록을 만듭니다. 파일은 열기 대화상자로 고르고, 원본 파일은 바꾸지 않습니다.
 * @returns 만들어진 회의(처리 중). 대화상자를 취소하면 meeting이 null
 * @example
 * const { meeting } = await importMeetingAudioApi()
 */
export const importMeetingAudioApi = async () => {
  try {
    return await window.api.meetings.import()
  } catch (caught) {
    throw toUserError(caught)
  }
}

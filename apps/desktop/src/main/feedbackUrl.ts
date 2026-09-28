const FEEDBACK_ISSUE_URL = 'https://github.com/geongyu09/meeting-stt/issues/new'
// .github/ISSUE_TEMPLATE/의 파일 이름. 쿼리 키는 그 폼의 필드 id와 같아야 값이 채워진다
const FEEDBACK_TEMPLATE = 'feedback.yml'

interface BuildFeedbackIssueUrlParams {
  appVersion: string
  osVersion: string
  arch: string
}

/**
 * 앱 버전·macOS 버전·아키텍처만 채운 이슈 작성 URL. 회의 내용·로그·설정값은 넣지 않는다
 * (references/architecture.md "피드백 보내기")
 */
export const buildFeedbackIssueUrl = ({
  appVersion,
  osVersion,
  arch
}: BuildFeedbackIssueUrlParams) => {
  const url = new URL(FEEDBACK_ISSUE_URL)
  url.searchParams.set('template', FEEDBACK_TEMPLATE)
  url.searchParams.set('app-version', appVersion)
  url.searchParams.set('os', `macOS ${osVersion} (${arch})`)

  return url.toString()
}

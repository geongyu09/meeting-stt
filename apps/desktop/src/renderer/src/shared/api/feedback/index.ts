/**
 * @description 앱 버전·macOS 버전을 채운 GitHub 이슈 작성 화면을 기본 브라우저로 엽니다. 앱은 아무것도 전송하지 않습니다.
 * @returns 없음
 * @example
 * await openFeedbackApi()
 */
export const openFeedbackApi = async () => {
  await window.api.feedback.open()
}

import { describe, expect, it } from 'vitest'
import { buildFeedbackIssueUrl } from './feedbackUrl'

describe('buildFeedbackIssueUrl', () => {
  it('이슈 폼 템플릿과 버전·OS 필드를 채운 URL을 만든다', () => {
    const url = new URL(
      buildFeedbackIssueUrl({ appVersion: '0.2.5', osVersion: '15.5.0', arch: 'arm64' })
    )

    expect(url.origin + url.pathname).toBe('https://github.com/geongyu09/meeting-stt/issues/new')
    expect(url.searchParams.get('template')).toBe('feedback.yml')
    expect(url.searchParams.get('app-version')).toBe('0.2.5')
    expect(url.searchParams.get('os')).toBe('macOS 15.5.0 (arm64)')
  })

  it('버전·OS 외의 값은 넣지 않는다', () => {
    const url = new URL(
      buildFeedbackIssueUrl({ appVersion: '0.2.5', osVersion: '15.5.0', arch: 'arm64' })
    )

    expect([...url.searchParams.keys()]).toEqual(['template', 'app-version', 'os'])
  })
})

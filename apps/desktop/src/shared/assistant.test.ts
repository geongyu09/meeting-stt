import { describe, expect, it } from 'vitest'

import {
  MAX_DOCUMENT_BYTES,
  MAX_QUESTION_CHARS,
  readAssistantMessagePayload,
  readAssistantProviderPayload,
  readPermissionModePayload,
  readWorkspacePathPayload,
  readWorkspaceWritePayload,
  recordSummaryPathOf
} from './assistant'

describe('recordSummaryPathOf', () => {
  it('원문 이름 뒤에 " 요약"을 붙인다 — 상대 경로든 절대 경로든', () => {
    expect(recordSummaryPathOf('raw/recordings/2026-10-21-1430 배포 일정.md')).toBe(
      'raw/recordings/2026-10-21-1430 배포 일정 요약.md'
    )
    expect(recordSummaryPathOf('/Users/me/brain/raw/recordings/2026-10-21-1430-2.md')).toBe(
      '/Users/me/brain/raw/recordings/2026-10-21-1430-2 요약.md'
    )
  })

  it('이름 가운데의 .md는 건드리지 않는다', () => {
    expect(recordSummaryPathOf('raw/recordings/a.md 정리.md')).toBe(
      'raw/recordings/a.md 정리 요약.md'
    )
  })
})

describe('readAssistantMessagePayload', () => {
  it('공급자와 앞뒤 공백을 자른 질문을 돌려준다', () => {
    expect(readAssistantMessagePayload({ provider: 'claude-cli', text: '  요약해 줘\n' })).toEqual({
      provider: 'claude-cli',
      text: '요약해 줘'
    })
  })

  it('모르는 공급자는 거절한다', () => {
    expect(() => readAssistantMessagePayload({ provider: 'local', text: '안녕' })).toThrow(
      '알 수 없는 에이전트입니다'
    )
  })

  it('빈 질문과 문자열이 아닌 질문은 거절한다', () => {
    expect(() => readAssistantMessagePayload({ provider: 'claude-cli', text: '   ' })).toThrow(
      '질문이 비어 있습니다'
    )
    expect(() => readAssistantMessagePayload({ provider: 'claude-cli', text: 3 })).toThrow(
      '질문이 비어 있습니다'
    )
  })

  it('너무 긴 질문은 거절한다', () => {
    const text = '가'.repeat(MAX_QUESTION_CHARS + 1)
    expect(() => readAssistantMessagePayload({ provider: 'claude-cli', text })).toThrow(
      '질문이 너무 깁니다'
    )
  })
})

describe('readAssistantProviderPayload', () => {
  it('아는 에이전트만 돌려주고 나머지는 거절한다', () => {
    expect(readAssistantProviderPayload({ provider: 'codex-cli' })).toBe('codex-cli')
    expect(() => readAssistantProviderPayload({ provider: 'local' })).toThrow(
      '알 수 없는 에이전트입니다'
    )
    expect(() => readAssistantProviderPayload(null)).toThrow('알 수 없는 에이전트입니다')
  })
})

describe('readPermissionModePayload', () => {
  it('아는 권한 모드만 받는다', () => {
    expect(readPermissionModePayload({ permissionMode: 'bypassPermissions' })).toBe(
      'bypassPermissions'
    )
    expect(() => readPermissionModePayload({ permissionMode: 'dontAsk' })).toThrow(
      '알 수 없는 권한 모드입니다'
    )
    expect(() => readPermissionModePayload(null)).toThrow('알 수 없는 권한 모드입니다')
  })
})

describe('readWorkspacePathPayload', () => {
  it('비어 있지 않은 문자열 경로만 받는다', () => {
    expect(readWorkspacePathPayload({ path: 'notes/a.md' })).toBe('notes/a.md')
    expect(() => readWorkspacePathPayload({ path: '' })).toThrow('문서 경로가 올바르지 않습니다')
    expect(() => readWorkspacePathPayload({})).toThrow('문서 경로가 올바르지 않습니다')
  })
})

describe('readWorkspaceWritePayload', () => {
  it('경로와 본문을 돌려준다', () => {
    expect(readWorkspaceWritePayload({ path: 'a.md', content: '' })).toEqual({
      path: 'a.md',
      content: ''
    })
  })

  it('본문이 문자열이 아니면 거절한다', () => {
    expect(() => readWorkspaceWritePayload({ path: 'a.md', content: null })).toThrow(
      '문서 내용이 올바르지 않습니다'
    )
  })

  it('바이트 수로 크기를 잰다 — 한글은 글자당 3바이트다', () => {
    const content = '가'.repeat(Math.floor(MAX_DOCUMENT_BYTES / 3) + 1)
    expect(() => readWorkspaceWritePayload({ path: 'a.md', content })).toThrow('문서가 너무 커서')
  })
})

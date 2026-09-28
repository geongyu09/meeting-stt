import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({ shell: { openExternal: vi.fn() } }))

import { isAllowedExternalUrl } from './externalUrl'

describe('isAllowedExternalUrl', () => {
  it('https 링크는 허용한다', () => {
    expect(isAllowedExternalUrl('https://github.com/geongyu09/meeting-stt/issues/new')).toBe(true)
  })

  it('https가 아닌 스킴은 거부한다', () => {
    expect(isAllowedExternalUrl('http://example.com')).toBe(false)
    expect(isAllowedExternalUrl('file:///etc/passwd')).toBe(false)
    expect(isAllowedExternalUrl('javascript:alert(1)')).toBe(false)
    expect(isAllowedExternalUrl('smb://server/share')).toBe(false)
  })

  it('URL로 읽히지 않는 문자열은 거부한다', () => {
    expect(isAllowedExternalUrl('not a url')).toBe(false)
  })
})

// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { DictationStateEvent } from '@shared/ipc'

vi.mock('@renderer/shared/api/settings', () => ({
  getSettingsApi: vi.fn(),
  updateSettingsApi: vi.fn()
}))
vi.mock('@renderer/shared/api/dictation', () => ({
  getDictationStateApi: vi.fn(),
  controlDictationApi: vi.fn(),
  openAccessibilitySettingsApi: vi.fn()
}))
vi.mock('@renderer/shared/api/events', () => ({
  onDictationState: vi.fn(() => () => {}),
  onSettingsChanged: vi.fn(() => () => {})
}))

import { getDictationStateApi, openAccessibilitySettingsApi } from '@renderer/shared/api/dictation'
import { getSettingsApi } from '@renderer/shared/api/settings'
import DictationSection from './index'

const SETTINGS = { dictationShortcut: 'Alt+Command+D' }
const PASTE_STATE: DictationStateEvent = {
  phase: 'idle',
  startedAt: null,
  level: 0,
  insertMode: 'paste',
  lastInsertedText: '',
  hasLastResult: false
}

beforeEach(() => {
  vi.mocked(getSettingsApi).mockResolvedValue(SETTINGS as never)
  vi.mocked(getDictationStateApi).mockResolvedValue(PASTE_STATE)
  vi.mocked(openAccessibilitySettingsApi).mockResolvedValue(undefined)
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('DictationSection', () => {
  it('현재 단축키를 넣은 사용법을 보여 준다', async () => {
    render(<DictationSection />)

    expect((await screen.findByText(/⌥⌘D를 누른 뒤 말하세요/)).textContent).toContain(
      '다시 ⌥⌘D를 누르면 끝납니다'
    )
  })

  it('접근성 권한이 있으면 허용됨으로 보이고 시스템 설정 버튼을 숨긴다', async () => {
    render(<DictationSection />)

    expect((await screen.findByRole('status')).textContent).toContain('허용됨')
    expect(screen.queryByRole('button', { name: '시스템 설정 열기' })).toBeNull()
  })

  it('접근성 권한이 없으면 ⌘V 안내와 시스템 설정 버튼을 보여 주고, 누르면 설정을 연다', async () => {
    const user = userEvent.setup()
    vi.mocked(getDictationStateApi).mockResolvedValue({ ...PASTE_STATE, insertMode: 'clipboard' })
    render(<DictationSection />)

    expect((await screen.findByRole('status')).textContent).toContain('⌘V로 붙여 넣어야 합니다')

    await user.click(screen.getByRole('button', { name: '시스템 설정 열기' }))

    expect(openAccessibilitySettingsApi).toHaveBeenCalled()
  })

  it('창이 포커스를 받으면 권한 상태를 다시 읽는다', async () => {
    vi.mocked(getDictationStateApi).mockResolvedValueOnce({
      ...PASTE_STATE,
      insertMode: 'clipboard'
    })
    render(<DictationSection />)
    expect((await screen.findByRole('status')).textContent).toContain('허용되지 않음')

    vi.mocked(getDictationStateApi).mockResolvedValue(PASTE_STATE)
    await act(async () => {
      fireEvent(window, new Event('focus'))
    })

    expect(screen.getByRole('status').textContent).toContain('허용됨')
  })
})

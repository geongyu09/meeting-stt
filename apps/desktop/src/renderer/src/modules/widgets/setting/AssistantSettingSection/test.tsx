// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { AssistantStatus } from '@shared/types'

vi.mock('@renderer/shared/api/assistant', () => ({
  getAssistantStatusApi: vi.fn(),
  chooseAssistantFolderApi: vi.fn(),
  setAssistantPermissionModeApi: vi.fn()
}))

import {
  chooseAssistantFolderApi,
  getAssistantStatusApi,
  setAssistantPermissionModeApi
} from '@renderer/shared/api/assistant'
import AssistantSettingSection from './index'

const statusOf = (overrides: Partial<AssistantStatus> = {}): AssistantStatus => ({
  folder: '/Users/me/notes',
  folderProblem: null,
  isGitRepo: true,
  permissionMode: 'acceptEdits',
  ...overrides
})

beforeEach(() => {
  vi.mocked(getAssistantStatusApi).mockResolvedValue(statusOf())
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('AssistantSettingSection', () => {
  it('폴더를 고르지 않았으면 그렇게 알리고, 고르면 경로를 보여 준다', async () => {
    vi.mocked(getAssistantStatusApi).mockResolvedValue(statusOf({ folder: null }))
    vi.mocked(chooseAssistantFolderApi).mockResolvedValue(statusOf({ folder: '/Users/me/vault' }))
    render(<AssistantSettingSection />)

    expect(await screen.findByText('아직 고르지 않았습니다')).toBeTruthy()
    await userEvent.click(screen.getByRole('button', { name: '폴더 고르기' }))

    expect(await screen.findByText('/Users/me/vault')).toBeTruthy()
  })

  it('git 저장소가 아니거나 폴더가 사라졌으면 안내한다', async () => {
    vi.mocked(getAssistantStatusApi).mockResolvedValue(statusOf({ isGitRepo: false }))
    const { unmount } = render(<AssistantSettingSection />)

    expect((await screen.findByRole('status')).textContent).toContain('git 저장소가 아니라')
    unmount()

    vi.mocked(getAssistantStatusApi).mockResolvedValue(statusOf({ folderProblem: 'missing' }))
    render(<AssistantSettingSection />)

    expect((await screen.findByRole('status')).textContent).toContain('작업 폴더가 없습니다')
  })

  it('모든 권한 허용을 켜면 bypassPermissions로 저장하고 경고를 보여 준다', async () => {
    vi.mocked(setAssistantPermissionModeApi).mockResolvedValue(
      statusOf({ permissionMode: 'bypassPermissions' })
    )
    render(<AssistantSettingSection />)

    const toggle = await screen.findByRole('switch', { name: '모든 권한 허용' })
    expect(toggle.getAttribute('aria-checked')).toBe('false')
    await userEvent.click(toggle)

    expect(setAssistantPermissionModeApi).toHaveBeenCalledWith({
      permissionMode: 'bypassPermissions'
    })
    expect((await screen.findByRole('status')).textContent).toContain('묻지 않고 실행합니다')
    expect(toggle.getAttribute('aria-checked')).toBe('true')
  })

  it('폴더 바꾸기에 실패하면 오류를 알린다', async () => {
    vi.mocked(chooseAssistantFolderApi).mockRejectedValue(new Error('busy'))
    render(<AssistantSettingSection />)

    await userEvent.click(await screen.findByRole('button', { name: '폴더 고르기' }))

    expect((await screen.findByRole('alert')).textContent).toBe('작업 폴더를 바꾸지 못했습니다')
  })
})

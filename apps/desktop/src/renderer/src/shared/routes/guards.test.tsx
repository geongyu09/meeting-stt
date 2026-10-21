// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router'
import type { AssistantStatus } from '@shared/types'

vi.mock('@renderer/shared/api/assistant', () => ({
  getAssistantStatusApi: vi.fn(),
  getAssistantFolderApi: vi.fn(),
  chooseAssistantFolderApi: vi.fn()
}))

import {
  chooseAssistantFolderApi,
  getAssistantFolderApi,
  getAssistantStatusApi
} from '@renderer/shared/api/assistant'
import { RequireFolder } from './guards'

const statusOf = (folder: string | null): AssistantStatus => ({
  folder,
  folderProblem: null,
  isGitRepo: true,
  permissionMode: 'acceptEdits',
  provider: 'claude-cli'
})

const renderGuard = async (status: AssistantStatus) => {
  vi.mocked(getAssistantFolderApi).mockResolvedValue({ folder: status.folder })
  vi.mocked(getAssistantStatusApi).mockResolvedValue(status)
  const router = createMemoryRouter([
    { element: <RequireFolder />, children: [{ path: '/', element: <p>채팅</p> }] }
  ])

  await act(async () => {
    render(<RouterProvider router={router} />)
  })
}

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('RequireFolder', () => {
  it('작업 폴더가 없으면 채팅 대신 첫 화면만 보이고, 폴더를 고르면 같은 자리에 채팅이 선다', async () => {
    const user = userEvent.setup()
    vi.mocked(chooseAssistantFolderApi).mockResolvedValue(statusOf('/Users/me/notes'))
    await renderGuard(statusOf(null))

    expect(screen.getByRole('heading', { name: '작업 폴더를 골라 주세요' })).toBeTruthy()
    expect(screen.queryByText('채팅')).toBeNull()

    await user.click(screen.getByRole('button', { name: '폴더 고르기' }))

    expect(screen.getByText('채팅')).toBeTruthy()
    expect(screen.queryByRole('heading')).toBeNull()
  })

  it('고르기에 실패하거나 취소하면 첫 화면에 머문다', async () => {
    const user = userEvent.setup()
    vi.mocked(chooseAssistantFolderApi).mockRejectedValueOnce(new Error('busy'))
    await renderGuard(statusOf(null))

    await user.click(screen.getByRole('button', { name: '폴더 고르기' }))

    expect(screen.getByRole('alert').textContent).toBe('작업 폴더를 고르지 못했어요')
    expect(screen.queryByText('채팅')).toBeNull()

    // 대화상자를 취소하면 main이 폴더 없는 상태를 그대로 돌려준다
    vi.mocked(chooseAssistantFolderApi).mockResolvedValueOnce(statusOf(null))
    await user.click(screen.getByRole('button', { name: '폴더 고르기' }))

    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.queryByText('채팅')).toBeNull()
  })

  it('전체 상태가 늦어도 폴더만 먼저 읽어 첫 화면을 바로 그린다', async () => {
    // 전체 상태는 CLI 탐색을 기다려 첫 호출이 2초쯤 걸린다 — 끝나지 않는 프로미스로 흉내 낸다
    vi.mocked(getAssistantStatusApi).mockReturnValue(new Promise(() => {}))
    vi.mocked(getAssistantFolderApi).mockResolvedValue({ folder: null })
    const router = createMemoryRouter([
      { element: <RequireFolder />, children: [{ path: '/', element: <p>채팅</p> }] }
    ])

    await act(async () => {
      render(<RouterProvider router={router} />)
    })

    expect(screen.getByRole('heading', { name: '작업 폴더를 골라 주세요' })).toBeTruthy()
  })

  it('작업 폴더가 있으면 바로 채팅이다', async () => {
    await renderGuard(statusOf('/Users/me/notes'))

    expect(screen.getByText('채팅')).toBeTruthy()
    expect(screen.queryByRole('heading')).toBeNull()
  })
})

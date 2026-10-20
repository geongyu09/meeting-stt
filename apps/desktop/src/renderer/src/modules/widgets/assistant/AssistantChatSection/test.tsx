// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import type { AssistantChatState, AssistantStatus, LlmStatus } from '@shared/types'

vi.mock('@renderer/shared/api/assistant', () => ({
  getAssistantStatusApi: vi.fn(),
  getAssistantStateApi: vi.fn(),
  sendAssistantMessageApi: vi.fn(),
  cancelAssistantApi: vi.fn(),
  resetAssistantChatApi: vi.fn()
}))
vi.mock('@renderer/shared/api/llm', () => ({ getLlmStatusApi: vi.fn() }))
vi.mock('@renderer/shared/api/events', () => ({ onAssistantState: vi.fn(() => () => {}) }))

import {
  cancelAssistantApi,
  getAssistantStateApi,
  getAssistantStatusApi,
  sendAssistantMessageApi
} from '@renderer/shared/api/assistant'
import { onAssistantState } from '@renderer/shared/api/events'
import { getLlmStatusApi } from '@renderer/shared/api/llm'
import AssistantChatSection from './index'

const EMPTY_CHAT: AssistantChatState = {
  provider: null,
  sessionId: null,
  turns: [],
  isRunning: false
}

const statusOf = (overrides: Partial<AssistantStatus> = {}): AssistantStatus => ({
  folder: '/Users/me/notes',
  folderProblem: null,
  isGitRepo: true,
  permissionMode: 'acceptEdits',
  ...overrides
})

const llmStatusOf = (claudeCliPath: string | null, codexCliPath: string | null = null) =>
  ({ claudeCliPath, codexCliPath }) as LlmStatus

const answeringChat: AssistantChatState = {
  provider: 'claude-cli',
  sessionId: 'session-1',
  isRunning: true,
  turns: [
    {
      id: 'q',
      role: 'user',
      text: '템플릿 만들어 줘',
      tools: [],
      changedFiles: [],
      error: null
    },
    {
      id: 'a',
      role: 'assistant',
      text: '만들었습니다.',
      tools: [{ id: 'toolu_1', name: 'Write', target: '/Users/me/notes/notes/template.md' }],
      changedFiles: ['notes/template.md', '/tmp/outside.md'],
      error: null
    }
  ]
}

const pushState = (state: AssistantChatState) => {
  const listener = vi.mocked(onAssistantState).mock.calls.at(-1)?.[0]
  act(() => listener?.(state))
}

const renderChat = (onOpenFile = vi.fn()) => {
  render(
    <MemoryRouter>
      <AssistantChatSection onOpenFile={onOpenFile} />
    </MemoryRouter>
  )

  return { onOpenFile }
}

beforeEach(() => {
  vi.mocked(getAssistantStatusApi).mockResolvedValue(statusOf())
  vi.mocked(getAssistantStateApi).mockResolvedValue(EMPTY_CHAT)
  vi.mocked(getLlmStatusApi).mockResolvedValue(llmStatusOf('/Users/me/.local/bin/claude'))
  vi.mocked(sendAssistantMessageApi).mockResolvedValue(undefined)
  vi.mocked(cancelAssistantApi).mockResolvedValue(undefined)
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('AssistantChatSection', () => {
  it('작업 폴더가 없으면 설정 링크와 함께 안내하고 입력을 막는다', async () => {
    vi.mocked(getAssistantStatusApi).mockResolvedValue(statusOf({ folder: null }))
    renderChat()

    expect((await screen.findByRole('status')).textContent).toContain('작업 폴더를 먼저 고르세요')
    expect(screen.getByRole('link', { name: '설정 열기' })).toBeTruthy()
    expect((screen.getByRole('textbox', { name: '질문' }) as HTMLTextAreaElement).disabled).toBe(
      true
    )
  })

  it('고른 에이전트의 CLI가 없으면 설치를 안내한다', async () => {
    vi.mocked(getLlmStatusApi).mockResolvedValue(llmStatusOf(null))
    renderChat()

    expect((await screen.findByRole('status')).textContent).toContain('Claude Code CLI를 찾지')
  })

  it('Codex만 설치돼 있으면 Codex를 기본으로 골라 보낸다', async () => {
    vi.mocked(getLlmStatusApi).mockResolvedValue(llmStatusOf(null, '/opt/homebrew/bin/codex'))
    renderChat()
    const input = screen.getByRole('textbox', { name: '질문' })
    await vi.waitFor(() => expect((input as HTMLTextAreaElement).disabled).toBe(false))

    expect((screen.getByRole('combobox', { name: '에이전트' }) as HTMLSelectElement).value).toBe(
      'codex-cli'
    )
    await userEvent.type(input, '요약해 줘{Enter}')

    expect(sendAssistantMessageApi).toHaveBeenCalledWith({
      provider: 'codex-cli',
      text: '요약해 줘'
    })
  })

  it('설치되지 않은 에이전트로 바꾸면 그 CLI의 설치를 안내하고 입력을 막는다', async () => {
    renderChat()
    const input = screen.getByRole('textbox', { name: '질문' })
    await vi.waitFor(() => expect((input as HTMLTextAreaElement).disabled).toBe(false))

    await userEvent.selectOptions(screen.getByRole('combobox', { name: '에이전트' }), 'codex-cli')

    expect(screen.getByRole('status').textContent).toContain('Codex CLI를 찾지')
    expect((input as HTMLTextAreaElement).disabled).toBe(true)
  })

  it('Enter로 질문을 보내고 입력란을 비운다', async () => {
    renderChat()
    const input = screen.getByRole('textbox', { name: '질문' })
    await vi.waitFor(() => expect((input as HTMLTextAreaElement).disabled).toBe(false))

    await userEvent.type(input, '회의 메모 템플릿 만들어 줘{Enter}')

    expect(sendAssistantMessageApi).toHaveBeenCalledWith({
      provider: 'claude-cli',
      text: '회의 메모 템플릿 만들어 줘'
    })
    expect((input as HTMLTextAreaElement).value).toBe('')
  })

  it('한글 조합 중의 Enter와 Shift+Enter는 보내지 않는다', async () => {
    renderChat()
    const input = screen.getByRole('textbox', { name: '질문' })
    await vi.waitFor(() => expect((input as HTMLTextAreaElement).disabled).toBe(false))
    fireEvent.change(input, { target: { value: '안녕' } })

    fireEvent.keyDown(input, { key: 'Enter', isComposing: true })
    fireEvent.keyDown(input, { key: 'Enter', shiftKey: true })

    expect(sendAssistantMessageApi).not.toHaveBeenCalled()
  })

  it('답변·도구·바뀐 파일을 그리고, 폴더 안의 마크다운만 에디터로 연다', async () => {
    const { onOpenFile } = renderChat()
    await screen.findByText(/작업 폴더의 문서에 대해 묻거나/)

    pushState(answeringChat)

    expect(screen.getByText('만들었습니다.')).toBeTruthy()
    expect(screen.getByText('Write')).toBeTruthy()
    await userEvent.click(screen.getByRole('button', { name: 'notes/template.md' }))
    expect(onOpenFile).toHaveBeenCalledWith('notes/template.md')
    expect(screen.queryByRole('button', { name: '/tmp/outside.md' })).toBeNull()
    expect(screen.getByText('/tmp/outside.md')).toBeTruthy()
  })

  it('실행 중에는 중지 버튼이 에이전트를 끝내고, 대화 중에는 에이전트를 바꿀 수 없다', async () => {
    renderChat()
    await screen.findByText(/작업 폴더의 문서에 대해 묻거나/)
    pushState(answeringChat)

    await userEvent.click(screen.getByRole('button', { name: '중지' }))

    expect(cancelAssistantApi).toHaveBeenCalled()
    expect((screen.getByRole('combobox', { name: '에이전트' }) as HTMLSelectElement).disabled).toBe(
      true
    )
  })

  it('턴 오류를 보여 준다', async () => {
    renderChat()
    await screen.findByText(/작업 폴더의 문서에 대해 묻거나/)

    pushState({
      ...answeringChat,
      isRunning: false,
      turns: answeringChat.turns.with(1, { ...answeringChat.turns[1], error: '중지했습니다' })
    })

    expect(screen.getByRole('alert').textContent).toBe('중지했습니다')
  })
})

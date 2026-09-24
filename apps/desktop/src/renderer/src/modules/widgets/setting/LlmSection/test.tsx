// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { LlmStatus } from '@shared/types'

vi.mock('@renderer/shared/api/llm', () => ({
  getLlmStatusApi: vi.fn(),
  setLlmProviderApi: vi.fn(),
  setClaudeApiKeyApi: vi.fn(),
  checkLlmApi: vi.fn()
}))

import {
  checkLlmApi,
  getLlmStatusApi,
  setClaudeApiKeyApi,
  setLlmProviderApi
} from '@renderer/shared/api/llm'
import LlmSection from './index'

const statusOf = (overrides: Partial<LlmStatus> = {}): LlmStatus => ({
  provider: 'local',
  isLocalModelReady: true,
  hasClaudeApiKey: false,
  claudeApiKeyTail: null,
  claudeCliPath: null,
  claudeCliVersion: null,
  ...overrides
})

const renderSection = async (status: LlmStatus) => {
  vi.mocked(getLlmStatusApi).mockResolvedValue(status)

  await act(async () => {
    render(<LlmSection localModelSlot={<p>로컬 모델 파일 행</p>} />)
  })
}

const findRadio = (name: RegExp) => screen.getByRole('radio', { name })

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('LlmSection', () => {
  it('기본은 로컬 모델이고 회의록 전송 여부를 공급자마다 설명한다', async () => {
    await renderSection(statusOf())

    expect(findRadio(/로컬 모델/).hasAttribute('checked')).toBe(true)
    expect(screen.getByText(/기기 밖으로 나가지 않습니다/)).toBeTruthy()
    expect(screen.getAllByText(/Anthropic 서버로 전송/)).toHaveLength(2)
    expect(screen.queryByRole('button', { name: '연결 확인' })).toBeNull()
  })

  it('로컬을 골랐을 때만 모델 파일 다운로드 행을 끼운다', async () => {
    await renderSection(statusOf())
    expect(screen.getByText('로컬 모델 파일 행')).toBeTruthy()

    cleanup()
    await renderSection(statusOf({ provider: 'claude-api' }))
    expect(screen.queryByText('로컬 모델 파일 행')).toBeNull()
  })

  it('Claude API를 고르면 저장하고 키 입력란을 보여 준다', async () => {
    const user = userEvent.setup()
    vi.mocked(setLlmProviderApi).mockResolvedValue(statusOf({ provider: 'claude-api' }))
    await renderSection(statusOf())

    await user.click(findRadio(/Claude API/))

    expect(setLlmProviderApi).toHaveBeenCalledWith({ provider: 'claude-api' })
    expect(screen.getByLabelText('Claude API 키')).toBeTruthy()
    expect(screen.getByText(/발급한 키를 붙여 넣으세요/)).toBeTruthy()
    expect(screen.getByRole('button', { name: '연결 확인' })).toBeTruthy()
  })

  it('키를 저장하면 입력란을 비우고 마지막 네 자만 보여 준다', async () => {
    const user = userEvent.setup()
    vi.mocked(setClaudeApiKeyApi).mockResolvedValue(
      statusOf({ provider: 'claude-api', hasClaudeApiKey: true, claudeApiKeyTail: 'wxyz' })
    )
    await renderSection(statusOf({ provider: 'claude-api' }))

    const input = screen.getByLabelText('Claude API 키') as HTMLInputElement
    await user.type(input, 'sk-ant-api03-wxyz')
    await user.click(screen.getByRole('button', { name: '저장' }))

    expect(setClaudeApiKeyApi).toHaveBeenCalledWith({ apiKey: 'sk-ant-api03-wxyz' })
    expect(input.value).toBe('')
    expect(input.getAttribute('type')).toBe('password')
    expect(screen.getByText(/…wxyz/)).toBeTruthy()
    expect(screen.getByRole('status').textContent).toContain('API 키를 저장했습니다')
  })

  it('저장된 키가 있으면 지울 수 있다', async () => {
    const user = userEvent.setup()
    vi.mocked(setClaudeApiKeyApi).mockResolvedValue(statusOf({ provider: 'claude-api' }))
    await renderSection(
      statusOf({ provider: 'claude-api', hasClaudeApiKey: true, claudeApiKeyTail: 'wxyz' })
    )

    await user.click(screen.getByRole('button', { name: '키 삭제' }))

    expect(setClaudeApiKeyApi).toHaveBeenCalledWith({ apiKey: null })
    expect(screen.queryByRole('button', { name: '키 삭제' })).toBeNull()
  })

  it('Claude Code를 골랐는데 명령을 못 찾으면 설치 안내를 보여 준다', async () => {
    await renderSection(statusOf({ provider: 'claude-cli' }))

    expect(screen.getByRole('alert').textContent).toContain('claude 명령을 찾을 수 없습니다')
  })

  it('Claude Code 명령을 찾았으면 경로와 버전을 보여 준다', async () => {
    await renderSection(
      statusOf({
        provider: 'claude-cli',
        claudeCliPath: '/Users/me/.local/bin/claude',
        claudeCliVersion: '2.1.281 (Claude Code)'
      })
    )

    expect(screen.getByText('/Users/me/.local/bin/claude')).toBeTruthy()
    expect(screen.getByText(/2\.1\.281/)).toBeTruthy()
  })

  it('연결 확인 결과를 보여 주고 실패하면 안내한다', async () => {
    const user = userEvent.setup()
    vi.mocked(checkLlmApi).mockResolvedValueOnce({
      message: 'Claude Code에 연결했습니다 (응답: 확인)'
    })
    vi.mocked(checkLlmApi).mockRejectedValueOnce(new Error('Not logged in · Please run /login'))
    await renderSection(
      statusOf({ provider: 'claude-cli', claudeCliPath: '/usr/local/bin/claude' })
    )

    await user.click(screen.getByRole('button', { name: '연결 확인' }))
    expect(screen.getByRole('status').textContent).toContain('Claude Code에 연결했습니다')

    await user.click(screen.getByRole('button', { name: '연결 확인' }))
    expect(screen.getByRole('alert').textContent).toContain('Not logged in')
  })

  it('공급자 저장에 실패하면 안내를 보여 준다', async () => {
    const user = userEvent.setup()
    vi.mocked(setLlmProviderApi).mockRejectedValue(new Error('알 수 없는 LLM 공급자입니다'))
    await renderSection(statusOf())

    await user.click(findRadio(/Claude Code/))

    expect(screen.getByRole('alert').textContent).toContain('알 수 없는 LLM 공급자입니다')
    expect(findRadio(/로컬 모델/).hasAttribute('checked')).toBe(true)
  })
})

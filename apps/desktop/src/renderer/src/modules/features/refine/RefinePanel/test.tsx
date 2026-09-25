// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import type { RefineProgressEvent } from '@shared/ipc'
import type { GlossarySettings, LlmStatus, RefinePair, RefineResult } from '@shared/types'

vi.mock('@renderer/shared/api/refine', () => ({ runRefineApi: vi.fn() }))
vi.mock('@renderer/shared/api/llm', () => ({ getLlmStatusApi: vi.fn() }))
vi.mock('@renderer/shared/api/glossary', () => ({ getGlossaryApi: vi.fn() }))
vi.mock('@renderer/shared/api/events', () => ({ onRefineProgress: vi.fn(() => () => {}) }))

import { onRefineProgress } from '@renderer/shared/api/events'
import { getGlossaryApi } from '@renderer/shared/api/glossary'
import { getLlmStatusApi } from '@renderer/shared/api/llm'
import { runRefineApi } from '@renderer/shared/api/refine'
import RefinePanel from './index'

const MEETING_ID = 'meeting-1'
const REFINED_AT = 1_758_700_000_000

const llmStatusOf = (overrides: Partial<LlmStatus> = {}): LlmStatus => ({
  provider: 'local',
  isLocalModelReady: true,
  apiKeys: {
    anthropic: { isSaved: false, tail: null },
    openai: { isSaved: false, tail: null }
  },
  openaiModel: 'gpt-6-sol',
  claudeCliPath: null,
  claudeCliVersion: null,
  ...overrides
})

const glossaryOf = (terms: string[]): GlossarySettings => ({ teamDescription: '', terms })

const pairOf = (utteranceId: string, from: string, to: string): RefinePair => ({
  utteranceId,
  from,
  to,
  similarity: 0.8
})

const resultOf = (appliedPairs: RefinePair[]): RefineResult => ({
  refinedAt: REFINED_AT,
  appliedPairs
})

interface RenderPanelParams {
  refineResult?: RefineResult | null
  globalTerms?: string[]
  llmStatus?: LlmStatus
}

const renderPanel = async ({
  refineResult = null,
  globalTerms = ['GitHub = 깃허브'],
  llmStatus = llmStatusOf()
}: RenderPanelParams = {}) => {
  vi.mocked(getLlmStatusApi).mockResolvedValue(llmStatus)
  vi.mocked(getGlossaryApi).mockResolvedValue(glossaryOf(globalTerms))

  await act(async () => {
    render(
      <MemoryRouter>
        <RefinePanel meetingId={MEETING_ID} refineResult={refineResult} />
      </MemoryRouter>
    )
  })
}

/** main이 보내는 교정 진행 이벤트를 흉내 낸다 */
const emitRefineProgress = async (event: RefineProgressEvent) => {
  const listener = vi.mocked(onRefineProgress).mock.calls.at(-1)?.[0]

  await act(async () => {
    listener?.(event)
  })
}

const rerunButton = () => screen.getByRole('button', { name: '다시 교정' })

beforeEach(() => {
  vi.mocked(runRefineApi).mockResolvedValue(undefined)
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('RefinePanel', () => {
  it('아직 교정하지 않은 회의는 안내와 함께 다시 교정 버튼을 보여 준다', async () => {
    await renderPanel()

    expect(screen.getByText('아직 교정하지 않은 회의입니다')).toBeTruthy()
    expect(rerunButton().hasAttribute('disabled')).toBe(false)
    expect(screen.queryByRole('list', { name: '고친 용어' })).toBeNull()
  })

  it('전역 용어가 없으면 버튼을 막고 설정 링크로 자동 교정 조건을 안내한다', async () => {
    await renderPanel({ globalTerms: [] })

    expect(rerunButton().hasAttribute('disabled')).toBe(true)
    expect(screen.getByText(/회의록이 만들어질 때 자동으로 교정합니다/)).toBeTruthy()
    expect(
      screen.getByRole('link', { name: '설정에서 전역 용어를 저장' }).getAttribute('href')
    ).toBe('/settings')
  })

  it('LLM이 준비되지 않았으면 버튼을 막고 안내를 보여 준다', async () => {
    await renderPanel({ llmStatus: llmStatusOf({ isLocalModelReady: false }) })

    expect(rerunButton().hasAttribute('disabled')).toBe(true)
    expect(screen.getByText(/로컬 요약 모델 파일이 설치되어 있지 않습니다/)).toBeTruthy()
    expect(screen.getByRole('link', { name: '설정에서 준비하기' })).toBeTruthy()
  })

  it('고친 쌍을 같은 쌍끼리 묶어 몇 곳인지 보여 준다', async () => {
    await renderPanel({
      refineResult: resultOf([
        pairOf('u1', '기터브', 'GitHub'),
        pairOf('u2', '카볼', 'tarball'),
        pairOf('u5', '기터브', 'GitHub')
      ])
    })

    const list = screen.getByRole('list', { name: '고친 용어' })
    expect(list.querySelectorAll('li')).toHaveLength(2)
    expect(screen.getByText('2곳')).toBeTruthy()
    expect(screen.getByText('2가지 고침')).toBeTruthy()
    expect(screen.getByText(/자동으로 고쳤습니다/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: /수락/ })).toBeNull()
  })

  it('교정했는데 고친 곳이 없으면 찾지 못했다고 알린다', async () => {
    await renderPanel({ refineResult: resultOf([]) })

    expect(screen.getByText('고칠 곳을 찾지 못했습니다')).toBeTruthy()
  })

  it('버튼을 누르면 다시 교정을 요청하고 진행 상태를 보여 준다', async () => {
    await renderPanel()

    await userEvent.click(rerunButton())

    expect(vi.mocked(runRefineApi)).toHaveBeenCalledWith({ meetingId: MEETING_ID })
    expect(screen.getByRole('progressbar', { name: '교정 진행률' })).toBeTruthy()
    expect(screen.getByText(/한글 읽기를 정하는 중/)).toBeTruthy()
  })

  it('자동 교정의 진행 이벤트도 버튼 없이 진행률로 보여 준다', async () => {
    await renderPanel()

    await emitRefineProgress({ meetingId: MEETING_ID, stage: 'verify', percent: 55 })

    expect(screen.getByText(/판정하는 중/)).toBeTruthy()
    expect(screen.getByText('교정 중 55%')).toBeTruthy()
    expect(screen.queryByRole('button', { name: '다시 교정' })).toBeNull()
  })

  it('다른 회의의 진행 이벤트는 무시한다', async () => {
    await renderPanel()

    await emitRefineProgress({ meetingId: 'meeting-2', stage: 'verify', percent: 55 })

    expect(screen.queryByRole('progressbar')).toBeNull()
  })

  it('실패하면 한국어 안내를 보여 주고 다시 시도할 수 있다', async () => {
    await renderPanel()
    await userEvent.click(rerunButton())

    await emitRefineProgress({
      meetingId: MEETING_ID,
      stage: 'error',
      percent: 0,
      errorMessage: '전역 용어 사전이 비어 있습니다'
    })

    expect(screen.getByText('전역 용어 사전이 비어 있습니다')).toBeTruthy()
    expect(rerunButton().hasAttribute('disabled')).toBe(false)
  })
})

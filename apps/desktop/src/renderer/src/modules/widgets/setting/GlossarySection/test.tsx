// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('@renderer/shared/api/glossary', () => ({
  getGlossaryApi: vi.fn(),
  updateGlossaryApi: vi.fn(),
  draftGlossaryApi: vi.fn()
}))

import { draftGlossaryApi, getGlossaryApi, updateGlossaryApi } from '@renderer/shared/api/glossary'
import GlossarySection from './index'

const TEAM_LABEL = /팀 소개/
const TERMS_LABEL = /용어 목록/
const DRAFT_BUTTON = { name: '용어 초안 만들기' }
const SAVE_BUTTON = { name: '저장' }

const SAVED = { teamDescription: '프론트엔드 개발팀', terms: ['GitHub = 깃허브', '모노레포'] }

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

const termsBox = async () => (await screen.findByLabelText(TERMS_LABEL)) as HTMLTextAreaElement

describe('GlossarySection', () => {
  it('저장된 팀 소개와 용어를 보여준다', async () => {
    vi.mocked(getGlossaryApi).mockResolvedValue(SAVED)
    render(<GlossarySection />)

    expect((await termsBox()).value).toBe('GitHub = 깃허브\n모노레포')
    expect((screen.getByLabelText(TEAM_LABEL) as HTMLTextAreaElement).value).toBe(
      '프론트엔드 개발팀'
    )
    expect((screen.getByRole('button', SAVE_BUTTON) as HTMLButtonElement).disabled).toBe(true)
  })

  it('초안의 새 용어만 목록 뒤에 덧붙이고 저장하지 않는다', async () => {
    vi.mocked(getGlossaryApi).mockResolvedValue(SAVED)
    vi.mocked(draftGlossaryApi).mockResolvedValue({
      terms: ['GitHub = 기티허브', 'React = 리액트', 'JWT = 제이더블유티']
    })
    render(<GlossarySection />)
    await termsBox()

    await userEvent.click(screen.getByRole('button', DRAFT_BUTTON))

    expect(await screen.findByText(/새 용어 2개를 덧붙였습니다/)).toBeTruthy()
    expect((await termsBox()).value).toBe(
      'GitHub = 깃허브\n모노레포\nReact = 리액트\nJWT = 제이더블유티'
    )
    expect(draftGlossaryApi).toHaveBeenCalledWith({ teamDescription: '프론트엔드 개발팀' })
    expect(updateGlossaryApi).not.toHaveBeenCalled()
    expect(screen.getByText('저장하지 않은 변경이 있습니다')).toBeTruthy()
  })

  it('고친 목록을 저장하고 정리된 결과를 반영한다', async () => {
    vi.mocked(getGlossaryApi).mockResolvedValue(SAVED)
    vi.mocked(updateGlossaryApi).mockResolvedValue({
      teamDescription: '프론트엔드 개발팀',
      terms: ['GitHub = 깃허브', '모노레포', 'pnpm = 피엔피엠']
    })
    render(<GlossarySection />)
    const box = await termsBox()

    await userEvent.type(box, '\npnpm = 피엔피엠\n')
    await userEvent.click(screen.getByRole('button', SAVE_BUTTON))

    expect(await screen.findByText('용어 3개를 저장했습니다')).toBeTruthy()
    expect(updateGlossaryApi).toHaveBeenCalledWith({
      teamDescription: '프론트엔드 개발팀',
      terms: ['GitHub = 깃허브', '모노레포', 'pnpm = 피엔피엠', '']
    })
    expect(box.value).toBe('GitHub = 깃허브\n모노레포\npnpm = 피엔피엠')
  })

  it('팀 소개가 비어 있으면 초안을 만들 수 없다', async () => {
    vi.mocked(getGlossaryApi).mockResolvedValue({ teamDescription: '', terms: [] })
    render(<GlossarySection />)
    await termsBox()

    expect((screen.getByRole('button', DRAFT_BUTTON) as HTMLButtonElement).disabled).toBe(true)
  })

  it('초안이 실패하면 main의 안내 문구를 보여주고 목록은 그대로 둔다', async () => {
    vi.mocked(getGlossaryApi).mockResolvedValue(SAVED)
    vi.mocked(draftGlossaryApi).mockRejectedValue(
      new Error('용어 초안을 만들려면 요약 모델을 먼저 내려받아 주세요')
    )
    render(<GlossarySection />)
    await termsBox()

    await userEvent.click(screen.getByRole('button', DRAFT_BUTTON))

    expect((await screen.findByRole('alert')).textContent).toMatch(/요약 모델을 먼저 내려받아/)
    expect((await termsBox()).value).toBe('GitHub = 깃허브\n모노레포')
  })

  it('불러오기에 실패하면 안내한다', async () => {
    vi.mocked(getGlossaryApi).mockRejectedValue(new Error(''))
    render(<GlossarySection />)

    expect((await screen.findByRole('alert')).textContent).toBe('용어 사전을 불러오지 못했습니다')
  })
})

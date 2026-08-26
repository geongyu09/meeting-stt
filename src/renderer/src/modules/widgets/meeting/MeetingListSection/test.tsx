// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import type { Meeting } from '@shared/types'

vi.mock('@renderer/shared/api/meetings', () => ({ getMeetingsApi: vi.fn() }))
vi.mock('@renderer/shared/api/events', () => ({ onPipelineProgress: vi.fn(() => () => {}) }))

import { getMeetingsApi } from '@renderer/shared/api/meetings'
import MeetingListSection from './index'

const meetingOf = (overrides: Partial<Meeting> = {}): Meeting => ({
  id: 'meeting-1',
  title: '2026-08-26 회의',
  createdAt: new Date(2026, 7, 26, 15, 12).getTime(),
  durationSec: 125,
  status: 'done',
  ...overrides
})

const renderSection = () =>
  render(
    <MemoryRouter>
      <MeetingListSection />
    </MemoryRouter>
  )

afterEach(() => {
  cleanup()
  vi.mocked(getMeetingsApi).mockReset()
})

describe('MeetingListSection', () => {
  it('회의가 하나도 없으면 녹음을 권하는 안내를 보여준다', async () => {
    vi.mocked(getMeetingsApi).mockResolvedValue([])
    renderSection()

    expect(await screen.findByText(/아직 녹음한 회의가 없습니다/)).toBeTruthy()
  })

  it('회의의 제목·시각·길이·상태를 보여준다', async () => {
    vi.mocked(getMeetingsApi).mockResolvedValue([meetingOf()])
    renderSection()

    expect(await screen.findByText('2026-08-26 회의')).toBeTruthy()
    expect(screen.getByText(/2026년 8월 26일 15:12 · 2분 5초/)).toBeTruthy()
    expect(screen.getByText('완료')).toBeTruthy()
  })

  it('처리 중인 회의는 상태와 진행률을 함께 표시한다', async () => {
    vi.mocked(getMeetingsApi).mockResolvedValue([meetingOf({ status: 'processing' })])
    renderSection()

    expect(await screen.findByText('회의록 만드는 중')).toBeTruthy()
    expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('0')
  })

  it('완료된 회의에는 진행률을 보여주지 않는다', async () => {
    vi.mocked(getMeetingsApi).mockResolvedValue([meetingOf()])
    renderSection()

    expect(await screen.findByText('완료')).toBeTruthy()
    expect(screen.queryByRole('progressbar')).toBeNull()
  })

  it('실패한 회의는 오류 메시지를 함께 보여준다', async () => {
    vi.mocked(getMeetingsApi).mockResolvedValue([
      meetingOf({ status: 'error', errorMessage: '모델이 준비되지 않았습니다' })
    ])
    renderSection()

    expect(await screen.findByText('모델이 준비되지 않았습니다')).toBeTruthy()
  })

  it('목록을 불러오지 못하면 오류와 다시 시도 버튼을 보여준다', async () => {
    vi.mocked(getMeetingsApi).mockRejectedValue(new Error('회의 목록을 불러오지 못했습니다'))
    renderSection()

    expect(await screen.findByText('회의 목록을 불러오지 못했습니다')).toBeTruthy()
    expect(screen.getByRole('button', { name: '다시 시도' })).toBeTruthy()
  })

  it('회의를 클릭하면 상세 화면으로 갈 수 있는 링크를 건다', async () => {
    vi.mocked(getMeetingsApi).mockResolvedValue([meetingOf({ id: 'abc' })])
    renderSection()

    const link = await screen.findByRole('link')
    expect(link.getAttribute('href')).toBe('/meetings/abc')
  })
})

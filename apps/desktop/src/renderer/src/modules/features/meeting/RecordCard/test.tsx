// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { DEFAULT_SUMMARY_TEMPLATE } from '@shared/summaryTemplate'
import type { PipelineProgressEvent } from '@shared/ipc'
import type { LlmStatus, Meeting, MeetingDetail } from '@shared/types'

vi.mock('@renderer/shared/api/meetings', () => ({
  getMeetingApi: vi.fn(),
  renameMeetingApi: vi.fn(),
  deleteMeetingApi: vi.fn(),
  reprocessMeetingApi: vi.fn()
}))
vi.mock('@renderer/shared/api/speakers', () => ({
  mergeSpeakersApi: vi.fn(),
  renameSpeakerApi: vi.fn()
}))
vi.mock('@renderer/shared/api/utterances', () => ({
  reassignUtteranceApi: vi.fn(),
  revertUtteranceRefineApi: vi.fn(),
  updateUtteranceTextApi: vi.fn()
}))
vi.mock('@renderer/shared/api/summary', () => ({ createSummaryApi: vi.fn() }))
vi.mock('@renderer/shared/api/summaryTemplate', () => ({ getSummaryTemplatesApi: vi.fn() }))
vi.mock('@renderer/shared/api/llm', () => ({ getLlmStatusApi: vi.fn() }))
vi.mock('@renderer/shared/api/clipboard', () => ({ writeClipboardTextApi: vi.fn() }))
vi.mock('@renderer/shared/api/events', () => ({
  onPipelineProgress: vi.fn(),
  onRefineProgress: vi.fn(() => () => {}),
  onSummaryProgress: vi.fn(() => () => {}),
  onMeetingsChanged: vi.fn(() => () => {})
}))

import { writeClipboardTextApi } from '@renderer/shared/api/clipboard'
import { onPipelineProgress } from '@renderer/shared/api/events'
import { getLlmStatusApi } from '@renderer/shared/api/llm'
import { deleteMeetingApi, getMeetingApi, reprocessMeetingApi } from '@renderer/shared/api/meetings'
import { createSummaryApi } from '@renderer/shared/api/summary'
import { getSummaryTemplatesApi } from '@renderer/shared/api/summaryTemplate'
import RecordCard from './index'

const MEETING_ID = 'meeting-1'
const CREATED_AT = new Date(2026, 9, 21, 14, 0).getTime()

const DONE_MEETING: Meeting = {
  id: MEETING_ID,
  title: '주간 제품 회의',
  createdAt: CREATED_AT,
  durationSec: 48 * 60,
  status: 'done',
  summary: '결정\n- 화면에 보이는 이름만 Gyeot으로 바꾼다',
  speakerCount: 2,
  hasAudio: true
}

const detailOf = (meeting: Meeting): MeetingDetail => ({
  meeting,
  utterances: [
    {
      id: 'u1',
      meetingId: MEETING_ID,
      ord: 0,
      speakerLabel: 'SPEAKER_00',
      startSec: 12,
      endSec: 20,
      text: '이번 주는 앱 이름부터 정리할게요.',
      originalText: null
    },
    {
      id: 'u2',
      meetingId: MEETING_ID,
      ord: 1,
      speakerLabel: 'SPEAKER_01',
      startSec: 41,
      endSec: 50,
      text: '그게 맞는 것 같아요.',
      originalText: null
    }
  ],
  speakers: [
    { meetingId: MEETING_ID, label: 'SPEAKER_00', displayName: '진행자' },
    { meetingId: MEETING_ID, label: 'SPEAKER_01', displayName: null }
  ],
  refineResult: {
    refinedAt: CREATED_AT,
    appliedPairs: [
      { utteranceId: 'u1', from: '기옷', to: 'Gyeot', similarity: 0.9 },
      { utteranceId: 'u2', from: '클로드', to: 'Claude', similarity: 0.9 }
    ]
  },
  note: ''
})

const READY_LLM = { provider: 'claude-cli', claudeCliPath: '/usr/local/bin/claude' } as LlmStatus

let pushProgress: (event: PipelineProgressEvent) => void = () => {}

const renderCard = () =>
  render(
    <MemoryRouter>
      <RecordCard meetingId={MEETING_ID} />
    </MemoryRouter>
  )

beforeEach(() => {
  vi.mocked(onPipelineProgress).mockImplementation((listener) => {
    pushProgress = listener

    return () => {}
  })
  vi.mocked(getMeetingApi).mockResolvedValue(detailOf(DONE_MEETING))
  vi.mocked(getLlmStatusApi).mockResolvedValue(READY_LLM)
  vi.mocked(getSummaryTemplatesApi).mockResolvedValue([
    DEFAULT_SUMMARY_TEMPLATE,
    { id: 'decisions', name: '결정만', blocks: [], isBuiltIn: false }
  ])
  vi.mocked(writeClipboardTextApi).mockResolvedValue(undefined)
  vi.mocked(createSummaryApi).mockResolvedValue(undefined)
  vi.mocked(deleteMeetingApi).mockResolvedValue(undefined)
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('RecordCard', () => {
  it('끝난 기록은 제목·메타·요약·화자·교정 수와 전체 기록 보기 링크를 보여 준다', async () => {
    renderCard()
    const card = await screen.findByRole('article', { name: '기록 주간 제품 회의' })

    expect(card.textContent).toContain('10월 21일 오후 2:00 · 48분 · 화자 2명')
    expect(await screen.findByText('요약 · Claude Code')).toBeTruthy()
    expect(card.textContent).toContain('화면에 보이는 이름만 Gyeot으로 바꾼다')
    expect(card.textContent).toContain('진행자')
    expect(card.textContent).toContain('화자 2')
    expect(card.textContent).toContain('용어 2곳 교정됨')
    expect(screen.getByRole('link', { name: '전체 기록 보기' }).getAttribute('href')).toBe(
      '/meetings/meeting-1'
    )
  })

  it('기록 복사는 화자 이름이 붙은 전체 평문을 클립보드에 쓰고, 요약 복사는 요약만 쓴다', async () => {
    renderCard()
    await screen.findByRole('article')

    await userEvent.click(screen.getByRole('button', { name: '기록 복사' }))
    const [{ text }] = vi.mocked(writeClipboardTextApi).mock.calls[0]
    expect(text).toContain('진행자')
    expect(text).toContain('이번 주는 앱 이름부터 정리할게요.')
    expect(screen.getByRole('button', { name: '복사했습니다' })).toBeTruthy()

    await userEvent.click(screen.getByRole('button', { name: '요약 복사' }))
    expect(writeClipboardTextApi).toHaveBeenLastCalledWith({ text: DONE_MEETING.summary })
  })

  it('템플릿을 고르고 다시 요약을 누르면 그 템플릿으로 요약을 요청한다', async () => {
    renderCard()
    await screen.findByRole('article')

    await userEvent.selectOptions(await screen.findByRole('combobox'), 'decisions')
    await userEvent.click(screen.getByRole('button', { name: '다시 요약' }))

    expect(createSummaryApi).toHaveBeenCalledWith({
      meetingId: MEETING_ID,
      templateId: 'decisions'
    })
  })

  it('더보기 → 회의 삭제 → 삭제의 2단계를 거쳐야 지운다', async () => {
    renderCard()
    await screen.findByRole('article')

    await userEvent.click(screen.getByRole('button', { name: '더보기' }))
    await userEvent.click(screen.getByRole('button', { name: '회의 삭제' }))
    expect(deleteMeetingApi).not.toHaveBeenCalled()
    expect(screen.getByText(/되돌릴 수 없습니다/)).toBeTruthy()

    await userEvent.click(screen.getByRole('button', { name: '삭제' }))

    expect(deleteMeetingApi).toHaveBeenCalledWith({ meetingId: MEETING_ID })
  })

  it('처리 중이면 단계·퍼센트·진행 막대를 보여 준다', async () => {
    vi.mocked(getMeetingApi).mockResolvedValue(
      detailOf({ ...DONE_MEETING, status: 'processing', summary: undefined })
    )
    renderCard()
    await screen.findByRole('article')
    expect(screen.getByText('차례를 기다리는 중')).toBeTruthy()

    act(() => pushProgress({ meetingId: MEETING_ID, stage: 'diarize', percent: 50 }))

    expect(screen.getByText('화자 구분 중')).toBeTruthy()
    expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('30')
    expect(screen.queryByRole('link', { name: '전체 기록 보기' })).toBeNull()
  })

  it('실패한 기록은 오류와 다시 시도를 보여 주고, 저장된 참석자 수로 다시 돌린다', async () => {
    vi.mocked(getMeetingApi).mockResolvedValue(
      detailOf({ ...DONE_MEETING, status: 'error', errorMessage: '음성 인식에 실패했습니다' })
    )
    vi.mocked(reprocessMeetingApi).mockResolvedValue(
      detailOf({ ...DONE_MEETING, status: 'processing' })
    )
    renderCard()
    await screen.findByRole('article')
    expect(screen.getByRole('alert').textContent).toBe('음성 인식에 실패했습니다')

    await userEvent.click(screen.getByRole('button', { name: '다시 시도' }))

    expect(reprocessMeetingApi).toHaveBeenCalledWith({ meetingId: MEETING_ID, speakerCount: 2 })
  })

  it('녹음 중인 회의는 그리지 않는다', async () => {
    vi.mocked(getMeetingApi).mockResolvedValue(detailOf({ ...DONE_MEETING, status: 'recording' }))
    const { container } = renderCard()
    await vi.waitFor(() => expect(getMeetingApi).toHaveBeenCalled())

    expect(container.innerHTML).toBe('')
  })
})

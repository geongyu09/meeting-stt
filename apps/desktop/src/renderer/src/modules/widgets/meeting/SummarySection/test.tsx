// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import type { ModelStatusResponse, SummaryProgressEvent } from '@shared/ipc'
import type { Meeting, MeetingDetail, Utterance } from '@shared/types'

vi.mock('@renderer/shared/api/meetings', () => ({
  getMeetingApi: vi.fn(),
  renameMeetingApi: vi.fn(),
  deleteMeetingApi: vi.fn()
}))
vi.mock('@renderer/shared/api/utterances', () => ({
  updateUtteranceTextApi: vi.fn(),
  reassignUtteranceApi: vi.fn()
}))
vi.mock('@renderer/shared/api/speakers', () => ({
  renameSpeakerApi: vi.fn(),
  mergeSpeakersApi: vi.fn()
}))
vi.mock('@renderer/shared/api/clipboard', () => ({ writeClipboardTextApi: vi.fn() }))
vi.mock('@renderer/shared/api/summary', () => ({ createSummaryApi: vi.fn() }))
vi.mock('@renderer/shared/api/models', () => ({
  getModelStatusApi: vi.fn(),
  downloadModelsApi: vi.fn(),
  downloadSummaryModelApi: vi.fn()
}))
vi.mock('@renderer/shared/api/events', () => ({
  onPipelineProgress: vi.fn(() => () => {}),
  onSummaryProgress: vi.fn(() => () => {}),
  onModelDownloadProgress: vi.fn(() => () => {})
}))

import { writeClipboardTextApi } from '@renderer/shared/api/clipboard'
import { onSummaryProgress } from '@renderer/shared/api/events'
import { getMeetingApi } from '@renderer/shared/api/meetings'
import { getModelStatusApi } from '@renderer/shared/api/models'
import { createSummaryApi } from '@renderer/shared/api/summary'
import SummarySection from './index'

const MEETING_ID = 'meeting-1'

const meetingOf = (overrides: Partial<Meeting> = {}): Meeting => ({
  id: MEETING_ID,
  title: '2026-08-26 회의',
  createdAt: new Date(2026, 7, 26, 15, 12).getTime(),
  durationSec: 125,
  status: 'done',
  ...overrides
})

const utteranceOf = (): Utterance => ({
  id: 'utterance-1',
  meetingId: MEETING_ID,
  ord: 0,
  speakerLabel: 'speaker_00',
  startSec: 0,
  endSec: 3,
  text: '회의를 시작하겠습니다'
})

const detailOf = (overrides: Partial<MeetingDetail> = {}): MeetingDetail => ({
  meeting: meetingOf(),
  utterances: [utteranceOf()],
  speakers: [{ meetingId: MEETING_ID, label: 'speaker_00', displayName: null }],
  ...overrides
})

const modelStatusOf = (overrides: Partial<ModelStatusResponse> = {}): ModelStatusResponse => ({
  isReady: true,
  isSummaryReady: true,
  selectedWhisperModelId: 'turbo-q5',
  recommendedWhisperModelId: 'turbo-q5',
  whisperOptions: [],
  items: [],
  ...overrides
})

interface RenderSectionParams {
  detail: MeetingDetail | null
  modelStatus?: ModelStatusResponse
}

const renderSection = async (
  detail: MeetingDetail | null,
  { modelStatus = modelStatusOf() }: Partial<RenderSectionParams> = {}
) => {
  vi.mocked(getMeetingApi).mockResolvedValue(detail)
  vi.mocked(getModelStatusApi).mockResolvedValue(modelStatus)

  await act(async () => {
    render(
      <MemoryRouter>
        <SummarySection meetingId={MEETING_ID} />
      </MemoryRouter>
    )
  })
}

/** main이 보내는 요약 진행 이벤트를 흉내 낸다 */
const emitSummaryProgress = async (event: SummaryProgressEvent) => {
  const listener = vi.mocked(onSummaryProgress).mock.calls.at(-1)?.[0]

  await act(async () => {
    listener?.(event)
  })
}

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('SummarySection', () => {
  it('요약이 없으면 안내와 함께 요약 만들기 버튼을 보여 준다', async () => {
    await renderSection(detailOf())

    expect(screen.getByText(/아직 요약이 없습니다/)).toBeTruthy()
    expect(screen.getByRole('button', { name: '요약 만들기' })).toBeTruthy()
  })

  it('저장된 요약이 있으면 본문과 다시 요약 버튼을 보여 준다', async () => {
    await renderSection(detailOf({ meeting: meetingOf({ summary: '## 핵심 요약\n- 배포 연기' }) }))

    expect(screen.getByText(/배포 연기/)).toBeTruthy()
    expect(screen.getByRole('button', { name: '다시 요약' })).toBeTruthy()
  })

  it('회의록이 아직 없으면(처리 중) 아무것도 그리지 않는다', async () => {
    await renderSection(detailOf({ meeting: meetingOf({ status: 'processing' }) }))

    expect(screen.queryByRole('button', { name: '요약 만들기' })).toBeNull()
  })

  it('요약 모델이 없으면 버튼을 막고 설정으로 가는 링크를 보여 준다', async () => {
    await renderSection(detailOf(), { modelStatus: modelStatusOf({ isSummaryReady: false }) })

    expect(screen.getByRole('button', { name: '요약 만들기' }).hasAttribute('disabled')).toBe(true)
    expect(screen.getByText(/요약 모델이 설치되어 있지 않습니다/)).toBeTruthy()
    expect(screen.getByRole('link', { name: '설정에서 요약 모델 받기' }).getAttribute('href')).toBe(
      '/settings'
    )
  })

  it('발화가 하나도 없으면 요약 버튼을 막는다', async () => {
    await renderSection(detailOf({ utterances: [] }))

    expect(screen.getByRole('button', { name: '요약 만들기' }).hasAttribute('disabled')).toBe(true)
    expect(screen.getByText('요약할 발화가 없습니다')).toBeTruthy()
  })

  it('버튼을 누르면 요약을 요청하고 진행 상태를 보여 준다', async () => {
    await renderSection(detailOf())

    await userEvent.click(screen.getByRole('button', { name: '요약 만들기' }))

    expect(vi.mocked(createSummaryApi)).toHaveBeenCalledWith({ meetingId: MEETING_ID })
    expect(screen.getByRole('progressbar', { name: '요약 진행률' })).toBeTruthy()
  })

  it('구간을 합치는 단계로 넘어가면 안내 문구가 바뀐다', async () => {
    await renderSection(detailOf())
    await userEvent.click(screen.getByRole('button', { name: '요약 만들기' }))

    await emitSummaryProgress({ meetingId: MEETING_ID, stage: 'reduce', percent: 80 })

    expect(screen.getByText(/하나로 정리하는 중/)).toBeTruthy()
  })

  it('완료 이벤트의 요약 본문을 그대로 보여 준다', async () => {
    await renderSection(detailOf())
    await userEvent.click(screen.getByRole('button', { name: '요약 만들기' }))

    await emitSummaryProgress({
      meetingId: MEETING_ID,
      stage: 'done',
      percent: 100,
      summary: '## 핵심 요약\n- 결제 이슈로 배포 연기'
    })

    expect(screen.getByText(/결제 이슈로 배포 연기/)).toBeTruthy()
    expect(screen.queryByRole('progressbar')).toBeNull()
  })

  it('다른 회의의 진행 이벤트는 무시한다', async () => {
    await renderSection(detailOf())
    await userEvent.click(screen.getByRole('button', { name: '요약 만들기' }))

    await emitSummaryProgress({
      meetingId: 'meeting-2',
      stage: 'done',
      percent: 100,
      summary: '남의 회의 요약'
    })

    expect(screen.queryByText('남의 회의 요약')).toBeNull()
    expect(screen.getByRole('progressbar', { name: '요약 진행률' })).toBeTruthy()
  })

  it('실패하면 한국어 안내를 보여 주고 다시 시도할 수 있다', async () => {
    await renderSection(detailOf())
    await userEvent.click(screen.getByRole('button', { name: '요약 만들기' }))

    await emitSummaryProgress({
      meetingId: MEETING_ID,
      stage: 'error',
      percent: 0,
      errorMessage: '요약 모델이 준비되지 않았습니다'
    })

    expect(screen.getByText('요약 모델이 준비되지 않았습니다')).toBeTruthy()
    expect(screen.getByRole('button', { name: '요약 만들기' }).hasAttribute('disabled')).toBe(false)
  })

  it('요약을 클립보드에 복사한다', async () => {
    await renderSection(detailOf({ meeting: meetingOf({ summary: '## 핵심 요약\n- 배포 연기' }) }))

    await userEvent.click(screen.getByRole('button', { name: '요약 복사' }))

    expect(vi.mocked(writeClipboardTextApi)).toHaveBeenCalledWith({
      text: '## 핵심 요약\n- 배포 연기'
    })
    expect(screen.getByRole('button', { name: '복사됨' })).toBeTruthy()
  })
})

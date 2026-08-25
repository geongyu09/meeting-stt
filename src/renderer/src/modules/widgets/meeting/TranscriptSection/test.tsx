// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen } from '@testing-library/react'
import type { PipelineProgressEvent } from '@shared/ipc'
import type { Meeting, MeetingDetail, Speaker, Utterance } from '@shared/types'

vi.mock('@renderer/shared/api/meetings', () => ({ getMeetingApi: vi.fn() }))
vi.mock('@renderer/shared/api/events', () => ({ onPipelineProgress: vi.fn(() => () => {}) }))

import { onPipelineProgress } from '@renderer/shared/api/events'
import { getMeetingApi } from '@renderer/shared/api/meetings'
import TranscriptSection from './index'

const MEETING_ID = 'meeting-1'

const meetingOf = (overrides: Partial<Meeting> = {}): Meeting => ({
  id: MEETING_ID,
  title: '2026-08-26 회의',
  createdAt: new Date(2026, 7, 26, 15, 12).getTime(),
  durationSec: 125,
  status: 'done',
  ...overrides
})

const utteranceOf = (overrides: Partial<Utterance> = {}): Utterance => ({
  id: 'utterance-1',
  meetingId: MEETING_ID,
  ord: 0,
  speakerLabel: 'speaker_00',
  startSec: 0,
  endSec: 3,
  text: '회의를 시작하겠습니다',
  ...overrides
})

const speakerOf = (overrides: Partial<Speaker> = {}): Speaker => ({
  meetingId: MEETING_ID,
  label: 'speaker_00',
  displayName: null,
  ...overrides
})

const detailOf = (overrides: Partial<MeetingDetail> = {}): MeetingDetail => ({
  meeting: meetingOf(),
  utterances: [utteranceOf()],
  speakers: [speakerOf()],
  ...overrides
})

afterEach(() => {
  cleanup()
  vi.mocked(getMeetingApi).mockReset()
  vi.mocked(onPipelineProgress).mockReset()
  vi.mocked(onPipelineProgress).mockReturnValue(() => {})
})

describe('TranscriptSection', () => {
  it('완료된 회의의 발화를 시각·화자 이름과 함께 보여준다', async () => {
    vi.mocked(getMeetingApi).mockResolvedValue(
      detailOf({
        utterances: [
          utteranceOf(),
          utteranceOf({
            id: 'utterance-2',
            ord: 1,
            speakerLabel: 'speaker_01',
            startSec: 65,
            endSec: 70,
            text: '네 좋습니다'
          })
        ],
        speakers: [speakerOf({ displayName: '김팀장' }), speakerOf({ label: 'speaker_01' })]
      })
    )
    render(<TranscriptSection meetingId={MEETING_ID} />)

    expect(await screen.findByText('회의를 시작하겠습니다')).toBeTruthy()
    expect(screen.getByText('김팀장')).toBeTruthy()
    expect(screen.getByText('00:00:00')).toBeTruthy()
    // 이름을 지정하지 않은 화자는 등장 순서대로 번호를 받는다
    expect(screen.getByText('화자 2')).toBeTruthy()
    expect(screen.getByText('00:01:05')).toBeTruthy()
  })

  it('처리 중인 회의는 기다려 달라는 안내를 보여준다', async () => {
    vi.mocked(getMeetingApi).mockResolvedValue(
      detailOf({ meeting: meetingOf({ status: 'processing' }), utterances: [], speakers: [] })
    )
    render(<TranscriptSection meetingId={MEETING_ID} />)

    expect(await screen.findByText(/회의록을 만들고 있습니다/)).toBeTruthy()
  })

  it('처리에 실패한 회의는 저장된 오류 메시지를 보여준다', async () => {
    vi.mocked(getMeetingApi).mockResolvedValue(
      detailOf({
        meeting: meetingOf({ status: 'error', errorMessage: '모델이 준비되지 않았습니다' }),
        utterances: [],
        speakers: []
      })
    )
    render(<TranscriptSection meetingId={MEETING_ID} />)

    expect(await screen.findByText('모델이 준비되지 않았습니다')).toBeTruthy()
  })

  it('없는 회의를 열면 찾을 수 없다고 알린다', async () => {
    vi.mocked(getMeetingApi).mockResolvedValue(null)
    render(<TranscriptSection meetingId={MEETING_ID} />)

    expect(await screen.findByText('회의를 찾을 수 없습니다')).toBeTruthy()
  })

  it('발화가 하나도 없으면 인식된 발화가 없다고 알린다', async () => {
    vi.mocked(getMeetingApi).mockResolvedValue(detailOf({ utterances: [], speakers: [] }))
    render(<TranscriptSection meetingId={MEETING_ID} />)

    expect(await screen.findByText('인식된 발화가 없습니다')).toBeTruthy()
  })

  it('처리 완료 이벤트를 받으면 회의록을 다시 불러온다', async () => {
    let notify: ((event: PipelineProgressEvent) => void) | null = null
    vi.mocked(onPipelineProgress).mockImplementation((listener) => {
      notify = listener

      return () => {}
    })
    vi.mocked(getMeetingApi)
      .mockResolvedValueOnce(
        detailOf({ meeting: meetingOf({ status: 'processing' }), utterances: [], speakers: [] })
      )
      .mockResolvedValue(detailOf())

    render(<TranscriptSection meetingId={MEETING_ID} />)
    expect(await screen.findByText(/회의록을 만들고 있습니다/)).toBeTruthy()

    await act(async () => {
      notify?.({ meetingId: MEETING_ID, stage: 'done', percent: 100 })
    })

    expect(await screen.findByText('회의를 시작하겠습니다')).toBeTruthy()
  })
})

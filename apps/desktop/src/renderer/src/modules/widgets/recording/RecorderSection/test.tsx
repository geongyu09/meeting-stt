// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { RecordingStateEvent } from '@shared/ipc'

vi.mock('@renderer/shared/api/recording', () => ({
  getRecordingStateApi: vi.fn(),
  controlRecordingApi: vi.fn(),
  setSpeakerCountApi: vi.fn(),
  setLiveTranscriptApi: vi.fn(),
  setRecordingPausedApi: vi.fn(),
  setRecordingNoteApi: vi.fn(),
  setRecordingTypeApi: vi.fn()
}))
vi.mock('@renderer/shared/api/events', () => ({ onRecordingState: vi.fn() }))

import { onRecordingState } from '@renderer/shared/api/events'
import {
  controlRecordingApi,
  getRecordingStateApi,
  setLiveTranscriptApi,
  setRecordingNoteApi,
  setRecordingPausedApi,
  setRecordingTypeApi,
  setSpeakerCountApi
} from '@renderer/shared/api/recording'
import RecorderSection from './index'

const MEETING_ID = 'meeting-1'
const IDLE_STATE: RecordingStateEvent = {
  meetingId: null,
  startedAt: null,
  pausedAt: null,
  level: 0,
  recordingType: 'meeting',
  note: '',
  liveTranscript: { isEnabled: false, lines: [], partial: '' },
  systemAudio: { isEnabled: false }
}
const RECORDING_STATE: RecordingStateEvent = {
  ...IDLE_STATE,
  meetingId: MEETING_ID,
  startedAt: Date.now() - 65_000,
  level: 0.4
}

/** main이 보내는 상태 이벤트를 테스트에서 직접 흘려보내기 위해 구독자를 잡아 둔다 */
const listeners: ((event: RecordingStateEvent) => void)[] = []
const pushState = (event: RecordingStateEvent) => act(() => listeners.forEach((l) => l(event)))

/** 녹음 중 상태로 그린다. 카드는 녹음 중에만 보인다 */
const renderRecording = async (state: RecordingStateEvent = RECORDING_STATE) => {
  vi.mocked(getRecordingStateApi).mockResolvedValue(state)
  render(<RecorderSection />)

  return screen.findByRole('region', { name: '녹음' })
}

beforeEach(() => {
  listeners.length = 0
  vi.mocked(onRecordingState).mockImplementation((listener) => {
    listeners.push(listener)

    return () => {}
  })
  vi.mocked(getRecordingStateApi).mockResolvedValue(IDLE_STATE)
  vi.mocked(controlRecordingApi).mockResolvedValue(undefined)
  vi.mocked(setSpeakerCountApi).mockResolvedValue(RECORDING_STATE)
  vi.mocked(setLiveTranscriptApi).mockResolvedValue(RECORDING_STATE)
  vi.mocked(setRecordingPausedApi).mockResolvedValue(RECORDING_STATE)
  vi.mocked(setRecordingNoteApi).mockResolvedValue(RECORDING_STATE)
  vi.mocked(setRecordingTypeApi).mockResolvedValue(RECORDING_STATE)
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('RecorderSection', () => {
  it('대기 중에는 아무것도 그리지 않는다', async () => {
    const { container } = render(<RecorderSection />)
    await vi.waitFor(() => expect(getRecordingStateApi).toHaveBeenCalled())

    expect(container.innerHTML).toBe('')
  })

  it('녹음 중이면 상태·경과 시간을 보여 주고, 정지는 main에 정지 명령을 보낸다', async () => {
    await renderRecording()

    expect(screen.getByText('녹음 중')).toBeTruthy()
    expect(screen.getByRole('timer', { name: '경과 시간' }).textContent).toBe('01:05')

    await userEvent.click(screen.getByRole('button', { name: '정지하고 기록 만들기' }))

    expect(controlRecordingApi).toHaveBeenCalledWith({ kind: 'stop' })
  })

  it('접으면 헤더만 남기고 본문·정지 버튼을 숨기며, 다시 누르면 펼친다', async () => {
    await renderRecording()

    await userEvent.click(screen.getByRole('button', { name: '녹음 카드 접기' }))

    expect(screen.getByRole('timer', { name: '경과 시간' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: '정지하고 기록 만들기' })).toBeNull()
    const expandButton = screen.getByRole('button', { name: '녹음 카드 펼치기' })
    expect(expandButton.getAttribute('aria-expanded')).toBe('false')

    await userEvent.click(expandButton)

    expect(screen.getByRole('button', { name: '정지하고 기록 만들기' })).toBeTruthy()
  })

  it('녹음 중에 메모로 바꾸면 main에 종류를 보내고, 메모 상태에서는 참석자 수를 묻지 않는다', async () => {
    await renderRecording()

    expect(screen.getByRole('button', { name: '회의' }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByText('참석자')).toBeTruthy()

    await userEvent.click(screen.getByRole('button', { name: '메모' }))
    expect(setRecordingTypeApi).toHaveBeenCalledWith({ type: 'memo' })

    pushState({ ...RECORDING_STATE, recordingType: 'memo' })

    expect(screen.getByRole('button', { name: '메모' }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.queryByText('참석자')).toBeNull()
  })

  it('종류를 바꾸지 못하면 카드 안에 안내를 보여 준다', async () => {
    vi.mocked(setRecordingTypeApi).mockRejectedValue(new Error('ipc'))
    await renderRecording()

    await userEvent.click(screen.getByRole('button', { name: '메모' }))

    expect((await screen.findByRole('alert')).textContent).toBe(
      '녹음 종류를 바꾸지 못했습니다. 잠시 후 다시 시도해 주세요'
    )
  })

  it('일시정지 아이콘 버튼으로 main에 일시정지를 요청하고, 일시정지 중에는 멈춘 시간과 재개 버튼을 보여 준다', async () => {
    await renderRecording()

    await userEvent.click(screen.getByRole('button', { name: '녹음 일시정지' }))
    expect(setRecordingPausedApi).toHaveBeenCalledWith({ isPaused: true })

    const pausedAt = Date.now()
    pushState({ ...RECORDING_STATE, startedAt: pausedAt - 65_000, pausedAt })

    expect(screen.getByText('일시정지됨')).toBeTruthy()
    expect(screen.getByRole('timer', { name: '경과 시간' }).textContent).toBe('01:05')
    expect(screen.getByRole('button', { name: '녹음 재개' })).toBeTruthy()
  })

  it('참석자 수를 입력하면 세션에 저장하고, 범위를 벗어나면 보내지 않고 안내한다', async () => {
    await renderRecording()
    const input = screen.getByRole('textbox', { name: '참석자 수' })

    await userEvent.type(input, '4')
    expect(setSpeakerCountApi).toHaveBeenLastCalledWith({ speakerCount: 4 })

    await userEvent.type(input, '0')
    expect(setSpeakerCountApi).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('alert').textContent).toContain('1~20 사이의 정수')
  })

  it('다른 창에서 바꾼 참석자 수를 그대로 보여 준다', async () => {
    await renderRecording({ ...RECORDING_STATE, speakerCount: 7 })

    expect((screen.getByRole('textbox', { name: '참석자 수' }) as HTMLInputElement).value).toBe('7')
  })

  it('온라인 회의 소리를 함께 녹음 중이면 칩으로 알린다', async () => {
    await renderRecording({ ...RECORDING_STATE, systemAudio: { isEnabled: true } })

    expect(screen.getByText('상대방 소리 포함')).toBeTruthy()
  })

  it('라이브 보기로 바꾸면 main에 켜 달라고 요청하고, 켜져 있으면 확정된 문장과 말하는 중인 구간을 보여 준다', async () => {
    await renderRecording()

    await userEvent.click(screen.getByRole('button', { name: '라이브' }))
    expect(setLiveTranscriptApi).toHaveBeenCalledWith({ isEnabled: true })

    pushState({
      ...RECORDING_STATE,
      liveTranscript: {
        isEnabled: true,
        lines: [{ id: 1, text: '이번 주는 앱 이름부터 정리할게요.' }],
        partial: '녹음은 남깁니다'
      }
    })

    const log = screen.getByRole('log', { name: '라이브 받아쓰기' })
    expect(log.textContent).toContain('이번 주는 앱 이름부터 정리할게요.')
    expect(log.textContent).toContain('녹음은 남깁니다')
    expect(screen.getByText(/GPU를 계속 써서/)).toBeTruthy()
  })

  it('라이브 보기에 아직 들린 말이 없으면 듣는 중이라고 하고, 인식이 실패하면 그 안내를 보여 준다', async () => {
    const live = { isEnabled: true, lines: [], partial: '' }
    await renderRecording({ ...RECORDING_STATE, liveTranscript: live })

    expect(screen.getByText('듣고 있습니다…')).toBeTruthy()

    pushState({
      ...RECORDING_STATE,
      liveTranscript: { ...live, errorMessage: '인식이 잠시 멈췄습니다. 녹음은 계속됩니다' }
    })

    expect(screen.getByRole('alert').textContent).toContain('인식이 잠시 멈췄습니다')
  })

  it('노트를 펼쳐 적으면 세션에 저장하고, 적는 동안은 늦게 온 세션 값으로 되돌리지 않는다', async () => {
    await renderRecording()
    expect(screen.queryByRole('textbox', { name: '녹음 노트' })).toBeNull()

    await userEvent.click(screen.getByRole('button', { name: '노트' }))
    const note = screen.getByRole('textbox', { name: '녹음 노트' }) as HTMLTextAreaElement
    await userEvent.type(note, '안건')
    expect(setRecordingNoteApi).toHaveBeenLastCalledWith({ note: '안건' })

    pushState({ ...RECORDING_STATE, note: '안' })
    expect(note.value).toBe('안건')

    await userEvent.tab()
    pushState({ ...RECORDING_STATE, note: '안건 · 배포 일정' })
    expect(note.value).toBe('안건 · 배포 일정')
  })

  it('노트 저장에 실패하면 카드 안에 안내를 보여 준다', async () => {
    vi.mocked(setRecordingNoteApi).mockRejectedValue(new Error('ipc'))
    await renderRecording()

    await userEvent.click(screen.getByRole('button', { name: '노트' }))
    await userEvent.type(screen.getByRole('textbox', { name: '녹음 노트' }), '안')

    expect((await screen.findByRole('alert')).textContent).toContain('노트를 저장하지 못했습니다')
  })

  it('명령 전달에 실패하면 카드 안에 안내를 보여 준다', async () => {
    vi.mocked(controlRecordingApi).mockRejectedValue(new Error('ipc'))
    await renderRecording()

    await userEvent.click(screen.getByRole('button', { name: '정지하고 기록 만들기' }))

    expect(screen.getByRole('alert').textContent).toContain('녹음 요청을 보내지 못했습니다')
  })
})

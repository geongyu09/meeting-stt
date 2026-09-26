// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import type { RecordingStateEvent } from '@shared/ipc'

vi.mock('@renderer/shared/api/recording', () => ({
  getRecordingStateApi: vi.fn(),
  controlRecordingApi: vi.fn(),
  setSpeakerCountApi: vi.fn(),
  setLiveTranscriptApi: vi.fn(),
  setSystemAudioApi: vi.fn(),
  setRecordingPausedApi: vi.fn()
}))

vi.mock('@renderer/shared/api/meetings', () => ({ importMeetingAudioApi: vi.fn() }))

vi.mock('@renderer/shared/api/events', () => ({ onRecordingState: vi.fn() }))
vi.mock('@renderer/shared/api/settings', () => ({
  getSettingsApi: vi.fn().mockResolvedValue({ recordingShortcut: 'Alt+Command+R' })
}))

import type { Meeting } from '@shared/types'
import { onRecordingState } from '@renderer/shared/api/events'
import { importMeetingAudioApi } from '@renderer/shared/api/meetings'
import {
  controlRecordingApi,
  getRecordingStateApi,
  setLiveTranscriptApi,
  setRecordingPausedApi,
  setSpeakerCountApi,
  setSystemAudioApi
} from '@renderer/shared/api/recording'
import RecorderSection from './index'

const MEETING_ID = 'meeting-1'
const IDLE_STATE: RecordingStateEvent = {
  meetingId: null,
  startedAt: null,
  pausedAt: null,
  level: 0,
  liveTranscript: { isEnabled: false, lines: [], partial: '' },
  systemAudio: { isEnabled: false }
}

/** 가져오기가 성공하면 회의 상세로 이동하므로 상세 경로를 함께 둔다 */
const renderSection = () =>
  render(
    <MemoryRouter initialEntries={['/record']}>
      <Routes>
        <Route path="/record" element={<RecorderSection />} />
        <Route path="/meetings/:meetingId" element={<p>회의 상세 화면</p>} />
      </Routes>
    </MemoryRouter>
  )

/**
 * main이 보내는 상태 이벤트를 테스트에서 직접 흘려보내기 위해 구독자를 잡아 둔다.
 * 화면 안의 여러 컴포넌트(가져오기 행 등)가 각자 구독하므로 전부에게 보낸다
 */
const listeners = new Set<(event: RecordingStateEvent) => void>()
const pushState = (event: RecordingStateEvent) => listeners.forEach((listener) => listener(event))

beforeEach(() => {
  listeners.clear()
  vi.mocked(onRecordingState).mockImplementation((listener) => {
    listeners.add(listener)

    return () => listeners.delete(listener)
  })
  vi.mocked(getRecordingStateApi).mockResolvedValue(IDLE_STATE)
  vi.mocked(controlRecordingApi).mockResolvedValue(undefined)
  vi.mocked(setSpeakerCountApi).mockResolvedValue(IDLE_STATE)
  vi.mocked(setLiveTranscriptApi).mockResolvedValue(IDLE_STATE)
  vi.mocked(setSystemAudioApi).mockResolvedValue(IDLE_STATE)
  vi.mocked(setRecordingPausedApi).mockResolvedValue(IDLE_STATE)
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('RecorderSection', () => {
  it('녹음 시작을 누르면 main에 시작 명령을 보낸다', async () => {
    const user = userEvent.setup()
    renderSection()

    await user.click(screen.getByRole('button', { name: '녹음 시작' }))

    expect(controlRecordingApi).toHaveBeenCalledWith({ kind: 'start' })
  })

  it('다른 창에서 시작한 녹음의 경과 시간과 정지 버튼을 보여준다', async () => {
    const user = userEvent.setup()
    renderSection()

    act(() => {
      pushState({
        ...IDLE_STATE,
        meetingId: MEETING_ID,
        startedAt: Date.now() - 125_000,
        level: 0.2
      })
    })

    expect(screen.getByText('02:05')).toBeTruthy()

    await user.click(screen.getByRole('button', { name: '녹음 정지하고 회의록 만들기' }))

    expect(controlRecordingApi).toHaveBeenCalledWith({ kind: 'stop' })
  })

  it('녹음 중에는 일시정지 아이콘 버튼으로 main에 일시정지를 요청한다', async () => {
    const user = userEvent.setup()
    renderSection()

    expect(screen.queryByRole('button', { name: '녹음 일시정지' })).toBeNull()

    act(() => {
      pushState({ ...IDLE_STATE, meetingId: MEETING_ID, startedAt: Date.now(), level: 0.2 })
    })
    await user.click(screen.getByRole('button', { name: '녹음 일시정지' }))

    expect(setRecordingPausedApi).toHaveBeenCalledWith({ isPaused: true })
  })

  it('pausedAt이 없는 상태(옛 main)는 일시정지로 보지 않는다', () => {
    renderSection()
    const withoutPausedAt: Partial<RecordingStateEvent> = { ...IDLE_STATE }
    delete withoutPausedAt.pausedAt

    act(() => {
      pushState({
        ...withoutPausedAt,
        meetingId: MEETING_ID,
        startedAt: Date.now(),
        level: 0.2
      } as RecordingStateEvent)
    })

    expect(screen.getByText('녹음 중')).toBeTruthy()
    expect(screen.getByRole('button', { name: '녹음 일시정지' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: '녹음 재개' })).toBeNull()
  })

  it('일시정지 중에는 멈춘 시간과 재개 버튼을 보여준다', async () => {
    const user = userEvent.setup()
    renderSection()
    const pausedAt = Date.now()

    act(() => {
      pushState({
        ...IDLE_STATE,
        meetingId: MEETING_ID,
        startedAt: pausedAt - 65_000,
        pausedAt,
        level: 0
      })
    })

    expect(screen.getByText('일시정지됨')).toBeTruthy()
    expect(screen.getByText('01:05')).toBeTruthy()

    await user.click(screen.getByRole('button', { name: '녹음 재개' }))

    expect(setRecordingPausedApi).toHaveBeenCalledWith({ isPaused: false })
  })

  it('참석자 수를 입력하면 세션에 저장한다', async () => {
    const user = userEvent.setup()
    renderSection()

    await user.type(screen.getByLabelText('참석자 수'), '4')

    expect(setSpeakerCountApi).toHaveBeenCalledWith({ speakerCount: 4 })
  })

  it('다른 창에서 바꾼 참석자 수를 그대로 보여준다', () => {
    renderSection()

    act(() => {
      pushState({ ...IDLE_STATE, speakerCount: 7 })
    })

    expect((screen.getByLabelText('참석자 수') as HTMLInputElement).value).toBe('7')
  })

  it('범위를 벗어난 참석자 수는 보내지 않고 안내한다', async () => {
    const user = userEvent.setup()
    renderSection()

    await user.type(screen.getByLabelText('참석자 수'), '99')

    expect(setSpeakerCountApi).not.toHaveBeenCalledWith({ speakerCount: 99 })
    expect(screen.getByText(/1~20 사이의 정수만 쓸 수 있습니다/)).toBeTruthy()
  })

  it('위젯에서 일어난 녹음 실패를 메인 창에도 보여준다', () => {
    renderSection()

    act(() => {
      pushState({ ...IDLE_STATE, errorMessage: '마이크 사용 권한이 없습니다' })
    })

    expect(screen.getByRole('alert').textContent).toBe('마이크 사용 권한이 없습니다')
  })

  it('명령 전달에 실패하면 안내를 보여준다', async () => {
    const user = userEvent.setup()
    vi.mocked(controlRecordingApi).mockRejectedValue(new Error('연결 실패'))
    renderSection()

    await user.click(screen.getByRole('button', { name: '녹음 시작' }))

    expect(await screen.findByRole('alert')).toBeTruthy()
    expect(screen.getByText(/녹음 요청을 보내지 못했습니다/)).toBeTruthy()
  })

  it('녹음 파일을 가져오면 만들어진 회의 상세로 이동한다', async () => {
    const user = userEvent.setup()
    vi.mocked(importMeetingAudioApi).mockResolvedValue({
      meeting: { id: 'imported-1' } as Meeting
    })
    renderSection()

    await user.click(screen.getByRole('button', { name: '녹음 파일 가져오기' }))

    expect(await screen.findByText('회의 상세 화면')).toBeTruthy()
  })

  it('파일 선택을 취소하면 그대로 머문다', async () => {
    const user = userEvent.setup()
    vi.mocked(importMeetingAudioApi).mockResolvedValue({ meeting: null })
    renderSection()

    await user.click(screen.getByRole('button', { name: '녹음 파일 가져오기' }))

    expect(await screen.findByRole('button', { name: '녹음 파일 가져오기' })).toBeTruthy()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('가져오기에 실패하면 main의 안내를 보여준다', async () => {
    const user = userEvent.setup()
    vi.mocked(importMeetingAudioApi).mockRejectedValue(new Error('이 파일을 읽지 못했습니다'))
    renderSection()

    await user.click(screen.getByRole('button', { name: '녹음 파일 가져오기' }))

    expect((await screen.findByRole('alert')).textContent).toBe('이 파일을 읽지 못했습니다')
  })

  it('녹음 중에는 가져오기 버튼을 숨기지 않고 비활성으로 둔다', () => {
    renderSection()

    act(() => {
      pushState({ ...IDLE_STATE, meetingId: MEETING_ID, startedAt: Date.now(), level: 0 })
    })

    expect(
      (screen.getByRole('button', { name: '녹음 파일 가져오기' }) as HTMLButtonElement).disabled
    ).toBe(true)
  })

  describe('라이브 받아쓰기', () => {
    const liveState = (overrides: Partial<RecordingStateEvent['liveTranscript']>) => ({
      ...IDLE_STATE,
      meetingId: MEETING_ID,
      startedAt: Date.now(),
      liveTranscript: { isEnabled: true, lines: [], partial: '', ...overrides }
    })

    it('보기 전환을 누르면 main에 라이브 받아쓰기를 켜 달라고 요청한다', async () => {
      const user = userEvent.setup()
      renderSection()

      await user.click(screen.getByRole('button', { name: '라이브 받아쓰기' }))

      expect(setLiveTranscriptApi).toHaveBeenCalledWith({ isEnabled: true })
    })

    it('켜져 있으면 파형 대신 확정된 문장과 말하는 중인 구간을 보여준다', () => {
      renderSection()

      act(() => {
        pushState(
          liveState({
            lines: [{ id: 1, text: '안녕하세요 회의를 시작하겠습니다' }],
            partial: '오늘 안건은'
          })
        )
      })

      expect(screen.queryByRole('meter')).toBeNull()
      expect(screen.getByRole('log', { name: '라이브 받아쓰기' }).textContent).toBe(
        '안녕하세요 회의를 시작하겠습니다오늘 안건은'
      )
      expect(
        screen.getByRole('button', { name: '라이브 받아쓰기' }).getAttribute('aria-pressed')
      ).toBe('true')
    })

    it('라이브 보기에서는 GPU를 계속 써 발열·배터리 소모가 늘 수 있다고 안내한다', () => {
      renderSection()

      act(() => {
        pushState(liveState({}))
      })

      expect(screen.getByText(/발열과 배터리 소모가 늘 수 있습니다/)).toBeTruthy()
    })

    it('아직 들린 말이 없으면 듣는 중이라고 안내한다', () => {
      renderSection()

      act(() => {
        pushState(liveState({}))
      })

      expect(screen.getByText('듣고 있습니다…')).toBeTruthy()
    })

    it('인식이 실패하면 녹음은 계속된다고 안내한다', () => {
      renderSection()

      act(() => {
        pushState(liveState({ errorMessage: '라이브 받아쓰기를 하지 못했습니다' }))
      })

      expect(screen.getByRole('alert').textContent).toContain('라이브 받아쓰기를 하지 못했습니다')
    })

    it('전환 요청이 실패하면 안내한다', async () => {
      const user = userEvent.setup()
      vi.mocked(setLiveTranscriptApi).mockRejectedValue(new Error('ipc'))
      renderSection()

      await user.click(screen.getByRole('button', { name: '라이브 받아쓰기' }))

      expect((await screen.findByRole('alert')).textContent).toContain('보기를 바꾸지 못했습니다')
    })
  })
  it('온라인 회의 소리 스위치를 켜면 main에 알린다', async () => {
    const user = userEvent.setup()
    renderSection()

    await user.click(screen.getByRole('switch', { name: '온라인 회의 소리 함께 녹음' }))

    expect(setSystemAudioApi).toHaveBeenCalledWith({ isEnabled: true })
  })

  it('켜기에 실패하면 main이 실은 안내를 보여주고 스위치는 꺼진 채다', async () => {
    renderSection()
    await screen.findByRole('switch', { name: '온라인 회의 소리 함께 녹음' })

    act(() =>
      pushState({
        ...IDLE_STATE,
        systemAudio: { isEnabled: false, errorMessage: '시스템 오디오를 잡지 못했습니다' }
      })
    )

    expect(screen.getByRole('alert').textContent).toContain('시스템 오디오를 잡지 못했습니다')
    expect(
      screen
        .getByRole('switch', { name: '온라인 회의 소리 함께 녹음' })
        .getAttribute('aria-checked')
    ).toBe('false')
  })

  it('녹음 중에는 스위치를 비활성으로 두고 켜져 있으면 배지를 보여준다', async () => {
    renderSection()
    await screen.findByRole('switch', { name: '온라인 회의 소리 함께 녹음' })

    act(() =>
      pushState({
        ...IDLE_STATE,
        meetingId: MEETING_ID,
        startedAt: Date.now(),
        systemAudio: { isEnabled: true }
      })
    )

    const toggle = screen.getByRole('switch', {
      name: '온라인 회의 소리 함께 녹음'
    }) as HTMLButtonElement
    expect(toggle.disabled).toBe(true)
    expect(toggle.getAttribute('aria-checked')).toBe('true')
    expect(screen.getByText('상대방 소리 포함')).toBeTruthy()
  })

  it('녹음 전에는 시작 전에 켜 두라는 안내를 보여준다', async () => {
    renderSection()

    expect((await screen.findByText(/이어폰을 쓰면 더 정확합니다/)).textContent).toContain(
      '시작 전에 켜 두세요'
    )
  })

  it('입력 항목을 녹음 설정과 파일로 만들기 카테고리로 나눈다', () => {
    renderSection()

    expect(screen.getByRole('heading', { name: '녹음 설정' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: '파일로 만들기' })).toBeTruthy()
    expect(
      screen.getByRole('region', { name: '녹음 설정' }).contains(screen.getByLabelText('참석자 수'))
    ).toBe(true)
  })
})

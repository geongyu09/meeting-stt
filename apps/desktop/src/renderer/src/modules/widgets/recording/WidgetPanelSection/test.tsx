// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { RecordingStateEvent } from '@shared/ipc'

vi.mock('@renderer/shared/api/recording', () => ({
  requestMicrophonePermissionApi: vi.fn(),
  startRecordingApi: vi.fn(),
  sendRecordingChunkApi: vi.fn(),
  stopRecordingApi: vi.fn(),
  getRecordingStateApi: vi.fn(),
  setSpeakerCountApi: vi.fn(),
  reportRecordingErrorApi: vi.fn()
}))

vi.mock('@renderer/shared/api/events', () => ({
  onRecordingState: vi.fn(),
  onRecordingCommand: vi.fn(),
  onModelDownloadProgress: vi.fn()
}))

vi.mock('@renderer/shared/api/models', () => ({
  getModelStatusApi: vi.fn(),
  downloadModelsApi: vi.fn(),
  downloadSummaryModelApi: vi.fn()
}))

vi.mock('@renderer/shared/api/widget', () => ({ setWidgetVisibleApi: vi.fn() }))
vi.mock('@renderer/shared/api/settings', () => ({
  getSettingsApi: vi.fn().mockResolvedValue({ inputDevice: null })
}))

import { onRecordingState } from '@renderer/shared/api/events'
import { getModelStatusApi } from '@renderer/shared/api/models'
import {
  getRecordingStateApi,
  reportRecordingErrorApi,
  requestMicrophonePermissionApi,
  startRecordingApi,
  stopRecordingApi
} from '@renderer/shared/api/recording'
import { setWidgetVisibleApi } from '@renderer/shared/api/widget'
import WidgetPanelSection from './index'

const MEETING_ID = 'meeting-1'
const IDLE_STATE: RecordingStateEvent = {
  meetingId: null,
  startedAt: null,
  level: 0,
  liveTranscript: { isEnabled: false, lines: [], partial: '' }
}

const READY_MODEL_STATUS = {
  isReady: true,
  isSummaryReady: false,
  selectedWhisperModelId: 'turbo-q5' as const,
  recommendedWhisperModelId: 'turbo-q5' as const,
  whisperOptions: [],
  items: []
}

/** main이 보내는 상태 이벤트를 테스트에서 직접 흘려보내기 위해 구독자를 잡아 둔다 */
let pushState: (event: RecordingStateEvent) => void = () => {}

/** happy-dom에는 오디오 그래프가 없어 위젯이 쓰는 최소한만 흉내 낸다 */
const stubAudioGraph = () => {
  class FakeAudioWorkletNode {
    port: { onmessage: ((event: MessageEvent<ArrayBuffer>) => void) | null } = { onmessage: null }
    connect = <T,>(node: T) => node
    disconnect = () => {}
  }

  class FakeAudioContext {
    sampleRate = 16000
    destination = {}
    audioWorklet = { addModule: () => Promise.resolve() }
    createGain = () => ({ gain: { value: 1 }, connect: <T,>(node: T) => node })
    createMediaStreamSource = () => ({ connect: <T,>(node: T) => node })
    close = () => Promise.resolve()
  }

  vi.stubGlobal('AudioContext', FakeAudioContext)
  vi.stubGlobal('AudioWorkletNode', FakeAudioWorkletNode)
  vi.stubGlobal('navigator', {
    mediaDevices: { getUserMedia: () => Promise.resolve({ getTracks: () => [] }) }
  })
}

beforeEach(() => {
  stubAudioGraph()
  vi.mocked(onRecordingState).mockImplementation((listener) => {
    pushState = listener

    return () => {}
  })
  vi.mocked(getRecordingStateApi).mockResolvedValue(IDLE_STATE)
  vi.mocked(getModelStatusApi).mockResolvedValue(READY_MODEL_STATUS)
  vi.mocked(requestMicrophonePermissionApi).mockResolvedValue(true)
  vi.mocked(startRecordingApi).mockResolvedValue(MEETING_ID)
  vi.mocked(setWidgetVisibleApi).mockResolvedValue(undefined)
  vi.mocked(reportRecordingErrorApi).mockResolvedValue(undefined)
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

describe('WidgetPanelSection', () => {
  it('모델이 준비되지 않으면 시작 버튼을 막고 안내를 보여준다', async () => {
    vi.mocked(getModelStatusApi).mockResolvedValue({ ...READY_MODEL_STATUS, isReady: false })
    render(<WidgetPanelSection />)

    expect(await screen.findByText('메인 창에서 모델을 먼저 준비해 주세요')).toBeTruthy()
    expect(screen.getByRole('button', { name: '녹음 시작' }).hasAttribute('disabled')).toBe(true)
  })

  it('녹음 시작을 누르면 마이크 권한을 받고 녹음을 시작한다', async () => {
    const user = userEvent.setup()
    render(<WidgetPanelSection />)

    await user.click(await screen.findByRole('button', { name: '녹음 시작' }))

    expect(requestMicrophonePermissionApi).toHaveBeenCalled()
    expect(startRecordingApi).toHaveBeenCalledWith({ sampleRate: 16000 })
  })

  it('마이크 권한이 없으면 녹음을 시작하지 않고 실패를 알린다', async () => {
    const user = userEvent.setup()
    vi.mocked(requestMicrophonePermissionApi).mockResolvedValue(false)
    render(<WidgetPanelSection />)

    await user.click(await screen.findByRole('button', { name: '녹음 시작' }))

    expect(startRecordingApi).not.toHaveBeenCalled()
    expect(vi.mocked(reportRecordingErrorApi).mock.calls[0][0].message).toContain(
      '마이크 사용 권한'
    )
  })

  it('녹음 중에는 경과 시간과 정지 버튼을 보여준다', async () => {
    render(<WidgetPanelSection />)
    await screen.findByRole('button', { name: '녹음 시작' })

    act(() => {
      pushState({
        ...IDLE_STATE,
        meetingId: MEETING_ID,
        startedAt: Date.now() - 65_000,
        level: 0.5
      })
    })

    expect(screen.getByText('녹음 중')).toBeTruthy()
    expect(screen.getByText('01:05')).toBeTruthy()
    expect(screen.getByRole('button', { name: '녹음 정지' })).toBeTruthy()
  })

  it('녹음 중 정지를 누르면 그 회의의 녹음을 끝낸다', async () => {
    const user = userEvent.setup()
    render(<WidgetPanelSection />)

    await user.click(await screen.findByRole('button', { name: '녹음 시작' }))
    act(() => {
      pushState({ ...IDLE_STATE, meetingId: MEETING_ID, startedAt: Date.now(), level: 0 })
    })
    await user.click(screen.getByRole('button', { name: '녹음 정지' }))

    expect(stopRecordingApi).toHaveBeenCalledWith({ meetingId: MEETING_ID })
  })

  it('세션이 보낸 오류 안내를 보여준다', async () => {
    render(<WidgetPanelSection />)
    await screen.findByRole('button', { name: '녹음 시작' })

    act(() => {
      pushState({ ...IDLE_STATE, errorMessage: '마이크 사용 권한이 없습니다' })
    })

    expect(screen.getByRole('alert').textContent).toBe('마이크 사용 권한이 없습니다')
  })

  it('숨기기 버튼은 패널을 숨긴다', async () => {
    const user = userEvent.setup()
    render(<WidgetPanelSection />)

    await user.click(await screen.findByRole('button', { name: '위젯 숨기기' }))

    expect(setWidgetVisibleApi).toHaveBeenCalledWith({ isVisible: false })
  })
})

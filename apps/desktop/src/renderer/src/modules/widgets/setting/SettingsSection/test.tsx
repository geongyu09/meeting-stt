// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('@renderer/shared/api/settings', () => ({
  getSettingsApi: vi.fn(),
  updateSettingsApi: vi.fn(),
  setShortcutsSuspendedApi: vi.fn().mockResolvedValue(undefined)
}))
vi.mock('@renderer/shared/api/update', () => ({
  checkUpdateApi: vi.fn(),
  downloadUpdateApi: vi.fn(),
  installUpdateApi: vi.fn()
}))
vi.mock('@renderer/shared/api/events', () => ({
  onUpdateAvailable: vi.fn(() => () => {})
}))

import {
  getSettingsApi,
  setShortcutsSuspendedApi,
  updateSettingsApi
} from '@renderer/shared/api/settings'
import SettingsSection from './index'

const AUDIO_LABEL = /원본 녹음 파일 보관/
const UPDATE_LABEL = /^업데이트 확인/
const QUIET_LABEL = /조용히 처리/
const FADE_LABEL = /위젯 반투명/
const OPACITY_LABEL = /포커스가 없을 때 불투명도/
const RECORDING_SHORTCUT_BUTTON = /녹음 시작·정지 단축키 변경/

const DEFAULT_SETTINGS = {
  isAudioKept: false,
  isUpdateCheckEnabled: false,
  isQuietProcessing: false,
  isWidgetEnabled: true,
  isWidgetFadeEnabled: true,
  widgetFadeOpacity: 0.55,
  recordingShortcut: 'Alt+Command+R',
  widgetShortcut: 'Alt+Command+W'
}

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('SettingsSection', () => {
  it('원본 녹음 보관이 꺼진 상태를 보여준다', async () => {
    vi.mocked(getSettingsApi).mockResolvedValue(DEFAULT_SETTINGS)
    render(<SettingsSection />)

    const checkbox = (await screen.findByLabelText(AUDIO_LABEL)) as HTMLInputElement
    expect(checkbox.checked).toBe(false)
    expect(screen.getByText(/보관하지 않은 회의는 나중에 다시 처리할 수 없습니다/)).toBeTruthy()
  })

  it('보관을 켜면 설정을 저장하고 결과를 반영한다', async () => {
    const user = userEvent.setup()
    vi.mocked(getSettingsApi).mockResolvedValue(DEFAULT_SETTINGS)
    vi.mocked(updateSettingsApi).mockResolvedValue({ ...DEFAULT_SETTINGS, isAudioKept: true })
    render(<SettingsSection />)

    await user.click(await screen.findByLabelText(AUDIO_LABEL))

    expect(updateSettingsApi).toHaveBeenCalledWith({ ...DEFAULT_SETTINGS, isAudioKept: true })
    const checkbox = (await screen.findByLabelText(AUDIO_LABEL)) as HTMLInputElement
    expect(checkbox.checked).toBe(true)
  })

  it('업데이트 확인을 켜면 나머지 설정을 유지한 채 저장한다', async () => {
    const user = userEvent.setup()
    vi.mocked(getSettingsApi).mockResolvedValue({ ...DEFAULT_SETTINGS, isAudioKept: true })
    vi.mocked(updateSettingsApi).mockResolvedValue({
      ...DEFAULT_SETTINGS,
      isAudioKept: true,
      isUpdateCheckEnabled: true
    })
    render(<SettingsSection />)

    await user.click(await screen.findByLabelText(UPDATE_LABEL))

    expect(updateSettingsApi).toHaveBeenCalledWith({
      ...DEFAULT_SETTINGS,
      isAudioKept: true,
      isUpdateCheckEnabled: true
    })
    const checkbox = (await screen.findByLabelText(UPDATE_LABEL)) as HTMLInputElement
    expect(checkbox.checked).toBe(true)
  })

  it('조용히 처리를 켜면 느려진다는 안내와 함께 저장한다', async () => {
    const user = userEvent.setup()
    vi.mocked(getSettingsApi).mockResolvedValue(DEFAULT_SETTINGS)
    vi.mocked(updateSettingsApi).mockResolvedValue({ ...DEFAULT_SETTINGS, isQuietProcessing: true })
    render(<SettingsSection />)

    const checkbox = (await screen.findByLabelText(QUIET_LABEL)) as HTMLInputElement
    expect(checkbox.checked).toBe(false)
    expect(screen.getByText(/처리 시간이 길어집니다/)).toBeTruthy()

    await user.click(checkbox)

    expect(updateSettingsApi).toHaveBeenCalledWith({ ...DEFAULT_SETTINGS, isQuietProcessing: true })
    expect(((await screen.findByLabelText(QUIET_LABEL)) as HTMLInputElement).checked).toBe(true)
  })

  it('저장에 실패하면 안내를 보여준다', async () => {
    const user = userEvent.setup()
    vi.mocked(getSettingsApi).mockResolvedValue(DEFAULT_SETTINGS)
    vi.mocked(updateSettingsApi).mockRejectedValue(new Error('설정을 저장하지 못했습니다'))
    render(<SettingsSection />)

    await user.click(await screen.findByLabelText(AUDIO_LABEL))

    expect(await screen.findByRole('alert')).toBeTruthy()
    expect(screen.getByText('설정을 저장하지 못했습니다')).toBeTruthy()
  })

  it('위젯 반투명을 끄면 불투명도 슬라이더를 막는다', async () => {
    const user = userEvent.setup()
    vi.mocked(getSettingsApi).mockResolvedValue(DEFAULT_SETTINGS)
    vi.mocked(updateSettingsApi).mockResolvedValue({
      ...DEFAULT_SETTINGS,
      isWidgetFadeEnabled: false
    })
    render(<SettingsSection />)

    const slider = (await screen.findByLabelText(OPACITY_LABEL)) as HTMLInputElement
    expect(slider.disabled).toBe(false)

    await user.click(screen.getByLabelText(FADE_LABEL))

    expect(updateSettingsApi).toHaveBeenCalledWith({
      ...DEFAULT_SETTINGS,
      isWidgetFadeEnabled: false
    })
    expect(((await screen.findByLabelText(OPACITY_LABEL)) as HTMLInputElement).disabled).toBe(true)
  })

  it('불투명도 슬라이더를 움직이면 값을 저장한다', async () => {
    vi.mocked(getSettingsApi).mockResolvedValue(DEFAULT_SETTINGS)
    vi.mocked(updateSettingsApi).mockResolvedValue({ ...DEFAULT_SETTINGS, widgetFadeOpacity: 0.3 })
    render(<SettingsSection />)

    fireEvent.change(await screen.findByLabelText(OPACITY_LABEL), { target: { value: '0.3' } })

    expect(updateSettingsApi).toHaveBeenCalledWith({ ...DEFAULT_SETTINGS, widgetFadeOpacity: 0.3 })
    expect(await screen.findByText('30%')).toBeTruthy()
  })

  it('단축키를 입력받는 동안 전역 단축키를 풀고, 누른 조합을 저장한다', async () => {
    const user = userEvent.setup()
    vi.mocked(getSettingsApi).mockResolvedValue(DEFAULT_SETTINGS)
    vi.mocked(updateSettingsApi).mockResolvedValue({
      ...DEFAULT_SETTINGS,
      recordingShortcut: 'Control+Shift+F5'
    })
    render(<SettingsSection />)

    const button = await screen.findByRole('button', { name: RECORDING_SHORTCUT_BUTTON })
    expect(button.textContent).toBe('⌥⌘R')

    await user.click(button)
    expect(setShortcutsSuspendedApi).toHaveBeenLastCalledWith({ isSuspended: true })

    fireEvent.keyDown(button, { code: 'F5', key: 'F5', ctrlKey: true, shiftKey: true })

    expect(updateSettingsApi).toHaveBeenCalledWith({
      ...DEFAULT_SETTINGS,
      recordingShortcut: 'Control+Shift+F5'
    })
    expect(await screen.findByText('⌃⇧F5')).toBeTruthy()
    expect(setShortcutsSuspendedApi).toHaveBeenLastCalledWith({ isSuspended: false })
  })

  it('수식키 없는 입력은 무시하고 Esc로 취소한다', async () => {
    const user = userEvent.setup()
    vi.mocked(getSettingsApi).mockResolvedValue(DEFAULT_SETTINGS)
    render(<SettingsSection />)

    const button = await screen.findByRole('button', { name: RECORDING_SHORTCUT_BUTTON })
    await user.click(button)

    fireEvent.keyDown(button, { code: 'KeyA', key: 'a' })
    expect(button.textContent).toBe('키 조합을 누르세요')

    fireEvent.keyDown(button, { code: 'Escape', key: 'Escape' })

    expect(await screen.findByText('⌥⌘R')).toBeTruthy()
    expect(updateSettingsApi).not.toHaveBeenCalled()
    expect(setShortcutsSuspendedApi).toHaveBeenLastCalledWith({ isSuspended: false })
  })

  it('단축키 등록에 실패하면 main의 안내를 보여준다', async () => {
    const user = userEvent.setup()
    vi.mocked(getSettingsApi).mockResolvedValue(DEFAULT_SETTINGS)
    vi.mocked(updateSettingsApi).mockRejectedValue(
      new Error('단축키 ⌘Space를 등록하지 못했습니다. 다른 앱이 쓰는 중일 수 있습니다')
    )
    render(<SettingsSection />)

    const button = await screen.findByRole('button', { name: RECORDING_SHORTCUT_BUTTON })
    await user.click(button)
    fireEvent.keyDown(button, { code: 'Space', key: ' ', metaKey: true })

    expect(await screen.findByText(/⌘Space를 등록하지 못했습니다/)).toBeTruthy()
    expect(button.textContent).toBe('⌥⌘R')
  })

  it('설정을 불러오지 못하면 오류를 보여준다', async () => {
    vi.mocked(getSettingsApi).mockRejectedValue(new Error('설정을 불러오지 못했습니다'))
    render(<SettingsSection />)

    expect(await screen.findByRole('alert')).toBeTruthy()
  })
})

// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('@renderer/shared/api/settings', () => ({
  getSettingsApi: vi.fn(),
  updateSettingsApi: vi.fn()
}))

import { getSettingsApi, updateSettingsApi } from '@renderer/shared/api/settings'
import SettingsSection from './index'

const AUDIO_LABEL = /원본 녹음 파일 보관/
const UPDATE_LABEL = /업데이트 확인/
const QUIET_LABEL = /조용히 처리/

const DEFAULT_SETTINGS = {
  isAudioKept: false,
  isUpdateCheckEnabled: false,
  isQuietProcessing: false,
  isWidgetEnabled: true
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

  it('설정을 불러오지 못하면 오류를 보여준다', async () => {
    vi.mocked(getSettingsApi).mockRejectedValue(new Error('설정을 불러오지 못했습니다'))
    render(<SettingsSection />)

    expect(await screen.findByRole('alert')).toBeTruthy()
  })
})

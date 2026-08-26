// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { AppSettings } from '@shared/types'

vi.mock('@renderer/shared/api/settings', () => ({
  getSettingsApi: vi.fn(),
  updateSettingsApi: vi.fn()
}))

import { getSettingsApi, updateSettingsApi } from '@renderer/shared/api/settings'
import SettingsSection from './index'

const AUDIO_OPTION_LABEL = /원본 녹음 파일 보관/
const UPDATE_OPTION_LABEL = /시작할 때 새 버전 확인/

const settingsOf = (overrides: Partial<AppSettings> = {}): AppSettings => ({
  isAudioKept: false,
  isUpdateCheckEnabled: false,
  ...overrides
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('SettingsSection', () => {
  it('원본 녹음 보관과 업데이트 확인이 꺼진 상태를 보여준다', async () => {
    vi.mocked(getSettingsApi).mockResolvedValue(settingsOf())
    render(<SettingsSection />)

    const audioCheckbox = (await screen.findByLabelText(AUDIO_OPTION_LABEL)) as HTMLInputElement
    expect(audioCheckbox.checked).toBe(false)
    expect((screen.getByLabelText(UPDATE_OPTION_LABEL) as HTMLInputElement).checked).toBe(false)
    expect(screen.getByText(/보관하지 않은 회의는 나중에 다시 처리할 수 없습니다/)).toBeTruthy()
  })

  it('보관을 켜면 나머지 설정은 유지한 채 저장하고 결과를 반영한다', async () => {
    const user = userEvent.setup()
    vi.mocked(getSettingsApi).mockResolvedValue(settingsOf({ isUpdateCheckEnabled: true }))
    vi.mocked(updateSettingsApi).mockResolvedValue(
      settingsOf({ isAudioKept: true, isUpdateCheckEnabled: true })
    )
    render(<SettingsSection />)

    await user.click(await screen.findByLabelText(AUDIO_OPTION_LABEL))

    expect(updateSettingsApi).toHaveBeenCalledWith({ isAudioKept: true, isUpdateCheckEnabled: true })
    const checkbox = (await screen.findByLabelText(AUDIO_OPTION_LABEL)) as HTMLInputElement
    expect(checkbox.checked).toBe(true)
  })

  it('업데이트 확인을 켜면 그 값만 바꿔 저장한다', async () => {
    const user = userEvent.setup()
    vi.mocked(getSettingsApi).mockResolvedValue(settingsOf())
    vi.mocked(updateSettingsApi).mockResolvedValue(settingsOf({ isUpdateCheckEnabled: true }))
    render(<SettingsSection />)

    await user.click(await screen.findByLabelText(UPDATE_OPTION_LABEL))

    expect(updateSettingsApi).toHaveBeenCalledWith({ isAudioKept: false, isUpdateCheckEnabled: true })
    const checkbox = (await screen.findByLabelText(UPDATE_OPTION_LABEL)) as HTMLInputElement
    expect(checkbox.checked).toBe(true)
  })

  it('저장에 실패하면 안내를 보여준다', async () => {
    const user = userEvent.setup()
    vi.mocked(getSettingsApi).mockResolvedValue(settingsOf())
    vi.mocked(updateSettingsApi).mockRejectedValue(new Error('설정을 저장하지 못했습니다'))
    render(<SettingsSection />)

    await user.click(await screen.findByLabelText(AUDIO_OPTION_LABEL))

    expect(await screen.findByRole('alert')).toBeTruthy()
    expect(screen.getByText('설정을 저장하지 못했습니다')).toBeTruthy()
  })

  it('설정을 불러오지 못하면 오류를 보여준다', async () => {
    vi.mocked(getSettingsApi).mockRejectedValue(new Error('설정을 불러오지 못했습니다'))
    render(<SettingsSection />)

    expect(await screen.findByRole('alert')).toBeTruthy()
  })
})

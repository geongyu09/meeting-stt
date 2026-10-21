// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import type { MeetingAudioFile } from '@shared/types'

vi.mock('@renderer/shared/api/meetings', () => ({
  getMeetingAudioFilesApi: vi.fn(),
  deleteMeetingAudioApi: vi.fn()
}))

import { deleteMeetingAudioApi, getMeetingAudioFilesApi } from '@renderer/shared/api/meetings'
import RecordingFileSection from './index'

const MEGABYTE = 1_000_000

const fileOf = (overrides: Partial<MeetingAudioFile>): MeetingAudioFile => ({
  meetingId: 'm1',
  title: '주간 회의',
  createdAt: Date.UTC(2026, 9, 21, 5, 10),
  durationSec: 600,
  status: 'done',
  sizeBytes: 20 * MEGABYTE,
  ...overrides
})

const renderSection = async (files: MeetingAudioFile[]) => {
  vi.mocked(getMeetingAudioFilesApi).mockResolvedValue(files)

  await act(async () => {
    render(
      <MemoryRouter>
        <RecordingFileSection />
      </MemoryRouter>
    )
  })
}

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('RecordingFileSection', () => {
  it('보관 중인 녹음 수와 총 용량을 보여 준다', async () => {
    await renderSection([
      fileOf({}),
      fileOf({ meetingId: 'm2', title: '메모', sizeBytes: 5 * MEGABYTE })
    ])

    expect(screen.getByText('보관 중인 녹음 2개 · 총 25MB')).toBeTruthy()
  })

  it('비어 있으면 안내를 보여 준다', async () => {
    await renderSection([])

    expect(screen.getByText('보관 중인 녹음 파일이 없습니다')).toBeTruthy()
  })

  it('한 행의 삭제는 확인 뒤에 그 회의만 지우고 응답 목록으로 바꾼다', async () => {
    await renderSection([fileOf({}), fileOf({ meetingId: 'm2', title: '메모' })])
    vi.mocked(deleteMeetingAudioApi).mockResolvedValue({
      files: [fileOf({ meetingId: 'm2', title: '메모' })],
      failedCount: 0
    })

    await userEvent.click(screen.getByRole('button', { name: '주간 회의 녹음 파일 삭제' }))
    expect(deleteMeetingAudioApi).not.toHaveBeenCalled()
    await userEvent.click(within(screen.getByRole('group')).getByRole('button', { name: '삭제' }))

    expect(deleteMeetingAudioApi).toHaveBeenCalledWith({ meetingIds: ['m1'] })
    expect(screen.queryByText('주간 회의')).toBeNull()
    expect(screen.getByText('보관 중인 녹음 1개 · 총 20MB')).toBeTruthy()
  })

  it('전체 선택은 처리 중인 회의를 빼고 고르며, 선택 삭제는 취소할 수 있다', async () => {
    await renderSection([
      fileOf({}),
      fileOf({ meetingId: 'm2', title: '처리 중 회의', status: 'processing' })
    ])

    await userEvent.click(screen.getByRole('checkbox', { name: '전체 선택' }))
    expect(screen.getByRole('checkbox', { name: '처리 중 회의 선택' })).toHaveProperty(
      'disabled',
      true
    )

    await userEvent.click(screen.getByRole('button', { name: '선택한 1개 삭제' }))
    await userEvent.click(screen.getByRole('button', { name: '취소' }))
    expect(deleteMeetingAudioApi).not.toHaveBeenCalled()

    await userEvent.click(screen.getByRole('button', { name: '선택한 1개 삭제' }))
    // 지우지 못한 파일은 목록에 남는다
    vi.mocked(deleteMeetingAudioApi).mockResolvedValue({ files: [fileOf({})], failedCount: 1 })
    await userEvent.click(screen.getByRole('button', { name: '삭제' }))

    expect(deleteMeetingAudioApi).toHaveBeenCalledWith({ meetingIds: ['m1'] })
    expect(screen.getByText('1개를 지우지 못했습니다')).toBeTruthy()
  })
})

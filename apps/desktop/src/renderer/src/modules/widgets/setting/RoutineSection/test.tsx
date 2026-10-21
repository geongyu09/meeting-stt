// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { AssistantStatus, Routine, RoutinesState } from '@shared/types'

vi.mock('@renderer/shared/api/routine', () => ({
  getRoutinesApi: vi.fn(),
  saveRoutineApi: vi.fn(),
  deleteRoutineApi: vi.fn(),
  runRoutineApi: vi.fn()
}))

vi.mock('@renderer/shared/api/assistant', () => ({
  getAssistantStatusApi: vi.fn()
}))

vi.mock('@renderer/shared/api/events', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@renderer/shared/api/events')>()),
  onRoutinesChanged: vi.fn(() => () => {})
}))

import { getAssistantStatusApi } from '@renderer/shared/api/assistant'
import { onRoutinesChanged } from '@renderer/shared/api/events'
import {
  deleteRoutineApi,
  getRoutinesApi,
  runRoutineApi,
  saveRoutineApi
} from '@renderer/shared/api/routine'
import RoutineSection from './index'

const statusOf = (overrides: Partial<AssistantStatus> = {}): AssistantStatus => ({
  folder: '/Users/me/notes',
  folderProblem: null,
  isGitRepo: true,
  permissionMode: 'acceptEdits',
  provider: 'claude-cli',
  isAutoOrganizeEnabled: true,
  ...overrides
})

const routineOf = (overrides: Partial<Routine> = {}): Routine => ({
  id: 'r1',
  name: '메일 확인',
  prompt: '새 메일을 정리해 줘',
  schedule: { kind: 'interval', minutes: 30 },
  isEnabled: true,
  anchorAt: new Date(2026, 9, 22, 8, 0).getTime(),
  lastRun: null,
  ...overrides
})

const stateOf = (overrides: Partial<RoutinesState> = {}): RoutinesState => ({
  routines: [],
  runningId: null,
  queuedIds: [],
  ...overrides
})

beforeEach(() => {
  vi.mocked(getAssistantStatusApi).mockResolvedValue(statusOf())
  vi.mocked(getRoutinesApi).mockResolvedValue(stateOf())
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('RoutineSection', () => {
  it('루틴이 없으면 알리고, 추가 폼으로 만들면 평일 09:00으로 저장한다', async () => {
    const created = routineOf({
      name: '아침 브리핑',
      schedule: { kind: 'time', weekdays: [1, 2, 3, 4, 5], time: '09:00' }
    })
    vi.mocked(saveRoutineApi).mockResolvedValue(stateOf({ routines: [created] }))
    render(<RoutineSection />)

    expect(await screen.findByText('아직 루틴이 없습니다.')).toBeTruthy()
    await userEvent.click(screen.getByRole('button', { name: '루틴 추가' }))
    const form = screen.getByRole('form', { name: '새 루틴' })
    await userEvent.type(within(form).getByLabelText('이름'), '아침 브리핑')
    await userEvent.type(within(form).getByLabelText('프롬프트'), '오늘 할 일 정리')
    await userEvent.click(within(form).getByRole('button', { name: '저장' }))

    expect(saveRoutineApi).toHaveBeenCalledWith({
      id: null,
      name: '아침 브리핑',
      prompt: '오늘 할 일 정리',
      schedule: { kind: 'time', weekdays: [1, 2, 3, 4, 5], time: '09:00' },
      isEnabled: true
    })
    expect(await screen.findByText('평일 09:00', { exact: false })).toBeTruthy()
    expect(screen.queryByRole('form')).toBeNull()
  })

  it('간격으로 바꾸면 시간을 분으로 바꿔 저장하고, main이 거절하면 폼에 이유를 보여 준다', async () => {
    vi.mocked(saveRoutineApi).mockRejectedValueOnce(
      new Error(
        "Error invoking remote method 'routines:save': Error: 주기가 올바르지 않습니다. 요일을 하나 이상 고르거나 간격을 10분~24시간으로 적어 주세요"
      )
    )
    render(<RoutineSection />)

    await userEvent.click(await screen.findByRole('button', { name: '루틴 추가' }))
    const form = screen.getByRole('form', { name: '새 루틴' })
    await userEvent.type(within(form).getByLabelText('이름'), '메일')
    await userEvent.type(within(form).getByLabelText('프롬프트'), '정리')
    await userEvent.click(within(form).getByRole('radio', { name: '간격' }))
    const count = within(form).getByRole('spinbutton', { name: '간격' })
    await userEvent.clear(count)
    await userEvent.type(count, '2')
    await userEvent.selectOptions(within(form).getByRole('combobox', { name: '단위' }), 'hours')
    await userEvent.click(within(form).getByRole('button', { name: '저장' }))

    expect(saveRoutineApi).toHaveBeenCalledWith(
      expect.objectContaining({ schedule: { kind: 'interval', minutes: 120 } })
    )
    expect((await within(form).findByRole('alert')).textContent).toContain(
      '주기가 올바르지 않습니다'
    )
  })

  it('지금 실행을 누르면 큐에 넣고, 실행 중인 동안 버튼을 막는다', async () => {
    vi.mocked(getRoutinesApi).mockResolvedValue(stateOf({ routines: [routineOf()] }))
    vi.mocked(runRoutineApi).mockResolvedValue(
      stateOf({ routines: [routineOf()], runningId: 'r1' })
    )
    render(<RoutineSection />)

    expect(await screen.findByText('30분마다', { exact: false })).toBeTruthy()
    await userEvent.click(screen.getByRole('button', { name: '지금 실행' }))

    expect(runRoutineApi).toHaveBeenCalledWith({ id: 'r1' })
    expect(screen.getByRole('button', { name: '실행 중' }).hasAttribute('disabled')).toBe(true)
  })

  it('main이 보낸 실행 결과를 반영하고, 마지막 답을 펼쳐 본다', async () => {
    vi.mocked(getRoutinesApi).mockResolvedValue(stateOf({ routines: [routineOf()] }))
    render(<RoutineSection />)
    await screen.findByText('아직 실행하지 않았습니다')

    const listener = vi.mocked(onRoutinesChanged).mock.calls[0][0]
    const finished = routineOf({
      lastRun: {
        finishedAt: new Date(2026, 9, 22, 8, 30).getTime(),
        text: '새 메일 3통을 정리했습니다',
        changedFiles: ['notes/mail.md'],
        error: null
      }
    })
    act(() => listener(stateOf({ routines: [finished] })))

    expect(screen.getByText('완료', { exact: false })).toBeTruthy()
    await userEvent.click(screen.getByText('마지막 답 보기'))
    expect(screen.getByText('새 메일 3통을 정리했습니다')).toBeTruthy()
    expect(screen.getByText('notes/mail.md', { exact: false })).toBeTruthy()
  })

  it('스위치로 끄면 같은 루틴을 꺼진 상태로 저장한다', async () => {
    vi.mocked(getRoutinesApi).mockResolvedValue(stateOf({ routines: [routineOf()] }))
    vi.mocked(saveRoutineApi).mockResolvedValue(
      stateOf({ routines: [routineOf({ isEnabled: false })] })
    )
    render(<RoutineSection />)

    await userEvent.click(await screen.findByRole('switch', { name: '메일 확인 켜기' }))

    expect(saveRoutineApi).toHaveBeenCalledWith({
      id: 'r1',
      name: '메일 확인',
      prompt: '새 메일을 정리해 줘',
      schedule: { kind: 'interval', minutes: 30 },
      isEnabled: false
    })
  })

  it('삭제는 한 번 더 확인한 뒤에 지운다', async () => {
    vi.mocked(getRoutinesApi).mockResolvedValue(stateOf({ routines: [routineOf()] }))
    vi.mocked(deleteRoutineApi).mockResolvedValue(stateOf())
    render(<RoutineSection />)

    await userEvent.click(await screen.findByRole('button', { name: '삭제' }))
    expect(deleteRoutineApi).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: '정말 삭제' }))

    expect(deleteRoutineApi).toHaveBeenCalledWith({ id: 'r1' })
    expect(await screen.findByText('아직 루틴이 없습니다.')).toBeTruthy()
  })

  it('작업 폴더가 없으면 안내한다', async () => {
    vi.mocked(getAssistantStatusApi).mockResolvedValue(statusOf({ folder: null }))
    render(<RoutineSection />)

    expect((await screen.findByRole('status')).textContent).toContain('작업 폴더를 먼저 고르세요')
  })
})

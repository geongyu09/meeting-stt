// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import type { RecordingStateEvent } from '@shared/ipc'
import type {
  AppSettings,
  AssistantChatState,
  AssistantStatus,
  LlmStatus,
  RoutinesState
} from '@shared/types'

vi.mock('@renderer/shared/api/assistant', () => ({
  getAssistantStatusApi: vi.fn(),
  getAssistantStateApi: vi.fn(),
  sendAssistantMessageApi: vi.fn(),
  cancelAssistantApi: vi.fn(),
  resetAssistantChatApi: vi.fn(),
  listWorkspaceFilesApi: vi.fn(),
  listAssistantSkillsApi: vi.fn()
}))
vi.mock('@renderer/shared/api/llm', () => ({ getLlmStatusApi: vi.fn() }))
vi.mock('@renderer/shared/api/recording', () => ({
  controlRecordingApi: vi.fn(),
  getRecordingStateApi: vi.fn()
}))
vi.mock('@renderer/shared/api/meetings', () => ({
  importMeetingAudioApi: vi.fn(),
  searchMeetingsApi: vi.fn(),
  getMeetingsApi: vi.fn(),
  getMeetingApi: vi.fn(),
  renameMeetingApi: vi.fn(),
  deleteMeetingApi: vi.fn(),
  reprocessMeetingApi: vi.fn()
}))
vi.mock('@renderer/shared/api/speakers', () => ({
  mergeSpeakersApi: vi.fn(),
  renameSpeakerApi: vi.fn()
}))
vi.mock('@renderer/shared/api/utterances', () => ({
  reassignUtteranceApi: vi.fn(),
  revertUtteranceRefineApi: vi.fn(),
  updateUtteranceTextApi: vi.fn()
}))
vi.mock('@renderer/shared/api/summary', () => ({ createSummaryApi: vi.fn() }))
vi.mock('@renderer/shared/api/summaryTemplate', () => ({ getSummaryTemplatesApi: vi.fn() }))
vi.mock('@renderer/shared/api/clipboard', () => ({ writeClipboardTextApi: vi.fn() }))
vi.mock('@renderer/shared/api/routine', () => ({
  getRoutinesApi: vi.fn(),
  saveRoutineApi: vi.fn()
}))
vi.mock('@renderer/shared/api/settings', () => ({
  getSettingsApi: vi.fn(),
  updateSettingsApi: vi.fn()
}))
vi.mock('@renderer/shared/api/events', () => ({
  onAssistantState: vi.fn(() => () => {}),
  onWorkspaceFilesChanged: vi.fn(() => () => {}),
  onRecordingState: vi.fn(() => () => {}),
  onMeetingsChanged: vi.fn(() => () => {}),
  onPipelineProgress: vi.fn(() => () => {}),
  onRefineProgress: vi.fn(() => () => {}),
  onSummaryProgress: vi.fn(() => () => {}),
  onSettingsChanged: vi.fn(() => () => {}),
  onRoutinesChanged: vi.fn(() => () => {})
}))

import {
  cancelAssistantApi,
  getAssistantStateApi,
  getAssistantStatusApi,
  listAssistantSkillsApi,
  listWorkspaceFilesApi,
  resetAssistantChatApi,
  sendAssistantMessageApi
} from '@renderer/shared/api/assistant'
import { writeClipboardTextApi } from '@renderer/shared/api/clipboard'
import { onAssistantState, onRecordingState, onRoutinesChanged } from '@renderer/shared/api/events'
import { getLlmStatusApi } from '@renderer/shared/api/llm'
import {
  getMeetingApi,
  getMeetingsApi,
  importMeetingAudioApi,
  searchMeetingsApi
} from '@renderer/shared/api/meetings'
import { controlRecordingApi, getRecordingStateApi } from '@renderer/shared/api/recording'
import { getRoutinesApi, saveRoutineApi } from '@renderer/shared/api/routine'
import { getSettingsApi } from '@renderer/shared/api/settings'
import { getSummaryTemplatesApi } from '@renderer/shared/api/summaryTemplate'
import AssistantChatSection from './index'

const EMPTY_CHAT: AssistantChatState = {
  provider: null,
  sessionId: null,
  turns: [],
  isRunning: false
}

/** 채팅은 녹음 중인지만 본다 */
const IDLE_RECORDING = { meetingId: null, startedAt: null } as unknown as RecordingStateEvent

const statusOf = (overrides: Partial<AssistantStatus> = {}): AssistantStatus => ({
  folder: '/Users/me/notes',
  folderProblem: null,
  isGitRepo: true,
  permissionMode: 'acceptEdits',
  provider: 'claude-cli',
  isAutoOrganizeEnabled: true,
  ...overrides
})

const llmStatusOf = (claudeCliPath: string | null, codexCliPath: string | null = null) =>
  ({ claudeCliPath, codexCliPath }) as LlmStatus

const answeringChat: AssistantChatState = {
  provider: 'claude-cli',
  sessionId: 'session-1',
  isRunning: true,
  turns: [
    {
      id: 'q',
      role: 'user',
      text: '템플릿 만들어 줘',
      tools: [],
      changedFiles: [],
      error: null
    },
    {
      id: 'a',
      role: 'assistant',
      text: '만들었습니다.',
      tools: [{ id: 'toolu_1', name: 'Write', target: 'notes/template.md' }],
      changedFiles: ['notes/template.md', '/tmp/outside.md'],
      error: null
    }
  ]
}

const NO_ROUTINES: RoutinesState = { routines: [], runningId: null, queuedIds: [] }

const ROUTINE_BLOCK = [
  '평일 아침 9시에 이렇게 돌릴게요.',
  '',
  '```routine',
  JSON.stringify({
    name: '아침 브리핑',
    prompt: 'tasks.md에서 오늘 할 일을 골라 notes/today.md에 정리해 줘',
    schedule: { kind: 'time', weekdays: [1, 2, 3, 4, 5], time: '09:00' }
  }),
  '```'
].join('\n')

const chatAnswering = (text: string): AssistantChatState => ({
  ...answeringChat,
  isRunning: false,
  turns: answeringChat.turns.with(1, {
    ...answeringChat.turns[1],
    text,
    tools: [],
    changedFiles: []
  })
})

const pushState = (state: AssistantChatState) => {
  const listener = vi.mocked(onAssistantState).mock.calls.at(-1)?.[0]
  act(() => listener?.(state))
}

/** 녹음 상태 구독자를 잡아 두고 main이 보내는 이벤트를 직접 흘려보낸다 */
const recordingListeners: ((event: RecordingStateEvent) => void)[] = []
const pushRecording = (event: RecordingStateEvent) =>
  act(() => recordingListeners.forEach((listener) => listener(event)))

const renderChat = ({
  openPath = null,
  stoppedMeetingId
}: { openPath?: string | null; stoppedMeetingId?: string } = {}) => {
  const onOpenDocument = vi.fn()
  const onOpenRecord = vi.fn()
  render(
    <MemoryRouter initialEntries={[{ pathname: '/', state: { stoppedMeetingId } }]}>
      <AssistantChatSection
        openPath={openPath}
        onOpenDocument={onOpenDocument}
        onOpenRecord={onOpenRecord}
      />
    </MemoryRouter>
  )

  return { onOpenDocument, onOpenRecord }
}

const inputOf = () => screen.getByRole('textbox', { name: '질문' }) as HTMLTextAreaElement

const readyInput = async () => {
  const input = inputOf()
  await vi.waitFor(() => expect(input.disabled).toBe(false))

  return input
}

beforeEach(() => {
  recordingListeners.length = 0
  vi.mocked(onRecordingState).mockImplementation((listener) => {
    recordingListeners.push(listener)

    return () => {}
  })
  vi.mocked(getMeetingsApi).mockResolvedValue([])
  vi.mocked(searchMeetingsApi).mockResolvedValue([])
  vi.mocked(getSummaryTemplatesApi).mockResolvedValue([])
  vi.mocked(importMeetingAudioApi).mockResolvedValue({ meeting: null })
  vi.mocked(getAssistantStatusApi).mockResolvedValue(statusOf())
  vi.mocked(getAssistantStateApi).mockResolvedValue(EMPTY_CHAT)
  vi.mocked(getLlmStatusApi).mockResolvedValue(llmStatusOf('/Users/me/.local/bin/claude'))
  vi.mocked(getRecordingStateApi).mockResolvedValue(IDLE_RECORDING)
  vi.mocked(getSettingsApi).mockResolvedValue({
    recordingShortcut: 'Alt+Command+R',
    newChatShortcut: 'Command+N'
  } as AppSettings)
  vi.mocked(listWorkspaceFilesApi).mockResolvedValue(['a.md', 'notes/b.md'])
  vi.mocked(listAssistantSkillsApi).mockResolvedValue([
    { name: 'wiki-review', description: '복습할 위키 페이지를 고른다' }
  ])
  vi.mocked(sendAssistantMessageApi).mockResolvedValue(undefined)
  vi.mocked(cancelAssistantApi).mockResolvedValue(undefined)
  vi.mocked(controlRecordingApi).mockResolvedValue(undefined)
  vi.mocked(getRoutinesApi).mockResolvedValue(NO_ROUTINES)
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('AssistantChatSection', () => {
  it('작업 폴더가 없으면 설정 링크와 함께 안내하고 입력을 막는다', async () => {
    vi.mocked(getAssistantStatusApi).mockResolvedValue(statusOf({ folder: null }))
    renderChat()

    expect((await screen.findByRole('status')).textContent).toContain('작업 폴더를 먼저 고르세요')
    expect(screen.getByRole('link', { name: '설정 열기' })).toBeTruthy()
    expect(inputOf().disabled).toBe(true)
  })

  it('설치된 CLI가 없으면 설치를 안내한다', async () => {
    vi.mocked(getLlmStatusApi).mockResolvedValue(llmStatusOf(null))
    renderChat()

    expect((await screen.findByRole('status')).textContent).toContain('Claude Code CLI를 찾지')
  })

  it('설정의 에이전트가 Codex면 Codex로 보낸다', async () => {
    vi.mocked(getAssistantStatusApi).mockResolvedValue(statusOf({ provider: 'codex-cli' }))
    vi.mocked(getLlmStatusApi).mockResolvedValue(llmStatusOf(null, '/opt/homebrew/bin/codex'))
    renderChat()

    await userEvent.type(await readyInput(), '요약해 줘{Enter}')

    expect(sendAssistantMessageApi).toHaveBeenCalledWith({
      provider: 'codex-cli',
      text: '요약해 줘'
    })
  })

  it('Enter로 질문을 보내고 입력란을 비운다', async () => {
    renderChat()
    const input = await readyInput()

    await userEvent.type(input, '회의 메모 템플릿 만들어 줘{Enter}')

    expect(sendAssistantMessageApi).toHaveBeenCalledWith({
      provider: 'claude-cli',
      text: '회의 메모 템플릿 만들어 줘'
    })
    expect(input.value).toBe('')
  })

  it('한글 조합 중의 Enter와 Shift+Enter는 보내지 않는다', async () => {
    renderChat()
    const input = await readyInput()
    fireEvent.change(input, { target: { value: '안녕' } })

    fireEvent.keyDown(input, { key: 'Enter', isComposing: true })
    fireEvent.keyDown(input, { key: 'Enter', shiftKey: true })

    expect(sendAssistantMessageApi).not.toHaveBeenCalled()
  })

  it('도크 밖에는 기능 상자가 없고, / 명령으로 문서 열기·녹음 시작을 한다', async () => {
    const { onOpenDocument } = renderChat()
    const input = await readyInput()
    expect(screen.queryByRole('button', { name: /문서 열기/ })).toBeNull()

    await userEvent.type(input, '/')
    await userEvent.click(screen.getByRole('option', { name: /문서 열기/ }))
    expect(onOpenDocument).toHaveBeenCalledWith(null)

    await userEvent.type(input, '/')
    await userEvent.click(screen.getByRole('option', { name: /녹음 시작/ }))
    expect(controlRecordingApi).toHaveBeenCalledWith({ kind: 'start' })

    pushState({ ...answeringChat, isRunning: false })
    expect(screen.queryByRole('button', { name: /문서 열기/ })).toBeNull()
  })

  it('입력 도크의 마이크 버튼은 녹음을 켜고 끈다', async () => {
    renderChat()
    await readyInput()

    await userEvent.click(screen.getByRole('button', { name: '녹음 시작' }))

    expect(controlRecordingApi).toHaveBeenCalledWith({ kind: 'toggle' })
  })

  it('/ 로 명령과 스킬 메뉴를 열고, 거른 뒤 Enter로 고르면 스킬 이름이 입력된다', async () => {
    renderChat()
    const input = await readyInput()

    await userEvent.type(input, '/')
    const menu = screen.getByRole('listbox')
    expect(menu.textContent).toContain('녹음 시작')
    expect(menu.textContent).toContain('/wiki-review')

    await userEvent.type(input, 'wiki')
    expect(screen.getAllByRole('option')).toHaveLength(1)

    await userEvent.type(input, '{Enter}')
    expect(input.value).toBe('/wiki-review ')
    expect(screen.queryByRole('listbox')).toBeNull()
    expect(sendAssistantMessageApi).not.toHaveBeenCalled()
  })

  it('/ 메뉴에서 내장 명령을 고르면 바로 실행하고 입력을 비운다', async () => {
    const { onOpenDocument } = renderChat()
    const input = await readyInput()

    await userEvent.type(input, '/문서{Enter}')

    expect(onOpenDocument).toHaveBeenCalledWith(null)
    expect(input.value).toBe('')
  })

  it('새 대화 단축키 ⌘N을 누르면 대화를 비운다', async () => {
    vi.mocked(resetAssistantChatApi).mockResolvedValue(EMPTY_CHAT)
    renderChat()
    await readyInput()
    pushState(answeringChat)

    await userEvent.keyboard('{Meta>}n{/Meta}')

    await vi.waitFor(() => expect(resetAssistantChatApi).toHaveBeenCalled())
  })

  it('@ 로 작업 폴더의 파일과 폴더를 고른다', async () => {
    renderChat()
    const input = await readyInput()

    await userEvent.type(input, '정리해줘 @')
    const options = screen.getAllByRole('option').map((option) => option.textContent)
    expect(options.join('|')).toContain('notes/b.md')
    expect(options.join('|')).toContain('notes/폴더 전체를 붙여요')

    await userEvent.type(input, 'b.md{Enter}')
    expect(input.value).toBe('정리해줘 @notes/b.md ')
  })

  it('답변·도구·바뀐 파일을 그리고, 폴더 안의 마크다운만 칩으로 연다', async () => {
    const { onOpenDocument } = renderChat()
    await readyInput()

    pushState(answeringChat)

    expect(screen.getByText('만들었습니다.')).toBeTruthy()
    expect(screen.getByText('고침').textContent).toContain('notes/template.md')
    await userEvent.click(screen.getByRole('button', { name: 'notes/template.md 열기' }))
    expect(onOpenDocument).toHaveBeenCalledWith('notes/template.md')
    expect(screen.queryByRole('button', { name: /outside\.md/ })).toBeNull()
    expect(screen.getByText('/tmp/outside.md')).toBeTruthy()
  })

  it('답변 복사 버튼은 답변 원문을 한 번에 클립보드에 넣는다', async () => {
    renderChat()
    await readyInput()
    pushState({ ...answeringChat, isRunning: false })

    await userEvent.click(screen.getByRole('button', { name: '답변 복사' }))

    expect(writeClipboardTextApi).toHaveBeenCalledWith({ text: '만들었습니다.' })
    expect(screen.getByRole('button', { name: '복사했습니다' })).toBeTruthy()
  })

  it('열린 문서의 칩은 열림으로 보이고, 보낼 글 앞에 그 문서를 붙인다', async () => {
    renderChat({ openPath: 'notes/template.md' })
    const input = await readyInput()
    pushState({ ...answeringChat, isRunning: false })

    expect(
      (
        screen.getByRole('button', { name: 'notes/template.md 열림' }) as HTMLButtonElement
      ).getAttribute('aria-pressed')
    ).toBe('true')
    expect(input.placeholder).toBe('이 문서에 대해 묻기')

    await userEvent.type(input, '요약해 줘{Enter}')

    expect(sendAssistantMessageApi).toHaveBeenCalledWith({
      provider: 'claude-cli',
      text: '@notes/template.md 요약해 줘'
    })
  })

  it('실행 중에는 보내기 자리의 중지 버튼이 에이전트를 끝낸다', async () => {
    renderChat()
    await readyInput()
    pushState(answeringChat)

    expect(screen.getByRole('status').textContent).toContain('작업하는 중')
    await userEvent.click(screen.getByRole('button', { name: '중지' }))

    expect(cancelAssistantApi).toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: '보내기' })).toBeNull()
  })

  it('턴 오류를 보여 준다', async () => {
    renderChat()
    await readyInput()

    pushState({
      ...answeringChat,
      isRunning: false,
      turns: answeringChat.turns.with(1, { ...answeringChat.turns[1], error: '중지했습니다' })
    })

    expect(screen.getByRole('alert').textContent).toBe('중지했습니다')
  })

  it('녹음 중이면 시작 줄과 단축키 안내가 보이고, 품질 문제는 안내 자리에 대신 쓴다', async () => {
    renderChat()
    await readyInput()

    pushRecording({
      ...IDLE_RECORDING,
      meetingId: 'meeting-1',
      startedAt: new Date(2026, 9, 21, 14, 0).getTime()
    })

    expect(screen.getByText(/오후 2:00 · 녹음을 시작했어요/)).toBeTruthy()
    expect(screen.getByRole('status').textContent).toBe('창을 닫아도 녹음은 계속돼요 · ⌥⌘R')
    expect(
      (screen.getByRole('button', { name: '녹음 시작' }) as HTMLButtonElement).getAttribute(
        'aria-pressed'
      )
    ).toBe('true')

    pushRecording({
      ...IDLE_RECORDING,
      meetingId: 'meeting-1',
      startedAt: Date.now(),
      qualityIssue: 'silent'
    })

    expect(screen.getByRole('status').textContent).toContain('소리가 들어오지 않습니다')
  })

  it('녹음 시작이 실패하면 그 안내를 입력 도크 아래에 보여 준다', async () => {
    renderChat()
    await readyInput()

    pushRecording({ ...IDLE_RECORDING, errorMessage: '마이크 사용 권한이 없습니다' })

    expect(screen.getByRole('alert').textContent).toBe('마이크 사용 권한이 없습니다')
  })

  it('/ 명령 기록 찾기는 도크를 찾기 모드로 바꾸고, Enter로 찾은 결과를 누르면 전체 기록을 연다', async () => {
    const found = {
      id: 'meeting-9',
      title: '디자인 리뷰',
      createdAt: new Date(2026, 9, 20, 11, 0).getTime(),
      durationSec: 32 * 60,
      status: 'done' as const,
      hasAudio: false
    }
    vi.mocked(searchMeetingsApi).mockResolvedValue([
      {
        meeting: found,
        match: { utteranceId: 'u1', text: '색은 디자인 토큰으로만 쓴다', startSec: 842 }
      }
    ])
    const { onOpenRecord } = renderChat()
    const input = await readyInput()

    await userEvent.type(input, '/')
    await userEvent.click(screen.getByRole('option', { name: /기록 찾기/ }))
    expect(input.previousElementSibling?.textContent).toBe('기록 찾기')
    expect(input.placeholder).toBe('찾을 말을 적고 Enter')

    await userEvent.type(input, '토큰{Enter}')

    expect(sendAssistantMessageApi).not.toHaveBeenCalled()
    await vi.waitFor(() => expect(searchMeetingsApi).toHaveBeenCalledWith({ query: '토큰' }))
    expect(await screen.findByText("'토큰'이(가) 나온 기록이 1개 있어요.")).toBeTruthy()
    const hit = screen.getByRole('listitem')
    expect(hit.textContent).toContain('디자인 리뷰')
    expect(hit.textContent).toContain('14:02')
    expect(hit.querySelector('mark')?.textContent).toBe('토큰')

    await userEvent.click(hit)
    expect(onOpenRecord).toHaveBeenCalledWith('meeting-9')
  })

  it('찾기 모드는 Esc로 끈다', async () => {
    renderChat()
    const input = await readyInput()

    await userEvent.type(input, '/')
    await userEvent.click(screen.getByRole('option', { name: /기록 찾기/ }))
    await userEvent.type(input, '{Escape}')

    expect(input.placeholder).toBe('무엇을 도와드릴까요?')
  })

  it('앱을 켠 뒤 만든 기록은 카드로 보이고, 막 멈춘 기록 위에는 멈췄어요 줄이 붙는다', async () => {
    const createdAt = new Date(2026, 9, 21, 14, 0).getTime()
    const meeting = {
      id: 'meeting-1',
      title: '주간 제품 회의',
      createdAt: Date.now(),
      durationSec: 48 * 60,
      status: 'done' as const,
      hasAudio: false
    }
    vi.mocked(getMeetingsApi).mockResolvedValue([
      meeting,
      { ...meeting, id: 'old', title: '지난 회의', createdAt: createdAt - 86_400_000 }
    ])
    vi.mocked(getMeetingApi).mockResolvedValue({
      meeting,
      utterances: [],
      speakers: [],
      refineResult: null,
      note: ''
    })
    renderChat({ stoppedMeetingId: 'meeting-1' })

    expect(await screen.findByRole('article', { name: '기록 주간 제품 회의' })).toBeTruthy()
    expect(screen.getByText(/녹음을 멈췄어요/)).toBeTruthy()
    expect(screen.queryByText('지난 회의')).toBeNull()
  })

  it('/ 명령 파일로 기록 만들기는 파일을 고르게 하고 실패를 도크 위에 알린다', async () => {
    vi.mocked(importMeetingAudioApi).mockRejectedValue(new Error('지원하지 않는 형식입니다'))
    renderChat()
    const input = await readyInput()

    await userEvent.type(input, '/')
    await userEvent.click(screen.getByRole('option', { name: /파일로 기록 만들기/ }))

    expect(importMeetingAudioApi).toHaveBeenCalled()
    expect((await screen.findByRole('alert')).textContent).toBe('지원하지 않는 형식입니다')
  })

  it('/ 명령 루틴 만들기는 정해진 첫 메시지를 에이전트에게 보낸다', async () => {
    renderChat()
    const input = await readyInput()

    await userEvent.type(input, '/')
    await userEvent.click(screen.getByRole('option', { name: /루틴 만들기/ }))

    expect(sendAssistantMessageApi).toHaveBeenCalledWith({
      provider: 'claude-cli',
      text: '루틴을 만들고 싶어. 무엇을 언제 자동으로 할지 물어보면서 같이 정해 줘.'
    })
    expect(input.value).toBe('')
  })

  it('답변의 루틴 제안은 카드로 보이고, 루틴 추가를 누르면 저장한 뒤 추가했어요로 바뀐다', async () => {
    vi.mocked(saveRoutineApi).mockResolvedValue(NO_ROUTINES)
    renderChat()
    await readyInput()
    pushState(chatAnswering(ROUTINE_BLOCK))

    const card = await screen.findByRole('region', { name: '루틴 제안' })
    expect(card.textContent).toContain('아침 브리핑')
    expect(card.textContent).toContain('평일 09:00')
    expect(screen.getByText('평일 아침 9시에 이렇게 돌릴게요.')).toBeTruthy()
    expect(screen.queryByText(/```routine/)).toBeNull()

    await userEvent.click(screen.getByRole('button', { name: '루틴 추가' }))
    expect(saveRoutineApi).toHaveBeenCalledWith({
      id: null,
      name: '아침 브리핑',
      prompt: 'tasks.md에서 오늘 할 일을 골라 notes/today.md에 정리해 줘',
      schedule: { kind: 'time', weekdays: [1, 2, 3, 4, 5], time: '09:00' },
      isEnabled: true
    })

    // main이 저장 뒤 routines:changed로 새 목록을 보낸다
    const listener = vi.mocked(onRoutinesChanged).mock.calls.at(-1)?.[0]
    act(() =>
      listener?.({
        ...NO_ROUTINES,
        routines: [
          {
            id: 'r1',
            name: '아침 브리핑',
            prompt: 'tasks.md에서 오늘 할 일을 골라 notes/today.md에 정리해 줘',
            schedule: { kind: 'time', weekdays: [1, 2, 3, 4, 5], time: '09:00' },
            isEnabled: true,
            anchorAt: 0,
            lastRun: null
          }
        ]
      })
    )
    expect(screen.queryByRole('button', { name: '루틴 추가' })).toBeNull()
    expect(card.textContent).toContain('추가했어요')
  })

  it('형식이 틀린 루틴 제안은 추가 버튼 대신 이유를 보여 주고, 닫히지 않은 블록은 숨긴다', async () => {
    renderChat()
    await readyInput()

    pushState(chatAnswering('이렇게요.\n\n```routine\n{"name": "아침'))
    expect(screen.getByText('이렇게요.')).toBeTruthy()
    expect(screen.queryByText(/아침/)).toBeNull()

    const tooOften = JSON.stringify({
      name: '확인',
      prompt: '메일 확인',
      schedule: { kind: 'interval', minutes: 5 }
    })
    pushState(chatAnswering(`이렇게요.\n\n\`\`\`routine\n${tooOften}\n\`\`\``))
    expect(screen.getByRole('alert').textContent).toContain('주기가 올바르지 않습니다')
    expect(screen.queryByRole('button', { name: '루틴 추가' })).toBeNull()
  })
})

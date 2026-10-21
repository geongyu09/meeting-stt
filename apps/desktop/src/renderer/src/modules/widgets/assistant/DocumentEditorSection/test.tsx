// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import type { WorkspaceFilesChangedEvent } from '@shared/ipc'
import type { AssistantStatus } from '@shared/types'

vi.mock('@renderer/shared/api/assistant', () => ({
  getAssistantStatusApi: vi.fn(),
  listWorkspaceFilesApi: vi.fn(),
  readWorkspaceFileApi: vi.fn(),
  writeWorkspaceFileApi: vi.fn()
}))
vi.mock('@renderer/shared/api/events', () => ({
  onWorkspaceFilesChanged: vi.fn(() => () => {})
}))

import {
  getAssistantStatusApi,
  listWorkspaceFilesApi,
  readWorkspaceFileApi,
  writeWorkspaceFileApi
} from '@renderer/shared/api/assistant'
import { onWorkspaceFilesChanged } from '@renderer/shared/api/events'
import DocumentEditorSection from './index'

const STATUS: AssistantStatus = {
  folder: '/Users/me/notes',
  folderProblem: null,
  isGitRepo: true,
  permissionMode: 'acceptEdits',
  provider: 'claude-cli'
}

/** 디스크 역할. 읽기·쓰기 목이 이 객체를 본다 */
let disk: Record<string, string> = {}

const onClose = vi.fn()

/** 페이지처럼 열린 경로를 든다 */
function Harness({ initialPath = null }: { initialPath?: string | null }) {
  const [openPath, setOpenPath] = useState<string | null>(initialPath)

  return (
    <DocumentEditorSection openPath={openPath} onOpenPathChange={setOpenPath} onClose={onClose} />
  )
}

/** 목록 훅과 에디터 훅이 같은 이벤트를 따로 구독한다. 살아 있는 구독 전부에 보낸다 */
const notifyChanged = async (event: WorkspaceFilesChangedEvent) => {
  const listeners = vi.mocked(onWorkspaceFilesChanged).mock.calls.map(([listener]) => listener)
  await act(async () => listeners.forEach((listener) => listener(event)))
}

const editorOf = (path: string) =>
  screen.findByRole('textbox', { name: `${path} 편집` }) as Promise<HTMLTextAreaElement>

beforeEach(() => {
  disk = { 'a.md': '# A', 'notes/b.md': '# B' }
  vi.mocked(getAssistantStatusApi).mockResolvedValue(STATUS)
  vi.mocked(listWorkspaceFilesApi).mockImplementation(async () => Object.keys(disk).sort())
  vi.mocked(readWorkspaceFileApi).mockImplementation(async ({ path }) => ({
    path,
    content: disk[path]
  }))
  vi.mocked(writeWorkspaceFileApi).mockImplementation(async ({ path, content }) => {
    disk[path] = content
  })
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('DocumentEditorSection', () => {
  it('목록에서 문서를 고르면 열고, 고쳐서 ⌘S로 저장한다', async () => {
    render(<Harness />)
    const select = await screen.findByRole('combobox', { name: '열린 문서' })
    await screen.findByRole('option', { name: 'notes/b.md' })

    await userEvent.selectOptions(select, 'notes/b.md')
    const editor = await editorOf('notes/b.md')
    expect(editor.value).toBe('# B')

    fireEvent.change(editor, { target: { value: '# B 고침' } })
    expect(screen.getByRole('status').textContent).toBe('저장하지 않은 변경이 있습니다')
    fireEvent.keyDown(editor, { key: 's', metaKey: true })

    await vi.waitFor(() => expect(disk['notes/b.md']).toBe('# B 고침'))
    expect((await screen.findByRole('status')).textContent).toBe('저장했습니다')
  })

  it('편집 중이 아니면 에이전트가 고친 내용을 바로 보여 준다', async () => {
    render(<Harness initialPath="a.md" />)
    await editorOf('a.md')

    disk['a.md'] = '# A 에이전트'
    await notifyChanged({ paths: ['a.md'] })

    await vi.waitFor(async () => expect((await editorOf('a.md')).value).toBe('# A 에이전트'))
  })

  it('편집 중에 바뀌면 덮어쓰지 않고 알리며, 다시 읽기를 누르면 새 내용을 연다', async () => {
    render(<Harness initialPath="a.md" />)
    fireEvent.change(await editorOf('a.md'), { target: { value: '# A 내 편집' } })

    disk['a.md'] = '# A 에이전트'
    await notifyChanged({ paths: ['a.md'] })

    expect(await screen.findByText('다른 곳에서 이 파일이 바뀌었습니다.')).toBeTruthy()
    expect((await editorOf('a.md')).value).toBe('# A 내 편집')

    await userEvent.click(screen.getByRole('button', { name: '다시 읽기' }))
    await vi.waitFor(async () => expect((await editorOf('a.md')).value).toBe('# A 에이전트'))
  })

  it('앱이 저장한 직후의 감시 이벤트는 외부 변경으로 보지 않는다', async () => {
    render(<Harness initialPath="a.md" />)
    const editor = await editorOf('a.md')
    fireEvent.change(editor, { target: { value: '# A 저장' } })
    await userEvent.click(screen.getByRole('button', { name: '저장' }))
    await vi.waitFor(() => expect(disk['a.md']).toBe('# A 저장'))

    fireEvent.change(editor, { target: { value: '# A 저장 후 또 편집' } })
    await notifyChanged({ paths: ['a.md'] })

    expect(screen.queryByText('다른 곳에서 이 파일이 바뀌었습니다.')).toBeNull()
  })

  it('저장했습니다 표시는 저장한 문서에만 남는다', async () => {
    render(<Harness initialPath="a.md" />)
    fireEvent.change(await editorOf('a.md'), { target: { value: '# A 저장' } })
    await userEvent.click(screen.getByRole('button', { name: '저장' }))
    expect((await screen.findByRole('status')).textContent).toBe('저장했습니다')
    await screen.findByRole('option', { name: 'notes/b.md' })

    await userEvent.selectOptions(screen.getByRole('combobox', { name: '열린 문서' }), 'notes/b.md')
    await editorOf('notes/b.md')

    expect(screen.queryByText('저장했습니다')).toBeNull()
  })

  it('다른 문서로 바꾸면 저장하지 않은 변경을 저장한다', async () => {
    render(<Harness initialPath="a.md" />)
    fireEvent.change(await editorOf('a.md'), { target: { value: '# A 바꾸기 전' } })
    await screen.findByRole('option', { name: 'notes/b.md' })

    await userEvent.selectOptions(screen.getByRole('combobox', { name: '열린 문서' }), 'notes/b.md')

    await vi.waitFor(() => expect(disk['a.md']).toBe('# A 바꾸기 전'))
    expect((await editorOf('notes/b.md')).value).toBe('# B')
  })

  it('닫기 버튼은 페이지에 패널을 닫으라고 알린다', async () => {
    render(<Harness initialPath="a.md" />)
    await editorOf('a.md')

    await userEvent.click(screen.getByRole('button', { name: '문서 닫기' }))

    expect(onClose).toHaveBeenCalled()
  })

  it('작업 폴더에 문서가 없으면 그렇게 알린다', async () => {
    disk = {}
    render(<Harness />)

    expect(await screen.findByText('작업 폴더에 마크다운 문서가 없습니다')).toBeTruthy()
  })
})

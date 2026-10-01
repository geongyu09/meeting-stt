// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DEFAULT_SUMMARY_TEMPLATE } from '@shared/summaryTemplate'
import type { SummaryTemplate } from '@shared/types'

vi.mock('@renderer/shared/api/summaryTemplate', () => ({
  getSummaryTemplatesApi: vi.fn(),
  saveSummaryTemplateApi: vi.fn(),
  deleteSummaryTemplateApi: vi.fn()
}))

import {
  deleteSummaryTemplateApi,
  getSummaryTemplatesApi,
  saveSummaryTemplateApi
} from '@renderer/shared/api/summaryTemplate'
import SummaryTemplateEditorSection from './index'

const WEEKLY: SummaryTemplate = {
  id: 'weekly',
  name: '주간 회의',
  blocks: [
    { kind: 'oneLine', heading: '한 줄 요약' },
    { kind: 'decisions', heading: '결정 사항' }
  ],
  isBuiltIn: false
}

const renderSection = async (templates: SummaryTemplate[] = [DEFAULT_SUMMARY_TEMPLATE]) => {
  vi.mocked(getSummaryTemplatesApi).mockResolvedValue(templates)

  await act(async () => {
    render(<SummaryTemplateEditorSection />)
  })
}

/** 미리보기는 줄바꿈이 뜻을 가지므로 공백을 접지 않고 찾는다 */
const getPreview = (pattern: RegExp) =>
  screen.getByText(pattern, { selector: 'pre', normalizer: (text) => text })

const stackedHeadings = () =>
  within(screen.getByRole('list', { name: '쌓인 블록' }))
    .getAllByRole('textbox', { name: /제목$/ })
    .map((input) => (input as HTMLInputElement).value)

/** happy-dom에는 끌기 데이터가 없어 필요한 만큼만 흉내 낸다. 한 번의 끌기 동안 같은 객체를 넘긴다 */
const createDataTransfer = () => {
  const data = new Map<string, string>()
  return {
    get types() {
      return [...data.keys()]
    },
    getData: (type: string) => data.get(type) ?? '',
    setData: (type: string, value: string) => data.set(type, value),
    setDragImage: () => undefined,
    effectAllowed: 'all',
    dropEffect: 'none'
  }
}

const stackList = () => screen.getByRole('list', { name: '쌓인 블록' })
const stackItems = () => within(stackList()).getAllByRole('listitem')
const dropZone = () => stackList().parentElement as HTMLElement

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('SummaryTemplateEditorSection', () => {
  it('기본 템플릿은 결과 모양만 보여 주고 복제만 할 수 있다', async () => {
    await renderSection()

    expect(screen.getByText(/기본 템플릿은 고칠 수 없습니다/)).toBeTruthy()
    expect(getPreview(/^## 핵심 요약\n- …/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: '저장' })).toBeNull()
    expect(screen.getByRole('button', { name: '복제해서 만들기' })).toBeTruthy()
  })

  it('블록을 쌓아 새 템플릿을 저장한다', async () => {
    await renderSection()
    vi.mocked(saveSummaryTemplateApi).mockResolvedValue([
      DEFAULT_SUMMARY_TEMPLATE,
      {
        id: 'new-id',
        name: '주간',
        blocks: [{ kind: 'topics', heading: '논의 사항' }],
        isBuiltIn: false
      }
    ])

    await userEvent.click(screen.getByRole('button', { name: '새 템플릿' }))
    const nameInput = screen.getByRole('textbox', { name: '템플릿 이름' })
    await userEvent.clear(nameInput)
    await userEvent.type(nameInput, '주간')
    await userEvent.click(screen.getByRole('button', { name: '논의 사항 블록 추가' }))

    // 같은 종류는 한 번만 넣는다
    expect(
      screen.getByRole('button', { name: '논의 사항 블록 추가' }).hasAttribute('disabled')
    ).toBe(true)

    await userEvent.click(screen.getByRole('button', { name: '저장' }))

    expect(vi.mocked(saveSummaryTemplateApi)).toHaveBeenCalledWith({
      id: undefined,
      name: '주간',
      blocks: [{ kind: 'topics', heading: '논의 사항' }]
    })
    expect(screen.getByText('"주간" 템플릿을 저장했습니다')).toBeTruthy()
    expect(screen.getByRole('button', { name: '주간' }).getAttribute('aria-pressed')).toBe('true')
  })

  it('블록이 없으면 저장하지 않고 안내한다', async () => {
    await renderSection()

    await userEvent.click(screen.getByRole('button', { name: '새 템플릿' }))
    await userEvent.click(screen.getByRole('button', { name: '저장' }))

    expect(screen.getByRole('alert').textContent).toContain('블록을 하나 이상')
    expect(vi.mocked(saveSummaryTemplateApi)).not.toHaveBeenCalled()
  })

  it('↑↓ 버튼으로 순서를 바꾸고 미리보기에 반영한다', async () => {
    await renderSection([DEFAULT_SUMMARY_TEMPLATE, WEEKLY])

    await userEvent.click(screen.getByRole('button', { name: '주간 회의' }))
    expect(stackedHeadings()).toEqual(['한 줄 요약', '결정 사항'])
    expect(screen.getByRole('button', { name: '블록 1 위로' }).hasAttribute('disabled')).toBe(true)

    await userEvent.click(screen.getByRole('button', { name: '블록 2 위로' }))

    expect(stackedHeadings()).toEqual(['결정 사항', '한 줄 요약'])
    expect(getPreview(/^## 결정 사항\n- …\n\n## 한 줄 요약/)).toBeTruthy()
    expect(screen.getByText('저장하지 않은 변경이 있습니다')).toBeTruthy()
  })

  it('제목을 고치고 직접 적기 블록의 설명을 적어 저장한다', async () => {
    await renderSection([DEFAULT_SUMMARY_TEMPLATE, WEEKLY])
    vi.mocked(saveSummaryTemplateApi).mockResolvedValue([DEFAULT_SUMMARY_TEMPLATE, WEEKLY])

    await userEvent.click(screen.getByRole('button', { name: '주간 회의' }))
    const heading = screen.getByRole('textbox', { name: '블록 1 제목' })
    await userEvent.clear(heading)
    await userEvent.type(heading, '오늘 한 줄')
    await userEvent.click(screen.getByRole('button', { name: '직접 적기 블록 추가' }))
    await userEvent.type(screen.getByRole('textbox', { name: '블록 3 설명' }), '다음 회의 안건')
    await userEvent.click(screen.getByRole('button', { name: '저장' }))

    expect(vi.mocked(saveSummaryTemplateApi)).toHaveBeenCalledWith({
      id: 'weekly',
      name: '주간 회의',
      blocks: [
        { kind: 'oneLine', heading: '오늘 한 줄' },
        { kind: 'decisions', heading: '결정 사항' },
        { kind: 'custom', heading: '추가 항목', description: '다음 회의 안건' }
      ]
    })
  })

  it('블록 모음에서 끌어 놓은 자리에 블록이 들어간다', async () => {
    await renderSection([DEFAULT_SUMMARY_TEMPLATE, WEEKLY])
    await userEvent.click(screen.getByRole('button', { name: '주간 회의' }))

    const dataTransfer = createDataTransfer()
    fireEvent.dragStart(screen.getByRole('button', { name: '논의 사항 블록 추가' }), {
      dataTransfer
    })
    // 첫 블록의 위쪽 절반 위 → 첫 블록 앞
    fireEvent.dragOver(stackItems()[0], { dataTransfer })
    fireEvent.drop(stackItems()[0], { dataTransfer })

    expect(stackedHeadings()).toEqual(['논의 사항', '한 줄 요약', '결정 사항'])
    expect(
      screen.getByRole('button', { name: '논의 사항 블록 추가' }).hasAttribute('disabled')
    ).toBe(true)
  })

  it('블록 사이가 아닌 빈 곳에 놓으면 맨 아래에 붙는다', async () => {
    await renderSection([DEFAULT_SUMMARY_TEMPLATE, WEEKLY])
    await userEvent.click(screen.getByRole('button', { name: '주간 회의' }))

    const dataTransfer = createDataTransfer()
    fireEvent.dragStart(screen.getByRole('button', { name: '주요 발언 블록 추가' }), {
      dataTransfer
    })
    fireEvent.dragOver(dropZone(), { dataTransfer })
    fireEvent.drop(dropZone(), { dataTransfer })

    expect(stackedHeadings()).toEqual(['한 줄 요약', '결정 사항', '주요 발언'])
  })

  it('비어 있는 놓는 곳에도 끌어 넣을 수 있다', async () => {
    await renderSection()
    await userEvent.click(screen.getByRole('button', { name: '새 템플릿' }))

    const zone = screen.getByText(/블록을 끌어다 여기에 놓아/).parentElement as HTMLElement
    const dataTransfer = createDataTransfer()
    fireEvent.dragStart(screen.getByRole('button', { name: '결정 사항 블록 추가' }), {
      dataTransfer
    })
    fireEvent.dragOver(zone, { dataTransfer })
    fireEvent.drop(zone, { dataTransfer })

    expect(stackedHeadings()).toEqual(['결정 사항'])
  })

  it('쌓인 블록의 손잡이를 끌어 순서를 바꾼다', async () => {
    await renderSection([DEFAULT_SUMMARY_TEMPLATE, WEEKLY])
    await userEvent.click(screen.getByRole('button', { name: '주간 회의' }))

    const dataTransfer = createDataTransfer()
    const handle = stackItems()[0].querySelector('[draggable="true"]') as HTMLElement
    fireEvent.dragStart(handle, { dataTransfer })
    fireEvent.dragOver(dropZone(), { dataTransfer })
    fireEvent.drop(dropZone(), { dataTransfer })
    fireEvent.dragEnd(handle, { dataTransfer })

    expect(stackedHeadings()).toEqual(['결정 사항', '한 줄 요약'])
  })

  it('앱 밖에서 끌어온 것은 받지 않는다', async () => {
    await renderSection([DEFAULT_SUMMARY_TEMPLATE, WEEKLY])
    await userEvent.click(screen.getByRole('button', { name: '주간 회의' }))

    const dataTransfer = createDataTransfer()
    dataTransfer.setData('text/plain', 'decisions')
    fireEvent.dragOver(dropZone(), { dataTransfer })
    fireEvent.drop(dropZone(), { dataTransfer })

    expect(stackedHeadings()).toEqual(['한 줄 요약', '결정 사항'])
  })

  it('블록을 빼면 목록에서 사라진다', async () => {
    await renderSection([DEFAULT_SUMMARY_TEMPLATE, WEEKLY])

    await userEvent.click(screen.getByRole('button', { name: '주간 회의' }))
    await userEvent.click(screen.getByRole('button', { name: '블록 1 빼기' }))

    expect(stackedHeadings()).toEqual(['결정 사항'])
  })

  it('블록이 많으면 로컬 모델 안내를 보인다', async () => {
    await renderSection()

    await userEvent.click(screen.getByRole('button', { name: '새 템플릿' }))
    for (const name of [
      '한 줄 요약',
      '핵심 요약',
      '논의 사항',
      '결정 사항',
      '다음 할 일',
      '주요 발언'
    ]) {
      await userEvent.click(screen.getByRole('button', { name: `${name} 블록 추가` }))
    }
    expect(screen.queryByText(/로컬 모델은 블록이 많으면/)).toBeNull()

    await userEvent.click(screen.getByRole('button', { name: '숫자 · 일정 블록 추가' }))

    expect(screen.getByText(/로컬 모델은 블록이 많으면/)).toBeTruthy()
  })

  it('삭제는 한 번 더 확인한 뒤 지운다', async () => {
    await renderSection([DEFAULT_SUMMARY_TEMPLATE, WEEKLY])
    vi.mocked(deleteSummaryTemplateApi).mockResolvedValue([DEFAULT_SUMMARY_TEMPLATE])

    await userEvent.click(screen.getByRole('button', { name: '주간 회의' }))
    await userEvent.click(screen.getByRole('button', { name: '삭제' }))

    expect(vi.mocked(deleteSummaryTemplateApi)).not.toHaveBeenCalled()

    await userEvent.click(screen.getByRole('button', { name: '정말 삭제' }))

    expect(vi.mocked(deleteSummaryTemplateApi)).toHaveBeenCalledWith({ id: 'weekly' })
    expect(screen.queryByRole('button', { name: '주간 회의' })).toBeNull()
    expect(screen.getByText('"주간 회의" 템플릿을 삭제했습니다')).toBeTruthy()
  })

  it('기본 템플릿을 복제하면 같은 블록으로 새 템플릿 편집을 시작한다', async () => {
    await renderSection()

    await userEvent.click(screen.getByRole('button', { name: '복제해서 만들기' }))

    expect((screen.getByRole('textbox', { name: '템플릿 이름' }) as HTMLInputElement).value).toBe(
      '기본 복사본'
    )
    expect(stackedHeadings()).toEqual(['핵심 요약', '결정 사항', '다음 할 일'])
  })

  it('저장 실패는 main의 안내 문구를 보여 준다', async () => {
    await renderSection([DEFAULT_SUMMARY_TEMPLATE, WEEKLY])
    vi.mocked(saveSummaryTemplateApi).mockRejectedValue(
      new Error('같은 이름의 템플릿이 이미 있습니다')
    )

    await userEvent.click(screen.getByRole('button', { name: '복제해서 만들기' }))
    await userEvent.click(screen.getByRole('button', { name: '저장' }))

    expect(screen.getByRole('alert').textContent).toBe('같은 이름의 템플릿이 이미 있습니다')
  })
})

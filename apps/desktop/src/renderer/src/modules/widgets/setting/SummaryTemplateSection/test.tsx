// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router'
import { DEFAULT_SUMMARY_TEMPLATE } from '@shared/summaryTemplate'
import type { SummaryTemplate } from '@shared/types'
import { PATHS } from '@renderer/shared/routes/paths'

vi.mock('@renderer/shared/api/summaryTemplate', () => ({
  getSummaryTemplatesApi: vi.fn()
}))

import { getSummaryTemplatesApi } from '@renderer/shared/api/summaryTemplate'
import SummaryTemplateSection from './index'

const WEEKLY: SummaryTemplate = {
  id: 'weekly',
  name: '주간 회의',
  blocks: [{ kind: 'oneLine', heading: '한 줄 요약' }],
  isBuiltIn: false
}

function GoBack() {
  const navigate = useNavigate()
  return (
    <button type="button" onClick={() => navigate(-1)}>
      뒤로
    </button>
  )
}

const renderSection = async (templates: SummaryTemplate[]) => {
  vi.mocked(getSummaryTemplatesApi).mockResolvedValue(templates)

  await act(async () => {
    render(
      <MemoryRouter initialEntries={[PATHS.assistant, PATHS.settings]} initialIndex={1}>
        <Routes>
          <Route path={PATHS.assistant} element={<p>채팅</p>} />
          <Route path={PATHS.settings} element={<SummaryTemplateSection />} />
          <Route
            path={PATHS.summaryTemplates}
            element={
              <>
                <p>편집 페이지</p>
                <GoBack />
              </>
            }
          />
        </Routes>
      </MemoryRouter>
    )
  })
}

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('SummaryTemplateSection', () => {
  it('만든 템플릿 수를 보여 준다', async () => {
    await renderSection([DEFAULT_SUMMARY_TEMPLATE, WEEKLY])

    expect(screen.getByText('내가 만든 템플릿 1개')).toBeTruthy()
  })

  it('템플릿 관리를 누르면 편집 페이지로 이동한다', async () => {
    await renderSection([DEFAULT_SUMMARY_TEMPLATE])

    await userEvent.click(screen.getByRole('button', { name: '템플릿 관리' }))

    expect(screen.getByText('편집 페이지')).toBeTruthy()
  })

  it('편집 페이지는 설정 자리를 대신해 뒤로 가면 설정을 열기 전 화면으로 간다', async () => {
    await renderSection([DEFAULT_SUMMARY_TEMPLATE])

    await userEvent.click(screen.getByRole('button', { name: '템플릿 관리' }))
    await userEvent.click(screen.getByRole('button', { name: '뒤로' }))

    expect(screen.getByText('채팅')).toBeTruthy()
  })
})

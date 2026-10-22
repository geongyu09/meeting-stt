// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider, useNavigate } from 'react-router'

vi.mock('@renderer/shared/api/events', () => ({
  onRecordingState: vi.fn(() => () => {})
}))

import { MainWindowLayout } from './layout'
import { PATHS } from './paths'

function GoBack() {
  const navigate = useNavigate()
  return (
    <button type="button" onClick={() => navigate(-1)}>
      뒤로
    </button>
  )
}

const renderLayout = (initialEntries: string[]) => {
  const router = createMemoryRouter(
    [
      {
        element: <MainWindowLayout />,
        children: [
          { path: PATHS.assistant, element: <p>채팅</p> },
          { path: PATHS.settings, element: <GoBack /> },
          { path: PATHS.recordings, element: <p>녹음 파일</p> }
        ]
      }
    ],
    { initialEntries, initialIndex: initialEntries.length - 1 }
  )
  render(<RouterProvider router={router} />)
}

afterEach(() => {
  cleanup()
})

describe('MainWindowLayout ⌘,', () => {
  it('채팅에서 ⌘,를 누르면 설정이 열리고 닫으면 채팅으로 돌아간다', async () => {
    const user = userEvent.setup()
    renderLayout([PATHS.assistant])

    await user.keyboard('{Meta>}[Comma]{/Meta}')
    await user.click(screen.getByRole('button', { name: '뒤로' }))

    expect(screen.getByText('채팅')).toBeTruthy()
  })

  it('하위 화면에서 연 설정을 닫으면 하위 화면이 아니라 채팅으로 간다', async () => {
    const user = userEvent.setup()
    renderLayout([PATHS.assistant, PATHS.recordings])

    await user.keyboard('{Meta>}[Comma]{/Meta}')
    await user.click(screen.getByRole('button', { name: '뒤로' }))

    expect(screen.getByText('채팅')).toBeTruthy()
  })

  it('입력 중에 막힌(preventDefault) 키는 무시한다', async () => {
    renderLayout([PATHS.assistant])

    await act(async () => {
      const event = new KeyboardEvent('keydown', { code: 'Comma', metaKey: true, cancelable: true })
      event.preventDefault()
      window.dispatchEvent(event)
    })

    expect(screen.getByText('채팅')).toBeTruthy()
  })
})

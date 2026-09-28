// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('@renderer/shared/api/feedback', () => ({
  openFeedbackApi: vi.fn()
}))

import { openFeedbackApi } from '@renderer/shared/api/feedback'
import FeedbackButton from './index'

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('FeedbackButton', () => {
  it('누르면 이슈 작성 화면을 연다', async () => {
    const user = userEvent.setup()
    vi.mocked(openFeedbackApi).mockResolvedValue(undefined)
    render(<FeedbackButton />)

    await user.click(screen.getByRole('button', { name: 'GitHub에서 작성' }))

    expect(openFeedbackApi).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('열지 못하면 안내를 보여 주고, 다시 누를 수 있다', async () => {
    const user = userEvent.setup()
    vi.mocked(openFeedbackApi).mockRejectedValueOnce(new Error('실패'))
    render(<FeedbackButton />)

    await user.click(screen.getByRole('button', { name: 'GitHub에서 작성' }))
    expect(screen.getByRole('alert').textContent).toBe(
      '브라우저를 열지 못했습니다. 잠시 후 다시 시도해 주세요'
    )

    vi.mocked(openFeedbackApi).mockResolvedValueOnce(undefined)
    await user.click(screen.getByRole('button', { name: 'GitHub에서 작성' }))
    expect(screen.queryByRole('alert')).toBeNull()
  })
})

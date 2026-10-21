// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'

import Markdown from './index'

afterEach(cleanup)

describe('Markdown', () => {
  it('마크다운을 요소로 그리고 링크는 새 창으로 보낸다', () => {
    const { container } = render(
      <Markdown
        text={'## 제목\n\n**굵게** [문서](https://example.com)\n\n| a | b |\n| - | - |\n| 1 | 2 |'}
      />
    )

    expect(screen.getByRole('heading', { level: 2 }).textContent).toBe('제목')
    expect(container.querySelector('strong')?.textContent).toBe('굵게')
    expect(container.querySelector('td')?.textContent).toBe('1')
    const link = screen.getByRole('link', { name: '문서' })
    expect(link.getAttribute('href')).toBe('https://example.com')
    expect(link.getAttribute('target')).toBe('_blank')
  })

  it('생 HTML은 실행하지 않는다', () => {
    const { container } = render(<Markdown text={'<img src=x onerror="alert(1)">'} />)

    expect(container.querySelector('img')).toBeNull()
  })
})

import { describe, expect, it } from 'vitest'
import { parseSkillFrontmatter } from './skillFrontmatter'

describe('parseSkillFrontmatter', () => {
  it('name과 description을 꺼내고 따옴표를 벗긴다', () => {
    const text =
      '---\nname: wiki-review\ndescription: "망각 점수로 복습할 페이지를 고른다"\n---\n# 본문\n'

    expect(parseSkillFrontmatter(text)).toEqual({
      name: 'wiki-review',
      description: '망각 점수로 복습할 페이지를 고른다'
    })
  })

  it('접은 블록 스칼라 description은 들여쓴 줄을 공백으로 잇는다', () => {
    const text = '---\nname: a\ndescription: >\n  첫 줄\n  둘째 줄\nversion: 1\n---\n'

    expect(parseSkillFrontmatter(text).description).toBe('첫 줄 둘째 줄')
  })

  it('머리말이 없거나 키가 없으면 name은 null, description은 빈 문자열이다', () => {
    expect(parseSkillFrontmatter('# 제목만')).toEqual({ name: null, description: '' })
    expect(parseSkillFrontmatter('---\ndescription: 설명\n---\n')).toEqual({
      name: null,
      description: '설명'
    })
  })
})

import { describe, expect, it } from 'vitest'

import {
  autoTitleOf,
  buildTitlePrompt,
  cleanTitleTopic,
  clipTitleInput,
  isDefaultTitle,
  TITLE_INPUT_MAX_CHARS,
  TITLE_TOPIC_MAX_CHARS
} from './autoTitle'

const CREATED_AT = new Date(2026, 9, 21, 14, 30).getTime()

describe('clipTitleInput', () => {
  it('짧으면 그대로 둔다', () => {
    expect(clipTitleInput('짧은 전사')).toBe('짧은 전사')
  })

  it('길면 처음·가운데·끝을 3분의 1씩 남긴다', () => {
    const transcript = `${'가'.repeat(5000)}${'나'.repeat(5000)}${'다'.repeat(5000)}`
    const [head, middle, tail] = clipTitleInput(transcript).split('\n…\n')
    const partChars = Math.floor(TITLE_INPUT_MAX_CHARS / 3)

    expect(head).toBe('가'.repeat(partChars))
    expect(middle).toBe('나'.repeat(partChars))
    expect(tail).toBe('다'.repeat(partChars))
  })
})

describe('buildTitlePrompt', () => {
  it('노트가 있으면 전사본 앞에 둔다', () => {
    const prompt = buildTitlePrompt({ transcript: '배포는 금요일', note: '  안건: 배포  ' })

    expect(prompt).toBe('## 노트\n\n안건: 배포\n\n## 전사본\n\n배포는 금요일')
  })

  it('노트가 비면 전사본만 넣는다', () => {
    expect(buildTitlePrompt({ transcript: '배포는 금요일', note: ' ' })).toBe(
      '## 전사본\n\n배포는 금요일'
    )
  })
})

describe('cleanTitleTopic', () => {
  it('제목 표시·따옴표·끝 마침표를 뗀다', () => {
    expect(cleanTitleTopic('제목: "배포 일정 논의."')).toBe('배포 일정 논의')
    expect(cleanTitleTopic('## 「주간 회고」')).toBe('주간 회고')
  })

  it('첫 줄만 쓰고 모델이 붙인 날짜는 뗀다', () => {
    expect(cleanTitleTopic('\n2026-10-21 배포 일정\n설명입니다')).toBe('배포 일정')
  })

  it('30자에서 자른다', () => {
    expect(cleanTitleTopic('가'.repeat(50))).toHaveLength(TITLE_TOPIC_MAX_CHARS)
  })

  it('남는 것이 없으면 null', () => {
    expect(cleanTitleTopic('  ""  ')).toBeNull()
    expect(cleanTitleTopic('')).toBeNull()
  })
})

describe('isDefaultTitle', () => {
  it('어느 UI 언어의 기본 제목이든 참이다', () => {
    expect(isDefaultTitle({ title: '2026-10-21 녹음', createdAt: CREATED_AT })).toBe(true)
    expect(isDefaultTitle({ title: 'Recording 2026-10-21', createdAt: CREATED_AT })).toBe(true)
  })

  it('v0.3.2까지의 기본 제목도 참이다', () => {
    expect(isDefaultTitle({ title: '2026-10-21 회의', createdAt: CREATED_AT })).toBe(true)
    expect(isDefaultTitle({ title: 'Meeting 2026-10-21', createdAt: CREATED_AT })).toBe(true)
  })

  it('다른 날짜나 고친 제목이면 거짓이다', () => {
    expect(isDefaultTitle({ title: '2026-10-20 녹음', createdAt: CREATED_AT })).toBe(false)
    expect(isDefaultTitle({ title: '2026-10-21 배포 회의', createdAt: CREATED_AT })).toBe(false)
  })
})

describe('autoTitleOf', () => {
  it('녹음 날짜 뒤에 주제를 붙인다', () => {
    expect(autoTitleOf({ createdAt: CREATED_AT, topic: '배포 일정 논의' })).toBe(
      '2026-10-21 배포 일정 논의'
    )
  })
})

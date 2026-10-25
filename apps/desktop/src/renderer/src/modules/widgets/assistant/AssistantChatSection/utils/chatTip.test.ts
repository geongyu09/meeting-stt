import { describe, expect, it } from 'vitest'

import type { ChatTip } from '../types/chatTip'
import { chatTipOf } from './chatTip'

const SHORTCUTS = {
  recordingShortcut: 'Alt+Command+R',
  memoShortcut: 'Alt+Command+M',
  widgetShortcut: 'Alt+Command+W',
  dictationShortcut: 'Alt+Command+D',
  newChatShortcut: 'Command+N'
}

const TIPS: ChatTip[] = [
  { id: 'routine' },
  { id: 'recordShortcut', shortcut: 'recordingShortcut' },
  { id: 'noNeedToOrganize', needsOrganize: true },
  { id: 'todoAdd', skill: 'todo' }
]

const tipAt = (index: number, overrides: Partial<Parameters<typeof chatTipOf>[0]> = {}) =>
  chatTipOf({
    tips: TIPS,
    seed: index / TIPS.length,
    skillNames: ['todo'],
    shortcuts: SHORTCUTS,
    isOrganizeEnabled: true,
    ...overrides
  })

describe('chatTipOf', () => {
  it('seed로 팁 하나를 고르고, 단축키 팁에는 설정의 키를 붙인다', () => {
    expect(tipAt(0)).toEqual({ kind: 'tip', id: 'routine', accelerator: null })
    expect(tipAt(1)).toEqual({ kind: 'tip', id: 'recordShortcut', accelerator: 'Alt+Command+R' })
    expect(tipAt(3)).toEqual({ kind: 'tip', id: 'todoAdd', accelerator: null })
  })

  it('꺼진 단축키와 꺼진 자동 정리에 기대는 팁은 고르지 않는다', () => {
    const ids = [0, 0.3, 0.6, 0.99].map((seed) =>
      chatTipOf({
        tips: TIPS,
        seed,
        skillNames: ['todo'],
        shortcuts: { ...SHORTCUTS, recordingShortcut: '' },
        isOrganizeEnabled: false
      })
    )
    expect(ids.map((tip) => (tip.kind === 'tip' ? tip.id : tip.skill))).toEqual([
      'routine',
      'routine',
      'todoAdd',
      'todoAdd'
    ])
  })

  it('기대는 스킬이 없으면 그 스킬을 넣는 안내가 된다', () => {
    expect(tipAt(3, { skillNames: [] })).toEqual({ kind: 'missingSkill', skill: 'todo' })
  })
})

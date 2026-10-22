import type { ChatTip, ChatTipShortcut } from '../types/chatTip'

interface ChatTipOfParams {
  tips: ChatTip[]
  /** 0 이상 1 미만. 새 대화마다 바꿔 다른 팁을 고른다 */
  seed: number
  skillNames: string[]
  shortcuts: Record<ChatTipShortcut, string>
  isOrganizeEnabled: boolean
}

/**
 * 빈 대화에 보일 팁 하나를 고릅니다. 꺼진 단축키·꺼진 자동 정리에 기대는 팁은 빼고,
 * 기대는 스킬이 없으면 그 스킬을 넣는 안내를 돌려준다.
 * @example
 * chatTipOf({ tips: CHAT_TIPS, seed: Math.random(), skillNames: ['todo'], shortcuts: settings, isOrganizeEnabled: true })
 */
export const chatTipOf = ({
  tips,
  seed,
  skillNames,
  shortcuts,
  isOrganizeEnabled
}: ChatTipOfParams) => {
  const candidates = tips.filter(
    (tip) => (!tip.shortcut || shortcuts[tip.shortcut]) && (!tip.needsOrganize || isOrganizeEnabled)
  )
  const tip = candidates[Math.floor(seed * candidates.length)]

  if (tip.skill && !skillNames.includes(tip.skill))
    return { kind: 'missingSkill', skill: tip.skill } as const

  return {
    kind: 'tip',
    id: tip.id,
    accelerator: tip.shortcut ? shortcuts[tip.shortcut] : null
  } as const
}

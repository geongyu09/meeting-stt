import { describe, expect, it } from 'vitest'

import { assignSpeakers, mergeUtterances, UNKNOWN_SPEAKER } from './merge'
import type { SpeakerSegment, SttSegment } from './types'

const speakerSegments: SpeakerSegment[] = [
  { start: 0, end: 5, speaker: 'speaker_00' },
  { start: 5, end: 10, speaker: 'speaker_01' }
]

describe('assignSpeakers', () => {
  it('겹침이 가장 큰 화자를 단어에 배정한다', () => {
    const segments: SttSegment[] = [
      {
        start: 0,
        end: 8,
        text: '안녕하세요 반갑습니다',
        words: [
          { start: 0.5, end: 2, text: '안녕하세요' },
          { start: 6, end: 7.5, text: '반갑습니다' }
        ]
      }
    ]

    const pieces = assignSpeakers({ segments, speakerSegments })

    expect(pieces.map((piece) => piece.speaker)).toEqual(['speaker_00', 'speaker_01'])
  })

  it('단어 타임스탬프가 없으면 세그먼트 전체로 배정한다', () => {
    const segments: SttSegment[] = [{ start: 6, end: 9, text: '네 알겠습니다' }]

    const pieces = assignSpeakers({ segments, speakerSegments })

    expect(pieces).toEqual([{ speaker: 'speaker_01', start: 6, end: 9, text: '네 알겠습니다' }])
  })

  it('겹치는 화자 구간이 없으면 직전 화자를 승계한다', () => {
    const segments: SttSegment[] = [
      {
        start: 0,
        end: 30,
        text: '앞 뒤',
        words: [
          { start: 1, end: 2, text: '앞' },
          { start: 20, end: 21, text: '뒤' }
        ]
      }
    ]

    const pieces = assignSpeakers({ segments, speakerSegments })

    expect(pieces.map((piece) => piece.speaker)).toEqual(['speaker_00', 'speaker_00'])
  })

  it('경계에서 어느 구간에도 걸치지 않는 단어는 가까운 화자에 붙인다', () => {
    const gapped: SpeakerSegment[] = [
      { start: 0, end: 5, speaker: 'speaker_00' },
      { start: 5.5, end: 10, speaker: 'speaker_01' }
    ]
    const segments: SttSegment[] = [
      {
        start: 0,
        end: 6,
        text: '앞말 뒷말',
        words: [
          { start: 1, end: 2, text: '앞말' },
          { start: 5.4, end: 5.45, text: '뒷말' }
        ]
      }
    ]

    const pieces = assignSpeakers({ segments, speakerSegments: gapped })

    expect(pieces.map((piece) => piece.speaker)).toEqual(['speaker_00', 'speaker_01'])
  })

  it('승계할 직전 화자도 없으면 UNKNOWN을 쓴다', () => {
    const segments: SttSegment[] = [{ start: 20, end: 21, text: '혼자' }]

    const pieces = assignSpeakers({ segments, speakerSegments })

    expect(pieces[0].speaker).toBe(UNKNOWN_SPEAKER)
  })

  it('화자 구간이 비어 있어도 전사 결과를 잃지 않는다', () => {
    const segments: SttSegment[] = [{ start: 0, end: 1, text: '화자 정보 없음' }]

    const pieces = assignSpeakers({ segments, speakerSegments: [] })

    expect(pieces).toHaveLength(1)
    expect(pieces[0].speaker).toBe(UNKNOWN_SPEAKER)
  })

  it('전사 결과가 없으면 빈 배열을 반환한다', () => {
    expect(assignSpeakers({ segments: [], speakerSegments })).toEqual([])
  })
})

describe('mergeUtterances', () => {
  it('같은 화자의 연속 발화를 하나로 합친다', () => {
    const merged = mergeUtterances([
      { speaker: 'speaker_00', start: 0, end: 1.2, text: '안녕하세요' },
      { speaker: 'speaker_00', start: 1.3, end: 2.5, text: '회의 시작하겠습니다' }
    ])

    expect(merged).toHaveLength(1)
    expect(merged[0].text).toBe('안녕하세요 회의 시작하겠습니다')
    expect(merged[0].startSec).toBe(0)
    expect(merged[0].endSec).toBe(2.5)
  })

  it('화자가 바뀌면 발화를 나누고 ord를 0부터 매긴다', () => {
    const merged = mergeUtterances([
      { speaker: 'speaker_00', start: 0, end: 2, text: '먼저 말합니다' },
      { speaker: 'speaker_01', start: 2, end: 4, text: '이어서 말합니다' }
    ])

    expect(merged.map((utterance) => utterance.ord)).toEqual([0, 1])
    expect(merged.map((utterance) => utterance.speakerLabel)).toEqual(['speaker_00', 'speaker_01'])
  })

  it('0.5초 미만 고아 발화는 앞 발화에 흡수한다', () => {
    const merged = mergeUtterances([
      { speaker: 'speaker_00', start: 0, end: 3, text: '길게 말하는 중인데' },
      { speaker: 'speaker_01', start: 3, end: 3.2, text: '음' },
      { speaker: 'speaker_00', start: 3.2, end: 6, text: '계속 이어집니다' }
    ])

    expect(merged).toHaveLength(1)
    expect(merged[0].speakerLabel).toBe('speaker_00')
    expect(merged[0].text).toBe('길게 말하는 중인데 음 계속 이어집니다')
  })

  it('앞 발화가 없는 고아는 뒤 발화에 흡수한다', () => {
    const merged = mergeUtterances([
      { speaker: 'speaker_01', start: 0, end: 0.2, text: '어' },
      { speaker: 'speaker_00', start: 0.2, end: 4, text: '시작하겠습니다' }
    ])

    expect(merged).toHaveLength(1)
    expect(merged[0].speakerLabel).toBe('speaker_00')
    expect(merged[0].text).toBe('어 시작하겠습니다')
  })

  it('전체가 짧은 발화 하나뿐이면 그대로 남긴다', () => {
    const merged = mergeUtterances([{ speaker: 'speaker_00', start: 0, end: 0.3, text: '네' }])

    expect(merged).toHaveLength(1)
    expect(merged[0].text).toBe('네')
  })

  it('빈 입력이면 빈 배열을 반환한다', () => {
    expect(mergeUtterances([])).toEqual([])
  })
})

import { describe, expect, it } from 'vitest'
import type { PlannedItem } from '@renderer/shared/utils/planDownload'
import { summarizeDownload } from './summarizeDownload'

const items: PlannedItem[] = [
  { key: 'whisper', label: '음성 인식 모델', sizeBytes: 500, isInstalled: false },
  { key: 'vad', label: '무음 감지 모델', sizeBytes: 100, isInstalled: true }
]

describe('summarizeDownload', () => {
  it('설치된 항목은 전부 받은 것으로 더하고 받는 중인 항목은 받은 만큼만 더한다', () => {
    const summary = summarizeDownload({
      items,
      progress: { whisper: { key: 'whisper', receivedBytes: 250, totalBytes: 500, percent: 50 } }
    })

    expect(summary).toEqual({
      totalBytes: 600,
      receivedBytes: 350,
      percent: 58,
      doneCount: 1,
      totalCount: 2
    })
  })

  it('진행 이벤트가 없으면 설치된 항목만 센다', () => {
    const summary = summarizeDownload({ items, progress: {} })

    expect(summary.receivedBytes).toBe(100)
    expect(summary.doneCount).toBe(1)
  })

  it('100%가 된 항목은 받은 바이트가 용량에 못 미쳐도 끝난 것으로 본다', () => {
    const summary = summarizeDownload({
      items,
      progress: { whisper: { key: 'whisper', receivedBytes: 480, totalBytes: 480, percent: 100 } }
    })

    expect(summary.doneCount).toBe(2)
    expect(summary.percent).toBe(100)
  })

  it('받을 것이 없으면 100%다', () => {
    expect(summarizeDownload({ items: [], progress: {} }).percent).toBe(100)
  })
})

import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import {
  buildRecordNote,
  extractLegacySummary,
  recordNoteBaseName,
  writeRecordNote
} from './recordNote'

const CREATED_AT = new Date(2026, 9, 21, 14, 30).getTime()

const utterancesOf = () => [
  { ord: 0, speakerLabel: 'SPEAKER_00', startSec: 12, endSec: 15, text: '지난주 배포 일정부터' },
  { ord: 1, speakerLabel: 'SPEAKER_01', startSec: 16, endSec: 18, text: '네 그렇게 하죠' }
]

describe('recordNoteBaseName', () => {
  it('제목에서 날짜를 떼고 시각 뒤에 주제를 붙인다', () => {
    expect(recordNoteBaseName({ title: '2026-10-21 배포 일정 논의', createdAt: CREATED_AT })).toBe(
      '2026-10-21-1430 배포 일정 논의'
    )
  })

  it('기본 제목이면 어느 언어든 시각만 쓴다', () => {
    expect(recordNoteBaseName({ title: '2026-10-21 녹음', createdAt: CREATED_AT })).toBe(
      '2026-10-21-1430'
    )
    expect(recordNoteBaseName({ title: 'Recording 2026-10-21', createdAt: CREATED_AT })).toBe(
      '2026-10-21-1430'
    )
  })

  it('파일명에 못 쓰는 문자는 _로 바꾸고 60자에서 자른다', () => {
    const name = recordNoteBaseName({ title: `a/b:c ${'가'.repeat(80)}`, createdAt: CREATED_AT })
    expect(name.startsWith('2026-10-21-1430 a_b_c ')).toBe(true)
    expect(name.length).toBe('2026-10-21-1430 '.length + 60)
  })
})

describe('buildRecordNote', () => {
  it('머리말·참석자·마크다운 회의록을 만들고 지정한 화자 이름을 쓴다', () => {
    const content = buildRecordNote({
      meeting: {
        title: '2026-10-21 배포',
        createdAt: CREATED_AT,
        durationSec: 723,
        note: '',
        recordType: 'meeting'
      },
      utterances: utterancesOf(),
      displayNames: { SPEAKER_00: '김OO' }
    })

    expect(content).toContain(
      '종류: 회의\n제목: 2026-10-21 배포\n시작: 2026-10-21 14:30\n길이: 12분 3초\n참석자: 김OO, 화자 2\n---'
    )
    expect(content).toContain('[00:00:12] **김OO**: 지난주 배포 일정부터')
    expect(content).not.toContain('## 노트')
  })

  it('노트가 있으면 머리말 아래 노트와 전사 제목을 둔다', () => {
    const content = buildRecordNote({
      meeting: {
        title: 't',
        createdAt: CREATED_AT,
        durationSec: 5,
        note: '안건 https://a.b/c',
        recordType: 'meeting'
      },
      utterances: utterancesOf(),
      displayNames: {}
    })

    expect(content.indexOf('## 노트')).toBeLessThan(content.indexOf('## 전사'))
    expect(content).toContain('안건 https://a.b/c')
  })

  it('메모는 참석자 줄 없이 발화를 화자·시각 없는 문단으로 잇는다', () => {
    const content = buildRecordNote({
      meeting: { title: 't', createdAt: CREATED_AT, durationSec: 5, note: '', recordType: 'memo' },
      utterances: utterancesOf(),
      displayNames: {}
    })

    expect(content).toContain('종류: 메모\n')
    expect(content).not.toContain('참석자:')
    expect(content).toContain('---\n\n지난주 배포 일정부터\n\n네 그렇게 하죠\n')
    expect(content).not.toContain('[00:00:12]')
  })
})

describe('extractLegacySummary', () => {
  const LEGACY_SUMMARY = '## 요약\n\n녹음 요약입니다.\n\n### 할 일\n\n- 표 확인하기'

  /** 2026-10-24 이전 정리 에이전트처럼 머리말 바로 아래에 `## 요약`을 끼운 원문 */
  const legacyNoteOf = (note: string) =>
    buildRecordNote({
      meeting: { title: 't', createdAt: CREATED_AT, durationSec: 5, note, recordType: 'meeting' },
      utterances: utterancesOf(),
      displayNames: {}
    }).replace('---\n\n', `---\n\n${LEGACY_SUMMARY}\n\n`)

  it('머리말 아래 요약을 제목 줄 없이 첫 발화 줄 앞까지 떼어 낸다', () => {
    expect(extractLegacySummary(legacyNoteOf(''))).toBe(
      '녹음 요약입니다.\n\n### 할 일\n\n- 표 확인하기\n'
    )
  })

  it('노트가 있으면 노트 제목 앞에서 멈춘다', () => {
    expect(extractLegacySummary(legacyNoteOf('안건'))).toBe(
      '녹음 요약입니다.\n\n### 할 일\n\n- 표 확인하기\n'
    )
  })

  it('요약 안의 다른 ## 제목은 요약에 남긴다', () => {
    const content = legacyNoteOf('').replace('### 할 일', '## 결정 사항')
    expect(extractLegacySummary(content)).toContain('## 결정 사항\n\n- 표 확인하기')
  })

  it('요약이 없는 원문이면 null이다', () => {
    const content = buildRecordNote({
      meeting: {
        title: 't',
        createdAt: CREATED_AT,
        durationSec: 5,
        note: '',
        recordType: 'meeting'
      },
      utterances: utterancesOf(),
      displayNames: {}
    })
    expect(extractLegacySummary(content)).toBeNull()
  })

  it('사용자 노트 안의 ## 요약 줄은 옛 요약으로 보지 않는다', () => {
    const content = buildRecordNote({
      meeting: {
        title: 't',
        createdAt: CREATED_AT,
        durationSec: 5,
        note: '## 요약\n\n내 메모',
        recordType: 'meeting'
      },
      utterances: utterancesOf(),
      displayNames: {}
    })
    expect(extractLegacySummary(content)).toBeNull()
  })

  it('제목 줄만 있고 내용이 비면 null이다', () => {
    const content = legacyNoteOf('').replace(LEGACY_SUMMARY, '## 요약')
    expect(extractLegacySummary(content)).toBeNull()
  })
})

describe('writeRecordNote', () => {
  let dir = ''

  afterEach(() => rm(dir, { recursive: true, force: true }))

  it('폴더를 만들고 같은 이름이 있으면 -2를 붙여 덮지 않는다', async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'record-note-'))
    const first = await writeRecordNote({ folder: dir, baseName: 'a', content: '1' })
    const second = await writeRecordNote({ folder: dir, baseName: 'a', content: '2' })

    expect(first).toBe(path.join(dir, 'raw/recordings/a.md'))
    expect(second).toBe(path.join(dir, 'raw/recordings/a-2.md'))
    expect(await readFile(first, 'utf8')).toBe('1')
  })
})

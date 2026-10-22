import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import { buildRecordNote, recordNoteBaseName, writeRecordNote } from './recordNote'

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
      meeting: { title: '2026-10-21 배포', createdAt: CREATED_AT, durationSec: 723, note: '' },
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
      meeting: { title: 't', createdAt: CREATED_AT, durationSec: 5, note: '안건 https://a.b/c' },
      utterances: utterancesOf(),
      displayNames: {}
    })

    expect(content.indexOf('## 노트')).toBeLessThan(content.indexOf('## 전사'))
    expect(content).toContain('안건 https://a.b/c')
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

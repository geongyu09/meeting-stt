import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import {
  formatTranscript,
  resolveSpeakerNames,
  type DefaultSpeakerNames
} from '@meeting-stt/core/format'
import type { MergedUtterance } from '@meeting-stt/core/types'
import { isDefaultTitle } from '@shared/autoTitle'
import { toSafeFileName } from '../audio/exportFileName'

/**
 * 비서의 뇌에 저장하는 전사 원문 파일 (references/features/assistant.md "녹음 기록 자동 정리" > "원문 파일").
 * 경로·내용 조립은 순수 함수라 vitest로 검증하고, 쓰기만 파일 IO다.
 */

/** 작업 폴더 안의 고정 위치. UI 언어와 무관하다 ("기본 하네스" 절, 폴더 이름은 영어로만) */
export const RECORDINGS_DIR = 'raw/recordings'
export const NOTE_TOPIC_MAX_CHARS = 60
/** 같은 이름이 이만큼 겹치면 포기한다 — 한 분 안에 같은 주제가 백 번 생기지 않는다 */
const MAX_NAME_SUFFIX = 100
const SECONDS_PER_MINUTE = 60
const SECONDS_PER_HOUR = 3600

export interface RecordNoteMeeting {
  title: string
  createdAt: number
  durationSec: number
  note: string
}

const pad2 = (value: number) => String(value).padStart(2, '0')

const dateTextOf = (date: Date) =>
  `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`

const timeTextOf = (date: Date) => `${pad2(date.getHours())}${pad2(date.getMinutes())}`

/**
 * @description 원문 파일 이름(확장자 없이). `YYYY-MM-DD-HHmm`에 제목에서 날짜를 뗀 주제를 붙이고, 기본 제목이면 시각만.
 * @example
 * recordNoteBaseName({ title: '2026-10-21 배포 일정', createdAt }) // '2026-10-21-1430 배포 일정'
 */
export const recordNoteBaseName = ({
  title,
  createdAt
}: Pick<RecordNoteMeeting, 'title' | 'createdAt'>) => {
  const date = new Date(createdAt)
  const dateText = dateTextOf(date)
  const stamp = `${dateText}-${timeTextOf(date)}`
  if (isDefaultTitle({ title, createdAt })) return stamp

  const topic = toSafeFileName(title.replace(dateText, '')).slice(0, NOTE_TOPIC_MAX_CHARS).trim()
  return topic ? `${stamp} ${topic}` : stamp
}

const durationTextOf = (durationSec: number) => {
  const total = Math.max(0, Math.round(durationSec))
  const hours = Math.floor(total / SECONDS_PER_HOUR)
  const minutes = Math.floor((total % SECONDS_PER_HOUR) / SECONDS_PER_MINUTE)
  const seconds = total % SECONDS_PER_MINUTE

  return [hours ? `${hours}시간` : '', `${minutes}분`, `${seconds}초`].filter(Boolean).join(' ')
}

interface BuildRecordNoteParams {
  meeting: RecordNoteMeeting
  utterances: MergedUtterance[]
  displayNames: Record<string, string | null>
  defaultNames?: DefaultSpeakerNames
}

/**
 * @description YAML 머리말 + (노트가 있으면 `## 노트`·`## 전사`) + 마크다운 회의록. 머리말 항목은 UI 언어와 무관하게 한국어다.
 * @example
 * buildRecordNote({ meeting, utterances, displayNames: {} })
 */
export const buildRecordNote = ({
  meeting,
  utterances,
  displayNames,
  defaultNames
}: BuildRecordNoteParams) => {
  const names = resolveSpeakerNames({
    labels: utterances.map((utterance) => utterance.speakerLabel),
    displayNames,
    defaultNames
  })
  const started = new Date(meeting.createdAt)
  const header = [
    '---',
    '종류: 회의',
    `제목: ${meeting.title}`,
    `시작: ${dateTextOf(started)} ${pad2(started.getHours())}:${pad2(started.getMinutes())}`,
    `길이: ${durationTextOf(meeting.durationSec)}`,
    `참석자: ${[...new Set(Object.values(names))].join(', ')}`,
    '---'
  ]
  const body = formatTranscript({ utterances, displayNames, defaultNames, format: 'markdown' })
  const note = meeting.note.trim()
  const sections = note ? ['## 노트', '', note, '', '## 전사', '', body] : [body]

  return [...header, '', ...sections, ''].join('\n')
}

const LEGACY_SUMMARY_HEADING = '## 요약'
/** 앱이 만든 본문의 첫 줄 — 노트·전사 제목, 또는 마크다운 회의록의 발화 줄 `[00:00:12] **이름**:` */
const BODY_START_LINE = /^(## 노트|## 전사|\[\d{2}:\d{2}:\d{2}\] \*\*)/

/**
 * @description 2026-10-24 이전 원문에서 정리 에이전트가 머리말 아래에 쓴 `## 요약`을 떼어 낸다.
 * 앱이 만든 본문(노트·전사·발화 줄) 앞에 있는 것만 보므로 사용자 노트 안의 같은 제목은 건드리지 않는다.
 * @returns 제목 줄을 뺀 요약. 없거나 비었으면 null
 * @example
 * extractLegacySummary('---\n…\n---\n\n## 요약\n\n요약\n\n[00:00:12] **김OO**: …') // '요약\n'
 */
export const extractLegacySummary = (content: string) => {
  const lines = content.split('\n')
  const bodyStart = lines.findIndex((line) => BODY_START_LINE.test(line))
  const head = bodyStart === -1 ? lines : lines.slice(0, bodyStart)
  const start = head.findIndex((line) => line.trim() === LEGACY_SUMMARY_HEADING)
  if (start === -1) return null

  const summary = head
    .slice(start + 1)
    .join('\n')
    .trim()
  return summary ? `${summary}\n` : null
}

const isExists = (caught: unknown) =>
  typeof caught === 'object' && caught !== null && 'code' in caught && caught.code === 'EEXIST'

/**
 * @description 파일이 없을 때만 쓴다 — 옛 원문의 요약을 옮길 때 이미 있는 요약 파일을 덮지 않는다.
 * @returns 썼으면 true, 이미 있었으면 false
 */
export const writeFileIfAbsent = async ({
  filePath,
  content
}: {
  filePath: string
  content: string
}) => {
  try {
    await writeFile(filePath, content, { flag: 'wx' })
    return true
  } catch (caught) {
    if (isExists(caught)) return false
    throw caught
  }
}

/**
 * @description `<작업 폴더>/raw/recordings/<baseName>.md`에 `wx`로 쓴다. 같은 이름이 있으면 `-2`, `-3`…을 붙인다.
 * @returns 실제로 쓴 절대 경로
 */
export const writeRecordNote = async ({
  folder,
  baseName,
  content
}: {
  folder: string
  baseName: string
  content: string
}) => {
  const dir = path.join(folder, RECORDINGS_DIR)
  await mkdir(dir, { recursive: true })

  for (let suffix = 1; suffix <= MAX_NAME_SUFFIX; suffix += 1) {
    const filePath = path.join(dir, `${baseName}${suffix === 1 ? '' : `-${suffix}`}.md`)
    try {
      await writeFile(filePath, content, { flag: 'wx' })
      return filePath
    } catch (caught) {
      if (!isExists(caught)) throw caught
    }
  }

  throw new Error(`같은 이름의 원문이 너무 많습니다: ${baseName}`)
}

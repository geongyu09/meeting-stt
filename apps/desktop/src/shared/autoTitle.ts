/**
 * 녹음 자동 제목의 순수 로직 — 입력 자르기, 프롬프트, 답 다듬기, 기본 제목 판정
 * (references/features/transcript.md "회의록 자동 제목").
 */

import { LOCALES, MESSAGES } from './i18n'
import { clipNote } from './note'

/** 전사본에서 넣을 글자 수. 잠정값이고 실제 녹음으로 확정한다 (references/roadmap.md "회의록 자동 제목") */
export const TITLE_INPUT_MAX_CHARS = 4000
/** 노트에서 넣을 글자 수. 잠정값 */
export const TITLE_NOTE_MAX_CHARS = 2000
export const TITLE_TOPIC_MAX_CHARS = 30
/** 30자 한 줄이면 충분하다. 외부 공급자는 API 하한이 따로 있다 */
export const TITLE_MAX_TOKENS = 48
/** 노트 2,000자 + 전사 4,000자가 한국어로 6,000토큰 안쪽이다 */
export const TITLE_CTX_TOKENS = 8192
/** llama-cli가 한 줄만 내게 한다. 30자보다 넉넉히 두고 `cleanTitleTopic`이 자른다 */
export const TITLE_GRAMMAR = 'root ::= [^\\n]{1,60}'

const CLIPPED_MARK = '\n…\n'
const PART_COUNT = 3

export const TITLE_SYSTEM_PROMPT = [
  '당신은 사용자가 녹음한 기록에 짧은 제목을 붙입니다.',
  `녹음이 무엇에 관한 것인지 ${TITLE_TOPIC_MAX_CHARS}자 이내 한 줄 명사구로 씁니다.`,
  '노트는 사용자가 녹음하며 직접 적은 글입니다. 노트가 있으면 노트의 주제와 표기를 우선합니다.',
  '날짜·따옴표·마침표는 넣지 말고 제목만 답합니다.'
].join('\n')

/**
 * @description 전사본이 길면 처음·가운데·끝에서 3분의 1씩 잘라 잇습니다. 앞부분은 인사·잡담이 많아 앞만 보면 주제를 놓칩니다.
 * @param transcript - 발화를 줄로 이은 전사본
 * @returns `TITLE_INPUT_MAX_CHARS` 안쪽(구분 표시 제외)의 전사본
 * @example
 * clipTitleInput(transcript)
 */
export const clipTitleInput = (transcript: string) => {
  if (transcript.length <= TITLE_INPUT_MAX_CHARS) return transcript

  const partChars = Math.floor(TITLE_INPUT_MAX_CHARS / PART_COUNT)
  const middleStart = Math.floor((transcript.length - partChars) / 2)

  return [
    transcript.slice(0, partChars),
    transcript.slice(middleStart, middleStart + partChars),
    transcript.slice(-partChars)
  ].join(CLIPPED_MARK)
}

/**
 * @description 자동 제목 프롬프트를 만듭니다. 노트가 있으면 전사본 앞에 둡니다.
 * @param transcript - 발화를 줄로 이은 전사본
 * @param note - 녹음 노트 원문. 비어 있으면 넣지 않는다
 * @example
 * buildTitlePrompt({ transcript, note })
 */
export const buildTitlePrompt = ({ transcript, note }: { transcript: string; note: string }) => {
  const clippedNote = clipNote({ note, maxChars: TITLE_NOTE_MAX_CHARS })

  return [
    ...(clippedNote ? ['## 노트', '', clippedNote, ''] : []),
    '## 전사본',
    '',
    clipTitleInput(transcript)
  ].join('\n')
}

const HEADING_MARK = /^#+\s*/
const TITLE_LABEL = /^(제목|title)\s*[:：]\s*/i
const LEADING_DATE = /^\d{4}-\d{2}-\d{2}\s*/
const WRAPPING_QUOTES = /^["'“”‘’「」『』`*]+|["'“”‘’「」『』`*]+$/g
const TRAILING_PERIOD = /[.。]+$/

/**
 * @description 모델 답에서 주제만 남깁니다. 첫 줄만 쓰고 `#`·`제목:`·날짜·따옴표·끝 마침표를 떼고 30자에서 자릅니다.
 * @param answer - 모델 답 원문
 * @returns 주제. 남는 것이 없으면 null이고 기본 제목을 둔다
 * @example
 * cleanTitleTopic('제목: "배포 일정 논의."') // '배포 일정 논의'
 */
export const cleanTitleTopic = (answer: string) => {
  const [firstLine = ''] = answer.trim().split('\n')
  const topic = firstLine
    .trim()
    .replace(HEADING_MARK, '')
    .replace(TITLE_LABEL, '')
    .replace(LEADING_DATE, '')
    .replace(WRAPPING_QUOTES, '')
    .replace(TRAILING_PERIOD, '')
    .trim()
    .slice(0, TITLE_TOPIC_MAX_CHARS)
    .trim()

  return topic || null
}

const pad2 = (value: number) => String(value).padStart(2, '0')

/** 로컬 시각 기준 `YYYY-MM-DD`. UI 언어와 무관하다 */
const dateTextOf = (createdAt: number) => {
  const date = new Date(createdAt)

  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`
}

/**
 * @description 앱이 붙인 기본 제목인지 판정합니다. 녹음한 뒤 UI 언어를 바꿔도 맞도록 모든 언어의 기본 제목과 비교하고,
 * v0.3.2까지 만든 녹음도 자동 제목을 받도록 예전 기본 제목("… 회의")도 봅니다.
 * @param title - 지금 제목
 * @param createdAt - 녹음 시작 시각(epoch ms)
 * @example
 * isDefaultTitle({ title: '2026-10-21 녹음', createdAt }) // true
 */
export const isDefaultTitle = ({ title, createdAt }: { title: string; createdAt: number }) => {
  const date = dateTextOf(createdAt)

  return LOCALES.some((locale) => {
    const { defaultTitle, legacyDefaultTitle } = MESSAGES[locale].main.recording
    return defaultTitle({ date }) === title || legacyDefaultTitle({ date }) === title
  })
}

/**
 * @description 최종 제목 `YYYY-MM-DD <주제>`를 만듭니다. 날짜는 모델이 아니라 코드가 붙입니다.
 * @example
 * autoTitleOf({ createdAt, topic: '배포 일정 논의' }) // '2026-10-21 배포 일정 논의'
 */
export const autoTitleOf = ({ createdAt, topic }: { createdAt: number; topic: string }) =>
  `${dateTextOf(createdAt)} ${topic}`

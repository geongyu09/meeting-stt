/**
 * 외부 LLM 공급자의 문장 교정 순수 로직 (2026-09-28).
 *
 * 용어 교정(`./refine.ts`)과 역할을 반대로 나눈다 — LLM이 문장 뜻을 보고 고친 줄을 내고, 코드가 거른다.
 * 원문과 수정문을 어절 단위로 맞춰 바뀐 덩어리를 찾고, 덩어리마다 발음 유사도를 재 소리가 비슷한 수정만 남긴다.
 * 음성 인식 오류는 들은 소리와 비슷한 말로 나오므로, 소리가 먼 수정은 오인식 교정이 아니라 창작이다.
 * 로컬 4B 모델은 이 방식을 해내지 못해 외부 공급자에서만 쓴다 (docs/phase5-refine-results.md "문장 교정").
 */

import { termReadingOf } from '@meeting-stt/core/termReadings'

import { acronymReading } from './glossary'
import { phoneticSimilarity } from './phonetic'
import { glossaryEntriesOf } from './refine'
import type { RefinePair, RefineSource } from './types'

/**
 * 한 번에 보내는 발화 글자 수. 요약의 외부 예산(40만 자)을 쓰지 않는 이유는 출력이 고친 줄 전체를 다시 적어 길어지기 때문이다.
 * 71분 회의가 3조각이었다 (docs/phase5-refine-results.md).
 */
export const SENTENCE_CHUNK_CHARS = 12_000

/** 적응형 사고·추론 토큰과 다시 적는 줄이 함께 들어간다. 12,000자 조각을 전부 고쳐 적어도 넉넉하다 */
export const SENTENCE_MAX_TOKENS = 32_000

/**
 * 반영할 덩어리의 발음 유사도 하한. 실측에서 맞는 수정은 대부분 0.56 이상이었고(거인이→어린이 0.60),
 * 이 값에서 로컬 모델의 엉뚱한 수정 8개가 모두 걸러졌다 (docs/phase5-refine-results.md).
 */
export const SENTENCE_MIN_SIMILARITY = 0.5

/** 영문 단어마다 읽기 후보를 곱해 나가므로 덩어리 하나에서 비교할 표기 수를 묶어 둔다 */
const MAX_SPELLING_VARIANTS = 16

const NO_CHANGE = '없음'

const OUTPUT_LINE = /^\s*\[(\d+)\]\s*(.+?)\s*$/

const LATIN_WORD = /[A-Za-z][A-Za-z0-9.+-]*/g

export const SENTENCE_SYSTEM_PROMPT = [
  '당신은 한국어 회의 음성 인식 결과에서 잘못 받아 적힌 말을 고치는 교정자입니다.',
  '음성 인식은 들은 소리와 비슷한 다른 말로 잘못 적습니다 (예: "배포"를 "대포", "tarball"을 "카볼", "모노레포"를 "모노래퍼").',
  '각 줄을 앞뒤 문맥과 함께 읽고, 그 자리에서 뜻이 통하지 않는 말을 발음이 비슷하면서 문맥에 맞는 말로 바꿉니다.',
  '',
  '규칙:',
  '1. 소리가 비슷한 말로만 바꿉니다. 소리가 다른 말로 바꾸거나 내용을 더하거나 빼지 않습니다.',
  '2. 문장을 다듬지 않습니다. 말투, 군말(어, 그, 이제), 반복, 끊긴 문장은 그대로 둡니다.',
  '3. 사람 이름과 숫자는 바꾸지 않습니다.',
  '4. 잘못 적힌 말이 용어 사전의 용어라면 한글 읽기가 아니라 사전의 표기(영문이면 영문)로 적습니다. 맞게 적힌 한국어 표현(예: "시맨틱 버저닝")은 사전 표기로 바꾸지 않습니다.',
  '5. 무엇으로 바꿀지 확신이 없으면 그 줄은 고치지 않습니다.',
  '',
  '출력: 고친 줄만 "[번호] 고친 줄 전체" 형식으로 한 줄에 하나씩 씁니다. 설명·빈 줄·코드 블록은 쓰지 않습니다.',
  `고칠 줄이 하나도 없으면 "${NO_CHANGE}"이라고만 씁니다.`
].join('\n')

/**
 * @description 발화를 `SENTENCE_CHUNK_CHARS`를 넘지 않는 조각으로 나눕니다. 발화 하나가 한도보다 길면 그 발화만으로 조각을 만듭니다.
 * @param sources - 회의의 발화 (순서대로)
 * @returns 발화 조각 배열
 * @example
 * const chunks = splitSentenceChunks({ sources })
 */
export const splitSentenceChunks = ({ sources }: { sources: RefineSource[] }) =>
  sources.reduce<RefineSource[][]>((chunks, source) => {
    const last = chunks.at(-1)
    const size = last?.reduce((sum, item) => sum + item.text.length, 0) ?? 0
    if (!last || size + source.text.length > SENTENCE_CHUNK_CHARS) return [...chunks, [source]]

    return [...chunks.slice(0, -1), [...last, source]]
  }, [])

interface BuildSentencePromptParams {
  chunk: RefineSource[]
  glossary: string[]
}

/**
 * @description 문장 교정 프롬프트를 만듭니다. 발화 id 대신 조각 안에서 1부터 매긴 번호를 붙이고, 용어 사전은 있을 때만 넣습니다.
 * @param chunk - `splitSentenceChunks`의 조각 하나
 * @param glossary - 정리한 전역 용어 줄. 비어 있어도 된다
 * @returns 모델에 보낼 프롬프트
 * @example
 * const prompt = buildSentencePrompt({ chunk, glossary: ['tarball = 타볼'] })
 */
export const buildSentencePrompt = ({ chunk, glossary }: BuildSentencePromptParams) => {
  const entries = glossaryEntriesOf(glossary)
  const glossaryLines = entries.length
    ? [
        '용어 사전 (표기 = 읽기):',
        ...entries.map(({ term, readings }) =>
          readings.length ? `- ${term} = ${readings.join(', ')}` : `- ${term}`
        ),
        ''
      ]
    : []

  return [
    ...glossaryLines,
    '회의록:',
    ...chunk.map(({ text }, index) => `[${index + 1}] ${text}`)
  ].join('\n')
}

/**
 * @description 모델 답변에서 고친 줄을 읽습니다. 번호가 조각 밖이거나 원문과 같은 줄, 형식이 깨진 줄은 버립니다.
 * @param output - 모델 답변
 * @param chunk - 프롬프트를 만든 조각
 * @returns 발화 id와 모델이 고친 줄
 * @example
 * parseSentenceOutput({ output: '[2] 차 정지를 해야', chunk })
 */
export const parseSentenceOutput = ({ output, chunk }: { output: string; chunk: RefineSource[] }) =>
  output.split('\n').flatMap((line) => {
    const match = OUTPUT_LINE.exec(line)
    const source = match ? chunk[Number(match[1]) - 1] : undefined
    if (!match || !source || source.text === match[2]) return []

    return [{ id: source.id, proposed: match[2] }]
  })

type DiffOp = { isSame: true; word: string } | { isSame: false; from: string[]; to: string[] }

/** 어절 LCS 길이표. table[i][j]는 a[i:]와 b[j:]의 LCS 길이다 */
const lcsTable = ({ a, b }: { a: string[]; b: string[] }) =>
  a.reduceRight<number[][]>(
    (rows, wordA) => {
      const next = rows[0]
      const row = b.reduceRight<number[]>(
        (cells, wordB, j) => [
          wordA === wordB ? next[j + 1] + 1 : Math.max(next[j], cells[0]),
          ...cells
        ],
        [0]
      )
      return [row, ...rows]
    },
    [new Array<number>(b.length + 1).fill(0)]
  )

/** 바뀐 어절이 이어지면 한 덩어리로 묶는다. "탑을 디프로 → tarball diff로"를 두 어절이 아니라 한 덩어리로 잰다 */
const appendChange = ({ ops, from, to }: { ops: DiffOp[]; from: string[]; to: string[] }) => {
  const last = ops.at(-1)
  if (!last || last.isSame) return [...ops, { isSame: false as const, from, to }]

  return [
    ...ops.slice(0, -1),
    { isSame: false as const, from: [...last.from, ...from], to: [...last.to, ...to] }
  ]
}

/** 원문 어절(a)과 수정문 어절(b)을 같은 어절과 바뀐 덩어리의 나열로 맞춘다 */
const diffWords = ({ a, b }: { a: string[]; b: string[] }) => {
  const table = lcsTable({ a, b })
  const walk = ({ i, j, ops }: { i: number; j: number; ops: DiffOp[] }): DiffOp[] => {
    if (i === a.length && j === b.length) return ops
    if (i < a.length && j < b.length && a[i] === b[j]) {
      return walk({ i: i + 1, j: j + 1, ops: [...ops, { isSame: true, word: a[i] }] })
    }
    if (j < b.length && (i === a.length || table[i][j + 1] >= table[i + 1][j])) {
      return walk({ i, j: j + 1, ops: appendChange({ ops, from: [], to: [b[j]] }) })
    }
    return walk({ i: i + 1, j, ops: appendChange({ ops, from: [a[i]], to: [] }) })
  }

  return walk({ i: 0, j: 0, ops: [] })
}

type GlossaryEntry = ReturnType<typeof glossaryEntriesOf>[number]

/** 영문 표기의 한글 읽기. 용어 사전 → 검수된 읽기 사전 → 대문자 약어 순서로 찾고, 모르면 빈 배열 */
const readingsOfLatin = ({ latin, entries }: { latin: string; entries: GlossaryEntry[] }) => {
  const key = latin.toLowerCase()
  const fromGlossary = entries.find(({ term }) => term.toLowerCase() === key)
  if (fromGlossary?.readings.length) return fromGlossary.readings

  const known = termReadingOf(latin)
  if (known) return known.reading.split(',').map((reading) => reading.trim())

  const acronym = acronymReading(latin.toUpperCase())
  return acronym ? [acronym] : []
}

/**
 * 영문을 한글 읽기로 바꾼 표기들. 원래 표기도 남겨 영문끼리(CIE → CI) 비교할 수 있게 한다.
 * 여러 단어로 된 용어(peer dependency)는 단어로 쪼개기 전에 통째로 읽는다.
 */
const spellingsOf = ({ text, entries }: { text: string; entries: GlossaryEntry[] }) => {
  const phrases = entries
    .filter(({ term, readings }) => term.includes(' ') && readings.length && text.includes(term))
    .map(({ term }) => term)
  const latins = [...phrases, ...new Set(text.match(LATIN_WORD) ?? [])]

  return latins.reduce(
    (variants, latin) =>
      variants
        .flatMap((variant) => [
          variant,
          ...readingsOfLatin({ latin, entries }).map((reading) =>
            variant.replaceAll(latin, reading)
          )
        ])
        .slice(0, MAX_SPELLING_VARIANTS),
    [text]
  )
}

/** 양쪽 표기의 모든 조합 중 가장 가까운 발음 유사도. 읽기를 모르는 영문은 글자 그대로 비교된다 */
const changeSimilarity = ({
  from,
  to,
  entries
}: {
  from: string
  to: string
  entries: GlossaryEntry[]
}) => {
  const toSpellings = spellingsOf({ text: to, entries })

  return Math.max(
    ...spellingsOf({ text: from, entries }).flatMap((a) =>
      toSpellings.map((b) => phoneticSimilarity({ a, b }))
    )
  )
}

interface GuardSentenceParams {
  utteranceId: string
  before: string
  proposed: string
  glossary: string[]
}

/**
 * @description 모델이 고친 줄에서 발음이 비슷한 수정 덩어리만 반영합니다. 나머지 자리에는 원문 어절을 남기고,
 * 어절을 넣기만 하거나 빼기만 한 덩어리는 반영하지 않습니다. 어절 사이 공백은 하나로 맞춰집니다.
 * @param utteranceId - 발화 id (결과 쌍에 싣는다)
 * @param before - 발화 원문
 * @param proposed - 모델이 고친 줄
 * @param glossary - 정리한 전역 용어 줄 (영문 읽기에 쓴다)
 * @returns 반영한 본문과 반영한 덩어리 쌍. 반영한 덩어리가 없으면 본문은 원문 그대로다
 * @example
 * guardSentence({ utteranceId, before: '차 통지를 해야', proposed: '차 정지를 해야', glossary: [] })
 * // { text: '차 정지를 해야', pairs: [{ utteranceId, from: '통지를', to: '정지를', similarity: 0.75 }] }
 */
export const guardSentence = ({ utteranceId, before, proposed, glossary }: GuardSentenceParams) => {
  const entries = glossaryEntriesOf(glossary)
  const ops = diffWords({
    a: before.split(/\s+/).filter(Boolean),
    b: proposed.split(/\s+/).filter(Boolean)
  })

  const judged = ops.map((op) => {
    if (op.isSame) return { words: [op.word], pair: null }

    const from = op.from.join(' ')
    const to = op.to.join(' ')
    const similarity = from && to ? changeSimilarity({ from, to, entries }) : 0
    if (similarity < SENTENCE_MIN_SIMILARITY) return { words: op.from, pair: null }

    const pair: RefinePair = { utteranceId, from, to, similarity }
    return { words: op.to, pair }
  })
  const pairs = judged.flatMap(({ pair }) => (pair ? [pair] : []))

  return { text: pairs.length ? judged.flatMap(({ words }) => words).join(' ') : before, pairs }
}

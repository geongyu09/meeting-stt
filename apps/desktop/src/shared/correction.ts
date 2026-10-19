/**
 * 발화 인라인 편집의 교정 횟수 세기 (2026-10-19).
 *
 * 원문과 수정문을 어절 단위로 맞춰 바뀐 어절을 세고, 같은 단어로 3회 이상 고쳐진 단어는 전역 용어 사전에
 * 자동 등록해 인식 단계 프롬프트에 가중치를 준다 (references/architecture.md "교정 횟수로 용어 자동 등록").
 * DB 읽고 쓰기는 main(`src/main/glossary/corrections.ts`)이 담당한다.
 */

import { GLOSSARY_TERM_MAX_CHARS } from './glossary'
import { PARTICLES } from './refine'
import { diffWords } from './sentenceRefine'

export const CORRECTION_PROMOTE_COUNT = 3

/** 어절 앞뒤의 문장 부호. `C++`·`Next.js`처럼 용어 안의 기호는 남긴다 */
const EDGE_PUNCTUATION = /^[\s"'“‘([]+|[.,!?:;"'”’)\]…]+$/g

/** 한 글자는 일상어와 겹치고 `=`은 용어 줄의 읽기 구분자라 센 적이 없는 것으로 본다 */
const isCountable = (word: string) =>
  word.length >= 2 &&
  word.length <= GLOSSARY_TERM_MAX_CHARS &&
  !/^\d+$/.test(word) &&
  !word.includes('=')

/** 원문 어절도 같은 조사로 끝나면 조사가 아니라 그 앞이 바뀐 것이므로 조사를 뗀다 (`깃허브를 → GitHub를`이면 `GitHub`) */
const stripSharedParticle = ({ from, to }: { from: string; to: string }) => {
  const particle = PARTICLES.find((candidate) => to.endsWith(candidate) && from.endsWith(candidate))
  return particle ? to.slice(0, -particle.length) : to
}

const wordsOf = (text: string) => text.split(/\s+/).filter(Boolean)

/**
 * @description 원문에서 수정문으로 바뀐 단어를 찾습니다. 원문 어절이 있고 수정문 어절이 하나인 덩어리만 셉니다.
 * 순수 삽입은 오인식이 아니라 세지 않습니다. 한 번의 편집에서 같은 단어는 한 번만 돌려줍니다.
 * @param params.before - 편집 전 발화
 * @param params.after - 편집 후 발화
 * @returns 바뀐 단어 목록 (문장 부호·공유 조사를 뗀 형태)
 * @example
 * changedWordsOf({ before: '깃허브를 쓴다.', after: 'GitHub를 쓴다.' }) // ['GitHub']
 */
export const changedWordsOf = ({ before, after }: { before: string; after: string }) =>
  diffWords({ a: wordsOf(before), b: wordsOf(after) })
    .flatMap((op) => (op.isSame || op.from.length === 0 || op.to.length !== 1 ? [] : [op]))
    .map((op) =>
      stripSharedParticle({
        from: op.from[op.from.length - 1].replace(EDGE_PUNCTUATION, ''),
        to: op.to[0].replace(EDGE_PUNCTUATION, '')
      })
    )
    .filter((word, index, all) => isCountable(word) && all.indexOf(word) === index)

interface CountCorrectionsParams {
  counts: Record<string, number>
  before: string
  after: string
}

/**
 * @description 편집 한 번의 바뀐 단어를 누적 횟수에 더하고, 승격 횟수에 닿은 단어를 돌려줍니다. 승격된 단어는 횟수에서 뺍니다.
 * @param params.counts - 지금까지의 단어별 횟수
 * @param params.before - 편집 전 발화
 * @param params.after - 편집 후 발화
 * @returns 새 횟수와 승격된 단어 목록
 * @example
 * countCorrections({ counts: { GitHub: 2 }, before: '깃허브', after: 'GitHub' }) // { counts: {}, promoted: ['GitHub'] }
 */
export const countCorrections = ({ counts, before, after }: CountCorrectionsParams) => {
  const next = changedWordsOf({ before, after }).reduce(
    (acc, word) => ({ ...acc, [word]: (acc[word] ?? 0) + 1 }),
    counts
  )
  const promoted = Object.keys(next).filter((word) => next[word] >= CORRECTION_PROMOTE_COUNT)

  return {
    counts: Object.fromEntries(Object.entries(next).filter(([word]) => !promoted.includes(word))),
    promoted
  }
}

/**
 * 받아쓰기(음성 입력) 조각 다듬기. LLM 없이 규칙만 적용한다 — 지연이 없고 로컬이며, 틀려도 예측 가능한 방식으로만 틀린다.
 * 규칙은 비음성 표기 제거 → 간투사 제거 → 용어 표기 치환 → 공백 정리 순이고, 조각 연결 규칙도 여기 둔다
 * (`references/architecture.md` "받아쓰기" > "다듬기", 측정은 `docs/dictation-results.md`).
 */

import { TERM_READINGS } from './termReadings'

export interface DictationTerm {
  /** 끼워 넣을 표기 (`GitHub`) */
  term: string
  /** 인식 결과에 나올 수 있는 읽기 (`깃허브`). 비어 있으면 치환하지 않는다 */
  readings: string[]
}

/** 용어 사전 줄 `표기 = 읽기1, 읽기2`의 구분자. `src/shared/glossary.ts`와 같다 */
const READING_SEPARATOR = '='
const READINGS_DELIMITER = ','

/** whisper가 붙이는 비음성 표기 — `[음악]`, `(웃음)`, `♪` */
const NON_SPEECH_PATTERNS = [/\[[^\]]*\]/g, /\([^)]*\)/g, /[♪♫]/g]

/** 어절 전체가 이것과 같으면 지운다. 뒤의 쉼표·마침표·말줄임표는 떼고 비교한다 */
const FILLERS = new Set(['음', '어', '아', '에', '으', '음음', '어어'])
/**
 * 홀로 서면 관형사·대명사일 수 있어(`그 사람`, `저 분`) 뒤에 쉼표·말줄임표가 붙었거나 조각의 마지막 어절일 때만 지운다.
 * whisper는 머뭇거림을 `그,`·`그…`로 적는다
 */
const HESITATION_FILLERS = new Set(['그', '저', '뭐'])
const TRAILING_PUNCTUATION = /[,.…!?]+$/

/** 읽기 뒤에 붙어도 같은 용어로 보는 조사. 긴 것부터 맞춰야 `에서`가 `에`로 잘리지 않는다 */
const PARTICLES = [
  '에서는',
  '에서도',
  '으로는',
  '으로도',
  '이라고',
  '이라는',
  '입니다',
  '이에요',
  '에서',
  '에는',
  '에도',
  '으로',
  '로는',
  '로도',
  '이랑',
  '하고',
  '까지',
  '부터',
  '처럼',
  '보다',
  '이나',
  '라고',
  '라는',
  '이고',
  '인데',
  '이다',
  '예요',
  '이요',
  '에',
  '을',
  '를',
  '이',
  '가',
  '은',
  '는',
  '로',
  '와',
  '과',
  '도',
  '의',
  '만',
  '랑',
  '나',
  '요',
  '고',
  '다'
].toSorted((a, b) => b.length - a.length)
/**
 * 한 음절 읽기(`번`=Bun, `뷰`=Vue, `깃`=Git)는 일상어와 너무 자주 겹쳐(`한 번 더`) 치환하지 않는다.
 * 그 용어를 꼭 바꾸고 싶으면 사용자가 두 음절 읽기(`번 런타임`)를 적는다
 */
const MIN_READING_SYLLABLES = 2
const HANGUL_SYLLABLE = /[가-힣]/g
const WORD_BOUNDARY_BEFORE = '(^|\\s)'
const WORD_BOUNDARY_AFTER = '(?=\\s|$|[,.!?…])'
const REGEXP_SPECIALS = /[.*+?^${}()|[\]\\]/g
const WHITESPACE = /\s+/g

/**
 * 검수한 읽기 사전(`termReadings.ts`)을 받아쓰기 치환 목록으로. 읽기가 둘이면 둘 다 받는다.
 * 앱은 이것을 적용하지 않는다 — `이슈` → `Issue`처럼 한글로 쓰는 외래어까지 바꿔 CER을 올렸다
 * (`docs/dictation-results.md` 2절). 측정 스크립트(`dictationRefineEval.ts`)가 비교 기준으로 쓴다
 */
export const BUILT_IN_DICTATION_TERMS: DictationTerm[] = Object.entries(TERM_READINGS).map(
  ([term, reading]) => ({
    term,
    readings: reading.split(READINGS_DELIMITER).map((item) => item.trim())
  })
)

/**
 * @description 전역 용어 사전 줄(`표기 = 읽기1, 읽기2`)을 받아쓰기 치환 목록으로 바꿉니다. 읽기가 없는 줄은 뺍니다.
 * @param lines - 용어 사전 줄 목록
 * @returns 치환 목록
 * @example
 * dictationTermsOf(['GitHub = 깃허브', 'Electron']) // [{ term: 'GitHub', readings: ['깃허브'] }]
 */
export const dictationTermsOf = (lines: string[]): DictationTerm[] =>
  lines
    .map((line) => {
      const [termPart, readingsPart = ''] = line.split(READING_SEPARATOR)

      return {
        term: termPart.trim(),
        readings: readingsPart
          .split(READINGS_DELIMITER)
          .map((item) => item.trim())
          .filter(Boolean)
      }
    })
    .filter(({ term, readings }) => term && readings.length > 0)

const normalizeSpaces = (text: string) => text.replace(WHITESPACE, ' ').trim()

const removeNonSpeech = (text: string) =>
  NON_SPEECH_PATTERNS.reduce((acc, pattern) => acc.replace(pattern, ' '), text)

interface IsFillerParams {
  token: string
  isLast: boolean
}

const isFiller = ({ token, isLast }: IsFillerParams) => {
  const core = token.replace(TRAILING_PUNCTUATION, '')
  if (!core) return false
  if (FILLERS.has(core)) return true

  return HESITATION_FILLERS.has(core) && (core !== token || isLast)
}

const removeFillers = (text: string) => {
  const tokens = text.split(' ')

  return tokens
    .filter((token, index) => !isFiller({ token, isLast: index === tokens.length - 1 }))
    .join(' ')
}

const escapeRegExp = (text: string) => text.replace(REGEXP_SPECIALS, '\\$&')

const syllableCountOf = (reading: string) => (reading.match(HANGUL_SYLLABLE) ?? []).length

/** 어절 경계의 읽기(+조사)만 잡는다. 읽기에 공백이 있으면(`넥스트 제이에스`) 어절 둘을 함께 잡는다 */
const readingPatternOf = (reading: string) =>
  new RegExp(
    `${WORD_BOUNDARY_BEFORE}${escapeRegExp(reading)}(${PARTICLES.join('|')})?${WORD_BOUNDARY_AFTER}`,
    'g'
  )

interface ApplyTermReadingsParams {
  text: string
  terms: DictationTerm[]
}

/**
 * @description 읽기가 어절 경계에서 그대로 나오면 표기로 바꿉니다. 뒤에 붙은 조사는 남깁니다(`깃허브에` → `GitHub에`).
 * 긴 읽기부터 맞춰 `넥스트 제이에스`가 `제이에스`보다 먼저 잡히게 합니다.
 * @param text - 공백을 정리한 인식 결과
 * @param terms - 치환 목록
 * @returns 치환한 텍스트
 * @example
 * applyTermReadings({ text: '깃허브에 올렸어요', terms: [{ term: 'GitHub', readings: ['깃허브'] }] }) // 'GitHub에 올렸어요'
 */
export const applyTermReadings = ({ text, terms }: ApplyTermReadingsParams) =>
  terms
    .flatMap(({ term, readings }) => readings.map((reading) => ({ term, reading })))
    .filter(
      ({ term, reading }) => reading !== term && syllableCountOf(reading) >= MIN_READING_SYLLABLES
    )
    .toSorted((a, b) => b.reading.length - a.reading.length)
    .reduce(
      (acc, { term, reading }) =>
        acc.replace(
          readingPatternOf(reading),
          (_match: string, before: string, particle: string | undefined) =>
            `${before}${term}${particle ?? ''}`
        ),
      text
    )

interface RefineDictationTextParams {
  text: string
  /** 전역 용어 사전(`dictationTermsOf`)과 내장 사전(`BUILT_IN_DICTATION_TERMS`)을 호출하는 쪽이 고른다 */
  terms: DictationTerm[]
}

/**
 * @description 인식한 조각 하나를 규칙으로 다듬습니다. 비음성 표기와 간투사를 지우고, 용어 읽기를 표기로 바꾸고, 공백을 정리합니다.
 * 결과가 비면(간투사만 말함) 빈 문자열입니다.
 * @param text - whisper 결과 한 줄
 * @param terms - 치환 목록
 * @returns 다듬은 조각
 * @example
 * refineDictationText({ text: '음 깃허브에 올렸어요 (웃음)', terms }) // 'GitHub에 올렸어요'
 */
export const refineDictationText = ({ text, terms }: RefineDictationTextParams) => {
  const compact = normalizeSpaces(removeNonSpeech(text))
  const withoutFillers = removeFillers(compact)

  return normalizeSpaces(applyTermReadings({ text: withoutFillers, terms }))
}

interface DictationInsertTextOfParams {
  piece: string
  /** 세션의 첫 조각인지. 커서 앞 글자는 사용자 몫이라 첫 조각 앞에는 공백을 붙이지 않는다 */
  isFirst: boolean
}

/**
 * @description 조각을 커서 자리에 넣을 모양으로 만듭니다. 둘째 조각부터는 앞에 공백 하나를 붙여 앞 조각과 띄웁니다.
 * 문장부호는 보태지 않습니다 — 침묵이 꼭 문장 끝은 아니라 마침표가 틀린 자리에 찍힙니다.
 * @param piece - 다듬은 조각
 * @param isFirst - 세션의 첫 조각인지
 * @returns 넣을 텍스트
 * @example
 * dictationInsertTextOf({ piece: '내일 봅시다', isFirst: false }) // ' 내일 봅시다'
 */
export const dictationInsertTextOf = ({ piece, isFirst }: DictationInsertTextOfParams) =>
  isFirst ? piece : ` ${piece}`

/**
 * @description 세션의 조각 전체를 하나의 글로 잇습니다 (메뉴바 "마지막 받아쓰기 복사").
 * @param pieces - 다듬은 조각 목록
 * @returns 공백 하나로 이은 글
 * @example
 * joinDictationPieces(['안녕하세요', '내일 봅시다']) // '안녕하세요 내일 봅시다'
 */
export const joinDictationPieces = (pieces: string[]) => pieces.join(' ')

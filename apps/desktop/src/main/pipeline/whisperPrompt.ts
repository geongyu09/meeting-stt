import { open } from 'node:fs/promises'
import { info, messageOf, warn } from '../log'
import type { TermPrompt } from './whisper'

const GGML_MAGIC = 0x67676d6c
const INT32_BYTES = 4
const FLOAT32_BYTES = 4
/** hparams: n_vocab, n_audio_ctx, n_audio_state, n_audio_head, n_audio_layer, n_text_ctx, ... */
const HPARAM_COUNT = 11
const TEXT_CTX_HPARAM_INDEX = 5
/** 어휘는 멜 필터 바로 뒤에 있고 5만 개 남짓이라 모델 앞 4MB면 충분하다 */
const VOCAB_READ_BYTES = 4 * 1024 * 1024
const TERM_SEPARATOR = ', '
/** whisper.cpp가 프롬프트 앞에 붙이는 이전 문맥 표시 토큰 */
const PREV_MARKER_TOKENS = 1

/**
 * whisper.cpp tokenize()의 단어 분할 정규식. std::regex는 C 로케일 바이트 단위라
 * [[:alpha:]]·[[:digit:]]·\s가 ASCII만 잡고, 한글 바이트는 "그 밖의 문자" 갈래로 묶인다.
 * JS의 \s는 0x85·0xA0까지 잡으므로 공백 집합을 직접 적는다.
 */
const WORD_PATTERN =
  /'s|'t|'re|'ve|'m|'ll|'d| ?[A-Za-z]+| ?[0-9]+| ?[^ \t\n\v\f\rA-Za-z0-9]+|[ \t\n\v\f\r]+(?![^ \t\n\v\f\r])|[ \t\n\v\f\r]+/g

export interface WhisperVocab {
  /** 토큰 바이트열을 latin1 문자열로 옮긴 것 */
  tokens: Set<string>
  textCtx: number
  maxTokenBytes: number
}

const latin1Of = (bytes: Uint8Array) => String.fromCharCode(...bytes)

/** ggml 모델 파일 앞부분에서 어휘와 n_text_ctx를 읽는다. 형식이 다르면 던진다 */
export const parseWhisperVocab = (bytes: Uint8Array) => {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  if (view.getUint32(0, true) !== GGML_MAGIC) throw new Error('ggml 모델 파일이 아님')

  const textCtx = view.getInt32(INT32_BYTES * (1 + TEXT_CTX_HPARAM_INDEX), true)
  const filtersOffset = INT32_BYTES * (1 + HPARAM_COUNT)
  const nMel = view.getInt32(filtersOffset, true)
  const nFft = view.getInt32(filtersOffset + INT32_BYTES, true)
  const vocabOffset = filtersOffset + INT32_BYTES * 2 + nMel * nFft * FLOAT32_BYTES
  const nVocab = view.getInt32(vocabOffset, true)

  const tokens = new Set<string>()
  let offset = vocabOffset + INT32_BYTES
  let maxTokenBytes = 0
  for (let index = 0; index < nVocab; index += 1) {
    const length = view.getUint32(offset, true)
    offset += INT32_BYTES
    if (offset + length > bytes.byteLength) throw new Error('어휘가 읽은 범위를 넘음')
    tokens.add(latin1Of(bytes.subarray(offset, offset + length)))
    maxTokenBytes = Math.max(maxTokenBytes, length)
    offset += length
  }

  return { tokens, textCtx, maxTokenBytes } satisfies WhisperVocab
}

const countWordTokens = ({ word, vocab }: { word: string; vocab: WhisperVocab }) => {
  let count = 0
  let start = 0
  while (start < word.length) {
    const longest = Math.min(word.length, start + vocab.maxTokenBytes)
    let end = longest
    while (end > start && !vocab.tokens.has(word.slice(start, end))) end -= 1
    // whisper.cpp는 어휘에 없는 바이트를 토큰 없이 건너뛴다
    if (end > start) count += 1
    start = end > start ? end : start + 1
  }
  return count
}

/** whisper.cpp tokenize()와 같은 규칙(단어 분할 뒤 가장 긴 일치 토큰을 탐욕적으로)으로 토큰 수를 센다 */
export const countWhisperTokens = ({ text, vocab }: { text: string; vocab: WhisperVocab }) => {
  const bytes = latin1Of(new TextEncoder().encode(text))
  const words = bytes.match(WORD_PATTERN) ?? []
  return words.reduce((sum, word) => sum + countWordTokens({ word, vocab }), 0)
}

/** whisper.cpp가 carry 프롬프트에 쓰는 최대 토큰 수 (n_text_ctx / 2 - 이전 문맥 표시 1) */
export const promptBudgetOf = (vocab: WhisperVocab) => vocab.textCtx / 2 - PREV_MARKER_TOKENS

interface BuildTermPromptParams {
  terms: string[]
  vocab: WhisperVocab
}

/**
 * 용어를 순서대로 예산 안에 들어가는 만큼 이어 붙인다. 넘치는 용어는 뺀다 —
 * whisper.cpp는 넘치면 앞쪽을 잘라 버리므로 사전 앞쪽 용어가 사라진다.
 */
export const buildTermPrompt = ({ terms, vocab }: BuildTermPromptParams) => {
  const budget = promptBudgetOf(vocab)
  const accepted = terms.reduce(
    (acc, term) => {
      if (acc.isFull) return acc
      const prompt = acc.prompt ? `${acc.prompt}${TERM_SEPARATOR}${term}` : term
      const tokenCount = countWhisperTokens({ text: prompt, vocab })
      if (tokenCount > budget) return { ...acc, isFull: true }
      return { prompt, tokenCount, usedCount: acc.usedCount + 1, isFull: false }
    },
    { prompt: '', tokenCount: 0, usedCount: 0, isFull: false }
  )

  return {
    prompt: accepted.prompt,
    tokenCount: accepted.tokenCount,
    droppedCount: terms.length - accepted.usedCount
  }
}

const vocabCache = new Map<string, Promise<WhisperVocab>>()

const loadVocab = async (modelPath: string) => {
  const file = await open(modelPath, 'r')
  try {
    const buffer = new Uint8Array(VOCAB_READ_BYTES)
    const { bytesRead } = await file.read(buffer, 0, VOCAB_READ_BYTES, 0)
    return parseWhisperVocab(buffer.subarray(0, bytesRead))
  } finally {
    await file.close()
  }
}

/** 모델 파일당 한 번만 읽는다. 실패한 읽기는 캐시에 남기지 않는다 */
export const readWhisperVocab = (modelPath: string) => {
  const cached = vocabCache.get(modelPath)
  if (cached) return cached

  const loading = loadVocab(modelPath)
  vocabCache.set(modelPath, loading)
  loading.catch(() => vocabCache.delete(modelPath))
  return loading
}

interface ResolveTermPromptParams {
  /** 용어 표기 목록 (`termNameOf`로 읽기를 뗀 것) */
  terms: string[]
  whisperModelPath: string
}

/**
 * 용어 목록을 모델 어휘로 세어 `--prompt`에 넣을 값으로 만든다. 어휘를 못 읽으면 undefined —
 * 용어 프롬프트는 품질 보탬이라 인식 자체를 막지 않는다. 파이프라인과 받아쓰기가 같이 쓴다
 */
export const resolveTermPrompt = async ({
  terms,
  whisperModelPath
}: ResolveTermPromptParams): Promise<TermPrompt | undefined> => {
  if (!terms.length) return undefined

  try {
    const vocab = await readWhisperVocab(whisperModelPath)
    const { prompt, tokenCount, droppedCount } = buildTermPrompt({ terms, vocab })
    info(`용어 프롬프트: ${terms.length - droppedCount}개 · ${tokenCount}토큰`)
    if (droppedCount) warn(`용어 프롬프트: 토큰 한도를 넘어 뒤쪽 ${droppedCount}개를 뺌`)
    return prompt ? { text: prompt, tokenCount } : undefined
  } catch (caught) {
    warn(`용어 프롬프트 없이 인식: 어휘를 읽지 못함 (${messageOf(caught)})`)
    return undefined
  }
}

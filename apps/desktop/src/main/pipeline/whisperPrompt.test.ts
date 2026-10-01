import { describe, expect, it } from 'vitest'

import { buildTermPrompt, countWhisperTokens, parseWhisperVocab } from './whisperPrompt'

const GGML_MAGIC = 0x67676d6c
const HPARAM_COUNT = 11
const TEXT_CTX_HPARAM_INDEX = 5

/** ggml 머리(매직·hparams·멜 필터 1x1)와 어휘만 담은 가짜 모델 */
const fakeModel = ({ tokens, textCtx }: { tokens: string[]; textCtx: number }) => {
  const encoded = tokens.map((token) => new TextEncoder().encode(token))
  const header = [
    GGML_MAGIC,
    ...Array.from({ length: HPARAM_COUNT }, () => 0),
    1,
    1,
    0,
    tokens.length
  ]
  header[1 + TEXT_CTX_HPARAM_INDEX] = textCtx
  const size = header.length * 4 + encoded.reduce((sum, bytes) => sum + 4 + bytes.length, 0)
  const buffer = new Uint8Array(size)
  const view = new DataView(buffer.buffer)
  header.forEach((value, index) => view.setUint32(index * 4, value, true))

  encoded.reduce((offset, bytes) => {
    view.setUint32(offset, bytes.length, true)
    buffer.set(bytes, offset + 4)
    return offset + 4 + bytes.length
  }, header.length * 4)

  return buffer
}

const BYTE_TOKENS = Array.from({ length: 256 }, (_, byte) => String.fromCharCode(byte))
const latin1Token = (text: string) => String.fromCharCode(...new TextEncoder().encode(text))

const vocabOf = (extra: string[], textCtx = 448) => {
  const vocab = parseWhisperVocab(fakeModel({ tokens: [], textCtx }))
  const tokens = new Set([...BYTE_TOKENS, ...extra.map(latin1Token)])
  return { ...vocab, tokens, maxTokenBytes: Math.max(...[...tokens].map((token) => token.length)) }
}

describe('parseWhisperVocab', () => {
  it('n_text_ctx와 어휘를 읽는다', () => {
    const vocab = parseWhisperVocab(fakeModel({ tokens: ['Git', ' Hub', ''], textCtx: 448 }))

    expect(vocab.textCtx).toBe(448)
    expect(vocab.tokens.has('Git')).toBe(true)
    expect(vocab.tokens.has(' Hub')).toBe(true)
    expect(vocab.maxTokenBytes).toBe(4)
  })

  it('ggml 파일이 아니면 던진다', () => {
    expect(() => parseWhisperVocab(new Uint8Array(64))).toThrow()
  })
})

describe('countWhisperTokens', () => {
  it('단어마다 가장 긴 일치 토큰을 고른다', () => {
    const vocab = vocabOf(['Git', 'Hub', ' Hub', 'GitHub'])

    expect(countWhisperTokens({ text: 'GitHub', vocab })).toBe(1)
    expect(countWhisperTokens({ text: 'Git Hub', vocab })).toBe(2)
  })

  it('한글은 바이트 단위로 쪼개고 어휘에 있는 묶음을 쓴다', () => {
    const vocab = vocabOf([' 회의'])

    // 앞 공백이 붙은 묶음만 어휘에 있어, 공백 없는 "회의"는 6바이트가 각각 토큰이 된다
    expect(countWhisperTokens({ text: ' 회의', vocab })).toBe(1)
    expect(countWhisperTokens({ text: '회의', vocab })).toBe(6)
  })
})

describe('buildTermPrompt', () => {
  it('예산 안에 들어가는 앞쪽 용어만 남긴다', () => {
    // 예산 = 16 / 2 - 1 = 7토큰. 용어 하나가 "ab" 1토큰, 구분자 ", "가 ","·" ab" 2토큰
    const vocab = vocabOf(['ab', ' ab'], 16)

    const result = buildTermPrompt({ terms: ['ab', 'ab', 'ab', 'ab', 'ab'], vocab })

    expect(result.prompt).toBe('ab, ab, ab, ab')
    expect(result.tokenCount).toBe(7)
    expect(result.droppedCount).toBe(1)
  })

  it('용어가 없으면 빈 프롬프트다', () => {
    expect(buildTermPrompt({ terms: [], vocab: vocabOf([]) })).toEqual({
      prompt: '',
      tokenCount: 0,
      droppedCount: 0
    })
  })
})

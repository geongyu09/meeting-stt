import { describe, expect, it } from 'vitest'
import type { LlmStatus } from './types'

import {
  apiVendorOf,
  buildClaudeCliArgs,
  buildCodexCliArgs,
  codexErrorReason,
  isCodexModelId,
  isLlmProvider,
  isLlmReady,
  isOpenaiModelId,
  llmMissingMessage,
  parseClaudeCliOutput,
  parseCodexModels,
  readApiKeyPayload,
  readCodexModelPayload
} from './llm'

const statusOf = (overrides: Partial<LlmStatus> = {}): LlmStatus => ({
  provider: 'local',
  isLocalModelReady: true,
  apiKeys: {
    anthropic: { isSaved: false, tail: null },
    openai: { isSaved: false, tail: null }
  },
  openaiModel: 'gpt-6-sol',
  claudeCliPath: null,
  claudeCliVersion: null,
  codexCliPath: null,
  codexCliVersion: null,
  codexModel: null,
  codexModels: [],
  ...overrides
})

const savedKeys = (overrides: Partial<LlmStatus['apiKeys']> = {}): LlmStatus['apiKeys'] => ({
  anthropic: { isSaved: false, tail: null },
  openai: { isSaved: false, tail: null },
  ...overrides
})

// claude 2.1.281 `claude -p --output-format json` 실제 출력을 짧게 자른 것
const CLI_SUCCESS =
  '{"duration_api_ms":1873,"stop_reason":"end_turn","session_id":"39b2bed2","total_cost_usd":0.11,"is_error":false,"num_turns":1,"subtype":"success","result":"2","type":"result"}'
const CLI_NOT_LOGGED_IN =
  '{"duration_api_ms":0,"stop_reason":"stop_sequence","is_error":true,"num_turns":1,"subtype":"success","api_error_status":null,"result":"Not logged in · Please run /login","type":"result"}'

describe('isLlmProvider', () => {
  it('다섯 공급자만 인정한다', () => {
    expect(isLlmProvider('local')).toBe(true)
    expect(isLlmProvider('claude-api')).toBe(true)
    expect(isLlmProvider('claude-cli')).toBe(true)
    expect(isLlmProvider('openai-api')).toBe(true)
    expect(isLlmProvider('codex-cli')).toBe(true)
    expect(isLlmProvider('gemini')).toBe(false)
    expect(isLlmProvider(undefined)).toBe(false)
  })
})

describe('isOpenaiModelId', () => {
  it('GPT-6 계열 세 모델만 인정한다', () => {
    expect(isOpenaiModelId('gpt-6-sol')).toBe(true)
    expect(isOpenaiModelId('gpt-6-astra')).toBe(true)
    expect(isOpenaiModelId('gpt-6-luna')).toBe(true)
    expect(isOpenaiModelId('gpt-4o')).toBe(false)
  })
})

describe('apiVendorOf', () => {
  it('키를 쓰는 공급자만 회사를 돌려준다', () => {
    expect(apiVendorOf('claude-api')).toBe('anthropic')
    expect(apiVendorOf('openai-api')).toBe('openai')
    expect(apiVendorOf('claude-cli')).toBeNull()
    expect(apiVendorOf('local')).toBeNull()
  })
})

describe('llmMissingMessage', () => {
  it('로컬은 요약 모델이 없을 때만 막는다', () => {
    expect(llmMissingMessage(statusOf())).toBeNull()
    expect(llmMissingMessage(statusOf({ isLocalModelReady: false }))).toMatch(/요약 모델/)
  })

  it('Claude API는 Anthropic 키가 있어야 한다. 로컬 모델·OpenAI 키는 보지 않는다', () => {
    expect(
      llmMissingMessage(
        statusOf({
          provider: 'claude-api',
          isLocalModelReady: false,
          apiKeys: savedKeys({ openai: { isSaved: true, tail: 'abcd' } })
        })
      )
    ).toMatch(/Claude API 키/)
    expect(
      isLlmReady(
        statusOf({
          provider: 'claude-api',
          isLocalModelReady: false,
          apiKeys: savedKeys({ anthropic: { isSaved: true, tail: 'wxyz' } })
        })
      )
    ).toBe(true)
  })

  it('OpenAI API는 OpenAI 키가 있어야 한다', () => {
    expect(llmMissingMessage(statusOf({ provider: 'openai-api' }))).toMatch(/OpenAI API 키/)
    expect(
      isLlmReady(
        statusOf({
          provider: 'openai-api',
          isLocalModelReady: false,
          apiKeys: savedKeys({ openai: { isSaved: true, tail: 'abcd' } })
        })
      )
    ).toBe(true)
  })

  it('Claude Code는 실행 파일을 찾아야 한다', () => {
    expect(llmMissingMessage(statusOf({ provider: 'claude-cli' }))).toMatch(/claude 명령/)
    expect(
      isLlmReady(statusOf({ provider: 'claude-cli', claudeCliPath: '/Users/me/.local/bin/claude' }))
    ).toBe(true)
  })

  it('Codex는 실행 파일을 찾아야 한다. claude 경로는 보지 않는다', () => {
    expect(
      llmMissingMessage(statusOf({ provider: 'codex-cli', claudeCliPath: '/usr/local/bin/claude' }))
    ).toMatch(/codex 명령/)
    expect(
      isLlmReady(statusOf({ provider: 'codex-cli', codexCliPath: '/opt/homebrew/bin/codex' }))
    ).toBe(true)
  })
})

describe('buildClaudeCliArgs', () => {
  const args = buildClaudeCliArgs({ system: '당신은 요약 도우미입니다.' })

  it('한 턴 출력 모드와 JSON 형식을 켠다', () => {
    expect(args).toContain('-p')
    expect(args[args.indexOf('--output-format') + 1]).toBe('json')
  })

  it('도구·세션 저장·사용자 설정을 끈다', () => {
    expect(args[args.indexOf('--tools') + 1]).toBe('')
    expect(args).toContain('--no-session-persistence')
    expect(args[args.indexOf('--setting-sources') + 1]).toBe('')
  })

  it('구독 로그인이 풀리는 --bare는 쓰지 않는다', () => {
    expect(args).not.toContain('--bare')
  })

  it('시스템 프롬프트를 인자로 넘기고 프롬프트 본문은 넘기지 않는다', () => {
    expect(args[args.indexOf('--system-prompt') + 1]).toBe('당신은 요약 도우미입니다.')
  })
})

describe('parseClaudeCliOutput', () => {
  it('성공 출력에서 답변만 꺼낸다', () => {
    expect(parseClaudeCliOutput(CLI_SUCCESS)).toBe('2')
  })

  it('종료 코드가 0이어도 is_error면 원문을 담아 던진다', () => {
    expect(() => parseClaudeCliOutput(CLI_NOT_LOGGED_IN)).toThrow(/Not logged in/)
  })

  it('앞뒤에 로그가 섞여도 JSON을 찾는다', () => {
    expect(parseClaudeCliOutput(`warning: something\n${CLI_SUCCESS}\n`)).toBe('2')
  })

  it('JSON이 아니면 형식 오류로 던진다', () => {
    expect(() => parseClaudeCliOutput('Segmentation fault')).toThrow(/출력 형식/)
  })
})

describe('readApiKeyPayload', () => {
  it('null은 삭제 요청으로 본다', () => {
    expect(readApiKeyPayload({ vendor: 'openai', apiKey: null })).toEqual({
      vendor: 'openai',
      apiKey: null
    })
  })

  it('앞뒤 공백을 자른다', () => {
    expect(readApiKeyPayload({ vendor: 'anthropic', apiKey: '  sk-ant-api03-abc  ' })).toEqual({
      vendor: 'anthropic',
      apiKey: 'sk-ant-api03-abc'
    })
  })

  it('모르는 회사·빈 값·공백 포함·필드 누락은 거절한다', () => {
    expect(() => readApiKeyPayload({ vendor: 'google', apiKey: 'x' })).toThrow(/회사/)
    expect(() => readApiKeyPayload({ vendor: 'openai', apiKey: '   ' })).toThrow(/입력/)
    expect(() => readApiKeyPayload({ vendor: 'openai', apiKey: 'sk-proj\nabc' })).toThrow(/형식/)
    expect(() => readApiKeyPayload({ vendor: 'openai' })).toThrow(/잘못된 요청/)
  })
})

describe('isCodexModelId', () => {
  it('영숫자·점·밑줄·하이픈으로 된 id만 받는다', () => {
    expect(isCodexModelId('gpt-6-luna')).toBe(true)
    expect(isCodexModelId('gpt-5.6-terra')).toBe(true)
    expect(isCodexModelId('--dangerously-bypass-approvals-and-sandbox')).toBe(false)
    expect(isCodexModelId('gpt 6')).toBe(false)
    expect(isCodexModelId('')).toBe(false)
    expect(isCodexModelId('a'.repeat(65))).toBe(false)
    expect(isCodexModelId(null)).toBe(false)
  })
})

describe('buildCodexCliArgs', () => {
  const system = '당신은 요약 도우미입니다.\n"따옴표"도 있습니다.'
  const args = buildCodexCliArgs({ system, model: null, outputFile: '/tmp/out/answer.txt' })

  it('비대화 실행에 사용자 설정·세션 저장을 끄고 읽기 전용으로 돈다', () => {
    expect(args[0]).toBe('exec')
    expect(args).toEqual(
      expect.arrayContaining(['--ephemeral', '--ignore-user-config', '--skip-git-repo-check'])
    )
    expect(args[args.indexOf('--sandbox') + 1]).toBe('read-only')
  })

  it('시스템 프롬프트를 TOML 문자열로 넘기고 프롬프트는 stdin으로 받는다', () => {
    const instruction = args.find((arg) => arg.startsWith('developer_instructions='))
    expect(instruction).toBe(`developer_instructions=${JSON.stringify(system)}`)
    expect(args.at(-1)).toBe('-')
  })

  it('답변은 파일로 받는다', () => {
    expect(args[args.indexOf('--output-last-message') + 1]).toBe('/tmp/out/answer.txt')
  })

  it('모델이 null이면 --model을 넘기지 않고, 고르면 넘긴다', () => {
    expect(args).not.toContain('--model')
    const withModel = buildCodexCliArgs({ system, model: 'gpt-6-luna', outputFile: '/tmp/a.txt' })
    expect(withModel[withModel.indexOf('--model') + 1]).toBe('gpt-6-luna')
  })
})

describe('parseCodexModels', () => {
  // codex-cli 0.155 `codex debug models` 출력을 필요한 필드만 남겨 줄인 것
  const CATALOG = JSON.stringify({
    models: [
      { slug: 'gpt-5.5', display_name: 'GPT-5.5', visibility: 'list', priority: 12 },
      {
        slug: 'gpt-6-luna',
        display_name: 'GPT-6-Luna',
        description: 'Fast and affordable model for easier tasks.',
        visibility: 'list',
        priority: 3
      },
      {
        slug: 'codex-auto-review',
        display_name: 'Codex Auto Review',
        visibility: 'hide',
        priority: 43
      }
    ]
  })

  it('숨김 모델을 빼고 priority 순으로 정렬한다', () => {
    expect(parseCodexModels(CATALOG)).toEqual([
      {
        id: 'gpt-6-luna',
        label: 'GPT-6-Luna',
        description: 'Fast and affordable model for easier tasks.'
      },
      { id: 'gpt-5.5', label: 'GPT-5.5', description: null }
    ])
  })

  it('형식이 다르면 빈 배열', () => {
    expect(parseCodexModels('not json')).toEqual([])
    expect(parseCodexModels('{"items":[]}')).toEqual([])
  })
})

describe('codexErrorReason', () => {
  it('ERROR 줄의 JSON에서 메시지를 꺼낸다', () => {
    const stderr = [
      'OpenAI Codex v0.155.0',
      'model: gpt-6-sol',
      'ERROR: {"type":"error","status":400,"error":{"type":"invalid_request_error","message":"The \'gpt-6-sol\' model is not supported when using Codex with a ChatGPT account."}}',
      ''
    ].join('\n')
    expect(codexErrorReason(stderr)).toBe(
      "The 'gpt-6-sol' model is not supported when using Codex with a ChatGPT account."
    )
  })

  it('ERROR 줄이 없으면 마지막 줄, 비어 있으면 null', () => {
    expect(codexErrorReason('시작\nNot logged in\n')).toBe('Not logged in')
    expect(codexErrorReason('')).toBeNull()
  })
})

describe('readCodexModelPayload', () => {
  it('null은 CLI 기본 모델로 본다', () => {
    expect(readCodexModelPayload({ model: null })).toBeNull()
    expect(readCodexModelPayload({ model: 'gpt-6-luna' })).toBe('gpt-6-luna')
  })

  it('필드 누락·잘못된 형식은 거절한다', () => {
    expect(() => readCodexModelPayload({})).toThrow()
    expect(() => readCodexModelPayload({ model: '-c x=1' })).toThrow()
    expect(() => readCodexModelPayload('gpt-6-luna')).toThrow()
  })
})

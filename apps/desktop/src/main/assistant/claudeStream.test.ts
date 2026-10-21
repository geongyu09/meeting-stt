import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

import { buildClaudeAgentArgs, parseClaudeStreamLine } from './claudeStream'
import type { AgentStreamEvent } from './types/agentStream'

// Claude Code 2.1.304 실측 출력. 사용자 경로는 /Users/me/notes로 바꿨고 마지막 줄은 잘못된 세션 id로 --resume한 결과다
const FIXTURE_LINES = readFileSync(
  path.join(__dirname, 'fixtures', 'claudeStreamV2_1_304.jsonl'),
  'utf8'
)
  .split('\n')
  .filter(Boolean)

const allEvents = () => FIXTURE_LINES.flatMap(parseClaudeStreamLine)

const eventsOfKind = <K extends AgentStreamEvent['kind']>(kind: K) =>
  allEvents().filter(
    (event): event is Extract<AgentStreamEvent, { kind: K }> => event.kind === kind
  )

describe('buildClaudeAgentArgs', () => {
  it('첫 질문에는 --resume을 넘기지 않고 설정 소스·도구를 끄지 않는다', () => {
    const args = buildClaudeAgentArgs({ permissionMode: 'acceptEdits', sessionId: null })

    expect(args).not.toContain('--resume')
    expect(args).not.toContain('--setting-sources')
    expect(args).not.toContain('--tools')
    expect(
      args.slice(args.indexOf('--permission-mode'), args.indexOf('--permission-mode') + 2)
    ).toEqual(['--permission-mode', 'acceptEdits'])
  })

  it('이어 가는 질문에는 세션 id를 --resume으로 넘긴다', () => {
    const args = buildClaudeAgentArgs({ permissionMode: 'bypassPermissions', sessionId: 'abc' })

    expect(args.slice(-2)).toEqual(['--resume', 'abc'])
    expect(args).toContain('bypassPermissions')
  })

  it('채팅은 질문하고 기다리라는 안내를 붙이고, 루틴(isUnattended)은 붙이지 않는다', () => {
    const chat = buildClaudeAgentArgs({ permissionMode: 'acceptEdits', sessionId: null })
    const routine = buildClaudeAgentArgs({
      permissionMode: 'acceptEdits',
      sessionId: null,
      isUnattended: true
    })

    expect(chat).toContain('--append-system-prompt')
    expect(routine).not.toContain('--append-system-prompt')
    expect(routine).toContain('AskUserQuestion')
  })
})

describe('parseClaudeStreamLine', () => {
  it('init 줄에서 세션 id를 꺼낸다', () => {
    expect(eventsOfKind('session')).toEqual([
      { kind: 'session', sessionId: '530efa77-d611-47c0-a154-6b15c722a55e' }
    ])
  })

  it('글 조각을 이으면 최종 결과 글과 같다', () => {
    const streamed = eventsOfKind('text')
      .map((event) => event.text)
      .join('')
    const [success] = eventsOfKind('result')

    expect(streamed).toBe(success.text)
    expect(streamed.endsWith('완료')).toBe(true)
  })

  it('도구 이름과 대상 한 줄을 꺼내고, 고친 파일만 filePath를 단다', () => {
    expect(eventsOfKind('tool')).toEqual([
      {
        kind: 'tool',
        id: expect.stringMatching(/^toolu_/),
        name: 'Bash',
        target: 'git status --short; echo ---; cat notes/a.md',
        filePath: null
      },
      {
        kind: 'tool',
        id: expect.stringMatching(/^toolu_/),
        name: 'Read',
        target: '/Users/me/notes/notes/a.md',
        filePath: null
      },
      {
        kind: 'tool',
        id: expect.stringMatching(/^toolu_/),
        name: 'Edit',
        target: '/Users/me/notes/notes/a.md',
        filePath: '/Users/me/notes/notes/a.md'
      }
    ])
  })

  it('오류 결과는 errors 배열의 사유를 글로 쓴다', () => {
    const results = eventsOfKind('result')

    expect(results.map((event) => event.isError)).toEqual([false, true])
    expect(results[1].text).toBe(
      'No conversation found with session ID: 00000000-0000-0000-0000-000000000000'
    )
  })

  it('훅·thinking 조각·rate_limit·tool_result 줄과 JSON이 아닌 줄은 무시한다', () => {
    const ignored = FIXTURE_LINES.filter((line) =>
      /"hook_started"|"thinking_delta"|"rate_limit_event"|"type":"user"/.test(line)
    )

    expect(ignored.length).toBeGreaterThanOrEqual(4)
    expect(ignored.flatMap(parseClaudeStreamLine)).toEqual([])
    expect(parseClaudeStreamLine('Warning: something')).toEqual([])
    expect(parseClaudeStreamLine('')).toEqual([])
  })

  it('긴 여러 줄 명령은 첫 줄만 잘라 보여 준다', () => {
    const command = `${'x'.repeat(200)}\nsecond line`
    const [event] = parseClaudeStreamLine(
      JSON.stringify({
        type: 'assistant',
        message: {
          content: [{ type: 'tool_use', id: 'toolu_1', name: 'Bash', input: { command } }]
        }
      })
    )

    expect(event).toEqual({
      kind: 'tool',
      id: 'toolu_1',
      name: 'Bash',
      target: `${'x'.repeat(160)}…`,
      filePath: null
    })
  })
})

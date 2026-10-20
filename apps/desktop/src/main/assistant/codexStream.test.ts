import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

import { buildCodexAgentArgs, parseCodexStreamLine } from './codexStream'
import type { AgentStreamEvent } from './types/agentStream'

// codex-cli 0.163.0 실측 출력. 사용자 경로는 /Users/me/notes로 바꿨다.
// 앞 11줄은 파일 수정 한 턴, 뒤 5줄은 없는 모델로 실패한 턴이다
const FIXTURE_LINES = readFileSync(
  path.join(__dirname, 'fixtures', 'codexStreamV0_163_0.jsonl'),
  'utf8'
)
  .split('\n')
  .filter(Boolean)

const SUCCESS_LINES = FIXTURE_LINES.slice(0, 11)
const FAILURE_LINES = FIXTURE_LINES.slice(11)

const eventsOf = (lines: string[]) => lines.flatMap(parseCodexStreamLine)

const ofKind = <K extends AgentStreamEvent['kind']>(events: AgentStreamEvent[], kind: K) =>
  events.filter((event): event is Extract<AgentStreamEvent, { kind: K }> => event.kind === kind)

describe('buildCodexAgentArgs', () => {
  it('첫 질문은 exec에 workspace-write 샌드박스를 config로 넘긴다', () => {
    expect(
      buildCodexAgentArgs({ permissionMode: 'acceptEdits', sessionId: null, model: null })
    ).toEqual([
      'exec',
      '--json',
      '--skip-git-repo-check',
      '-c',
      'sandbox_mode="workspace-write"',
      '-'
    ])
  })

  it('이어 묻기는 exec resume 뒤 thread id를 넘기고, 모든 권한이면 샌드박스를 끈다', () => {
    expect(
      buildCodexAgentArgs({
        permissionMode: 'bypassPermissions',
        sessionId: 'thread-1',
        model: 'gpt-6-luna'
      })
    ).toEqual([
      'exec',
      'resume',
      '--json',
      '--skip-git-repo-check',
      '--dangerously-bypass-approvals-and-sandbox',
      '--model',
      'gpt-6-luna',
      'thread-1',
      '-'
    ])
  })

  it('요약 경로의 설정 무시·세션 미보관 옵션을 넣지 않는다', () => {
    const args = buildCodexAgentArgs({ permissionMode: 'acceptEdits', sessionId: 't', model: null })

    expect(args).not.toContain('--ignore-user-config')
    expect(args).not.toContain('--ephemeral')
    expect(args).not.toContain('--sandbox')
    expect(args).not.toContain('--color')
  })
})

describe('parseCodexStreamLine', () => {
  it('thread id·답변 덩어리·도구·턴 끝을 꺼낸다', () => {
    const events = eventsOf(SUCCESS_LINES)

    expect(ofKind(events, 'session')).toEqual([
      { kind: 'session', sessionId: '01a159a8-40a0-77d1-9d6d-c535fd97ddf0' }
    ])
    expect(ofKind(events, 'message').map((event) => event.text)).toEqual([
      '요청한 두 파일을 수정하겠습니다.',
      '완료'
    ])
    expect(ofKind(events, 'result')).toEqual([
      { kind: 'result', isError: false, text: '', sessionId: null }
    ])
  })

  it('명령은 셸 감싸기를 벗기고, 파일 변경은 파일마다 나눠 바뀐 파일로 단다', () => {
    const tools = ofKind(eventsOf(SUCCESS_LINES), 'tool')

    expect(tools.map(({ name }) => name)).toEqual(['Shell', 'Update', 'Add', 'Shell'])
    expect(tools[0].target?.startsWith("sed -n '1,20p' notes/a.md")).toBe(true)
    expect(tools.slice(1, 3)).toEqual([
      {
        kind: 'tool',
        id: 'item_2:0',
        name: 'Update',
        target: '/Users/me/notes/notes/a.md',
        filePath: '/Users/me/notes/notes/a.md'
      },
      {
        kind: 'tool',
        id: 'item_2:1',
        name: 'Add',
        target: '/Users/me/notes/notes/b.md',
        filePath: '/Users/me/notes/notes/b.md'
      }
    ])
  })

  it('같은 도구의 started·completed 두 줄에서 도구를 한 번만 낸다', () => {
    const ids = ofKind(eventsOf(SUCCESS_LINES), 'tool').map(({ id }) => id)

    expect(new Set(ids).size).toBe(ids.length)
  })

  it('실패한 턴은 API 오류 JSON 안쪽 문장을 쓰고, 경고 항목과 최상위 error 줄은 무시한다', () => {
    const events = eventsOf(FAILURE_LINES)

    expect(events.filter((event) => event.kind !== 'session')).toEqual([
      {
        kind: 'result',
        isError: true,
        text: "The 'no-such-model' model is not supported when using Codex with a ChatGPT account.",
        sessionId: null
      }
    ])
  })

  it('지운 파일은 바뀐 파일 목록에 넣지 않는다', () => {
    const [event] = parseCodexStreamLine(
      JSON.stringify({
        type: 'item.started',
        item: { id: 'item_0', type: 'file_change', changes: [{ path: '/w/a.md', kind: 'delete' }] }
      })
    )

    expect(event).toEqual({
      kind: 'tool',
      id: 'item_0:0',
      name: 'Delete',
      target: '/w/a.md',
      filePath: null
    })
  })

  it('JSON이 아닌 줄은 무시한다', () => {
    expect(parseCodexStreamLine('Reading prompt from stdin...')).toEqual([])
  })
})

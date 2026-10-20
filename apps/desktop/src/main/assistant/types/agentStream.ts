/**
 * 에이전트 CLI 출력에서 앱이 쓰는 이벤트. Claude Code(stream-json)와 Codex(--json)의 줄을 같은 모양으로 바꿔
 * 대화 세션이 공급자를 몰라도 되게 한다 (references/architecture.md "개인 비서 모드" > "에이전트 실행 경로").
 */
export type AgentStreamEvent =
  | { kind: 'session'; sessionId: string }
  /** 답변 글 조각 (Claude text_delta). 그대로 이어 붙인다 */
  | { kind: 'text'; text: string }
  /** 답변 글 한 덩어리 (Codex agent_message). 앞 글과 빈 줄로 잇는다 */
  | { kind: 'message'; text: string }
  | { kind: 'tool'; id: string; name: string; target: string | null; filePath: string | null }
  | { kind: 'result'; isError: boolean; text: string; sessionId: string | null }

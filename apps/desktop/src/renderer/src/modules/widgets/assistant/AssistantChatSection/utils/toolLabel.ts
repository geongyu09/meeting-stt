export type ToolLabel = 'read' | 'edit' | 'run' | 'web'

const TOOL_LABELS: Record<string, ToolLabel> = {
  Read: 'read',
  Glob: 'read',
  Grep: 'read',
  LS: 'read',
  NotebookRead: 'read',
  Write: 'edit',
  Edit: 'edit',
  MultiEdit: 'edit',
  NotebookEdit: 'edit',
  Bash: 'run',
  Shell: 'run',
  WebFetch: 'web',
  WebSearch: 'web'
}

/**
 * 도구 이름을 화면 라벨 종류로 바꿉니다. 모르는 도구는 null이라 이름 그대로 보여 준다
 * (references/features/ui.md "채팅창 리뉴얼" > "대화").
 * @example
 * toolLabelOf('Edit') // 'edit'
 * toolLabelOf('Task') // null
 */
export const toolLabelOf = (name: string): ToolLabel | null => TOOL_LABELS[name] ?? null

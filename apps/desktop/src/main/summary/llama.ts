import { cleanSummary, SUMMARY_CTX_TOKENS, SUMMARY_MAX_PREDICT_TOKENS } from '@shared/summary'

/** 요약은 창작이 아니므로 낮게 둔다. 0으로 두면 같은 문장을 반복하는 경향이 있다 */
const SUMMARY_TEMPERATURE = 0.3

/** llama-cli가 `-o` 파일에 답변 앞에 붙이는 고정 표시 */
const ASSISTANT_MARKER = '\nAssistant:\n'

interface BuildSummaryArgsParams {
  modelPath: string
  systemPromptPath: string
  promptPath: string
  outputPath: string
  threads: number
}

/**
 * llama-cli 인자. 프롬프트·시스템 프롬프트·출력을 전부 파일로 주고받는다 —
 * 회의록은 수만 자라 argv에 넣으면 길이 제한에 걸리고, `-e`(기본 켜짐)가 본문의
 * 역슬래시를 제어문자로 바꾼다 (references/architecture.md).
 */
export const buildSummaryArgs = ({
  modelPath,
  systemPromptPath,
  promptPath,
  outputPath,
  threads
}: BuildSummaryArgsParams) => [
  '-m',
  modelPath,
  '-sysf',
  systemPromptPath,
  '-f',
  promptPath,
  '-o',
  outputPath,
  // 한 턴만 돌고 끝낸다. 대화 모드로 들어가면 stdin을 기다리며 프로세스가 끝나지 않는다
  '-st',
  '--no-escape',
  '--no-display-prompt',
  '--no-warmup',
  '--no-show-timings',
  '-c',
  String(SUMMARY_CTX_TOKENS),
  '-n',
  String(SUMMARY_MAX_PREDICT_TOKENS),
  '--temp',
  String(SUMMARY_TEMPERATURE),
  '-t',
  String(threads)
]

interface ParseSummaryOutputParams {
  raw: string
  prompt: string
}

/**
 * `-o` 파일은 `User:\n<프롬프트>\n\nAssistant:\n<답변>` 형식이다.
 * 회의록 본문에도 같은 표시가 있을 수 있으므로 프롬프트가 끝나는 지점부터 찾는다.
 */
export const parseSummaryOutput = ({ raw, prompt }: ParseSummaryOutputParams) => {
  const body = prompt.trimEnd()
  const promptAt = raw.indexOf(body)
  const searchFrom = promptAt < 0 ? 0 : promptAt + body.length
  const markerAt = raw.indexOf(ASSISTANT_MARKER, searchFrom)

  if (markerAt < 0) {
    throw new Error('요약 결과를 읽지 못했습니다 (llama-cli 출력 형식이 예상과 다릅니다)')
  }

  const summary = cleanSummary(raw.slice(markerAt + ASSISTANT_MARKER.length))
  if (!summary) throw new Error('요약이 비어 있습니다 (회의록이 너무 짧을 수 있습니다)')

  return summary
}

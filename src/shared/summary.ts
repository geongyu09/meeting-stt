/**
 * 로컬 LLM 회의 요약의 순수 로직 — 회의록 분할, 프롬프트 조립, 모델 출력 정리.
 * spawn·파일 IO는 `src/main/summary/*`가 담당한다 (references/architecture.md).
 */

/**
 * Qwen3 토크나이저로 실측한 한국어 회의록의 문자/토큰 비 (40,089자 → 28,004토큰 = 1.43).
 * 예산을 넘기지 않도록 실측값보다 낮게 잡는다 (docs/phase5-results.md).
 */
const CHARS_PER_TOKEN = 1.4

/**
 * 컨텍스트를 크게 잡으면 KV 캐시가 그만큼 커진다 (Qwen3-4B는 토큰당 약 144KB).
 * 8192토큰이면 1.2GB 수준이라 저사양에서도 뜬다.
 */
export const SUMMARY_CTX_TOKENS = 8192

/**
 * 한 번의 요약이 만들어 낼 최대 토큰. 900으로 두면 71분 회의의 최종 요약이
 * 문장 중간에서 잘렸다 (docs/phase5-results.md).
 */
export const SUMMARY_MAX_PREDICT_TOKENS = 1200

/** 시스템 프롬프트와 지시문이 컨텍스트에서 차지하는 몫 */
const INSTRUCTION_TOKENS = 500

/** 회의록 본문 한 조각이 차지할 수 있는 최대 글자 수 */
export const CHUNK_BUDGET_CHARS = Math.floor(
  (SUMMARY_CTX_TOKENS - SUMMARY_MAX_PREDICT_TOKENS - INSTRUCTION_TOKENS) * CHARS_PER_TOKEN
)

/**
 * @description 글자 수로 토큰 수를 어림합니다. 실측 비율 기반이라 정확한 값이 아니라 예산 계산용입니다.
 * @param chars - 글자 수
 * @returns 어림한 토큰 수
 * @example
 * const tokens = estimateTokens({ chars: transcript.length })
 */
export const estimateTokens = ({ chars }: { chars: number }) => Math.ceil(chars / CHARS_PER_TOKEN)

/**
 * 요약이 사실을 지어내지 않도록 붙이는 시스템 프롬프트.
 * 날짜를 따로 못박는 이유: 초안에서 회의록에 없는 기한("2025년 4월 10일")을 만들어 냈다
 * (docs/phase5-results.md).
 */
export const SUMMARY_SYSTEM_PROMPT = [
  '당신은 한국어 회의록을 요약하는 도우미입니다.',
  '주어진 회의록에 실제로 나온 내용만 사용합니다.',
  '회의록에 없는 날짜·기한·숫자·이름·직책을 새로 만들어 쓰지 않습니다. 근거가 없으면 그 항목을 통째로 빼거나 "없음"이라고 씁니다.',
  '"화자 1", "화자 7" 같은 번호 라벨은 사람 이름이 아닙니다. 담당자로 쓰지 말고, 이름이 분명하지 않으면 담당자를 적지 않습니다.',
  '회의록은 음성 인식 결과라 오탈자가 있을 수 있습니다. 문맥으로 읽되 확실하지 않은 내용은 단정하지 않습니다.',
  '항상 한국어로, 요청받은 형식만 출력합니다. 인사말이나 설명을 덧붙이지 않습니다.'
].join('\n')

const FINAL_FORMAT = [
  '## 핵심 요약',
  '- (가장 중요한 것부터 5개 이내, 한 줄에 하나)',
  '',
  '## 결정 사항',
  '- (회의에서 확정된 것만 5개 이내. 없으면 "없음")',
  '',
  '## 다음 할 일',
  '- (할 일 하나에 한 줄, 5개 이내. 이름이 회의록에 분명히 나온 경우에만 "이름: "을 앞에 붙이고, 아니면 할 일만 적는다. 기한도 회의록에 나온 경우에만 덧붙인다. 없으면 "없음")'
].join('\n')

const CHUNK_FORMAT = [
  '## 논의',
  '- (이 구간에서 다룬 주제와 결론)',
  '',
  '## 결정',
  '- (이 구간에서 확정된 것만. 없으면 "없음")',
  '',
  '## 할 일',
  '- (할 일 하나에 한 줄. 이름이 분명히 나온 경우에만 "이름: "을 앞에 붙인다. 없으면 "없음")'
].join('\n')

interface SplitTranscriptParams {
  text: string
  budgetChars?: number
}

/**
 * @description 회의록을 요약 구간으로 나눕니다. 발화 줄 경계에서만 자르므로 한 발화가 두 구간에 걸치지 않습니다.
 * @param text - 회의록 전문
 * @param budgetChars - 한 구간의 최대 글자 수. 기본값은 `CHUNK_BUDGET_CHARS`
 * @returns 구간 문자열 배열. 빈 회의록이면 빈 배열
 * @example
 * const chunks = splitTranscript({ text: transcript })
 */
export const splitTranscript = ({
  text,
  budgetChars = CHUNK_BUDGET_CHARS
}: SplitTranscriptParams) => {
  const lines = text.split('\n').filter((line) => line.trim())
  if (!lines.length) return []

  const chunks: string[] = []
  let current: string[] = []
  let length = 0

  for (const line of lines) {
    // 한 줄이 예산보다 길면 쪼갤 경계가 없으므로 그대로 한 구간이 된다
    if (current.length && length + line.length + 1 > budgetChars) {
      chunks.push(current.join('\n'))
      current = []
      length = 0
    }

    current.push(line)
    length += line.length + 1
  }

  if (current.length) chunks.push(current.join('\n'))

  return chunks
}

/**
 * @description 회의록 전체가 한 번에 들어갈 때 쓰는 요약 프롬프트를 만듭니다.
 * @param transcript - 회의록 전문
 * @returns llama-cli에 파일로 넘길 프롬프트
 * @example
 * const prompt = buildWholePrompt({ transcript })
 */
export const buildWholePrompt = ({ transcript }: { transcript: string }) =>
  [
    '아래는 회의록 전문입니다.',
    '',
    transcript,
    '',
    '위 회의록을 다음 형식으로 요약하세요.',
    '',
    FINAL_FORMAT
  ].join('\n')

interface BuildChunkPromptParams {
  chunk: string
  index: number
  total: number
}

/**
 * @description 긴 회의록의 한 구간을 부분 요약하는 프롬프트를 만듭니다 (map 단계).
 * @param chunk - 구간 본문
 * @param index - 0부터 시작하는 구간 번호
 * @param total - 전체 구간 수
 * @returns llama-cli에 파일로 넘길 프롬프트
 * @example
 * const prompt = buildChunkPrompt({ chunk, index: 0, total: 5 })
 */
export const buildChunkPrompt = ({ chunk, index, total }: BuildChunkPromptParams) =>
  [
    `아래는 회의록 전체 ${total}개 구간 중 ${index + 1}번째 구간입니다.`,
    '앞뒤 구간은 보이지 않으므로, 이 구간에 실제로 나온 내용만 정리하세요.',
    '',
    chunk,
    '',
    '이 구간을 다음 형식으로 정리하세요.',
    '',
    CHUNK_FORMAT
  ].join('\n')

/**
 * @description 부분 요약들을 하나의 회의 요약으로 합치는 프롬프트를 만듭니다 (reduce 단계).
 * @param partials - `buildChunkPrompt`로 얻은 구간별 부분 요약
 * @returns llama-cli에 파일로 넘길 프롬프트
 * @example
 * const prompt = buildReducePrompt({ partials })
 */
export const buildReducePrompt = ({ partials }: { partials: string[] }) =>
  [
    '아래는 한 회의를 구간별로 나눠 정리한 부분 요약입니다.',
    '',
    partials.map((partial, index) => `### 구간 ${index + 1}\n${partial}`).join('\n\n'),
    '',
    '부분 요약들을 하나의 회의 요약으로 합치세요.',
    '중복되는 항목은 하나로 묶고, 구간 번호는 결과에 남기지 마세요.',
    '',
    FINAL_FORMAT
  ].join('\n')

const CODE_FENCE = /^```[a-z]*\n([\s\S]*?)\n```$/

/**
 * @description 모델 출력에서 코드펜스·줄 끝 공백·과한 빈 줄을 걷어냅니다.
 * @param raw - 모델이 만든 원본 텍스트
 * @returns 화면과 DB에 그대로 쓸 요약 텍스트
 * @example
 * const summary = cleanSummary(raw)
 */
export const cleanSummary = (raw: string) => {
  const trimmed = raw.trim()
  const unfenced = CODE_FENCE.exec(trimmed)?.[1] ?? trimmed

  return unfenced
    .split('\n')
    .map((line) => line.trimEnd())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

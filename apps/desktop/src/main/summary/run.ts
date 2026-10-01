import { mkdir, rm } from 'node:fs/promises'
import {
  buildChunkPrompt,
  buildReducePrompt,
  buildWholePrompt,
  cleanSummary,
  splitTranscript,
  SUMMARY_MAX_PREDICT_TOKENS,
  SUMMARY_SYSTEM_PROMPT
} from '@shared/summary'
import {
  compileTemplate,
  DEFAULT_SUMMARY_TEMPLATE,
  findMissingHeadings
} from '@shared/summaryTemplate'
import type { SummaryStage } from '@shared/types'
import { findSummaryTemplate } from '../db/summaryTemplates'
import { createLlmClient } from '../llm/provider'
import type { LlmClient } from '../llm/types'
import { info, warn } from '../log'

import { summaryWorkDir } from './paths'
import { t } from '../locale'

/** 구간 요약(map)이 전체 진행률에서 차지하는 몫. 나머지는 합치기(reduce) */
const MAP_PERCENT = 80

interface ProgressParams {
  stage: SummaryStage
  percent: number
}

interface RunSummaryParams {
  meetingId: string
  transcript: string
  templateId?: string
  onProgress: (progress: ProgressParams) => void
}

interface CompleteParams {
  client: LlmClient
  workDir: string
  prompt: string
  label: string
}

/** 공급자에 한 번 물어 정리한 요약을 돌려준다. 빈 답변은 저장하지 않는다 */
const complete = async ({ client, workDir, prompt, label }: CompleteParams) => {
  const summary = cleanSummary(
    await client.complete({
      system: SUMMARY_SYSTEM_PROMPT,
      prompt,
      maxTokens: SUMMARY_MAX_PREDICT_TOKENS,
      label,
      workDir
    })
  )
  if (!summary) throw new Error(t().main.summary.empty)

  return summary
}

type CompiledTemplate = ReturnType<typeof compileTemplate>

interface ReduceParams {
  client: LlmClient
  chunks: string[]
  workDir: string
  formats: CompiledTemplate
  onProgress: (progress: ProgressParams) => void
}

/** 구간마다 부분 요약을 만든 뒤 하나로 합친다. 한 번에 하나씩만 돌린다 */
const mapReduce = async ({ client, chunks, workDir, formats, onProgress }: ReduceParams) => {
  const partials: string[] = []

  for (const [index, chunk] of chunks.entries()) {
    onProgress({ stage: 'summarize', percent: (index / chunks.length) * MAP_PERCENT })
    partials.push(
      await complete({
        client,
        workDir,
        prompt: buildChunkPrompt({
          chunk,
          index,
          total: chunks.length,
          format: formats.chunkFormat
        }),
        label: `chunk-${index}`
      })
    )
  }

  onProgress({ stage: 'reduce', percent: MAP_PERCENT })

  return complete({
    client,
    workDir,
    prompt: buildReducePrompt({ partials, format: formats.finalFormat }),
    label: 'reduce'
  })
}

/** 템플릿은 잡이 시작할 때 읽는다. 큐에 있는 동안 지워졌으면 기본 템플릿으로 요약한다 */
const resolveTemplate = ({ meetingId, templateId }: { meetingId: string; templateId?: string }) => {
  if (!templateId) return DEFAULT_SUMMARY_TEMPLATE

  const template = findSummaryTemplate(templateId)
  if (template) return template

  warn(`회의 ${meetingId} 요약: 템플릿 ${templateId}을 찾지 못해 기본 템플릿으로 요약합니다`)
  return DEFAULT_SUMMARY_TEMPLATE
}

/** 공급자의 청크 예산에 다 들어가면 한 번에, 넘치면 map-reduce로 요약한다 */
const summarize = async ({ client, chunks, workDir, formats, onProgress }: ReduceParams) => {
  if (chunks.length > 1) return mapReduce({ client, chunks, workDir, formats, onProgress })

  onProgress({ stage: 'summarize', percent: 0 })
  return complete({
    client,
    workDir,
    prompt: buildWholePrompt({ transcript: chunks[0], format: formats.finalFormat }),
    label: 'whole'
  })
}

/**
 * 회의록 텍스트 한 개를 요약문으로 바꾼다. 공급자의 청크 예산에 다 들어가면 한 번에 요약하고,
 * 넘치면 구간별 부분 요약 → 합치기(map-reduce)로 처리한다 (references/architecture.md).
 * 공급자는 잡이 시작할 때 설정에서 한 번 읽는다.
 */
export const runSummary = async ({
  meetingId,
  transcript,
  templateId,
  onProgress
}: RunSummaryParams) => {
  const client = await createLlmClient()
  const template = resolveTemplate({ meetingId, templateId })
  const formats = compileTemplate({ blocks: template.blocks })

  const chunks = splitTranscript({ text: transcript, budgetChars: client.chunkBudgetChars })
  if (!chunks.length) throw new Error(t().main.summary.nothingToSummarize)

  const workDir = summaryWorkDir({ meetingId })
  await mkdir(workDir, { recursive: true })
  info(
    `회의 ${meetingId} 요약 시작 (${client.provider}, ${transcript.length}자, 구간 ${chunks.length}개, 템플릿 ${template.id} 블록 ${template.blocks.length}개)`
  )

  try {
    const summary = await summarize({ client, chunks, workDir, formats, onProgress })

    // 1차는 재시도하지 않는다 — 로컬 요약 시간이 두 배가 된다 (references/architecture.md "요약 템플릿")
    const missing = findMissingHeadings({ summary, headings: formats.headings })
    if (missing.length) warn(`회의 ${meetingId} 요약에 빠진 제목: ${missing.join(', ')}`)

    return summary
  } finally {
    // 회의록에서 다시 만들 수 있는 파생물이라 실패해도 남기지 않는다
    await rm(workDir, { recursive: true, force: true })
  }
}

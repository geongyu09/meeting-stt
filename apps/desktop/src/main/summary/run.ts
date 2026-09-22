import { existsSync } from 'node:fs'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import {
  buildChunkPrompt,
  buildReducePrompt,
  buildWholePrompt,
  splitTranscript,
  SUMMARY_SYSTEM_PROMPT
} from '@shared/summary'
import type { SummaryStage } from '@shared/types'
import { llamaBinPath } from '../bin/paths'
import { runBinary } from '../bin/spawn'
import { threadPlan } from '../bin/threads'
import { info } from '../log'
import { isSummaryModelReady, modelPath, summaryModelLabel } from '../models/paths'

import { buildSummaryArgs, parseSummaryOutput } from './llama'
import { summaryWorkDir } from './paths'

/** 구간 요약(map)이 전체 진행률에서 차지하는 몫. 나머지는 합치기(reduce) */
const MAP_PERCENT = 80

interface ProgressParams {
  stage: SummaryStage
  percent: number
}

interface RunSummaryParams {
  meetingId: string
  transcript: string
  onProgress: (progress: ProgressParams) => void
}

/** 실행 파일·모델이 없으면 spawn 전에 한국어로 안내하고 멈춘다 */
const ensureReady = () => {
  if (!existsSync(llamaBinPath())) {
    throw new Error('요약 실행 파일(llama-cli)이 준비되지 않았습니다')
  }

  if (!isSummaryModelReady()) {
    throw new Error(`${summaryModelLabel()}이 준비되지 않았습니다`)
  }
}

interface CompleteParams {
  workDir: string
  systemPromptPath: string
  prompt: string
  label: string
}

/** llama-cli를 한 번 돌려 답변만 돌려준다 */
const complete = async ({ workDir, systemPromptPath, prompt, label }: CompleteParams) => {
  const promptPath = path.join(workDir, `${label}.prompt.txt`)
  const outputPath = path.join(workDir, `${label}.out.txt`)
  await writeFile(promptPath, prompt, 'utf8')
  const { summary } = await threadPlan()

  await runBinary({
    command: llamaBinPath(),
    args: buildSummaryArgs({
      modelPath: modelPath('summary'),
      systemPromptPath,
      promptPath,
      outputPath,
      threads: summary
    })
  })

  return parseSummaryOutput({ raw: await readFile(outputPath, 'utf8'), prompt })
}

interface ReduceParams {
  chunks: string[]
  workDir: string
  systemPromptPath: string
  onProgress: (progress: ProgressParams) => void
}

/** 구간마다 부분 요약을 만든 뒤 하나로 합친다. llama는 한 번에 하나씩만 돌린다 */
const mapReduce = async ({ chunks, workDir, systemPromptPath, onProgress }: ReduceParams) => {
  const partials: string[] = []

  for (const [index, chunk] of chunks.entries()) {
    onProgress({ stage: 'summarize', percent: (index / chunks.length) * MAP_PERCENT })
    partials.push(
      await complete({
        workDir,
        systemPromptPath,
        prompt: buildChunkPrompt({ chunk, index, total: chunks.length }),
        label: `chunk-${index}`
      })
    )
  }

  onProgress({ stage: 'reduce', percent: MAP_PERCENT })

  return complete({
    workDir,
    systemPromptPath,
    prompt: buildReducePrompt({ partials }),
    label: 'reduce'
  })
}

/**
 * 회의록 텍스트 한 개를 요약문으로 바꾼다. 컨텍스트에 다 들어가면 한 번에 요약하고,
 * 넘치면 구간별 부분 요약 → 합치기(map-reduce)로 처리한다 (references/architecture.md).
 */
export const runSummary = async ({ meetingId, transcript, onProgress }: RunSummaryParams) => {
  ensureReady()

  const chunks = splitTranscript({ text: transcript })
  if (!chunks.length) throw new Error('요약할 회의록이 없습니다')

  const workDir = summaryWorkDir({ meetingId })
  await mkdir(workDir, { recursive: true })
  info(`회의 ${meetingId} 요약 시작 (${transcript.length}자, 구간 ${chunks.length}개)`)

  try {
    const systemPromptPath = path.join(workDir, 'system.txt')
    await writeFile(systemPromptPath, SUMMARY_SYSTEM_PROMPT, 'utf8')

    if (chunks.length === 1) {
      onProgress({ stage: 'summarize', percent: 0 })

      return await complete({
        workDir,
        systemPromptPath,
        prompt: buildWholePrompt({ transcript: chunks[0] }),
        label: 'whole'
      })
    }

    return await mapReduce({ chunks, workDir, systemPromptPath, onProgress })
  } finally {
    // 회의록에서 다시 만들 수 있는 파생물이라 실패해도 남기지 않는다
    await rm(workDir, { recursive: true, force: true })
  }
}

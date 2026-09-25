import { mkdir, rm } from 'node:fs/promises'
import {
  buildReadingGrammar,
  buildReadingPrompt,
  buildVerifyGrammar,
  buildVerifyPrompt,
  findRefineCandidates,
  parseReadings,
  parseVerifyOutput,
  READING_FORMAT_INSTRUCTION,
  READING_MAX_PREDICT_TOKENS,
  READING_SYSTEM_PROMPT,
  REFINE_CTX_TOKENS,
  REFINE_TEMPERATURE,
  splitVerifyBatches,
  VERIFY_FORMAT_INSTRUCTION,
  VERIFY_MAX_PREDICT_TOKENS,
  VERIFY_SYSTEM_PROMPT
} from '@shared/refine'
import type { RefinePair, RefineSource, RefineStage } from '@shared/types'
import { createLlmClient } from '../llm/provider'
import type { LlmClient } from '../llm/types'
import { info } from '../log'

import { refineWorkDir } from './paths'

/** 읽기 단계가 전체 진행률에서 차지하는 몫. 판정 배치가 나머지를 나눠 갖는다 */
const READ_PERCENT = 10
const FULL_PERCENT = 100

interface ProgressParams {
  stage: RefineStage
  percent: number
}

interface CompleteParams {
  client: LlmClient
  workDir: string
  system: string
  prompt: string
  grammar: string
  instruction: string
  maxTokens: number
  label: string
}

/**
 * 로컬은 GBNF 문법으로 형식을 못박고, 외부 공급자는 문법이 없어 같은 형식을 지시문으로 붙인다.
 * 형식에 맞지 않는 줄은 파서가 버린다 (references/architecture.md "회의록 교정")
 */
const complete = ({
  client,
  workDir,
  system,
  prompt,
  grammar,
  instruction,
  maxTokens,
  label
}: CompleteParams) => {
  const isLocal = client.provider === 'local'

  return client.complete({
    system,
    prompt: isLocal ? prompt : prompt + instruction,
    maxTokens,
    label,
    workDir,
    grammar: isLocal ? grammar : undefined,
    contextTokens: REFINE_CTX_TOKENS,
    temperature: REFINE_TEMPERATURE
  })
}

interface ReadingsParams {
  client: LlmClient
  glossary: string[]
  workDir: string
}

/** 읽기가 없는 라틴 문자 용어만 모델에게 묻는다. 없으면 모델을 부르지 않는다 */
const readingsOf = async ({ client, glossary, workDir }: ReadingsParams) => {
  const prompt = buildReadingPrompt({ glossary })
  if (!prompt) return parseReadings({ output: '', glossary })

  const output = await complete({
    client,
    workDir,
    system: READING_SYSTEM_PROMPT,
    prompt,
    grammar: buildReadingGrammar({ glossary }),
    instruction: READING_FORMAT_INSTRUCTION,
    maxTokens: READING_MAX_PREDICT_TOKENS,
    label: 'reading'
  })

  return parseReadings({ output, glossary })
}

interface VerifyParams {
  client: LlmClient
  sources: RefineSource[]
  candidates: RefinePair[]
  workDir: string
  onProgress: (progress: ProgressParams) => void
}

const verify = async ({ client, sources, candidates, workDir, onProgress }: VerifyParams) => {
  const batches = splitVerifyBatches({ candidates })
  const approved: RefinePair[] = []

  for (const [index, batch] of batches.entries()) {
    onProgress({
      stage: 'verify',
      percent: READ_PERCENT + (index / batches.length) * (FULL_PERCENT - READ_PERCENT)
    })
    const output = await complete({
      client,
      workDir,
      system: VERIFY_SYSTEM_PROMPT,
      prompt: buildVerifyPrompt({ batch, sources }),
      grammar: buildVerifyGrammar({ count: batch.length }),
      instruction: VERIFY_FORMAT_INSTRUCTION,
      maxTokens: VERIFY_MAX_PREDICT_TOKENS,
      label: `verify-${index}`
    })
    const passed = parseVerifyOutput({ output, batch })
    approved.push(...passed)
    info(`· 판정 ${index + 1}/${batches.length}: ${batch.length}개 중 ${passed.length}개 통과`)
  }

  return approved
}

interface RunRefineParams {
  meetingId: string
  sources: RefineSource[]
  /** 전역 + 회의별을 합쳐 정리한 용어 줄. 비어 있으면 호출하는 쪽이 먼저 거절한다 */
  glossary: string[]
  onProgress: (progress: ProgressParams) => void
}

/**
 * 회의록 발화와 용어 사전으로 수정 제안 쌍을 만든다. 코드가 발음 유사도로 후보를 만들고 LLM은 O/X만 답한다
 * (docs/phase5-refine-results.md). 공급자는 잡이 시작할 때 설정에서 한 번 읽는다.
 */
export const runRefine = async ({ meetingId, sources, glossary, onProgress }: RunRefineParams) => {
  const client = await createLlmClient()

  const workDir = refineWorkDir({ meetingId })
  await mkdir(workDir, { recursive: true })
  info(
    `회의 ${meetingId} 교정 시작 (${client.provider}, 발화 ${sources.length}개, 용어 ${glossary.length}개)`
  )

  try {
    onProgress({ stage: 'read', percent: 0 })
    const readings = await readingsOf({ client, glossary, workDir })

    const candidates = findRefineCandidates({ sources, readings })
    info(`· 후보 ${candidates.length}개`)
    if (!candidates.length) return []

    return await verify({ client, sources, candidates, workDir, onProgress })
  } finally {
    // 회의록에서 다시 만들 수 있는 파생물이라 실패해도 남기지 않는다
    await rm(workDir, { recursive: true, force: true })
  }
}

import { mkdir, rm } from 'node:fs/promises'
import {
  buildSentencePrompt,
  guardSentence,
  parseSentenceOutput,
  SENTENCE_MAX_TOKENS,
  SENTENCE_SYSTEM_PROMPT,
  splitSentenceChunks
} from '@shared/sentenceRefine'
import type { RefinePair, RefineSource, RefineStage } from '@shared/types'
import type { LlmClient } from '../llm/types'
import { info } from '../log'

import { refineWorkDir } from './paths'

const FULL_PERCENT = 100

interface RunSentenceRefineParams {
  client: LlmClient
  meetingId: string
  sources: RefineSource[]
  /** 정리한 전역 용어 줄. 비어 있어도 돈다 — 문장 교정은 용어 사전을 참고로만 쓴다 */
  glossary: string[]
  onProgress: (progress: { stage: RefineStage; percent: number }) => void
}

/**
 * 외부 공급자의 문장 교정. 조각마다 LLM이 고친 줄을 내고 코드가 발음 가드로 거른다
 * (references/architecture.md "회의록 교정 > 문장 교정"). 결과는 본문에 반영할 발화 텍스트와 반영한 쌍이다.
 */
export const runSentenceRefine = async ({
  client,
  meetingId,
  sources,
  glossary,
  onProgress
}: RunSentenceRefineParams) => {
  const chunks = splitSentenceChunks({ sources })
  const workDir = refineWorkDir({ meetingId })
  await mkdir(workDir, { recursive: true })
  info(
    `회의 ${meetingId} 문장 교정 시작 (${client.provider}, 발화 ${sources.length}개, 조각 ${chunks.length}개, 용어 ${glossary.length}개)`
  )

  try {
    const texts: { id: string; text: string }[] = []
    const pairs: RefinePair[] = []

    for (const [index, chunk] of chunks.entries()) {
      onProgress({ stage: 'sentence', percent: (index / chunks.length) * FULL_PERCENT })
      const output = await client.complete({
        system: SENTENCE_SYSTEM_PROMPT,
        prompt: buildSentencePrompt({ chunk, glossary }),
        maxTokens: SENTENCE_MAX_TOKENS,
        label: `sentence-${index}`,
        workDir
      })
      const textOf = new Map(chunk.map(({ id, text }) => [id, text]))
      const guarded = parseSentenceOutput({ output, chunk })
        .map(({ id, proposed }) =>
          guardSentence({ utteranceId: id, before: textOf.get(id) ?? '', proposed, glossary })
        )
        .filter((result) => result.pairs.length)

      texts.push(
        ...guarded.map((result) => ({ id: result.pairs[0].utteranceId, text: result.text }))
      )
      pairs.push(...guarded.flatMap((result) => result.pairs))
      info(`· 조각 ${index + 1}/${chunks.length}: 발화 ${guarded.length}개 반영`)
    }

    return { texts, pairs }
  } finally {
    // 회의록에서 다시 만들 수 있는 파생물이라 실패해도 남기지 않는다
    await rm(workDir, { recursive: true, force: true })
  }
}

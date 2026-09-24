import { existsSync } from 'node:fs'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { app } from 'electron'
import {
  buildGlossaryDraftPrompt,
  GLOSSARY_DRAFT_GRAMMAR,
  GLOSSARY_SYSTEM_PROMPT,
  parseGlossaryDraft
} from '@shared/glossary'
import { llamaBinPath } from '../bin/paths'
import { runBinary } from '../bin/spawn'
import { threadPlan } from '../bin/threads'
import { info } from '../log'
import { isSummaryModelReady, modelPath, summaryModelLabel } from '../models/paths'
import { buildGlossaryDraftArgs, extractAnswer } from '../summary/llama'

/** 초안 중에만 쓰는 프롬프트·문법·출력 파일 자리. 끝나면 실패해도 지운다 (references/architecture.md) */
const glossaryWorkDir = () => path.join(app.getPath('userData'), 'glossary')

/** 요약과 같은 실행 파일·모델을 쓴다. 없으면 spawn 전에 한국어로 안내하고 멈춘다 */
const ensureReady = () => {
  if (!existsSync(llamaBinPath())) {
    throw new Error('요약 실행 파일(llama-cli)이 준비되지 않았습니다')
  }

  if (!isSummaryModelReady()) {
    throw new Error(`용어 초안을 만들려면 ${summaryModelLabel()}을 먼저 내려받아 주세요`)
  }
}

/**
 * 팀 소개로 전역 용어 사전 초안을 만든다. 저장하지 않는다 — 모델 초안에는 틀린 읽기와 일반어가 섞여
 * 사용자가 고친 뒤 저장한다 (references/architecture.md "용어 사전").
 */
export const runGlossaryDraft = async ({ teamDescription }: { teamDescription: string }) => {
  ensureReady()

  const workDir = glossaryWorkDir()
  await mkdir(workDir, { recursive: true })

  try {
    const systemPromptPath = path.join(workDir, 'system.txt')
    const promptPath = path.join(workDir, 'prompt.txt')
    const grammarPath = path.join(workDir, 'draft.gbnf')
    const outputPath = path.join(workDir, 'out.txt')
    const prompt = buildGlossaryDraftPrompt({ teamDescription })
    await writeFile(systemPromptPath, GLOSSARY_SYSTEM_PROMPT, 'utf8')
    await writeFile(promptPath, prompt, 'utf8')
    await writeFile(grammarPath, GLOSSARY_DRAFT_GRAMMAR, 'utf8')
    const { summary: threads } = await threadPlan()

    await runBinary({
      command: llamaBinPath(),
      args: buildGlossaryDraftArgs({
        modelPath: modelPath('summary'),
        systemPromptPath,
        promptPath,
        outputPath,
        grammarPath,
        threads
      })
    })

    const terms = parseGlossaryDraft(
      extractAnswer({ raw: await readFile(outputPath, 'utf8'), prompt })
    )
    if (!terms.length) {
      throw new Error('용어 초안이 비어 있습니다. 팀 소개를 조금 더 자세히 적어 주세요')
    }
    info(`용어 초안 생성 완료 (${terms.length}개)`)

    return terms
  } finally {
    await rm(workDir, { recursive: true, force: true })
  }
}

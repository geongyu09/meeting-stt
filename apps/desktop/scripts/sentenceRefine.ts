import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'

import { buildClaudeCliArgs, parseClaudeCliOutput } from '@shared/llm'
import {
  buildSentencePrompt,
  guardSentence,
  parseSentenceOutput,
  SENTENCE_SYSTEM_PROMPT,
  splitSentenceChunks
} from '@shared/sentenceRefine'
import type { RefinePair, RefineSource } from '@shared/types'
import { SUMMARY_MODEL_ASSET } from '@meeting-stt/models/desktop'

import { parseSummaryOutput } from '../src/main/summary/llama'
import { fail, info } from './log'
import { BIN_DIR, MODELS_DIR, OUTPUT_DIR } from './paths'
import { run } from './shell'

/**
 * 문장 교정 검증 스크립트 (2026-09-28, docs/phase5-refine-results.md "문장 교정").
 * 프롬프트·파싱·발음 가드는 앱과 같은 `@shared/sentenceRefine`을 쓴다.
 *
 * 사용법: pnpm --filter meeting-stt exec tsx scripts/sentenceRefine.ts <회의록.txt> --glossary <용어 파일>
 *         [--provider local|claude-cli] [--format line|pair] [--replay <리포트.md>]
 * - `local`은 앱의 외부 공급자 경로가 아니다. 로컬 4B가 문장 교정을 못 한다는 측정을 재현하려고 남겨 둔다.
 * - `pair`는 "[번호] 틀린 말 => 고친 말" 형식 비교용. 고친 말을 원문에 끼워 넣은 줄을 같은 가드에 넣는다.
 * - `--replay`는 모델을 다시 부르지 않고 이전 리포트의 원문·모델 줄로 가드만 다시 계산한다.
 * 결과는 `fixtures/output/<이름>.sentence.<provider>.<format>.md`
 */
const LLAMA_BIN = path.join(BIN_DIR, 'llama-cli')
const SUMMARY_MODEL = path.join(MODELS_DIR, SUMMARY_MODEL_ASSET.fileName)
const CLAUDE_BIN = path.join(process.env.HOME ?? '', '.local', 'bin', 'claude')

const TRANSCRIPT_LINE = /^\[(\d{2}:\d{2}:\d{2})\] ([^:]+): (.*)$/
const PAIR_OUTPUT_LINE = /^\s*\[(\d+)\]\s*(.+?)\s*=>\s*(.+?)\s*$/

/** 로컬 8K 컨텍스트에 입력과 다시 적는 줄이 함께 들어가야 해서 조각을 작게 자른다 */
const LOCAL_CHUNK_CHARS = 1500
const LOCAL_CTX_TOKENS = 8192
const LOCAL_MAX_PREDICT_TOKENS = 3000
const LOCAL_TEMPERATURE = 0.1
/** 팬 소음을 피하려고 실험은 3스레드 + nice로 돈다 */
const LOCAL_THREADS = 3

type Provider = 'local' | 'claude-cli'
type Format = 'line' | 'pair'

const PAIR_SYSTEM_PROMPT = [
  ...SENTENCE_SYSTEM_PROMPT.split('\n').slice(0, -2),
  '출력: 고칠 말마다 "[번호] 틀린 말 => 고친 말" 형식으로 한 줄에 하나씩 씁니다. 틀린 말은 원문에 적힌 그대로 옮깁니다.',
  '고칠 말이 하나도 없으면 "없음"이라고만 씁니다.'
].join('\n')

const GRAMMARS: Record<Format, string> = {
  line: [
    'root ::= none | line+',
    'none ::= "없음\\n"',
    'line ::= "[" [0-9]+ "] " [^\\n]+ "\\n"'
  ].join('\n'),
  pair: [
    'root ::= none | line+',
    'none ::= "없음\\n"',
    'line ::= "[" [0-9]+ "] " [^=\\n]+ " => " [^\\n]+ "\\n"'
  ].join('\n')
}

interface Correction {
  id: string
  before: string
  proposed: string
  after: string
  pairs: RefinePair[]
}

const seconds = (startedAt: number) => ((performance.now() - startedAt) / 1000).toFixed(1)

const optionOf = (name: string) => {
  const args = process.argv.slice(2)
  const at = args.indexOf(name)
  return at < 0 ? undefined : args[at + 1]
}

/** 회의록 줄 번호를 발화 id로 쓴다. 리포트에서 원문 줄을 바로 찾을 수 있다 */
const parseTranscript = (text: string) =>
  text.split('\n').flatMap((line, index) => {
    const match = TRANSCRIPT_LINE.exec(line)
    return match ? [{ id: String(index + 1), time: match[1], text: match[3] }] : []
  })

const splitChunks = ({ sources, provider }: { sources: RefineSource[]; provider: Provider }) => {
  if (provider === 'claude-cli') return splitSentenceChunks({ sources })

  return sources.reduce<RefineSource[][]>((chunks, source) => {
    const last = chunks.at(-1)
    const size = last?.reduce((sum, item) => sum + item.text.length, 0) ?? 0
    if (!last || size + source.text.length > LOCAL_CHUNK_CHARS) return [...chunks, [source]]
    return [...chunks.slice(0, -1), [...last, source]]
  }, [])
}

interface CompleteParams {
  provider: Provider
  format: Format
  prompt: string
  workDir: string
  label: string
}

const completeLocal = async ({ format, prompt, workDir, label }: CompleteParams) => {
  const systemPath = path.join(workDir, `${label}.system.txt`)
  const promptPath = path.join(workDir, `${label}.prompt.txt`)
  const grammarPath = path.join(workDir, `${label}.gbnf`)
  const outputPath = path.join(workDir, `${label}.out.txt`)
  const system = format === 'pair' ? PAIR_SYSTEM_PROMPT : SENTENCE_SYSTEM_PROMPT
  await writeFile(systemPath, system, 'utf8')
  await writeFile(promptPath, prompt, 'utf8')
  await writeFile(grammarPath, GRAMMARS[format], 'utf8')

  const { code, stderr } = await run({
    command: 'nice',
    args: [
      LLAMA_BIN,
      ...['-m', SUMMARY_MODEL, '-sysf', systemPath, '-f', promptPath, '-o', outputPath],
      ...['--grammar-file', grammarPath],
      ...['-st', '--no-escape', '--no-display-prompt', '--no-warmup', '--no-show-timings'],
      ...['-c', String(LOCAL_CTX_TOKENS), '-n', String(LOCAL_MAX_PREDICT_TOKENS)],
      ...['--temp', String(LOCAL_TEMPERATURE), '-t', String(LOCAL_THREADS)]
    ]
  })
  if (code !== 0) fail(`llama-cli 비정상 종료 (코드 ${code})\n${stderr.slice(-800)}`)

  return parseSummaryOutput({ raw: await readFile(outputPath, 'utf8'), prompt })
}

const completeClaudeCli = ({ format, prompt }: CompleteParams) =>
  new Promise<string>((resolve, reject) => {
    const system = format === 'pair' ? PAIR_SYSTEM_PROMPT : SENTENCE_SYSTEM_PROMPT
    const child = spawn(CLAUDE_BIN, buildClaudeCliArgs({ system }))
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (chunk: Buffer) => (stdout += chunk.toString()))
    child.stderr.on('data', (chunk: Buffer) => (stderr += chunk.toString()))
    child.on('error', reject)
    child.on('close', (code) => {
      if (code !== 0) return reject(new Error(`claude 종료 코드 ${code}: ${stderr.slice(-400)}`))
      try {
        resolve(parseClaudeCliOutput(stdout))
      } catch (caught) {
        reject(caught)
      }
    })
    child.stdin.end(prompt)
  })

/** 쌍 형식: 틀린 말을 원문에서 찾아 고친 말로 바꾼 줄을 만든다. 원문에 없는 말을 짚었으면 버린다 */
const proposalsOfPairs = ({ output, chunk }: { output: string; chunk: RefineSource[] }) => {
  const proposed = output.split('\n').reduce((current, line) => {
    const match = PAIR_OUTPUT_LINE.exec(line)
    const source = match ? chunk[Number(match[1]) - 1] : undefined
    if (!match || !source) return current
    const text = current.get(source.id) ?? source.text
    return text.includes(match[2])
      ? new Map(current).set(source.id, text.replace(match[2], match[3]))
      : current
  }, new Map<string, string>())

  return [...proposed.entries()].map(([id, text]) => ({ id, proposed: text }))
}

const correctionOf = ({
  id,
  before,
  proposed,
  glossary
}: Omit<Correction, 'after' | 'pairs'> & { glossary: string[] }) => {
  const { text, pairs } = guardSentence({ utteranceId: id, before, proposed, glossary })
  return { id, before, proposed, after: text, pairs }
}

const buildReport = ({
  title,
  elapsedSec,
  lineCount,
  corrections
}: {
  title: string
  elapsedSec: string
  lineCount: number
  corrections: Correction[]
}) =>
  [
    `# 문장 교정: ${title}`,
    '',
    `- 소요 ${elapsedSec}초, 발화 ${lineCount}개 중 모델이 고친 줄 ${corrections.length}개`,
    `- 가드 통과 덩어리 ${corrections.flatMap((c) => c.pairs).length}개`,
    '',
    ...corrections.flatMap(({ id, before, proposed, after, pairs }) => [
      `### 줄 ${id}`,
      `- 원문: ${before}`,
      `- 모델: ${proposed}`,
      `- 반영: ${after}`,
      ...pairs.map(
        ({ from, to, similarity }) => `  - O «${from}» → «${to}» (${similarity.toFixed(2)})`
      ),
      ''
    ])
  ].join('\n')

/** 이전 리포트의 원문·모델 줄로 가드만 다시 계산한다. 모델을 다시 부르지 않는다 */
const replay = async ({ reportPath, glossary }: { reportPath: string; glossary: string[] }) => {
  const blocks = (await readFile(reportPath, 'utf8')).split('\n### ').slice(1)
  const corrections = blocks.map((block) =>
    correctionOf({
      id: /^줄 (\d+)/.exec(block)?.[1] ?? '',
      before: /^- 원문: (.*)$/m.exec(block)?.[1] ?? '',
      proposed: /^- 모델: (.*)$/m.exec(block)?.[1] ?? '',
      glossary
    })
  )
  info(
    `고친 줄 ${corrections.length}개, 가드 통과 덩어리 ${corrections.flatMap((c) => c.pairs).length}개`
  )
}

const main = async () => {
  const [transcriptPath] = process.argv.slice(2)
  const glossaryPath = optionOf('--glossary')
  if (!transcriptPath || !glossaryPath) {
    fail(
      '사용법: tsx scripts/sentenceRefine.ts <회의록.txt> --glossary <용어 파일> [--provider local|claude-cli] [--format line|pair]'
    )
  }
  const provider: Provider = optionOf('--provider') === 'claude-cli' ? 'claude-cli' : 'local'
  const format: Format = optionOf('--format') === 'pair' ? 'pair' : 'line'
  const glossary = (await readFile(glossaryPath, 'utf8')).split('\n').filter((line) => line.trim())

  const replayPath = optionOf('--replay')
  if (replayPath) return replay({ reportPath: replayPath, glossary })

  if (provider === 'local' && !existsSync(SUMMARY_MODEL)) fail('요약 모델이 없습니다')
  const lines = parseTranscript(await readFile(transcriptPath, 'utf8'))
  const sources = lines.map(({ id, text }) => ({ id, text }))
  const chunks = splitChunks({ sources, provider })

  const name = path.basename(transcriptPath).replace(/\.[^.]+$/, '')
  const workDir = path.join(OUTPUT_DIR, `${name}.sentence.work`)
  await mkdir(workDir, { recursive: true })

  const startedAt = performance.now()
  const corrections: Correction[] = []
  try {
    for (const [index, chunk] of chunks.entries()) {
      const chunkStartedAt = performance.now()
      const params = {
        provider,
        format,
        prompt: buildSentencePrompt({ chunk, glossary }),
        workDir,
        label: `chunk-${index}`
      }
      const output =
        provider === 'local' ? await completeLocal(params) : await completeClaudeCli(params)
      const proposals =
        format === 'pair'
          ? proposalsOfPairs({ output, chunk })
          : parseSentenceOutput({ output, chunk })
      const textOf = new Map(chunk.map(({ id, text }) => [id, text]))
      const chunkCorrections = proposals.map(({ id, proposed }) =>
        correctionOf({ id, before: textOf.get(id) ?? '', proposed, glossary })
      )
      corrections.push(...chunkCorrections)
      info(
        `· 조각 ${index + 1}/${chunks.length} ${seconds(chunkStartedAt)}초, 고친 줄 ${chunkCorrections.length}개`
      )
    }

    const report = buildReport({
      title: `${name} (${provider}/${format})`,
      elapsedSec: seconds(startedAt),
      lineCount: lines.length,
      corrections
    })
    const destPath = path.join(OUTPUT_DIR, `${name}.sentence.${provider}.${format}.md`)
    await writeFile(destPath, report, 'utf8')
    info(`완료 ${seconds(startedAt)}초 → ${destPath}`)
  } finally {
    await rm(workDir, { recursive: true, force: true })
  }
}

main().catch((error: unknown) => {
  fail(error instanceof Error ? error.message : String(error))
})

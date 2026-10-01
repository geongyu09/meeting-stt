// E7 LLM 화자 교정 (docs/diarization-experiments.md 4절, DiarizationLM 방식). 화자 라벨이 붙은 회의록을 창으로 잘라
// LLM에 주고 "발화 번호 → 라벨" 변경만 받는다. 겹치는 창의 판정이 다르면 바꾸지 않는다.
// 사용: pnpm --filter meeting-stt exec tsx scripts/diarExpLlm.ts --provider=claude-cli|codex-cli|local
//       [--dataset=D1] [--path=known] [--replay]
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { clusterEmbeddings } from '@meeting-stt/core/cluster'
import { SUMMARY_MODEL_ASSET } from '@meeting-stt/models/desktop'
import { buildClaudeCliArgs, buildCodexCliArgs } from '@shared/llm'
import type { MergedUtterance } from '@shared/types'

import { parseSummaryOutput } from '../src/main/summary/llama'
import { EXP_DIR, selectDatasets, type SpeakerCountPath } from './diarDatasets'
import { appendResult, evaluateSegments, loadEvalContext } from './diarEval'
import { loadClusterInput, segmentsOf } from './diarExpCluster'
import { bestManyToOne, emptyConfusion, addWeight, type ScoredPiece } from './diarScore'
import { fail, info } from './log'
import { BIN_DIR, MODELS_DIR } from './paths'
import { run } from './shell'

const TAG = 'r2.E7'
const WINDOW_UTTERANCES = 40
const WINDOW_STRIDE = WINDOW_UTTERANCES / 2
const SEC_PER_MIN = 60
const MS_PER_SEC = 1000
const PERCENT = 100
const LOCAL_CTX_TOKENS = 16384
const LOCAL_MAX_PREDICT_TOKENS = 800
const LOCAL_TEMPERATURE = 0.1
const LOCAL_THREADS = 3

const CLAUDE_BIN = path.join(process.env.HOME ?? '', '.local', 'bin', 'claude')
/** ChatGPT 데스크탑 앱에 동봉된 codex. 앱의 codexCli.ts 후보 경로와 같다 */
const CODEX_BIN = '/Applications/ChatGPT.app/Contents/Resources/codex'
const LLAMA_BIN = path.join(BIN_DIR, 'llama-cli')
const LOCAL_MODEL = path.join(MODELS_DIR, SUMMARY_MODEL_ASSET.fileName)

type Provider = 'claude-cli' | 'codex-cli' | 'local'

const SYSTEM_PROMPT = [
  '당신은 회의록의 화자 표시를 검수합니다.',
  '아래 회의록은 자동 화자 분리로 화자 라벨(S1, S2, …)이 붙었고, 일부 발화는 라벨이 틀렸습니다.',
  '대화 맥락(질문과 대답, 호칭, 말투, 앞뒤 흐름)으로 라벨이 틀렸다고 확신하는 발화만 찾아 올바른 라벨을 적습니다.',
  '규칙:',
  '- 회의록에 이미 나온 라벨만 씁니다. 새 라벨을 만들지 않습니다.',
  '- 확신이 없으면 바꾸지 않습니다. 바꿀 것이 없으면 빈 목록을 냅니다.',
  '- 텍스트는 고치지 않습니다.',
  '출력은 JSON 하나만 씁니다. 설명을 붙이지 않습니다.',
  '형식: {"changes":[{"id":발화 번호,"speaker":"라벨"}]}'
].join('\n')

interface Change {
  id: number
  speaker: string
}

interface WindowAnswer {
  from: number
  to: number
  changes: Change[]
  raw: string
  sec: number
  usage?: unknown
}

const formatTime = (sec: number) =>
  `${String(Math.floor(sec / SEC_PER_MIN)).padStart(2, '0')}:${String(Math.floor(sec % SEC_PER_MIN)).padStart(2, '0')}`

const collect = ({ command, args, input }: { command: string; args: string[]; input: string }) =>
  new Promise<string>((resolve, reject) => {
    const child = spawn(command, args, { cwd: os.tmpdir() })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (chunk: Buffer) => (stdout += chunk.toString()))
    child.stderr.on('data', (chunk: Buffer) => (stderr += chunk.toString()))
    child.on('error', reject)
    child.on('close', (code) =>
      code === 0
        ? resolve(stdout)
        : reject(new Error(`${command} 종료 코드 ${code}: ${stderr.slice(-400)}`))
    )
    child.stdin.end(input)
  })

const extractJson = (text: string): unknown => {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start < 0 || end <= start) return null
  try {
    return JSON.parse(text.slice(start, end + 1))
  } catch {
    return null
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

const completeClaude = async (prompt: string) => {
  const stdout = await collect({
    command: CLAUDE_BIN,
    args: buildClaudeCliArgs({ system: SYSTEM_PROMPT }),
    input: prompt
  })
  const parsed = extractJson(stdout)
  if (!isRecord(parsed) || typeof parsed.result !== 'string')
    throw new Error('claude 출력을 읽지 못했습니다')
  return { text: parsed.result, usage: parsed.usage }
}

const completeCodex = async (prompt: string) => {
  const outputFile = path.join(os.tmpdir(), `diarExpLlm-${process.pid}.txt`)
  await collect({
    command: CODEX_BIN,
    args: buildCodexCliArgs({ system: SYSTEM_PROMPT, model: null, outputFile }),
    input: prompt
  })
  const text = await readFile(outputFile, 'utf8')
  await rm(outputFile, { force: true })
  return { text, usage: undefined }
}

const completeLocal = async (prompt: string) => {
  const workDir = path.join(EXP_DIR, 'tmp-llm')
  await mkdir(workDir, { recursive: true })
  const systemPath = path.join(workDir, 'system.txt')
  const promptPath = path.join(workDir, 'prompt.txt')
  const outputPath = path.join(workDir, 'out.txt')
  await writeFile(systemPath, SYSTEM_PROMPT, 'utf8')
  await writeFile(promptPath, prompt, 'utf8')
  const { code, stderr } = await run({
    command: 'nice',
    args: [
      LLAMA_BIN,
      ...['-m', LOCAL_MODEL, '-sysf', systemPath, '-f', promptPath, '-o', outputPath],
      ...['-st', '--no-escape', '--no-display-prompt', '--no-warmup', '--no-show-timings'],
      ...['-c', String(LOCAL_CTX_TOKENS), '-n', String(LOCAL_MAX_PREDICT_TOKENS)],
      ...['--temp', String(LOCAL_TEMPERATURE), '-t', String(LOCAL_THREADS)]
    ]
  })
  if (code !== 0) throw new Error(`llama-cli 비정상 종료 (${code})\n${stderr.slice(-400)}`)
  return {
    text: parseSummaryOutput({ raw: await readFile(outputPath, 'utf8'), prompt }),
    usage: undefined
  }
}

const COMPLETERS: Record<Provider, (prompt: string) => Promise<{ text: string; usage?: unknown }>> =
  {
    'claude-cli': completeClaude,
    'codex-cli': completeCodex,
    local: completeLocal
  }

const parseChanges = (text: string): Change[] => {
  const parsed = extractJson(text)
  if (!isRecord(parsed) || !Array.isArray(parsed.changes)) return []
  return parsed.changes.flatMap((change: unknown) =>
    isRecord(change) && typeof change.id === 'number' && typeof change.speaker === 'string'
      ? [{ id: change.id, speaker: change.speaker }]
      : []
  )
}

/** 발화마다 그 발화를 본 모든 창이 같은 라벨로 바꾸자고 했을 때만 반영한다 */
const agreedChanges = ({
  answers,
  aliasOf
}: {
  answers: WindowAnswer[]
  aliasOf: Map<string, string>
}) => {
  const validAliases = new Set(aliasOf.values())
  const agreed = new Map<number, string>()
  const ids = new Set(answers.flatMap((answer) => answer.changes.map((change) => change.id)))
  for (const id of ids) {
    const covering = answers.filter((answer) => answer.from <= id && id < answer.to)
    const proposals = covering.map(
      (answer) => answer.changes.find((change) => change.id === id)?.speaker
    )
    const [first] = proposals
    if (first && validAliases.has(first) && proposals.every((proposal) => proposal === first))
      agreed.set(id, first)
  }
  return agreed
}

const majorityRefOf = (pieces: ScoredPiece[]) => {
  const confusion = emptyConfusion()
  for (const piece of pieces)
    addWeight({ confusion, hyp: 'all', ref: piece.refs[0], weight: piece.weight })
  return bestManyToOne(confusion).get('all')
}

const main = async () => {
  const argv = process.argv.slice(2)
  const valueOf = (name: string) => argv.find((arg) => arg.startsWith(`--${name}=`))?.split('=')[1]
  const provider = (valueOf('provider') ?? 'claude-cli') as Provider
  if (!COMPLETERS[provider]) return fail('--provider=claude-cli|codex-cli|local')
  const countPath: SpeakerCountPath = valueOf('path') === 'unknown' ? 'unknown' : 'known'
  const [dataset] = selectDatasets(valueOf('dataset') ?? 'D1')

  const context = await loadEvalContext(dataset)
  const input = await loadClusterInput({ dataset, countPath })
  if (!input) return fail(`${dataset.id}/${countPath} 고정 입력이 없습니다`)
  const speakerSegments = segmentsOf({
    input,
    labels: clusterEmbeddings({
      embeddings: input.embeddings.map((e) => e.vector),
      clusterCount: input.clusterCount
    })
  })
  const base = evaluateSegments({ context, speakerSegments, countPath })
  const utterances = base.utteranceList

  const aliasOf = new Map<string, string>()
  for (const utterance of utterances) {
    if (!aliasOf.has(utterance.speakerLabel))
      aliasOf.set(utterance.speakerLabel, `S${aliasOf.size + 1}`)
  }
  const labelOfAlias = new Map([...aliasOf].map(([label, alias]) => [alias, label]))

  const answersPath = path.join(EXP_DIR, `E7.${dataset.id}.${countPath}.${provider}.json`)
  let answers: WindowAnswer[] = []
  if (argv.includes('--replay') && existsSync(answersPath)) {
    answers = JSON.parse(await readFile(answersPath, 'utf8')) as WindowAnswer[]
  } else {
    for (let from = 0; from < utterances.length; from += WINDOW_STRIDE) {
      const to = Math.min(utterances.length, from + WINDOW_UTTERANCES)
      const prompt = utterances
        .slice(from, to)
        .map(
          (u) => `[${u.ord}] ${aliasOf.get(u.speakerLabel)} (${formatTime(u.startSec)}): ${u.text}`
        )
        .join('\n')
      const startedAt = performance.now()
      const { text, usage } = await COMPLETERS[provider](prompt)
      const sec = (performance.now() - startedAt) / MS_PER_SEC
      const changes = parseChanges(text)
      answers.push({ from, to, changes, raw: text, sec, usage })
      info(
        `  창 ${from}~${to - 1}: 변경 제안 ${changes.length}개 · ${sec.toFixed(1)}초 · 입력 ${prompt.length}자`
      )
      if (to === utterances.length) break
    }
    await writeFile(answersPath, JSON.stringify(answers, null, 1), 'utf8')
  }

  const agreed = agreedChanges({ answers, aliasOf })
  const relabel = (list: MergedUtterance[]) =>
    list.map((u) => {
      const alias = agreed.get(u.ord)
      const label = alias ? labelOfAlias.get(alias) : undefined
      return label && label !== u.speakerLabel ? { ...u, speakerLabel: label } : u
    })
  const result = evaluateSegments({ context, speakerSegments, countPath, relabel })

  // 정밀도: 바꾼 발화의 다수 정답 화자가, 기준선 매핑으로 본 새 라벨의 화자와 같은가
  const changed = utterances.filter(
    (u, index) => relabel(utterances)[index].speakerLabel !== u.speakerLabel
  )
  const mapping = base.score?.mapping ?? new Map<string, string>()
  const judged = changed.flatMap((u) => {
    const pieces = (base.scored ?? []).filter((piece) => piece.utteranceOrd === u.ord)
    if (!pieces.length) return []
    const truth = majorityRefOf(pieces)
    const newLabel = labelOfAlias.get(agreed.get(u.ord) ?? '') ?? ''
    return [
      { wasRight: mapping.get(u.speakerLabel) === truth, isRight: mapping.get(newLabel) === truth }
    ]
  })
  const fixed = judged.filter((j) => j.isRight).length
  const broken = judged.filter((j) => j.wasRight && !j.isRight).length
  const totalSec = answers.reduce((sum, answer) => sum + answer.sec, 0)
  const promptChars = utterances.reduce((sum, u) => sum + u.text.length, 0)
  const note = `제안 ${answers.reduce((sum, a) => sum + a.changes.length, 0)}개 → 합의 반영 ${changed.length}개 · 맞게 ${fixed}/${judged.length} (${judged.length ? ((fixed / judged.length) * PERCENT).toFixed(0) : 0}%) · 맞던 것을 틀리게 ${broken} · 창 ${answers.length}개 ${totalSec.toFixed(0)}초 · 회의록 ${promptChars}자`

  await appendResult({ tag: `${TAG}.base`, dataset, countPath, result: base })
  await appendResult({ tag: `${TAG}.${provider}`, dataset, countPath, result, note })
  info(`  ${note}`)
}

main().catch((error) => fail(error instanceof Error ? error.message : String(error)))

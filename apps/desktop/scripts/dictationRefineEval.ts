// 받아쓰기 다듬기 규칙이 CER을 올리지 않는지 잰다. whisper 결과(기본 zeroth100 turbo 출력)에 규칙을 단계별로 적용해
// 정답 전사본과의 CER을 비교한다. 규칙이 CER을 올리면 그 규칙을 뺀다 (references/architecture.md "받아쓰기" > "측정").
// 사용: pnpm --filter meeting-stt exec tsx scripts/dictationRefineEval.ts [--hyp=결과.txt] [--ref=정답.txt]
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import path from 'node:path'

import {
  BUILT_IN_DICTATION_TERMS,
  applyTermReadings,
  refineDictationText
} from '@meeting-stt/core/dictation'

import { computeCer } from './cer'
import { fail, info } from './log'
import { FIXTURES_DIR, OUTPUT_DIR } from './paths'

const DEFAULT_HYPOTHESIS = path.join(OUTPUT_DIR, 'zeroth100.zeroth100-turbo.txt')
const DEFAULT_REFERENCE = path.join(FIXTURES_DIR, 'reference', 'zeroth100.txt')
const PERCENT = 100

const valueOf = ({ argv, name }: { argv: string[]; name: string }) => {
  const prefix = `--${name}=`
  return argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length)
}

/** 줄마다 다듬고 바뀐 줄을 모아 보여 준다 — 어떤 치환이 CER을 움직였는지 눈으로 확인한다 */
const applyPerLine = ({ lines, apply }: { lines: string[]; apply: (line: string) => string }) => {
  const results = lines.map((line) => ({ before: line, after: apply(line) }))

  return {
    text: results.map(({ after }) => after).join('\n'),
    changed: results.filter(({ before, after }) => before !== after)
  }
}

const main = async () => {
  const argv = process.argv.slice(2)
  const hypothesisPath = valueOf({ argv, name: 'hyp' }) ?? DEFAULT_HYPOTHESIS
  const referencePath = valueOf({ argv, name: 'ref' }) ?? DEFAULT_REFERENCE
  for (const file of [hypothesisPath, referencePath]) {
    if (!existsSync(file)) fail(`${file} 이(가) 없습니다`)
  }

  const reference = await readFile(referencePath, 'utf-8')
  const lines = (await readFile(hypothesisPath, 'utf-8')).split('\n')

  const variants = [
    { label: '규칙 없음', apply: (line: string) => line },
    {
      label: '비음성·간투사·공백 (용어 치환 없음)',
      apply: (line: string) => refineDictationText({ text: line, terms: [] })
    },
    {
      label: '+ 내장 읽기 사전 치환',
      apply: (line: string) => refineDictationText({ text: line, terms: BUILT_IN_DICTATION_TERMS })
    },
    {
      label: '내장 읽기 사전 치환만',
      apply: (line: string) => applyTermReadings({ text: line, terms: BUILT_IN_DICTATION_TERMS })
    }
  ]

  info(`인식 결과 ${path.basename(hypothesisPath)} · 정답 ${path.basename(referencePath)}`)
  info('')
  for (const variant of variants) {
    const { text, changed } = applyPerLine({ lines, apply: variant.apply })
    const score = computeCer({ hypothesis: text, reference })
    info(
      `${variant.label}: CER ${(score.cer * PERCENT).toFixed(2)}% (치환 ${score.substitutions} · 삭제 ${score.deletions} · 삽입 ${score.insertions}) · 바뀐 줄 ${changed.length}`
    )
    changed.slice(0, 20).forEach(({ before, after }) => {
      info(`  - ${before}`)
      info(`  + ${after}`)
    })
  }
}

main().catch((error: unknown) => {
  fail(error instanceof Error ? error.message : String(error))
})

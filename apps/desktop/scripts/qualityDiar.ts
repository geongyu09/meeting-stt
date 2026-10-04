// 녹음 품질 측정 4절 (docs/recording-quality-results.md): 임의의 WAV를 앱과 같은 순서(정규화 → CLI 화자 분리)로 돌려
// 화자 구간 파일을 만든다. 재군집과 채점은 기존 recluster.ts · diarBench.ts를 그대로 쓴다.
// 사용: nice -n 15 pnpm --filter meeting-stt exec tsx scripts/qualityDiar.ts --wav=<녹음.wav> --tag=<이름> [--speakers=N]
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

import { buildDiarizeArgs } from '../src/main/pipeline/diarize'
import { normalizeWavFile } from '../src/main/pipeline/normalize'
import { EXPERIMENT_THREADS } from './diarDatasets'
import { fail, info } from './log'
import { DIARIZE_BIN, EMBEDDING_MODEL, SEGMENTATION_MODEL } from './paths'
import { QUALITY_DIR } from './qualityData'
import { run } from './shell'

const NICE_LEVEL = '15'

const main = async () => {
  const valueOf = (name: string) =>
    process.argv.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3)
  const wavPath = valueOf('wav')
  const tag = valueOf('tag')
  if (!wavPath || !tag) return fail('--wav와 --tag를 주세요')

  const speakers = valueOf('speakers')
  const normPath = path.join(QUALITY_DIR, `${tag}.norm.wav`)
  const diarPath = path.join(QUALITY_DIR, `${tag}.diar.nc${speakers ?? 'auto'}.txt`)

  await mkdir(QUALITY_DIR, { recursive: true })
  await normalizeWavFile({ inputPath: wavPath, outputPath: normPath })
  const result = await run({
    command: 'nice',
    args: [
      '-n',
      NICE_LEVEL,
      DIARIZE_BIN,
      ...buildDiarizeArgs({
        segmentationModelPath: SEGMENTATION_MODEL,
        embeddingModelPath: EMBEDDING_MODEL,
        audioPath: normPath,
        threads: EXPERIMENT_THREADS,
        speakerCount: speakers ? Number(speakers) : undefined
      })
    ]
  })
  if (result.code !== 0)
    fail(`화자 분리 비정상 종료 (${result.code})\n${result.stderr.slice(-400)}`)

  await writeFile(diarPath, result.stdout, 'utf-8')
  info(`${normPath}\n${diarPath}`)
}

main().catch((error: unknown) => {
  fail(error instanceof Error ? error.message : String(error))
})

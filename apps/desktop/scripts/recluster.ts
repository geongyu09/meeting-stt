// sherpa-onnx CLI가 낸 화자 구간을 앱과 같은 방식으로 재군집한다 (references/architecture.md "화자 재군집").
// 구간을 조각으로 잘라 sherpa-onnx-node로 재임베딩(캐시)하고 k-means + 중심 병합으로 라벨을 새로 붙여
// CLI stdout과 같은 형식으로 쓴다. 결과는 diarBench.ts로 채점한다.
// 사용: pnpm --filter meeting-stt exec tsx scripts/recluster.ts --diar=<구간.txt> --wav=<정규화 WAV>
//       [--speakers=N] [--merge=0.75] [--chunk=5] [--threads=3] [--out=<파일>] [--cache=<임베딩 json>] [--no-cache]
import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

import {
  CENTROID_MERGE_MIN_COSINE,
  OVERSPLIT_CLUSTER_COUNT,
  RECLUSTER_CHUNK_MAX_SEC,
  reclusterChunks,
  splitIntoChunks,
  type ChunkEmbedding,
  type TimeSpan
} from '@meeting-stt/core/cluster'
import type { SpeakerSegment } from '@shared/types'

import { parseDiarizeOutput } from '../src/main/pipeline/diarize'
import { embedChunks } from '../src/main/pipeline/speakerEmbedding'
import { fail, info } from './log'
import { EMBEDDING_MODEL, OUTPUT_DIR } from './paths'

const DEFAULT_THREADS = 3
const MS_PER_SEC = 1000
const TIME_DECIMALS = 3

interface ReclusterOptions {
  diarPath: string
  wavPath: string
  speakerCount?: number
  mergeMinCosine: number
  chunkMaxSec: number
  threads: number
  outPath: string
  cachePath: string
  isCacheUsed: boolean
}

interface EmbeddingCache {
  wavPath: string
  chunkMaxSec: number
  chunkCount: number
  dim: number
  embeddings: { chunkIndex: number; vector: number[] }[]
}

const parseOptions = (argv: string[]): ReclusterOptions => {
  const valueOf = (name: string) => {
    const prefix = `--${name}=`
    return argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length)
  }
  const diarPath = valueOf('diar')
  const wavPath = valueOf('wav')
  if (!diarPath || !wavPath) return fail('--diar=<화자 구간 파일> --wav=<정규화 WAV> 를 주세요')

  const speakers = valueOf('speakers')
  const speakerCount = speakers ? Number(speakers) : undefined
  const mergeMinCosine = Number(valueOf('merge') ?? CENTROID_MERGE_MIN_COSINE)
  const chunkMaxSec = Number(valueOf('chunk') ?? RECLUSTER_CHUNK_MAX_SEC)
  const stem = path.basename(diarPath, '.txt')
  const tag = `k${speakerCount ?? 'auto'}.m${mergeMinCosine}.c${chunkMaxSec}`

  return {
    diarPath,
    wavPath,
    speakerCount,
    mergeMinCosine,
    chunkMaxSec,
    threads: Number(valueOf('threads') ?? DEFAULT_THREADS),
    outPath: valueOf('out') ?? path.join(OUTPUT_DIR, `${stem}.recluster.${tag}.txt`),
    cachePath: valueOf('cache') ?? path.join(OUTPUT_DIR, `${stem}.emb.c${chunkMaxSec}.json`),
    isCacheUsed: !argv.includes('--no-cache')
  }
}

const readCache = async ({
  options,
  chunks
}: {
  options: ReclusterOptions
  chunks: TimeSpan[]
}) => {
  if (!options.isCacheUsed || !existsSync(options.cachePath)) return null

  const cache = JSON.parse(await readFile(options.cachePath, 'utf-8')) as EmbeddingCache
  const isMatch =
    cache.wavPath === options.wavPath &&
    cache.chunkMaxSec === options.chunkMaxSec &&
    cache.chunkCount === chunks.length
  if (!isMatch) return null

  info(`임베딩 캐시 사용: ${options.cachePath} (${cache.embeddings.length}개)`)
  return cache.embeddings.map<ChunkEmbedding>(({ chunkIndex, vector }) => ({
    chunkIndex,
    vector: Float32Array.from(vector)
  }))
}

const writeCache = async ({
  options,
  chunks,
  dim,
  embeddings
}: {
  options: ReclusterOptions
  chunks: TimeSpan[]
  dim: number
  embeddings: ChunkEmbedding[]
}) => {
  const cache: EmbeddingCache = {
    wavPath: options.wavPath,
    chunkMaxSec: options.chunkMaxSec,
    chunkCount: chunks.length,
    dim,
    embeddings: embeddings.map(({ chunkIndex, vector }) => ({ chunkIndex, vector: [...vector] }))
  }
  await writeFile(options.cachePath, JSON.stringify(cache), 'utf-8')
}

const loadEmbeddings = async ({
  options,
  chunks
}: {
  options: ReclusterOptions
  chunks: TimeSpan[]
}) => {
  const cached = await readCache({ options, chunks })
  if (cached) return cached

  const startedAt = performance.now()
  const { dim, embeddings } = embedChunks({
    modelPath: EMBEDDING_MODEL,
    audioPath: options.wavPath,
    chunks,
    threads: options.threads,
    onProgress: ({ done, total }) => {
      if (done % 500 === 0 || done === total) info(`  임베딩 ${done}/${total}`)
    }
  })
  info(
    `임베딩 ${embeddings.length}/${chunks.length}개 · ${dim}차원 · ${((performance.now() - startedAt) / MS_PER_SEC).toFixed(1)}초 (${options.threads}스레드)`
  )
  if (options.isCacheUsed) await writeCache({ options, chunks, dim, embeddings })

  return embeddings
}

const formatSegments = (segments: SpeakerSegment[]) =>
  segments
    .map(
      (segment) =>
        `${segment.start.toFixed(TIME_DECIMALS)} -- ${segment.end.toFixed(TIME_DECIMALS)} ${segment.speaker}`
    )
    .join('\n')

const summarizeSpeakers = (segments: SpeakerSegment[]) => {
  const totals = new Map<string, number>()
  for (const segment of segments) {
    totals.set(segment.speaker, (totals.get(segment.speaker) ?? 0) + segment.end - segment.start)
  }

  return [...totals]
    .sort((a, b) => b[1] - a[1])
    .map(([speaker, total]) => `${speaker} ${Math.round(total)}초`)
    .join(', ')
}

const main = async () => {
  const options = parseOptions(process.argv.slice(2))
  if (!existsSync(EMBEDDING_MODEL)) return fail(`${EMBEDDING_MODEL} 이(가) 없습니다`)

  const cliSegments = parseDiarizeOutput(await readFile(options.diarPath, 'utf-8'))
  if (!cliSegments.length) return fail(`${options.diarPath} 에 화자 구간이 없습니다`)
  await mkdir(OUTPUT_DIR, { recursive: true })

  const chunks = splitIntoChunks({ segments: cliSegments, maxChunkSec: options.chunkMaxSec })
  info(`CLI 구간 ${cliSegments.length}개 → ${options.chunkMaxSec}초 이하 조각 ${chunks.length}개`)

  const embeddings = await loadEmbeddings({ options, chunks })
  const clusterCount = options.speakerCount ?? OVERSPLIT_CLUSTER_COUNT
  const startedAt = performance.now()
  const segments = reclusterChunks({
    chunks,
    embeddings,
    clusterCount,
    mergeMinCosine: options.mergeMinCosine
  })
  info(
    `재군집 K=${clusterCount} 병합≥${options.mergeMinCosine}: ${((performance.now() - startedAt) / MS_PER_SEC).toFixed(1)}초 → ${summarizeSpeakers(segments)}`
  )

  await writeFile(options.outPath, `${formatSegments(segments)}\n`, 'utf-8')
  info(`결과: ${options.outPath}`)
}

main().catch((error) => fail(error instanceof Error ? error.message : String(error)))

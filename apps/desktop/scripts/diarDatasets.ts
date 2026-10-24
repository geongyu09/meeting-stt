// 화자 분리 2차 실험의 데이터셋 묶음 (docs/diarization-experiments.md 3-1절).
// 데이터셋 ID 하나로 원본·고정 입력(정규화 WAV, STT JSON, CLI 구간, 임베딩 캐시)·정답 경로를 찾는다.
import { existsSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

import {
  OVERSPLIT_CLUSTER_COUNT,
  RECLUSTER_CHUNK_MAX_SEC,
  splitIntoChunks,
  type ChunkEmbedding,
  type TimeSpan
} from '@meeting-stt/core/cluster'
import type { SpeakerSegment, SttSegment } from '@shared/types'

import { parseDiarizeOutput } from '../src/main/pipeline/diarize'
import { embedChunks } from '../src/main/pipeline/speakerEmbedding'
import { parseWhisperOutput } from '../src/main/pipeline/whisper'
import {
  parseReferenceTurns,
  parseRttm,
  parseUem,
  type Reference,
  type ReferenceFormat
} from './diarScore'
import { fail, info } from './log'
import { AUDIO_DIR, EMBEDDING_MODEL, FIXTURES_DIR, OUTPUT_DIR } from './paths'

const DATASETS_DIR = path.join(FIXTURES_DIR, 'datasets')
const REFERENCE_DIR = path.join(FIXTURES_DIR, 'reference')
/** 2차 실험의 고정 입력과 결과를 모아 두는 곳 */
export const EXP_DIR = path.join(OUTPUT_DIR, 'exp')
/** 팬 소음을 피하려고 실험은 3스레드로 돌린다 (docs/diarization-experiments.md 7절) */
export const EXPERIMENT_THREADS = 3
const MS_PER_SEC = 1000

export type DatasetGroup = 'D1' | 'D2' | 'D3s' | 'D4s' | 'D5' | 'D6'
/** known = 참석자 수 입력(CLI·K 모두 정답 화자 수), unknown = 참석자 수 없음(둘 다 12) */
export type SpeakerCountPath = 'known' | 'unknown'

export interface DiarDataset {
  id: string
  group: DatasetGroup
  language: 'ko' | 'en'
  /** 정답 화자 수. 정답본이 없는 D2는 1차 실험에서 입력한 값(4)이라 정답이 아니다 */
  speakerCount: number
  sourcePath: string
  normPath: string
  sttPath: string
  cliPathOf: (clusterCount: number) => string
  reference?: { format: ReferenceFormat; path: string; uemPath?: string }
  /** 온라인 회의: 섞기 전 마이크·시스템 소리 */
  channelPaths?: { mic: string; system: string }
}

interface DefaultPathsParams {
  id: string
  group: DatasetGroup
  language: 'ko' | 'en'
  speakerCount: number
  sourcePath: string
}

const withDefaultPaths = (params: DefaultPathsParams) => ({
  ...params,
  normPath: path.join(EXP_DIR, `${params.id}.norm.wav`),
  sttPath: path.join(EXP_DIR, `${params.id}.stt.json`),
  cliPathOf: (clusterCount: number) => path.join(EXP_DIR, `${params.id}.diar.nc${clusterCount}.txt`)
})

const simDataset = ({
  id,
  speakerCount,
  isOnline = false
}: {
  id: string
  speakerCount: number
  isOnline?: boolean
}): DiarDataset => {
  const stem = path.join(DATASETS_DIR, 'sim', id)
  return {
    ...withDefaultPaths({
      id,
      group: isOnline ? 'D4s' : 'D3s',
      language: 'ko',
      speakerCount,
      sourcePath: `${stem}.wav`
    }),
    reference: { format: 'rttm', path: `${stem}.rttm` },
    ...(isOnline ? { channelPaths: { mic: `${stem}.mic.wav`, system: `${stem}.system.wav` } } : {})
  }
}

const AMI_MEETINGS = ['ES2004a', 'IS1009a', 'TS3003a', 'EN2002a']
const AMI_MICS = [
  { suffix: 'mix', file: 'Mix-Headset' },
  { suffix: 'arr', file: 'Array1-01' }
]

const amiDatasets = AMI_MEETINGS.flatMap((meeting) =>
  AMI_MICS.map<DiarDataset>(({ suffix, file }) => ({
    ...withDefaultPaths({
      id: `ami-${meeting}-${suffix}`,
      group: 'D5',
      language: 'en',
      speakerCount: 4,
      sourcePath: path.join(DATASETS_DIR, 'ami', 'audio', `${meeting}.${file}.wav`)
    }),
    reference: {
      format: 'rttm',
      path: path.join(DATASETS_DIR, 'ami', 'rttm', `${meeting}.rttm`),
      uemPath: path.join(DATASETS_DIR, 'ami', 'uem', `${meeting}.uem`)
    }
  }))
)

export const DATASETS: DiarDataset[] = [
  {
    id: 'D1',
    group: 'D1',
    language: 'ko',
    speakerCount: 7,
    sourcePath: path.join(AUDIO_DIR, 'jun-meeting.wav'),
    normPath: path.join(OUTPUT_DIR, 'jun-meeting.norm.wav'),
    sttPath: path.join(OUTPUT_DIR, 'jun-meeting.baseline.json'),
    cliPathOf: (clusterCount) => path.join(OUTPUT_DIR, `jun-meeting.diar.nc${clusterCount}.txt`),
    reference: { format: 'clova', path: path.join(REFERENCE_DIR, 'jun-meeting.clova-speakers.txt') }
  },
  {
    id: 'D2',
    group: 'D2',
    language: 'ko',
    speakerCount: 4,
    sourcePath: path.join(AUDIO_DIR, 'geumtoro.wav'),
    normPath: path.join(OUTPUT_DIR, 'geumtoro.norm.wav'),
    sttPath: path.join(OUTPUT_DIR, 'geumtoro.baseline.json'),
    // nc4는 1차 실험 산출물(같은 정규화본으로 돌린 것)을 그대로 쓴다
    cliPathOf: (clusterCount) =>
      clusterCount === 4
        ? path.join(OUTPUT_DIR, 'geumtoro-rmsnorm.diar.nc4.txt')
        : path.join(EXP_DIR, `D2.diar.nc${clusterCount}.txt`)
  },
  simDataset({ id: 'sim-2a', speakerCount: 2 }),
  simDataset({ id: 'sim-3a', speakerCount: 3 }),
  simDataset({ id: 'sim-3b', speakerCount: 3 }),
  simDataset({ id: 'sim-5a', speakerCount: 5 }),
  simDataset({ id: 'onl-3h', speakerCount: 3, isOnline: true }),
  simDataset({ id: 'onl-3s', speakerCount: 3, isOnline: true }),
  simDataset({ id: 'onl-4s', speakerCount: 4, isOnline: true }),
  ...amiDatasets,
  // D6: 채팅창 리뉴얼 뒤 참석자 수 없이 처리된 실제 녹음. 정답본 없이 화자 수만 사용자에게 받았다 (E11)
  ...[
    { id: 'D6-mentoring', speakerCount: 6 },
    { id: 'D6-promo', speakerCount: 5 },
    { id: 'D6-retro', speakerCount: 5 }
  ].map<DiarDataset>(({ id, speakerCount }) =>
    withDefaultPaths({
      id,
      group: 'D6',
      language: 'ko',
      speakerCount,
      sourcePath: path.join(AUDIO_DIR, `real-1023-${id.slice('D6-'.length)}.wav`)
    })
  )
]

/** `D5`처럼 묶음 이름을 주면 그 묶음 전체, `all`이면 전부, 아니면 쉼표로 나눈 ID 목록 */
export const selectDatasets = (selector = 'all') => {
  const keys = selector.split(',')
  const selected = DATASETS.filter(
    (dataset) => keys.includes('all') || keys.includes(dataset.id) || keys.includes(dataset.group)
  )
  return selected.length ? selected : fail(`데이터셋을 찾지 못했습니다: ${selector}`)
}

export const clusterCountOf = ({
  dataset,
  countPath
}: {
  dataset: DiarDataset
  countPath: SpeakerCountPath
}) => (countPath === 'known' ? dataset.speakerCount : OVERSPLIT_CLUSTER_COUNT)

export const cliPathFor = ({
  dataset,
  countPath
}: {
  dataset: DiarDataset
  countPath: SpeakerCountPath
}) => dataset.cliPathOf(clusterCountOf({ dataset, countPath }))

export const embeddingCachePathOf = (cliPath: string) =>
  cliPath.replace(/\.txt$/, `.emb.c${RECLUSTER_CHUNK_MAX_SEC}.json`)

export const loadReference = async (dataset: DiarDataset): Promise<Reference | undefined> => {
  if (!dataset.reference) return undefined

  const { format, path: referencePath, uemPath } = dataset.reference
  const text = await readFile(referencePath, 'utf-8')
  return {
    format,
    turns: format === 'clova' ? parseReferenceTurns(text) : parseRttm(text),
    scoredRange: uemPath ? parseUem(await readFile(uemPath, 'utf-8')) : undefined
  }
}

export const loadSttSegments = async (dataset: DiarDataset): Promise<SttSegment[]> =>
  parseWhisperOutput(await readFile(dataset.sttPath))

export const loadCliSegments = async (cliPath: string): Promise<SpeakerSegment[]> =>
  parseDiarizeOutput(await readFile(cliPath, 'utf-8'))

interface EmbeddingCache {
  wavPath: string
  chunkMaxSec: number
  chunkCount: number
  dim: number
  embeddings: { chunkIndex: number; vector: number[] }[]
}

/** 구간을 임의 조각으로 잘라 임베딩한다. cachePath가 있고 조각 수가 맞으면 캐시를 쓴다 */
export const embedWithCache = async ({
  wavPath,
  chunks,
  cachePath
}: {
  wavPath: string
  chunks: TimeSpan[]
  cachePath: string
}) => {
  if (existsSync(cachePath)) {
    const cache = JSON.parse(await readFile(cachePath, 'utf-8')) as EmbeddingCache
    if (cache.chunkCount === chunks.length) {
      return {
        elapsedSec: 0,
        embeddings: cache.embeddings.map<ChunkEmbedding>(({ chunkIndex, vector }) => ({
          chunkIndex,
          vector: Float32Array.from(vector)
        }))
      }
    }
  }

  const startedAt = performance.now()
  const { dim, embeddings } = embedChunks({
    modelPath: EMBEDDING_MODEL,
    audioPath: wavPath,
    chunks,
    threads: EXPERIMENT_THREADS
  })
  const elapsedSec = (performance.now() - startedAt) / MS_PER_SEC
  info(`  임베딩 ${embeddings.length}/${chunks.length}개 · ${elapsedSec.toFixed(1)}초`)

  const cache: EmbeddingCache = {
    wavPath,
    chunkMaxSec: RECLUSTER_CHUNK_MAX_SEC,
    chunkCount: chunks.length,
    dim,
    embeddings: embeddings.map(({ chunkIndex, vector }) => ({ chunkIndex, vector: [...vector] }))
  }
  await writeFile(cachePath, JSON.stringify(cache), 'utf-8')
  return { elapsedSec, embeddings }
}

/** 앱과 같은 재군집 입력: CLI 구간 → 5초 이하 조각 → 조각 임베딩 */
export const loadReclusterInputs = async ({
  dataset,
  countPath
}: {
  dataset: DiarDataset
  countPath: SpeakerCountPath
}) => {
  const cliPath = cliPathFor({ dataset, countPath })
  const cliSegments = await loadCliSegments(cliPath)
  const chunks = splitIntoChunks({ segments: cliSegments })
  const { embeddings, elapsedSec } = await embedWithCache({
    wavPath: dataset.normPath,
    chunks,
    cachePath: embeddingCachePathOf(cliPath)
  })
  return { cliSegments, chunks, embeddings, embedSec: elapsedSec }
}

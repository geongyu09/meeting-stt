import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { app } from 'electron'
import { SAMPLE_RATE_HZ } from '@shared/audio'
import { normalizeGlossaryTerms, termNameOf } from '@shared/glossary'
import type { SttSegment } from '@shared/types'
import { whisperBinPath } from '../bin/paths'
import { runBinary } from '../bin/spawn'
import { threadPlan } from '../bin/threads'
import { getGlossarySettings } from '../db/settings'
import { info, messageOf, warn } from '../log'
import { modelPath } from '../models/paths'
import { buildWhisperArgs, parseWhisperOutput } from '../pipeline/whisper'
import { resolveTermPrompt } from '../pipeline/whisperPrompt'
import {
  EMPTY_STT_CHUNKER,
  flushSttChunker,
  pushSttChunk,
  shiftSegment,
  type SttPiece
} from './sttChunks'
import { buildNormalizedWav } from './whisperOnce'

/**
 * 메모 녹음의 녹음 중 STT. 녹음 세션이 WAV에 쓰는 샘플을 받아 20~25초 조각마다 파이프라인과 같은 인자로
 * whisper-cli를 한 번에 하나씩 돌리고, 정지하면 결과를 파이프라인 잡에 넘긴다. 결과는 메모리에만 두고,
 * 하나라도 실패하면 멈춰 파이프라인이 파일 전체로 인식한다 (references/features/recording.md "녹음 중 STT (메모)").
 */

const STT_DIR_NAME = 'meeting-stt-memo-stt'

/** 정지한 녹음의 결과. 파이프라인 잡이 한 번 꺼내 간다. null이면 실패했거나 도중에 멈췄다 */
const results = new Map<string, Promise<SttSegment[] | null>>()

/** 없으면 녹음 중 STT를 하지 않은 녹음이라 파일 전체로 인식한다 */
export const takeRecordingSttResult = ({ meetingId }: { meetingId: string }) => {
  const result = results.get(meetingId)
  results.delete(meetingId)

  return result
}

/** 용어 프롬프트는 녹음을 시작할 때의 사전으로 한 번 정한다 — 파이프라인 잡이 시작할 때 한 번 읽는 것과 같다 */
const prepareTarget = async (terms: string[]) => {
  const whisperModelPath = modelPath('whisper')

  return {
    whisperModelPath,
    vadModelPath: modelPath('vad'),
    threads: (await threadPlan()).stt,
    termPrompt: await resolveTermPrompt({ terms, whisperModelPath })
  }
}

type SttTarget = Awaited<ReturnType<typeof prepareTarget>>

interface RecognizePieceParams {
  piece: SttPiece
  target: SttTarget
  fileBase: string
}

const recognizePiece = async ({ piece, target, fileBase }: RecognizePieceParams) => {
  const dir = path.join(app.getPath('temp'), STT_DIR_NAME)
  const audioPath = path.join(dir, `${fileBase}.wav`)
  const outputPath = path.join(dir, fileBase)
  await mkdir(dir, { recursive: true })
  // 녹음 중에는 전체 음량을 모르므로 조각마다 정규화한다. 파일 전체 정규화와 CER이 같았다
  await writeFile(audioPath, buildNormalizedWav(piece.samples))

  try {
    await runBinary({
      command: whisperBinPath(),
      args: buildWhisperArgs({
        modelPath: target.whisperModelPath,
        audioPath,
        outputPath,
        threads: target.threads,
        vadModelPath: target.vadModelPath,
        termPrompt: target.termPrompt
      })
    })
    const offsetSec = piece.startSample / SAMPLE_RATE_HZ

    return parseWhisperOutput(await readFile(`${outputPath}.json`)).map((segment) =>
      shiftSegment({ segment, offsetSec })
    )
  } finally {
    await Promise.all([rm(audioPath, { force: true }), rm(`${outputPath}.json`, { force: true })])
  }
}

/** 녹음을 시작할 때 메모면 만든다. 일시정지 중 청크는 넣지 않는다 */
export const createRecordingStt = ({ meetingId }: { meetingId: string }) => {
  const terms = normalizeGlossaryTerms(getGlossarySettings().terms).map(termNameOf)
  let target: Promise<SttTarget> | undefined
  let chunker = EMPTY_STT_CHUNKER
  let segments: SttSegment[] = []
  let pieceCount = 0
  let isStopped = false
  let queue = Promise.resolve()

  const recognize = (piece: SttPiece) => {
    const index = pieceCount
    pieceCount += 1
    queue = queue.then(async () => {
      if (isStopped) return
      try {
        target ??= prepareTarget(terms)
        const recognized = await recognizePiece({
          piece,
          target: await target,
          fileBase: `${meetingId}-${index}`
        })
        segments = [...segments, ...recognized]
      } catch (caught) {
        isStopped = true
        warn(
          `녹음 중 STT 실패 ${meetingId} 조각 ${index}, 정지 뒤 파일 전체로 인식: ${messageOf(caught)}`
        )
      }
    })
  }

  return {
    push: ({ samples, rms }: { samples: Float32Array; rms: number }) => {
      if (isStopped) return
      const next = pushSttChunk({ chunker, samples, rms })
      chunker = next.chunker
      if (next.piece) recognize(next.piece)
    },
    /** 녹음 중 메모가 아니게 되거나 너무 짧은 녹음이면 멈춘다. 도는 중인 조각의 결과는 버린다 */
    stop: () => {
      isStopped = true
      chunker = EMPTY_STT_CHUNKER
    },
    /** 정지할 때 꼬리 조각을 넣고, 남은 조각이 끝나면 파이프라인 잡이 받아 가도록 결과를 둔다 */
    finish: () => {
      const tail = isStopped ? undefined : flushSttChunker(chunker).piece
      chunker = EMPTY_STT_CHUNKER
      if (tail) recognize(tail)
      const result = queue.then(() => {
        if (isStopped) return null
        info(`녹음 중 STT 완료 ${meetingId} (조각 ${pieceCount}개, 세그먼트 ${segments.length}개)`)
        return segments
      })
      results.set(meetingId, result)
    }
  }
}

export type RecordingStt = ReturnType<typeof createRecordingStt>

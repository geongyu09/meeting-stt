import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { gainDbFor } from '@meeting-stt/core/normalize'
import { SAMPLE_RATE_HZ } from '@shared/audio'
import { runBinary } from '../bin/spawn'
import { maxContextTokensOf, type TermPrompt } from '../pipeline/whisper'
import { applyGain, measureSpeechRmsDb } from '../pipeline/normalize'
import { liveTextOf } from './liveWindow'
import { buildWavHeader, float32ToInt16 } from './wavWriter'

/**
 * 짧은 구간 하나를 whisper-cli로 한 번 인식한다. 라이브 받아쓰기와 받아쓰기(음성 입력)가 같은 인자·같은 정규화를
 * 쓰도록 실행부를 여기 한 곳에 둔다 (references/architecture.md "받아쓰기" > "구간 나누기와 인식").
 * 경로 해석(electron)은 호출하는 쪽이 하므로 스크립트(`scripts/dictationLatencyBench.ts`)에서도 그대로 돈다.
 */

const LANGUAGE = 'ko'

export interface WhisperOnceTarget {
  whisperBin: string
  whisperModel: string
  vadModel: string
  threads: number
}

/** 파이프라인과 같은 RMS 게인 정규화 — 원거리 마이크에서 whisper가 말을 놓치는 문제는 짧은 구간에도 있다 */
export const buildNormalizedWav = (samples: Float32Array) => {
  const raw = float32ToInt16(samples)
  const pcm = new Int16Array(raw.buffer, raw.byteOffset, raw.length / Int16Array.BYTES_PER_ELEMENT)
  const gainDb = gainDbFor(measureSpeechRmsDb({ pcm, sampleRate: SAMPLE_RATE_HZ }))
  const { pcm: normalized } = applyGain({ pcm, gainDb })
  const body = Buffer.from(normalized.buffer, normalized.byteOffset, normalized.byteLength)

  return Buffer.concat([buildWavHeader({ dataBytes: body.length }), body])
}

interface BuildWhisperOnceArgsParams {
  target: WhisperOnceTarget
  audioPath: string
  /** 확장자를 뺀 출력 경로. whisper-cli가 .txt를 붙인다 */
  outputBase: string
  /**
   * 구간 앞에 붙일 용어 프롬프트. 구간이 하나라 `--carry-initial-prompt`는 필요 없고,
   * `-mc`는 토큰 수 + 1이어야 한다 — 0이면 whisper.cpp가 프롬프트까지 끈다 (references/pitfalls.md)
   */
  termPrompt?: TermPrompt
}

export const buildWhisperOnceArgs = ({
  target,
  audioPath,
  outputBase,
  termPrompt
}: BuildWhisperOnceArgsParams) => [
  ...['-m', target.whisperModel, '-f', audioPath, '-l', LANGUAGE, '-t', String(target.threads)],
  ...['-mc', String(maxContextTokensOf(termPrompt))],
  ...(termPrompt ? ['--prompt', termPrompt.text] : []),
  ...['-nt', '-np', '--vad', '--vad-model', target.vadModel, '-otxt', '-of', outputBase]
]

interface TranscribeOnceParams {
  samples: Float32Array
  /** 임시 WAV·결과 파일을 둘 폴더. 없으면 만든다 */
  dir: string
  /** 폴더 안 파일 이름(확장자 없이). 같은 폴더에서 동시에 돌면 이름을 달리 준다 */
  fileBase: string
  target: WhisperOnceTarget
  termPrompt?: TermPrompt
}

/** Int16 변환 → RMS 정규화 → 임시 WAV → whisper-cli → UTF-8 결과 파일을 한 줄로. 끝나면 임시 파일을 지운다 */
export const transcribeOnce = async ({
  samples,
  dir,
  fileBase,
  target,
  termPrompt
}: TranscribeOnceParams) => {
  const audioPath = path.join(dir, `${fileBase}.wav`)
  const outputBase = path.join(dir, fileBase)

  await mkdir(dir, { recursive: true })
  await writeFile(audioPath, buildNormalizedWav(samples))

  try {
    await runBinary({
      command: target.whisperBin,
      args: buildWhisperOnceArgs({ target, audioPath, outputBase, termPrompt })
    })
    // stdout은 청크 경계에서 한글 바이트가 잘릴 수 있어 결과 파일을 UTF-8로 읽는다
    return liveTextOf(await readFile(`${outputBase}.txt`, 'utf-8'))
  } finally {
    await Promise.all([rm(audioPath, { force: true }), rm(`${outputBase}.txt`, { force: true })])
  }
}

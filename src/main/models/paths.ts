import { existsSync } from 'node:fs'
import path from 'node:path'
import { app } from 'electron'
import { is } from '@electron-toolkit/utils'

/** Phase 1에서 확정한 기본 조합 (docs/phase1-results.md) */
const MODEL_FILES = {
  whisper: 'ggml-large-v3-turbo-q5_0.bin',
  vad: 'ggml-silero-v5.1.2.bin',
  segmentation: 'sherpa-onnx-pyannote-segmentation-3-0.onnx',
  embedding: '3dspeaker_speech_eres2net_base_sv_zh-cn_3dspeaker_16k.onnx'
} as const

export type ModelKey = keyof typeof MODEL_FILES

const MODEL_LABELS: Record<ModelKey, string> = {
  whisper: '음성 인식 모델',
  vad: '무음 감지 모델',
  segmentation: '화자 분할 모델',
  embedding: '화자 임베딩 모델'
}

export const modelsDir = () => path.join(app.getPath('userData'), 'models')

/** 개발 모드 전용 폴백. Phase 1 셋업 스크립트가 받아 둔 픽스처 모델을 그대로 쓴다 */
const devFallbackPath = (key: ModelKey) =>
  path.join(app.getAppPath(), 'scripts', 'fixtures', 'models', MODEL_FILES[key])

/** 모델 파일 경로. 개발 모드에서 userData에 없으면 Phase 1 픽스처를 가리킨다 */
export const modelPath = (key: ModelKey) => {
  const installed = path.join(modelsDir(), MODEL_FILES[key])
  if (existsSync(installed) || !is.dev) return installed

  const fallback = devFallbackPath(key)
  return existsSync(fallback) ? fallback : installed
}

/** 준비되지 않은 모델의 한국어 이름 목록 (파이프라인 시작 전 확인용) */
export const missingModelLabels = () =>
  (Object.keys(MODEL_FILES) as ModelKey[])
    .filter((key) => !existsSync(modelPath(key)))
    .map((key) => MODEL_LABELS[key])

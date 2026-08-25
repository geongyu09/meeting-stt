import path from 'node:path'

const SCRIPTS_DIR = __dirname

export const PROJECT_ROOT = path.resolve(SCRIPTS_DIR, '..')

// Phase 1 검증용 로컬 자산. 용량이 커서 git에 넣지 않는다 (.gitignore: scripts/fixtures/)
export const FIXTURES_DIR = path.join(SCRIPTS_DIR, 'fixtures')
export const MODELS_DIR = path.join(FIXTURES_DIR, 'models')
export const AUDIO_DIR = path.join(FIXTURES_DIR, 'audio')
export const OUTPUT_DIR = path.join(FIXTURES_DIR, 'output')
export const DOWNLOAD_TMP_DIR = path.join(MODELS_DIR, 'tmp')

export const PLATFORM_KEY = `${process.platform}-${process.arch}`
export const BIN_DIR = path.join(PROJECT_ROOT, 'resources', 'bin', PLATFORM_KEY)

export const WHISPER_BIN = path.join(BIN_DIR, 'whisper-cli')
export const DIARIZE_BIN = path.join(BIN_DIR, 'sherpa-onnx-offline-speaker-diarization')

export const WHISPER_MODEL = path.join(MODELS_DIR, 'ggml-large-v3-turbo-q5_0.bin')
export const VAD_MODEL = path.join(MODELS_DIR, 'ggml-silero-v5.1.2.bin')
export const SEGMENTATION_MODEL = path.join(
  MODELS_DIR,
  'sherpa-onnx-pyannote-segmentation-3-0.onnx'
)
export const EMBEDDING_MODEL = path.join(
  MODELS_DIR,
  '3dspeaker_speech_eres2net_base_sv_zh-cn_3dspeaker_16k.onnx'
)

import { existsSync } from 'node:fs'
import { copyFile, mkdir, rm } from 'node:fs/promises'
import path from 'node:path'

import { downloadFile } from './download'
import { info } from './log'
import { extractArchive } from './shell'
import {
  DOWNLOAD_TMP_DIR,
  EMBEDDING_MODEL,
  MODELS_DIR,
  SEGMENTATION_MODEL,
  VAD_MODEL,
  WHISPER_MODEL
} from './paths'

interface DirectAsset {
  label: string
  url: string
  sha256: string
  destPath: string
}

interface ArchiveEntry {
  /** 아카이브 내부 경로 */
  entry: string
  destPath: string
}

interface ArchiveAsset {
  label: string
  url: string
  sha256: string
  archiveName: string
  entries: ArchiveEntry[]
}

const SHERPA_VERSION = 'v1.13.6'

export const DIRECT_MODEL_ASSETS: DirectAsset[] = [
  {
    label: 'Whisper large-v3-turbo q5_0',
    url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3-turbo-q5_0.bin',
    sha256: '394221709cd5ad1f40c46e6031ca61bce88931e6e088c188294c6d5a55ffa7e2',
    destPath: WHISPER_MODEL
  },
  {
    label: 'Silero VAD v5.1.2',
    url: 'https://huggingface.co/ggml-org/whisper-vad/resolve/main/ggml-silero-v5.1.2.bin',
    sha256: '29940d98d42b91fbd05ce489f3ecf7c72f0a42f027e4875919a28fb4c04ea2cf',
    destPath: VAD_MODEL
  },
  {
    label: '화자 임베딩 3D-Speaker ERes2Net',
    url: `https://github.com/k2-fsa/sherpa-onnx/releases/download/speaker-recongition-models/${path.basename(EMBEDDING_MODEL)}`,
    sha256: '1a331345f04805badbb495c775a6ddffcdd1a732567d5ec8b3d5749e3c7a5e4b',
    destPath: EMBEDDING_MODEL
  }
]

/** 기본 모델과 비교하려고 받는 대안 모델. `--all` 을 줄 때만 내려받는다 */
export const OPTIONAL_MODEL_ASSETS: DirectAsset[] = [
  {
    label: 'Whisper small q5_1 (저사양 폴백 후보)',
    url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small-q5_1.bin',
    sha256: 'ae85e4a935d7a567bd102fe55afc16bb595bdb618e11b2fc7591bc08120411bb',
    destPath: path.join(MODELS_DIR, 'ggml-small-q5_1.bin')
  },
  {
    label: 'Whisper large-v3 q5_0 (고품질 후보)',
    url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3-q5_0.bin',
    sha256: 'd75795ecff3f83b5faa89d1900604ad8c780abd5739fae406de19f23ecd98ad1',
    destPath: path.join(MODELS_DIR, 'ggml-large-v3-q5_0.bin')
  }
]

export const ARCHIVE_MODEL_ASSETS: ArchiveAsset[] = [
  {
    label: '화자 분할 pyannote segmentation-3.0',
    url: 'https://github.com/k2-fsa/sherpa-onnx/releases/download/speaker-segmentation-models/sherpa-onnx-pyannote-segmentation-3-0.tar.bz2',
    sha256: '24615ee884c897d9d2ba09bb4d30da6bb1b15e685065962db5b02e76e4996488',
    archiveName: 'sherpa-onnx-pyannote-segmentation-3-0.tar.bz2',
    entries: [
      {
        entry: 'sherpa-onnx-pyannote-segmentation-3-0/model.onnx',
        destPath: SEGMENTATION_MODEL
      }
    ]
  }
]

/** 플랫폼별 sherpa-onnx 실행 파일 아카이브. 바이너리와 dylib은 같은 폴더에 둬야 @loader_path가 맞는다. */
export const sherpaBinaryAsset = ({ binDir }: { binDir: string }): ArchiveAsset => {
  const root = `sherpa-onnx-${SHERPA_VERSION}-osx-arm64-shared-no-tts`
  const libNames = [
    'libonnxruntime.dylib',
    'libsherpa-onnx-c-api.dylib',
    'libsherpa-onnx-cxx-api.dylib'
  ]

  return {
    label: `sherpa-onnx ${SHERPA_VERSION} (osx-arm64)`,
    url: `https://github.com/k2-fsa/sherpa-onnx/releases/download/${SHERPA_VERSION}/${root}.tar.bz2`,
    sha256: 'a188765a80094f8505b7ba02b6b906b6bb0dd42d0281822e6c11cdeba4120b24',
    archiveName: `${root}.tar.bz2`,
    entries: [
      {
        entry: `${root}/bin/sherpa-onnx-offline-speaker-diarization`,
        destPath: path.join(binDir, 'sherpa-onnx-offline-speaker-diarization')
      },
      ...libNames.map((name) => ({
        entry: `${root}/lib/${name}`,
        destPath: path.join(binDir, name)
      }))
    ]
  }
}

export const ensureDirectAsset = async (asset: DirectAsset) => {
  await downloadFile({
    url: asset.url,
    destPath: asset.destPath,
    sha256: asset.sha256,
    label: asset.label
  })
}

export const ensureArchiveAsset = async (asset: ArchiveAsset) => {
  if (asset.entries.every((it) => existsSync(it.destPath))) {
    info(`· ${asset.label} 이미 준비됨`)
    return
  }

  const archivePath = path.join(DOWNLOAD_TMP_DIR, asset.archiveName)
  await downloadFile({
    url: asset.url,
    destPath: archivePath,
    sha256: asset.sha256,
    label: asset.label
  })

  const extractDir = path.join(DOWNLOAD_TMP_DIR, `${asset.archiveName}.extracted`)
  await rm(extractDir, { recursive: true, force: true })
  await mkdir(extractDir, { recursive: true })
  await extractArchive({ archivePath, destDir: extractDir })

  for (const { entry, destPath } of asset.entries) {
    await mkdir(path.dirname(destPath), { recursive: true })
    await copyFile(path.join(extractDir, entry), destPath)
  }

  await rm(extractDir, { recursive: true, force: true })
  info(`· ${asset.label} 배치 완료`)
}

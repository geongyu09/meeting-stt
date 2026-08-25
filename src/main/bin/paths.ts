import path from 'node:path'
import { app } from 'electron'
import { is } from '@electron-toolkit/utils'

const PLATFORM_KEY = `${process.platform}-${process.arch}`

/**
 * 동봉 바이너리 위치. 패키징하면 asar 밖(app.asar.unpacked)으로 풀리므로 경로가 달라진다.
 * 경로 해석은 이 파일에서만 한다 (references/architecture.md).
 */
const binDir = () =>
  is.dev
    ? path.join(app.getAppPath(), 'resources', 'bin', PLATFORM_KEY)
    : path.join(process.resourcesPath, 'app.asar.unpacked', 'resources', 'bin', PLATFORM_KEY)

export const whisperBinPath = () => path.join(binDir(), 'whisper-cli')

export const diarizeBinPath = () => path.join(binDir(), 'sherpa-onnx-offline-speaker-diarization')

import { existsSync, statSync } from 'node:fs'
import { chmod, mkdir, symlink, unlink } from 'node:fs/promises'
import path from 'node:path'

import {
  ensureArchiveAsset,
  llamaBinaryAsset,
  sherpaBinaryAsset,
  whisperWindowsBinaryAsset
} from './assets'
import { buildWhisperFromSource } from './buildWhisper'
import { fail, info, warn } from './log'
import { DOWNLOAD_TMP_DIR, PLATFORM_KEY, PROJECT_ROOT, binDirOf } from './paths'
import { clearQuarantine, run, which } from './shell'

const SUPPORTED_PLATFORMS = ['darwin-arm64', 'win32-x64']

/**
 * macOS는 Homebrew(`brew install whisper-cpp`) 설치본을 심볼릭 링크로 쓴다.
 * 실행 파일이 @rpath로 Cellar의 dylib을 참조하므로 복사하면 깨진다.
 * 배포용 동봉 빌드는 따로 확보해야 한다 (`references/distribution.md`).
 */
const linkWhisperCli = async ({ binDir }: { binDir: string }) => {
  const whisperBin = path.join(binDir, 'whisper-cli')
  if (existsSync(whisperBin)) {
    info('· whisper-cli 이미 준비됨')
    return
  }

  const systemPath = await which('whisper-cli')
  if (!systemPath) {
    fail('whisper-cli를 찾지 못했습니다. `brew install whisper-cpp` 후 다시 실행해 주세요')
  }

  await unlink(whisperBin).catch(() => undefined)
  await symlink(systemPath, whisperBin)
  warn(`whisper-cli를 시스템 설치본(${systemPath})에 링크했습니다 — 개발 전용입니다`)
}

/**
 * 로컬 요약용 llama-cli (Phase 5). 요약은 선택 기능이라 자산이 없는 플랫폼이면
 * 경고만 남기고 넘어간다 — 여기서 멈추면 STT 준비까지 막힌다.
 */
const setupLlamaCli = async ({ binDir, platformKey }: { binDir: string; platformKey: string }) => {
  try {
    await ensureArchiveAsset(llamaBinaryAsset({ binDir, platformKey }))
  } catch (caught) {
    warn(
      `llama-cli 준비 실패 — 요약 기능만 막힙니다: ${caught instanceof Error ? caught.message : String(caught)}`
    )
    return
  }

  const llamaBin = path.join(
    binDir,
    platformKey.startsWith('win32') ? 'llama-cli.exe' : 'llama-cli'
  )
  await chmod(llamaBin, 0o755)
  await clearQuarantine(llamaBin)
}

/** Core Audio Taps API가 macOS 14.2부터 있다 (references/architecture.md "시스템 오디오 캡처") */
const SYSTEM_AUDIO_TAP_TARGET = 'arm64-apple-macos14.2'
const SYSTEM_AUDIO_TAP_SOURCE = path.join(PROJECT_ROOT, 'native', 'systemAudioTap', 'main.swift')

/**
 * 시스템 오디오 캡처 도구 (Phase 5-2). 시스템 프레임워크만 링크하는 Swift 한 파일이라 내려받지 않고 여기서 빌드한다.
 * Xcode·Command Line Tools가 없으면 경고만 남긴다 — 이 기능만 막히고 STT 준비는 계속된다.
 */
const setupSystemAudioTap = async ({ binDir }: { binDir: string }) => {
  const target = path.join(binDir, 'systemAudioTap')
  if (existsSync(target) && statSync(target).mtimeMs >= statSync(SYSTEM_AUDIO_TAP_SOURCE).mtimeMs) {
    info('· systemAudioTap 이미 준비됨')
    return
  }

  const swiftc = await which('swiftc')
  if (!swiftc) {
    warn(
      'swiftc를 찾지 못해 systemAudioTap을 건너뜁니다 — 온라인 회의 소리 녹음만 막힙니다 (xcode-select --install)'
    )
    return
  }

  const result = await run({
    command: swiftc,
    args: ['-O', '-target', SYSTEM_AUDIO_TAP_TARGET, '-o', target, SYSTEM_AUDIO_TAP_SOURCE]
  })
  if (result.code !== 0) {
    warn(
      `systemAudioTap 빌드 실패 — 온라인 회의 소리 녹음만 막힙니다: ${result.stderr.slice(-400)}`
    )
    return
  }

  await chmod(target, 0o755)
  info('· systemAudioTap 빌드 완료')
}

/** `--platform=win32-x64` 로 다른 플랫폼 자산을 미리 받을 수 있다 (CI·크로스 준비용) */
const platformKeyOf = (argv: string[]) =>
  argv.find((arg) => arg.startsWith('--platform='))?.split('=')[1] ?? PLATFORM_KEY

const main = async () => {
  const argv = process.argv.slice(2)
  const platformKey = platformKeyOf(argv)
  const wantsSourceBuild = argv.includes('--from-source')
  if (!SUPPORTED_PLATFORMS.includes(platformKey)) {
    fail(`아직 ${SUPPORTED_PLATFORMS.join(', ')} 만 지원합니다 (요청: ${platformKey})`)
  }

  const binDir = binDirOf({ platformKey })
  await mkdir(binDir, { recursive: true })
  await mkdir(DOWNLOAD_TMP_DIR, { recursive: true })

  info(`바이너리를 ${binDir} 에 준비합니다.`)

  if (platformKey === 'darwin-arm64') {
    // 배포 빌드는 --from-source로 정적 whisper-cli를 만든다. Homebrew 링크는 개발 전용이다
    if (wantsSourceBuild) await buildWhisperFromSource({ binDir })
    else await linkWhisperCli({ binDir })
  } else {
    await ensureArchiveAsset(whisperWindowsBinaryAsset({ binDir }))
  }

  await ensureArchiveAsset(sherpaBinaryAsset({ binDir, platformKey }))

  const diarizeBin = path.join(
    binDir,
    platformKey.startsWith('win32')
      ? 'sherpa-onnx-offline-speaker-diarization.exe'
      : 'sherpa-onnx-offline-speaker-diarization'
  )
  await chmod(diarizeBin, 0o755)
  await clearQuarantine(diarizeBin)

  await setupLlamaCli({ binDir, platformKey })
  if (platformKey === 'darwin-arm64') await setupSystemAudioTap({ binDir })

  info('바이너리 준비 완료')
}

main().catch((error: unknown) => {
  fail(error instanceof Error ? error.message : String(error))
})

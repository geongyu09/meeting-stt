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

interface SwiftTool {
  name: string
  /** `swiftc -target`. 도구가 쓰는 API가 생긴 OS 버전에 맞춘다 */
  target: string
  /** 빌드하지 못했을 때 어떤 기능만 막히는지 */
  blockedFeature: string
}

/** 시스템 프레임워크만 링크하는 Swift 한 파일 도구들. 내려받지 않고 여기서 빌드한다 (references/distribution.md 5절) */
const SWIFT_TOOLS: SwiftTool[] = [
  // Core Audio Taps API가 macOS 14.2부터 있다 (references/architecture.md "시스템 오디오 캡처")
  {
    name: 'systemAudioTap',
    target: 'arm64-apple-macos14.2',
    blockedFeature: '온라인 회의 소리 녹음'
  },
  // 받아쓰기 조각 끼워 넣기. 없으면 클립보드 폴백으로만 동작한다 (references/architecture.md "받아쓰기" > "끼워 넣기")
  {
    name: 'textInsert',
    target: 'arm64-apple-macos14.0',
    blockedFeature: '받아쓰기의 커서 자리 끼워 넣기(클립보드 복사로 대신)'
  }
]

/**
 * Xcode·Command Line Tools가 없으면 경고만 남긴다 — 그 기능만 막히고 STT 준비는 계속된다.
 * 소스가 바뀌지 않았으면 다시 빌드하지 않는다.
 */
const setupSwiftTool = async ({ binDir, tool }: { binDir: string; tool: SwiftTool }) => {
  const source = path.join(PROJECT_ROOT, 'native', tool.name, 'main.swift')
  const target = path.join(binDir, tool.name)
  if (existsSync(target) && statSync(target).mtimeMs >= statSync(source).mtimeMs) {
    info(`· ${tool.name} 이미 준비됨`)
    return
  }

  const swiftc = await which('swiftc')
  if (!swiftc) {
    warn(
      `swiftc를 찾지 못해 ${tool.name}을 건너뜁니다 — ${tool.blockedFeature}만 막힙니다 (xcode-select --install)`
    )
    return
  }

  const result = await run({
    command: swiftc,
    args: ['-O', '-target', tool.target, '-o', target, source]
  })
  if (result.code !== 0) {
    warn(`${tool.name} 빌드 실패 — ${tool.blockedFeature}만 막힙니다: ${result.stderr.slice(-400)}`)
    return
  }

  await chmod(target, 0o755)
  info(`· ${tool.name} 빌드 완료`)
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
  if (platformKey === 'darwin-arm64') {
    for (const tool of SWIFT_TOOLS) await setupSwiftTool({ binDir, tool })
  }

  info('바이너리 준비 완료')
}

main().catch((error: unknown) => {
  fail(error instanceof Error ? error.message : String(error))
})

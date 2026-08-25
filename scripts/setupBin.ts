import { existsSync } from 'node:fs'
import { chmod, mkdir, symlink, unlink } from 'node:fs/promises'

import { ensureArchiveAsset, sherpaBinaryAsset } from './assets'
import { fail, info, warn } from './log'
import { BIN_DIR, DIARIZE_BIN, DOWNLOAD_TMP_DIR, PLATFORM_KEY, WHISPER_BIN } from './paths'
import { clearQuarantine, which } from './shell'

const SUPPORTED_PLATFORM = 'darwin-arm64'

/**
 * Phase 1은 Homebrew(`brew install whisper-cpp`) 설치본을 심볼릭 링크로 쓴다.
 * 실행 파일이 @rpath로 Cellar의 dylib을 참조하므로 복사하면 깨진다.
 * 배포용 동봉 빌드는 Phase 4에서 따로 확보한다 (references/architecture.md).
 */
const linkWhisperCli = async () => {
  if (existsSync(WHISPER_BIN)) {
    info('· whisper-cli 이미 준비됨')
    return
  }

  const systemPath = await which('whisper-cli')
  if (!systemPath) {
    fail('whisper-cli를 찾지 못했습니다. `brew install whisper-cpp` 후 다시 실행해 주세요')
  }

  await unlink(WHISPER_BIN).catch(() => undefined)
  await symlink(systemPath, WHISPER_BIN)
  warn(`whisper-cli를 시스템 설치본(${systemPath})에 링크했습니다 — 개발 전용입니다`)
}

const main = async () => {
  if (PLATFORM_KEY !== SUPPORTED_PLATFORM) {
    fail(`아직 ${SUPPORTED_PLATFORM}만 지원합니다 (현재: ${PLATFORM_KEY})`)
  }

  await mkdir(BIN_DIR, { recursive: true })
  await mkdir(DOWNLOAD_TMP_DIR, { recursive: true })

  info(`바이너리를 ${BIN_DIR} 에 준비합니다.`)
  await linkWhisperCli()
  await ensureArchiveAsset(sherpaBinaryAsset({ binDir: BIN_DIR }))
  await chmod(DIARIZE_BIN, 0o755)
  await clearQuarantine(DIARIZE_BIN)
  info('바이너리 준비 완료')
}

main().catch((error: unknown) => {
  fail(error instanceof Error ? error.message : String(error))
})

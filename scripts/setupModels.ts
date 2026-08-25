import { mkdir } from 'node:fs/promises'

import {
  ARCHIVE_MODEL_ASSETS,
  DIRECT_MODEL_ASSETS,
  OPTIONAL_MODEL_ASSETS,
  ensureArchiveAsset,
  ensureDirectAsset
} from './assets'
import { fail, info } from './log'
import { DOWNLOAD_TMP_DIR, MODELS_DIR } from './paths'

const main = async () => {
  await mkdir(MODELS_DIR, { recursive: true })
  await mkdir(DOWNLOAD_TMP_DIR, { recursive: true })

  const wantsAll = process.argv.includes('--all')

  info(`모델을 ${MODELS_DIR} 에 준비합니다.`)
  for (const asset of DIRECT_MODEL_ASSETS) await ensureDirectAsset(asset)
  for (const asset of ARCHIVE_MODEL_ASSETS) await ensureArchiveAsset(asset)

  if (wantsAll) {
    for (const asset of OPTIONAL_MODEL_ASSETS) await ensureDirectAsset(asset)
  } else {
    info('· 비교용 대안 모델은 `--all` 을 줄 때만 받습니다')
  }

  info('모델 준비 완료')
}

main().catch((error: unknown) => {
  fail(error instanceof Error ? error.message : String(error))
})

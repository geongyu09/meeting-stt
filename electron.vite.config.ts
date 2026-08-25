import { resolve } from 'path'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'

const SHARED_DIR = resolve('src/shared')
const WORKLET_FILE_NAME = 'pcmRecorder.js'

export default defineConfig({
  main: {
    resolve: {
      alias: {
        '@shared': SHARED_DIR
      }
    }
  },
  preload: {
    resolve: {
      alias: {
        '@shared': SHARED_DIR
      }
    }
  },
  renderer: {
    build: {
      // 워크릿이 data: URL로 인라인되면 CSP(script-src 'self')에 막힌다 (references/pitfalls.md)
      assetsInlineLimit: (filePath: string) =>
        filePath.endsWith(WORKLET_FILE_NAME) ? false : undefined
    },
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src'),
        '@shared': SHARED_DIR
      }
    },
    plugins: [react()]
  }
})

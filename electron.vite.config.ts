import { resolve } from 'path'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'

const SHARED_DIR = resolve('src/shared')

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
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src'),
        '@shared': SHARED_DIR
      }
    },
    plugins: [react()]
  }
})

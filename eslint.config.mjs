import { defineConfig } from 'eslint/config'
import tseslint from '@electron-toolkit/eslint-config-ts'
import eslintConfigPrettier from '@electron-toolkit/eslint-config-prettier'
import eslintPluginReact from 'eslint-plugin-react'
import eslintPluginReactHooks from 'eslint-plugin-react-hooks'
import eslintPluginReactRefresh from 'eslint-plugin-react-refresh'

export default defineConfig(
  { ignores: ['**/node_modules', '**/dist', '**/out', 'scripts/fixtures'] },
  tseslint.configs.recommended,
  eslintPluginReact.configs.flat.recommended,
  eslintPluginReact.configs.flat['jsx-runtime'],
  {
    settings: {
      react: {
        version: 'detect'
      }
    }
  },
  {
    files: ['**/*.{ts,tsx}'],
    plugins: {
      'react-hooks': eslintPluginReactHooks,
      'react-refresh': eslintPluginReactRefresh
    },
    rules: {
      ...eslintPluginReactHooks.configs.recommended.rules,
      ...eslintPluginReactRefresh.configs.vite.rules,
      // 프로젝트 컨벤션은 리턴 타입을 추론에 맡긴다 (.claude/rules/general-code-convention.md).
      // 계약이 되는 곳(src/shared/ipc.ts 등)만 손으로 명시한다.
      '@typescript-eslint/explicit-function-return-type': 'off'
    }
  },
  {
    // AudioWorklet은 번들과 분리된 브라우저 스코프에서 도는 순수 JS라 TS 전용 규칙을 적용하지 않는다
    files: ['src/renderer/src/worklet/*.js', 'web/src/audio/pcmRecorder.js'],
    rules: {
      '@typescript-eslint/explicit-function-return-type': 'off'
    }
  },
  eslintConfigPrettier
)

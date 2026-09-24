import type { ReactNode } from 'react'
import type { LlmStatus } from '@shared/types'
import SettingGroup from '@renderer/shared/components/primitives/layout/SettingGroup'
import Button from '@renderer/shared/components/primitives/ui/Button'

import { PROVIDER_OPTIONS } from './constants/providers'
import useLlmSettings from './model/useLlmSettings'
import ApiKeyField from './ui/ApiKeyField'
import ProviderOption from './ui/ProviderOption'
import styles from './index.module.css'

/** Claude Code를 골랐을 때의 준비 상태. 로컬의 준비 상태는 파일 다운로드 행(슬롯)이 스스로 보여준다 */
const renderReadiness = (status: LlmStatus) => {
  if (status.provider === 'claude-cli') {
    return status.claudeCliPath ? (
      <p className={styles.hint}>
        찾은 명령: <code className={styles.code}>{status.claudeCliPath}</code>
        {status.claudeCliVersion ? ` (${status.claudeCliVersion})` : ''}. 터미널에서 로그인한 계정을
        그대로 씁니다.
      </p>
    ) : (
      <p className={styles.warning} role="alert">
        claude 명령을 찾을 수 없습니다. Claude Code를 설치하고 터미널에서 한 번 로그인한 뒤 앱을
        다시 켜 주세요.
      </p>
    )
  }

  return null
}

interface LlmSectionProps {
  /** 로컬 실행 방식을 골랐을 때 라디오 아래에 끼우는 요약 모델 파일 다운로드 행 (`model/SummaryModelSection`) */
  localModelSlot?: ReactNode
}

/** 요약·용어 초안을 어떤 방식으로 만들지. 기본은 로컬이고, Claude를 고르면 회의록이 밖으로 나간다 */
export default function LlmSection({ localModelSlot }: LlmSectionProps) {
  const {
    status,
    isLoading,
    loadError,
    apiKeyInput,
    isSaving,
    isChecking,
    actionError,
    notice,
    setApiKeyInput,
    selectProvider,
    saveApiKey,
    clearApiKey,
    checkConnection
  } = useLlmSettings()

  const renderBody = () => {
    if (isLoading) return <p className={styles.hint}>LLM 설정을 불러오는 중입니다</p>
    if (!status) {
      return (
        <p className={styles.error} role="alert">
          {loadError ?? 'LLM 설정을 불러오지 못했습니다'}
        </p>
      )
    }

    const isBusy = isSaving || isChecking

    return (
      <>
        <p className={styles.label}>실행 방식</p>
        <div className={styles.options} role="radiogroup" aria-label="실행 방식">
          {PROVIDER_OPTIONS.map((option) => (
            <ProviderOption
              key={option.value}
              value={option.value}
              title={option.title}
              description={option.description}
              isSelected={status.provider === option.value}
              isDisabled={isBusy}
              onSelect={() => selectProvider(option.value)}
            />
          ))}
        </div>

        {status.provider === 'local' && localModelSlot}
        {status.provider === 'claude-api' && (
          <ApiKeyField
            value={apiKeyInput}
            hasSavedKey={status.hasClaudeApiKey}
            savedKeyTail={status.claudeApiKeyTail}
            isDisabled={isBusy}
            onChange={setApiKeyInput}
            onSave={saveApiKey}
            onClear={clearApiKey}
          />
        )}
        {renderReadiness(status)}

        {status.provider !== 'local' && (
          <div className={styles.actions}>
            <Button variant="secondary" size="sm" onClick={checkConnection} disabled={isBusy}>
              {isChecking ? '확인하는 중…' : '연결 확인'}
            </Button>
            {isChecking && <span className={styles.hint}>짧은 요청 한 번을 보냅니다</span>}
          </div>
        )}

        {notice && (
          <p className={styles.notice} role="status">
            {notice}
          </p>
        )}
        {actionError && (
          <p className={styles.error} role="alert">
            {actionError}
          </p>
        )}
      </>
    )
  }

  return (
    <SettingGroup title="요약 · 용어 초안">
      <div className={styles.body}>
        <p className={styles.hint}>
          회의 요약과 용어 초안을 어떤 방식으로 만들지 고릅니다. 회의록 작성(음성 인식·화자 분리)은
          어느 쪽을 골라도 이 기기에서만 처리합니다. 진행 중인 요약에는 적용되지 않고 다음 요약부터
          바뀝니다.
        </p>
        {renderBody()}
      </div>
    </SettingGroup>
  )
}

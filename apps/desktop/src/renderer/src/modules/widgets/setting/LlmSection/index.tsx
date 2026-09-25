import type { ReactNode } from 'react'
import type { LlmStatus } from '@shared/types'
import type { Messages } from '@shared/i18n'
import { apiVendorOf } from '@shared/llm'
import SettingGroup from '@renderer/shared/components/primitives/layout/SettingGroup'
import Button from '@renderer/shared/components/primitives/ui/Button'
import { useLocale } from '@renderer/shared/provider/context/localeContext'

import { PROVIDER_ORDER } from './constants/providers'
import useLlmSettings from './model/useLlmSettings'
import ApiKeyField from './ui/ApiKeyField'
import OpenaiModelSelect from './ui/OpenaiModelSelect'
import ProviderOption from './ui/ProviderOption'
import styles from './index.module.css'

interface RenderReadinessParams {
  status: LlmStatus
  copy: Messages['llm']['section']
}

/** Claude Code를 골랐을 때의 준비 상태. 로컬의 준비 상태는 파일 다운로드 행(슬롯)이 스스로 보여준다 */
const renderReadiness = ({ status, copy }: RenderReadinessParams) => {
  if (status.provider === 'claude-cli') {
    return status.claudeCliPath ? (
      <p className={styles.hint}>
        {copy.cliFoundPrefix}
        <code className={styles.code}>{status.claudeCliPath}</code>
        {copy.cliFoundSuffix({ version: status.claudeCliVersion })}
      </p>
    ) : (
      <p className={styles.warning} role="alert">
        {copy.cliMissing}
      </p>
    )
  }

  return null
}

interface LlmSectionProps {
  /** 로컬 실행 방식을 골랐을 때 라디오 아래에 끼우는 요약 모델 파일 다운로드 행 (`model/SummaryModelSection`) */
  localModelSlot?: ReactNode
}

/** 요약·용어 초안을 어떤 방식으로 만들지. 기본은 로컬이고, 외부 공급자를 고르면 회의록이 밖으로 나간다 */
export default function LlmSection({ localModelSlot }: LlmSectionProps) {
  const { t } = useLocale()
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
    selectOpenaiModel,
    checkConnection
  } = useLlmSettings()

  const renderBody = () => {
    if (isLoading) return <p className={styles.hint}>{t.llm.section.loading}</p>
    if (!status) {
      return (
        <p className={styles.error} role="alert">
          {loadError ?? t.llm.section.loadError}
        </p>
      )
    }

    const isBusy = isSaving || isChecking
    const vendor = apiVendorOf(status.provider)

    return (
      <>
        <p className={styles.label}>{t.llm.section.providerLabel}</p>
        <div className={styles.options} role="radiogroup" aria-label={t.llm.section.providerLabel}>
          {PROVIDER_ORDER.map((provider) => (
            <ProviderOption
              key={provider}
              value={provider}
              title={t.llm.providers[provider].title}
              description={t.llm.providers[provider].description}
              isSelected={status.provider === provider}
              isDisabled={isBusy}
              onSelect={() => selectProvider(provider)}
            />
          ))}
        </div>

        {status.provider === 'local' && localModelSlot}
        {vendor && (
          <ApiKeyField
            label={t.llm.apiKeyLabels[vendor]}
            hint={t.llm.apiKeyField[vendor].hint}
            placeholder={t.llm.apiKeyField[vendor].placeholder}
            value={apiKeyInput}
            hasSavedKey={status.apiKeys[vendor].isSaved}
            savedKeyTail={status.apiKeys[vendor].tail}
            isDisabled={isBusy}
            onChange={setApiKeyInput}
            onSave={() => saveApiKey(vendor)}
            onClear={() => clearApiKey(vendor)}
          />
        )}
        {status.provider === 'openai-api' && (
          <OpenaiModelSelect
            value={status.openaiModel}
            isDisabled={isBusy}
            onChange={selectOpenaiModel}
          />
        )}
        {renderReadiness({ status, copy: t.llm.section })}

        {status.provider !== 'local' && (
          <div className={styles.actions}>
            <Button variant="secondary" size="sm" onClick={checkConnection} disabled={isBusy}>
              {isChecking ? t.llm.section.checking : t.llm.section.checkConnection}
            </Button>
            {isChecking && <span className={styles.hint}>{t.llm.section.checkHint}</span>}
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
    <SettingGroup title={t.llm.section.title}>
      <div className={styles.body}>
        <p className={styles.hint}>{t.llm.section.intro}</p>
        {renderBody()}
      </div>
    </SettingGroup>
  )
}

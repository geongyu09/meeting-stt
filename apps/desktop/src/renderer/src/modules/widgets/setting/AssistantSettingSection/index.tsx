import { useState } from 'react'
import { ASSISTANT_PROVIDERS, isAssistantProvider } from '@shared/assistant'
import {
  chooseAssistantFolderApi,
  installHarnessApi,
  setAssistantPermissionModeApi,
  setAssistantProviderApi
} from '@renderer/shared/api/assistant'
import SettingGroup from '@renderer/shared/components/primitives/layout/SettingGroup'
import SettingRow from '@renderer/shared/components/primitives/layout/SettingRow'
import Button from '@renderer/shared/components/primitives/ui/Button'
import Switch from '@renderer/shared/components/primitives/ui/Switch'
import useAssistantChat from '@renderer/shared/hooks/domain/assistant/useAssistantChat'
import useAssistantStatus from '@renderer/shared/hooks/domain/assistant/useAssistantStatus'
import { useLocale } from '@renderer/shared/provider/context/localeContext'

import styles from './index.module.css'

const PERMISSION_TITLE_ID = 'assistant-permission-title'
const PROVIDER_TITLE_ID = 'assistant-provider-title'

/**
 * 설정의 "개인 비서" 카테고리 — 작업 폴더·에이전트·권한 모드 (references/features/ui.md "설정 모달").
 * 앱은 폴더 경로만 저장한다. 폴더 문제·git 저장소가 아님·모든 권한 허용은 행 설명에 바로 알린다.
 */
export default function AssistantSettingSection() {
  const { t } = useLocale()
  const labels = t.assistant.settings
  const { status, applyStatus } = useAssistantStatus()
  const { state: chat } = useAssistantChat()
  const [actionError, setActionError] = useState<string | null>(null)
  const [harnessResult, setHarnessResult] = useState<'installed' | 'skipped' | 'error' | null>(null)
  const [isInstallingHarness, setIsInstallingHarness] = useState(false)

  const handleChooseFolder = async () => {
    try {
      applyStatus(await chooseAssistantFolderApi())
      setActionError(null)
      setHarnessResult(null)
    } catch {
      setActionError(labels.folder.chooseError)
    }
  }

  const handleInstallHarness = async () => {
    setIsInstallingHarness(true)
    try {
      const { isInstalled } = await installHarnessApi()
      setHarnessResult(isInstalled ? 'installed' : 'skipped')
    } catch {
      setHarnessResult('error')
    } finally {
      setIsInstallingHarness(false)
    }
  }

  const handleTogglePermission = async (isBypass: boolean) => {
    try {
      applyStatus(
        await setAssistantPermissionModeApi({
          permissionMode: isBypass ? 'bypassPermissions' : 'acceptEdits'
        })
      )
      setActionError(null)
    } catch {
      setActionError(labels.permission.error)
    }
  }

  const handleChangeProvider = async (value: string) => {
    if (!isAssistantProvider(value)) return

    try {
      applyStatus(await setAssistantProviderApi({ provider: value }))
      setActionError(null)
    } catch {
      setActionError(labels.provider.error)
    }
  }

  const folderNotice = !status?.folder
    ? null
    : status.folderProblem
      ? t.assistant.folderProblems[status.folderProblem]
      : status.isGitRepo
        ? null
        : labels.folder.notGitRepo
  const isBypass = status?.permissionMode === 'bypassPermissions'
  // 세션 id는 공급자 사이에서 이어지지 않아 대화 중에는 바꿀 수 없다
  const isChatActive = chat.turns.length > 0 || chat.isRunning

  return (
    <SettingGroup title={labels.title}>
      <SettingRow
        title={labels.folder.title}
        description={
          <>
            <span className={styles.path} data-mono={Boolean(status?.folder)}>
              {!status ? labels.loading : (status.folder ?? labels.folder.none)}
            </span>
            {folderNotice ? (
              <span className={styles.warning} role="status">
                {folderNotice}
              </span>
            ) : null}
            <span>{labels.folder.description}</span>
            {actionError ? (
              <span className={styles.error} role="alert">
                {actionError}
              </span>
            ) : null}
          </>
        }
        control={
          <Button variant="secondary" size="sm" onClick={handleChooseFolder} disabled={!status}>
            {labels.folder.choose}
          </Button>
        }
      />
      <SettingRow
        title={labels.harness.title}
        description={
          <>
            <span>{labels.harness.description}</span>
            {harnessResult === 'error' ? (
              <span className={styles.error} role="alert">
                {labels.harness.error}
              </span>
            ) : harnessResult ? (
              <span className={styles.result} role="status">
                {labels.harness[harnessResult]}
              </span>
            ) : null}
          </>
        }
        control={
          <Button
            variant="secondary"
            size="sm"
            onClick={handleInstallHarness}
            disabled={!status?.folder || Boolean(status.folderProblem) || isInstallingHarness}
          >
            {labels.harness.install}
          </Button>
        }
      />
      <SettingRow
        title={labels.provider.title}
        titleId={PROVIDER_TITLE_ID}
        description={labels.provider.description}
        control={
          <select
            className={styles.select}
            aria-labelledby={PROVIDER_TITLE_ID}
            value={status?.provider ?? ASSISTANT_PROVIDERS[0]}
            disabled={!status || isChatActive}
            onChange={(event) => void handleChangeProvider(event.target.value)}
          >
            {ASSISTANT_PROVIDERS.map((provider) => (
              <option key={provider} value={provider}>
                {t.assistant.providers[provider]}
              </option>
            ))}
          </select>
        }
      />
      <SettingRow
        title={labels.permission.title}
        titleId={PERMISSION_TITLE_ID}
        description={
          isBypass ? (
            <span className={styles.warning} role="status">
              {labels.permission.warning}
            </span>
          ) : (
            labels.permission.description
          )
        }
        control={
          <Switch
            isChecked={isBypass}
            onChange={handleTogglePermission}
            ariaLabelledBy={PERMISSION_TITLE_ID}
            disabled={!status}
          />
        }
      />
    </SettingGroup>
  )
}

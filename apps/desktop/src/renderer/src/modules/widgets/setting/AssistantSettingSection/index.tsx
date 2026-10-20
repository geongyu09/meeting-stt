import { useState } from 'react'
import {
  chooseAssistantFolderApi,
  setAssistantPermissionModeApi
} from '@renderer/shared/api/assistant'
import SettingGroup from '@renderer/shared/components/primitives/layout/SettingGroup'
import SettingRow from '@renderer/shared/components/primitives/layout/SettingRow'
import Button from '@renderer/shared/components/primitives/ui/Button'
import Switch from '@renderer/shared/components/primitives/ui/Switch'
import useAssistantStatus from '@renderer/shared/hooks/domain/assistant/useAssistantStatus'
import { useLocale } from '@renderer/shared/provider/context/localeContext'

import styles from './index.module.css'

const PERMISSION_TITLE_ID = 'assistant-permission-title'

/**
 * 설정의 "개인 비서" 카테고리 — 작업 폴더와 권한 모드 (references/architecture.md "개인 비서 모드" > "화면").
 * 앱은 폴더 경로만 저장한다. 폴더 문제·git 저장소가 아님·모든 권한 허용은 행 설명에 바로 알린다.
 */
export default function AssistantSettingSection() {
  const { t } = useLocale()
  const labels = t.assistant.settings
  const { status, applyStatus } = useAssistantStatus()
  const [actionError, setActionError] = useState<string | null>(null)

  const handleChooseFolder = async () => {
    try {
      applyStatus(await chooseAssistantFolderApi())
      setActionError(null)
    } catch {
      setActionError(labels.folder.chooseError)
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

  const folderNotice = !status?.folder
    ? null
    : status.folderProblem
      ? t.assistant.folderProblems[status.folderProblem]
      : status.isGitRepo
        ? null
        : labels.folder.notGitRepo
  const isBypass = status?.permissionMode === 'bypassPermissions'

  return (
    <SettingGroup title={labels.title}>
      <SettingRow
        title={labels.folder.title}
        description={
          <>
            <span className={styles.path}>
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

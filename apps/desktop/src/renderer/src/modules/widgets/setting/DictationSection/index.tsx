import { useEffect, useState } from 'react'
import { formatAccelerator } from '@shared/shortcut'
import { openAccessibilitySettingsApi } from '@renderer/shared/api/dictation'
import SettingGroup from '@renderer/shared/components/primitives/layout/SettingGroup'
import SettingRow from '@renderer/shared/components/primitives/layout/SettingRow'
import Button from '@renderer/shared/components/primitives/ui/Button'
import useDictation from '@renderer/shared/hooks/domain/dictation/useDictation'
import useSettings from '@renderer/shared/hooks/domain/setting/useSettings'
import { useLocale } from '@renderer/shared/provider/context/localeContext'

import styles from './index.module.css'

/**
 * 설정의 "받아쓰기" 카테고리. 전용 화면은 없고 사용법 한 줄과 접근성 권한 상태만 둔다
 * (references/architecture.md "받아쓰기" > "패널·메뉴바·단축키·설정"). 단축키 변경은 "단축키" 카테고리에 있다.
 */
export default function DictationSection() {
  const { t } = useLocale()
  const labels = t.dictation.settings
  const { settings } = useSettings()
  const { insertMode, isActive, refetch } = useDictation()
  const [openError, setOpenError] = useState<string | null>(null)

  // 시스템 설정에서 권한을 바꾸고 돌아오면 창이 포커스를 받는다. 그때 다시 읽어야 표시가 맞는다
  useEffect(() => {
    const handleFocus = () => void refetch()
    window.addEventListener('focus', handleFocus)

    return () => window.removeEventListener('focus', handleFocus)
  }, [refetch])

  const handleOpenSettings = async () => {
    try {
      await openAccessibilitySettingsApi()
      setOpenError(null)
    } catch {
      setOpenError(labels.accessibility.openError)
    }
  }

  // 진행 중이면 그 세션의 방식이고, 아니면 지금 시작했을 때의 방식이다. 둘 다 권한 유무를 그대로 반영한다
  const isGranted = insertMode === 'paste'

  return (
    <SettingGroup title={labels.title}>
      <SettingRow
        title={labels.usage.title}
        description={
          !settings
            ? labels.loading
            : settings.dictationShortcut
              ? labels.usage.description({
                  shortcut: formatAccelerator(settings.dictationShortcut)
                })
              : labels.usage.descriptionOff
        }
      />
      <SettingRow
        title={labels.accessibility.title}
        description={
          <>
            <span className={isGranted ? styles.granted : styles.denied} role="status">
              {isGranted ? labels.accessibility.granted : labels.accessibility.denied}
            </span>
            {openError ? (
              <span className={styles.error} role="alert">
                {' '}
                {openError}
              </span>
            ) : null}
          </>
        }
        control={
          isGranted && !isActive ? null : (
            <Button variant="secondary" size="sm" onClick={handleOpenSettings}>
              {labels.accessibility.open}
            </Button>
          )
        }
      />
    </SettingGroup>
  )
}

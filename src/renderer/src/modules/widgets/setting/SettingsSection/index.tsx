import useSettings from '@renderer/shared/hooks/domain/setting/useSettings'

import SettingToggle from './ui/SettingToggle'
import styles from './index.module.css'

export default function SettingsSection() {
  const { settings, isLoading, error, updateSettings } = useSettings()

  if (isLoading && !settings) return <p className={styles.message}>설정을 불러오는 중입니다</p>
  if (!settings) {
    return (
      <p className={styles.error} role="alert">
        {error?.message ?? '설정을 불러오지 못했습니다'}
      </p>
    )
  }

  return (
    <section className={styles.section}>
      <h2 className={styles.heading}>설정</h2>
      {error ? (
        <p className={styles.error} role="alert">
          {error.message}
        </p>
      ) : null}
      <SettingToggle
        title="원본 녹음 파일 보관"
        isChecked={settings.isAudioKept}
        onChange={(isAudioKept) => updateSettings({ isAudioKept })}
      >
        꺼 두면 회의록을 만든 뒤 원본 녹음을 지웁니다. 16kHz 녹음은 한 시간에 약 115MB를 차지합니다.
        보관하지 않은 회의는 나중에 다시 처리할 수 없습니다.
      </SettingToggle>
      <SettingToggle
        title="업데이트 확인"
        isChecked={settings.isUpdateCheckEnabled}
        onChange={(isUpdateCheckEnabled) => updateSettings({ isUpdateCheckEnabled })}
      >
        앱을 시작할 때 새 버전이 있는지 확인합니다. 기본은 꺼짐이며, 켜도 다음 실행부터 확인합니다.
        회의 내용은 보내지 않습니다.
      </SettingToggle>
      <SettingToggle
        title="조용히 처리"
        isChecked={settings.isQuietProcessing}
        onChange={(isQuietProcessing) => updateSettings({ isQuietProcessing })}
      >
        회의록을 만들 때 CPU를 절반만 써서 발열과 팬 소음을 줄입니다. 대신 처리 시간이 길어집니다.
        이미 처리 중인 회의에는 적용되지 않습니다.
      </SettingToggle>
    </section>
  )
}

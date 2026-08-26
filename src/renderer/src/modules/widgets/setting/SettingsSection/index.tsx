import useSettings from '@renderer/shared/hooks/domain/setting/useSettings'

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
      <label className={styles.option}>
        <input
          type="checkbox"
          checked={settings.isAudioKept}
          onChange={(event) => updateSettings({ isAudioKept: event.target.checked })}
        />
        <span className={styles.optionBody}>
          <span className={styles.optionTitle}>원본 녹음 파일 보관</span>
          <span className={styles.optionHint}>
            꺼 두면 회의록을 만든 뒤 원본 녹음을 지웁니다. 16kHz 녹음은 한 시간에 약 115MB를
            차지합니다. 보관하지 않은 회의는 나중에 다시 처리할 수 없습니다.
          </span>
        </span>
      </label>
      <label className={styles.option}>
        <input
          type="checkbox"
          checked={settings.isUpdateCheckEnabled}
          onChange={(event) => updateSettings({ isUpdateCheckEnabled: event.target.checked })}
        />
        <span className={styles.optionBody}>
          <span className={styles.optionTitle}>시작할 때 새 버전 확인</span>
          <span className={styles.optionHint}>
            기본은 꺼짐입니다. 켜면 앱을 켤 때마다 새 버전이 있는지 한 번 확인하고, 있으면 알리기만
            합니다. 내려받기와 설치는 직접 선택합니다. 그 외에는 네트워크를 쓰지 않습니다.
          </span>
        </span>
      </label>
    </section>
  )
}

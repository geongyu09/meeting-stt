import { useNavigate } from 'react-router'
import ModelDownloadSection from '@renderer/modules/widgets/model/ModelDownloadSection'
import Icon from '@renderer/shared/components/primitives/ui/Icon'
import { PATHS } from '@renderer/shared/routes/paths'
import { useLocale } from '@renderer/shared/provider/context/localeContext'

import styles from './index.module.css'

export default function Onboarding() {
  const { t } = useLocale()
  const navigate = useNavigate()

  return (
    <div className={styles.page}>
      {/* 신호등이 겹치는 자리. 창을 끄는 영역이다 */}
      <div className={styles.titleBar} />
      <div className={styles.columns}>
        <div className={styles.intro}>
          <span className={styles.eyebrow}>{t.models.onboarding.eyebrow}</span>
          <h1 className={styles.title}>{t.models.onboarding.title}</h1>
          <p className={styles.description}>
            {t.models.onboarding.descriptionLine1}
            <br />
            {t.models.onboarding.descriptionLine2}
          </p>
          <ul className={styles.features}>
            {t.models.onboarding.features.map((feature) => (
              <li key={feature} className={styles.feature}>
                <span className={styles.check}>
                  <Icon name="check" />
                </span>
                {feature}
              </li>
            ))}
          </ul>
        </div>
        <div className={styles.setup}>
          <ModelDownloadSection onComplete={() => navigate(PATHS.home, { replace: true })} />
        </div>
      </div>
    </div>
  )
}

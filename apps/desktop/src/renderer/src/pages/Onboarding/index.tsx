import { useNavigate } from 'react-router'
import ModelDownloadSection from '@renderer/modules/widgets/model/ModelDownloadSection'
import Icon from '@renderer/shared/components/primitives/ui/Icon'
import { PATHS } from '@renderer/shared/routes/paths'

import styles from './index.module.css'

const FEATURES = [
  '서버 없음, 계정 없음',
  '화자별로 나눠진 회의록과 로컬 요약',
  '회의 중엔 작은 위젯과 단축키로 녹음'
]

export default function Onboarding() {
  const navigate = useNavigate()

  return (
    <div className={styles.page}>
      {/* 신호등이 겹치는 자리. 창을 끄는 영역이다 */}
      <div className={styles.titleBar} />
      <div className={styles.columns}>
        <div className={styles.intro}>
          <span className={styles.eyebrow}>처음 설정</span>
          <h1 className={styles.title}>인터넷 사용, 비용, 시간 제한 없는 회의록</h1>
          <p className={styles.description}>
            로컬 모델을 사용해 음성 인식·화자 분리를 제한 없이 사용해 보세요.
            <br />
            처음 한 번 설치하면 인터넷 연결 없이 동작하고, 녹음은 어디로도 보내지 않습니다.
          </p>
          <ul className={styles.features}>
            {FEATURES.map((feature) => (
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

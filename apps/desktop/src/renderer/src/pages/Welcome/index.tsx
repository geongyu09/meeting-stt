import WelcomeSection from '@renderer/modules/widgets/assistant/WelcomeSection'

import styles from './index.module.css'

/** 작업 폴더를 고르기 전의 첫 화면. `RequireFolder`가 채팅 자리에 그린다 (references/features/ui.md "첫 화면") */
export default function Welcome() {
  return (
    <div className={styles.page}>
      {/* 신호등이 겹치는 자리. 창을 끄는 영역이다 */}
      <div className={styles.titleBar} />
      <WelcomeSection />
    </div>
  )
}

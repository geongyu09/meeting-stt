import { useEffect } from 'react'
import WidgetPanelSection from '@renderer/modules/widgets/recording/WidgetPanelSection'

import styles from './index.module.css'

export default function Widget() {
  // 네이티브 패널 질감(vibrancy)이 보이려면 문서 배경이 비어 있어야 한다.
  // 같은 번들을 쓰는 메인 창까지 투명해지지 않도록 전역 CSS 대신 이 창에서만 클래스를 붙인다
  useEffect(() => {
    document.body.classList.add(styles.transparent)

    return () => document.body.classList.remove(styles.transparent)
  }, [])

  return <WidgetPanelSection />
}

import Icon from '@renderer/shared/components/primitives/ui/Icon'
import { useLocale } from '@renderer/shared/provider/context/localeContext'

import styles from './Placeholder.module.css'

const CLOSE_ICON_SIZE = 18

interface PlaceholderProps {
  message: string
  isError?: boolean
  onClose: () => void
}

/** 회의를 아직 못 그리는 상태(불러오는 중·없음·실패). 닫기 버튼은 남겨 패널을 치울 수 있게 한다 */
export default function Placeholder({ message, isError = false, onClose }: PlaceholderProps) {
  const { t } = useLocale()

  return (
    <>
      <div className={styles.header}>
        <button
          type="button"
          className={styles.closeButton}
          aria-label={t.transcript.panel.close}
          onClick={onClose}
        >
          <Icon name="close" size={CLOSE_ICON_SIZE} />
        </button>
      </div>
      <p className={isError ? styles.error : styles.message}>{message}</p>
    </>
  )
}

import { useEffect, useId, useRef, type MouseEvent } from 'react'
import Button from '@renderer/shared/components/primitives/ui/Button'
import { useLocale } from '@renderer/shared/provider/context/localeContext'

import styles from './DiscardDialog.module.css'

interface DiscardDialogProps {
  onConfirm: () => void
  /** 취소·Esc·배경 클릭 모두 dialog의 close 이벤트로 온다 */
  onClose: () => void
}

/**
 * 녹음 버리기 확인 모달. 2단계 인라인 확인 규칙의 예외로, 정지 버튼과 같은 카드에서 실수로 사라지지 않게 화면을 가로막는다
 * (references/features/ui.md "편집 UI 규칙"). 설정 모달과 같은 네이티브 `<dialog>`라 포커스 가둠·Esc·배경은 플랫폼이 준다.
 */
export default function DiscardDialog({ onConfirm, onClose }: DiscardDialogProps) {
  const { t } = useLocale()
  const labels = t.recording.recorder
  const dialogRef = useRef<HTMLDialogElement>(null)
  const titleId = useId()

  // `open` 속성으로 열면 비모달이라 DOM API로 연다
  useEffect(() => {
    dialogRef.current?.showModal()
  }, [])

  // 배경(::backdrop) 클릭은 dialog 자신이 target이다. 안쪽 클릭은 자식이 target이라 닫히지 않는다
  const handleBackdropClick = (event: MouseEvent<HTMLDialogElement>) => {
    if (event.target === event.currentTarget) dialogRef.current?.close()
  }

  return (
    <dialog
      ref={dialogRef}
      className={styles.dialog}
      aria-labelledby={titleId}
      onClose={onClose}
      onClick={handleBackdropClick}
    >
      <div className={styles.content}>
        <h2 id={titleId} className={styles.title}>
          {labels.discardTitle}
        </h2>
        <p className={styles.description}>{labels.discardDescription}</p>
        <div className={styles.actions}>
          {/* 되돌릴 수 없는 쪽에 기본 포커스를 두지 않는다 */}
          <Button variant="secondary" autoFocus onClick={() => dialogRef.current?.close()}>
            {labels.discardCancel}
          </Button>
          <Button variant="danger" onClick={onConfirm}>
            {labels.discardConfirm}
          </Button>
        </div>
      </div>
    </dialog>
  )
}

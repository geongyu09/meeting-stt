import { useEffect, useId, useRef, useState, type MouseEvent } from 'react'
import { useLocation, useNavigate } from 'react-router'
import Icon from '@renderer/shared/components/primitives/ui/Icon'
import { useLocale } from '@renderer/shared/provider/context/localeContext'
import { PATHS } from '@renderer/shared/routes/paths'

import {
  DEFAULT_SETTINGS_CATEGORY,
  isSettingsCategory,
  type SettingsCategory
} from './constants/categories'
import CategoryContent from './ui/CategoryContent'
import CategoryNav from './ui/CategoryNav'
import styles from './index.module.css'

const CLOSE_ICON_SIZE = 18

/**
 * 설정 모달 (references/features/ui.md "채팅창 리뉴얼" > "설정 모달"). `/settings`에 뜨는 네이티브 `<dialog>`라
 * 포커스 가둠·Esc·배경은 플랫폼이 준다. 닫기·Esc·배경 클릭 모두 dialog의 close 이벤트를 거쳐 이전 화면으로 돌아간다.
 */
export default function Settings() {
  const { t } = useLocale()
  const navigate = useNavigate()
  const location = useLocation()
  const dialogRef = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  // 요약 템플릿 편집처럼 설정의 하위 화면에서 돌아오면 그 카테고리를 바로 연다
  const requested: unknown = (location.state as { category?: unknown } | null)?.category
  const [category, setCategory] = useState<SettingsCategory>(
    isSettingsCategory(requested) ? requested : DEFAULT_SETTINGS_CATEGORY
  )

  // `open` 속성으로 열면 비모달이라 DOM API로 연다
  useEffect(() => {
    dialogRef.current?.showModal()
  }, [])

  const handleClose = () => {
    // 앱이 이 경로로 바로 켜졌으면 돌아갈 곳이 없어 채팅으로 간다
    if (location.key === 'default') navigate(PATHS.assistant)
    else navigate(-1)
  }

  // 배경(::backdrop) 클릭은 dialog 자신이 target이다. 안쪽 클릭은 자식이 target이라 닫히지 않는다
  const handleBackdropClick = (event: MouseEvent<HTMLDialogElement>) => {
    if (event.target === event.currentTarget) dialogRef.current?.close()
  }

  return (
    <dialog
      ref={dialogRef}
      className={styles.dialog}
      aria-labelledby={titleId}
      onClose={handleClose}
      onClick={handleBackdropClick}
    >
      <header className={styles.header}>
        <h2 id={titleId} className={styles.title}>
          {t.settings.title}
        </h2>
        <button
          type="button"
          className={styles.closeButton}
          aria-label={t.settings.close}
          onClick={() => dialogRef.current?.close()}
        >
          <Icon name="close" size={CLOSE_ICON_SIZE} />
        </button>
      </header>
      <div className={styles.body}>
        <CategoryNav value={category} onChange={setCategory} />
        <div className={styles.content}>
          <div className={styles.inner}>
            <CategoryContent category={category} />
          </div>
        </div>
      </div>
    </dialog>
  )
}

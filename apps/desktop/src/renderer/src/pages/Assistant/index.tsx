import { useState } from 'react'
import { Outlet } from 'react-router'
import UpdateBanner from '@renderer/modules/features/update/UpdateBanner'
import AssistantChatSection from '@renderer/modules/widgets/assistant/AssistantChatSection'
import DocumentEditorSection from '@renderer/modules/widgets/assistant/DocumentEditorSection'
import SetupSection from '@renderer/modules/widgets/assistant/SetupSection'
import RecorderSection from '@renderer/modules/widgets/recording/RecorderSection'

import styles from './index.module.css'

/**
 * 첫 화면 — 채팅 창 하나, 문서 패널은 필요할 때만 옆에 (references/features/ui.md "채팅창 리뉴얼").
 * "문서 열기"는 파일 없이 패널만 열고, 바뀐 파일 칩은 파일과 함께 연다. widgets는 서로 import하지 않으므로 그 상태를 페이지가 든다.
 */
export default function Assistant() {
  const [openPath, setOpenPath] = useState<string | null>(null)
  const [isDocumentOpen, setIsDocumentOpen] = useState(false)

  const openDocument = (path: string | null) => {
    setOpenPath(path)
    setIsDocumentOpen(true)
  }

  const closeDocument = () => {
    setOpenPath(null)
    setIsDocumentOpen(false)
  }

  return (
    <div className={[styles.page, isDocumentOpen ? styles.withDocument : ''].join(' ')}>
      {/* 신호등이 겹치는 자리. 창을 끄는 영역이다 */}
      <div className={styles.titleBar} />
      <UpdateBanner />
      {/* 처음 실행이면 작업 폴더·모델 카드가 대화 위에 선다. 끝나면 스스로 사라진다 */}
      <SetupSection />
      <div className={styles.columns}>
        <AssistantChatSection
          openPath={isDocumentOpen ? openPath : null}
          onOpenDocument={openDocument}
          // 녹음 카드는 녹음 중에만 그려진다. widgets는 서로 import하지 않으므로 페이지가 슬롯으로 넘긴다
          recorderSlot={<RecorderSection />}
        />
        {isDocumentOpen ? (
          <DocumentEditorSection
            openPath={openPath}
            onOpenPathChange={setOpenPath}
            onClose={closeDocument}
          />
        ) : null}
      </div>
      {/* 설정 모달(`/settings`). 최상위 레이어에 뜨므로 자리는 상관없다 */}
      <Outlet />
    </div>
  )
}

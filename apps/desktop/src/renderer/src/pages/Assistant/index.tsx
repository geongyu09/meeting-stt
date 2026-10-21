import { useState } from 'react'
import { Link, Outlet } from 'react-router'
import UpdateBanner from '@renderer/modules/features/update/UpdateBanner'
import AssistantChatSection from '@renderer/modules/widgets/assistant/AssistantChatSection'
import DocumentEditorSection from '@renderer/modules/widgets/assistant/DocumentEditorSection'
import SetupSection from '@renderer/modules/widgets/assistant/SetupSection'
import TranscriptSection from '@renderer/modules/widgets/meeting/TranscriptSection'
import RecorderSection from '@renderer/modules/widgets/recording/RecorderSection'
import Icon from '@renderer/shared/components/primitives/ui/Icon'
import { useLocale } from '@renderer/shared/provider/context/localeContext'
import { PATHS } from '@renderer/shared/routes/paths'

import styles from './index.module.css'

type SidePanel = { kind: 'document' } | { kind: 'record'; meetingId: string } | null

/**
 * 첫 화면 — 채팅 창 하나, 문서·전체 기록 패널은 필요할 때만 옆에 (references/features/ui.md "채팅창 리뉴얼").
 * "문서 열기"는 파일 없이 패널만 열고, 바뀐 파일 칩은 파일과 함께 연다. 옆 자리는 하나라 문서와 기록 중 하나만 열린다.
 * widgets는 서로 import하지 않으므로 그 상태를 페이지가 든다.
 */
export default function Assistant() {
  const { t } = useLocale()
  const [openPath, setOpenPath] = useState<string | null>(null)
  const [panel, setPanel] = useState<SidePanel>(null)

  const openDocument = (path: string | null) => {
    setOpenPath(path)
    setPanel({ kind: 'document' })
  }

  const closePanel = () => {
    setOpenPath(null)
    setPanel(null)
  }

  const renderPanel = () => {
    if (panel?.kind === 'document') {
      return (
        <DocumentEditorSection
          openPath={openPath}
          onOpenPathChange={setOpenPath}
          onClose={closePanel}
        />
      )
    }
    if (panel?.kind === 'record') {
      // 다른 기록으로 바꾸면 편집·복사 상태가 남지 않도록 통째로 새로 그린다
      return (
        <TranscriptSection key={panel.meetingId} meetingId={panel.meetingId} onClose={closePanel} />
      )
    }

    return null
  }

  return (
    <div
      className={[
        styles.page,
        panel?.kind === 'document' ? styles.withDocument : '',
        panel?.kind === 'record' ? styles.withRecord : ''
      ].join(' ')}
    >
      {/* 신호등이 겹치는 자리. 창을 끄는 영역이다. 기능은 `/` 명령으로 열고 설정만 모서리에 둔다 */}
      <div className={styles.titleBar}>
        <Link
          className={styles.settingsLink}
          to={PATHS.settings}
          aria-label={t.assistant.chat.openSettings}
        >
          <Icon name="settings" size={18} />
        </Link>
      </div>
      <UpdateBanner />
      {/* 처음 실행이면 작업 폴더·모델 카드가 대화 위에 선다. 끝나면 스스로 사라진다 */}
      <SetupSection />
      <div className={styles.columns}>
        <AssistantChatSection
          openPath={panel?.kind === 'document' ? openPath : null}
          onOpenDocument={openDocument}
          onOpenRecord={(meetingId) => setPanel({ kind: 'record', meetingId })}
          // 녹음 카드는 녹음 중에만 그려진다. widgets는 서로 import하지 않으므로 페이지가 슬롯으로 넘긴다
          recorderSlot={<RecorderSection />}
        />
        {renderPanel()}
      </div>
      {/* 설정 모달(`/settings`). 최상위 레이어에 뜨므로 자리는 상관없다 */}
      <Outlet />
    </div>
  )
}

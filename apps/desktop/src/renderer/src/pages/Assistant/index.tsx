import { useState } from 'react'
import AssistantChatSection from '@renderer/modules/widgets/assistant/AssistantChatSection'
import DocumentEditorSection from '@renderer/modules/widgets/assistant/DocumentEditorSection'
import TopBar from '@renderer/shared/components/primitives/layout/TopBar'
import { useLocale } from '@renderer/shared/provider/context/localeContext'

import styles from './index.module.css'

/**
 * 개인 비서 화면 — 왼쪽 채팅, 오른쪽 문서 에디터 (references/architecture.md "개인 비서 모드" > "화면").
 * 채팅의 바뀐 파일을 에디터가 열어야 하는데 widgets는 서로 import하지 않으므로 열린 경로만 페이지가 든다.
 */
export default function Assistant() {
  const { t } = useLocale()
  const [openPath, setOpenPath] = useState<string | null>(null)

  return (
    <>
      <TopBar title={t.assistant.topBar} />
      <div className={styles.columns}>
        <AssistantChatSection onOpenFile={setOpenPath} />
        <DocumentEditorSection openPath={openPath} onOpenPathChange={setOpenPath} />
      </div>
    </>
  )
}

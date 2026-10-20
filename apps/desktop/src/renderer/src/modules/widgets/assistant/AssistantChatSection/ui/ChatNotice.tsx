import { Link } from 'react-router'
import { useLocale } from '@renderer/shared/provider/context/localeContext'
import { PATHS } from '@renderer/shared/routes/paths'

import styles from './ChatNotice.module.css'

interface ChatNoticeProps {
  /** 작업 폴더가 없거나 쓸 수 없을 때의 문장. 설정 링크를 붙인다 */
  folderNotice: string | null
  /** 고른 에이전트의 CLI가 없으면 그 이름. 있으면 null */
  missingCliLabel: string | null
  isNotGitRepo: boolean
}

/** 입력란 위의 안내 줄. 폴더 문제가 가장 먼저고, 준비가 끝났어도 git 저장소가 아니면 한 줄 경고한다 */
export default function ChatNotice({
  folderNotice,
  missingCliLabel,
  isNotGitRepo
}: ChatNoticeProps) {
  const { t } = useLocale()
  const labels = t.assistant.chat

  if (folderNotice) {
    return (
      <p className={styles.notice} role="status">
        {folderNotice}{' '}
        <Link className={styles.link} to={PATHS.settings}>
          {labels.openSettings}
        </Link>
      </p>
    )
  }
  if (missingCliLabel) {
    return (
      <p className={styles.notice} role="status">
        {labels.cliMissing({ label: missingCliLabel })}
      </p>
    )
  }
  if (isNotGitRepo) {
    return (
      <p className={styles.notice} role="status">
        {labels.notGitRepo}
      </p>
    )
  }

  return null
}

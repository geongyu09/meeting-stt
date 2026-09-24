import { GLOSSARY_MAX_TERMS, GLOSSARY_TEAM_MAX_CHARS } from '@shared/glossary'
import SettingGroup from '@renderer/shared/components/primitives/layout/SettingGroup'
import Button from '@renderer/shared/components/primitives/ui/Button'

import useGlossary from './model/useGlossary'
import styles from './index.module.css'

const TEAM_ROWS = 3
const TERMS_ROWS = 12

const TEAM_PLACEHOLDER =
  '예: 프론트엔드 개발팀입니다. 공용 UI 라이브러리와 패키지 배포를 주로 다룹니다.'
const TERMS_PLACEHOLDER = ['모노레포', 'GitHub = 깃허브', 'tarball = 타볼, 타르볼'].join('\n')

/** 교정·인식에 쓰는 전역 용어 사전. 팀 소개로 초안을 만들고 사람이 고쳐 저장한다 */
export default function GlossarySection() {
  const {
    teamDescription,
    termsText,
    isLoading,
    loadError,
    isDirty,
    isSaving,
    isDrafting,
    actionError,
    notice,
    setTeamDescription,
    setTermsText,
    saveGlossary,
    draftTerms
  } = useGlossary()

  const renderBody = () => {
    if (isLoading) return <p className={styles.hint}>용어 사전을 불러오는 중입니다</p>
    if (loadError) {
      return (
        <p className={styles.error} role="alert">
          {loadError}
        </p>
      )
    }

    const termCount = termsText.split('\n').filter((line) => line.trim()).length
    const isBusy = isSaving || isDrafting

    return (
      <>
        <label className={styles.field}>
          <span className={styles.label}>팀 소개</span>
          <textarea
            className={styles.textarea}
            rows={TEAM_ROWS}
            maxLength={GLOSSARY_TEAM_MAX_CHARS}
            placeholder={TEAM_PLACEHOLDER}
            value={teamDescription}
            onChange={(event) => setTeamDescription(event.target.value)}
            disabled={isDrafting}
          />
        </label>
        <div className={styles.actions}>
          <Button
            variant="secondary"
            size="sm"
            onClick={draftTerms}
            disabled={isBusy || !teamDescription.trim()}
          >
            {isDrafting ? '초안을 만드는 중…' : '용어 초안 만들기'}
          </Button>
          {isDrafting && (
            <span className={styles.hint}>
              10~20초 걸립니다. 회의록을 처리 중이면 그 작업이 끝난 뒤 만듭니다
            </span>
          )}
        </div>

        <label className={styles.field}>
          <span className={styles.label}>
            용어 목록 ({termCount}/{GLOSSARY_MAX_TERMS})
          </span>
          <span className={styles.hint}>
            한 줄에 하나씩 적습니다. 영어 용어는 “영어 = 한글 읽기”로 적어야 발음이 비슷하게 잘못
            받아 적힌 말을 찾을 수 있습니다. 읽기가 여러 개면 쉼표로 잇습니다.
          </span>
          <textarea
            className={`${styles.textarea} ${styles.terms}`}
            rows={TERMS_ROWS}
            placeholder={TERMS_PLACEHOLDER}
            value={termsText}
            onChange={(event) => setTermsText(event.target.value)}
            disabled={isDrafting}
            spellCheck={false}
          />
        </label>
        <div className={styles.actions}>
          <Button size="sm" onClick={saveGlossary} disabled={isBusy || !isDirty}>
            {isSaving ? '저장하는 중…' : '저장'}
          </Button>
          {isDirty && !isBusy && <span className={styles.hint}>저장하지 않은 변경이 있습니다</span>}
        </div>

        {notice && (
          <p className={styles.notice} role="status">
            {notice}
          </p>
        )}
        {actionError && (
          <p className={styles.error} role="alert">
            {actionError}
          </p>
        )}
      </>
    )
  }

  return (
    <SettingGroup title="용어 사전">
      <div className={styles.body}>
        <p className={styles.hint}>
          회의에 자주 나오는 영어 용어·제품 이름·약어를 적어 두면 회의록 교정에 씁니다. 팀 소개를
          적고 초안을 만들면 로컬 요약 모델이 후보를 채워 주고, 확인한 뒤 저장하면 됩니다. 초안에는
          요약 모델이 필요합니다.
        </p>
        {renderBody()}
      </div>
    </SettingGroup>
  )
}

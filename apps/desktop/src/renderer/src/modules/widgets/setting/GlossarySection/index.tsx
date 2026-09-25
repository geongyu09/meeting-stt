import { GLOSSARY_MAX_TERMS, GLOSSARY_TEAM_MAX_CHARS } from '@shared/glossary'
import SettingGroup from '@renderer/shared/components/primitives/layout/SettingGroup'
import Button from '@renderer/shared/components/primitives/ui/Button'
import { useLocale } from '@renderer/shared/provider/context/localeContext'

import useGlossary from './model/useGlossary'
import TermRow from './ui/TermRow'
import styles from './index.module.css'

const TEAM_ROWS = 3

/** 교정·인식에 쓰는 전역 용어 사전. 팀 소개로 초안을 만들고 사람이 고쳐 저장한다 */
export default function GlossarySection() {
  const { t } = useLocale()
  const {
    teamDescription,
    rows,
    focusId,
    termCount,
    isLoading,
    loadError,
    isDirty,
    isSaving,
    isDrafting,
    actionError,
    notice,
    setTeamDescription,
    addRow,
    updateRow,
    removeRow,
    pasteRows,
    saveGlossary,
    draftTerms
  } = useGlossary()

  const renderBody = () => {
    if (isLoading) return <p className={styles.hint}>{t.glossary.section.loading}</p>
    if (loadError) {
      return (
        <p className={styles.error} role="alert">
          {loadError}
        </p>
      )
    }

    const isBusy = isSaving || isDrafting

    return (
      <>
        <label className={styles.field}>
          <span className={styles.label}>{t.glossary.section.teamLabel}</span>
          <span className={styles.hint}>{t.glossary.section.teamHint}</span>
          <textarea
            className={styles.textarea}
            rows={TEAM_ROWS}
            maxLength={GLOSSARY_TEAM_MAX_CHARS}
            placeholder={t.glossary.section.teamPlaceholder}
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
            {isDrafting ? t.glossary.section.drafting : t.glossary.section.draft}
          </Button>
          {isDrafting && <span className={styles.hint}>{t.glossary.section.draftHint}</span>}
        </div>

        <div className={styles.field}>
          <span className={styles.label}>
            {t.glossary.section.termsLabel({ count: termCount, max: GLOSSARY_MAX_TERMS })}
          </span>
          <span className={styles.hint}>{t.glossary.section.termsHint}</span>
          <div className={styles.termHeader} aria-hidden="true">
            <span>{t.glossary.section.termColumn}</span>
            <span>{t.glossary.section.readingColumn}</span>
          </div>
          <ol className={styles.termList} aria-label={t.glossary.section.termList}>
            {rows.map((row, index) => (
              <TermRow
                key={row.id}
                position={index + 1}
                term={row.term}
                readings={row.readings}
                isAutoFocus={row.id === focusId}
                isDisabled={isDrafting}
                onChange={(patch) => updateRow({ id: row.id, patch })}
                onRemove={() => removeRow(row.id)}
                onPasteList={(text) => pasteRows({ id: row.id, text })}
                onEnter={() => addRow(row.id)}
              />
            ))}
          </ol>
          <div className={styles.actions}>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => addRow()}
              disabled={isDrafting || rows.length >= GLOSSARY_MAX_TERMS}
            >
              {t.glossary.section.addTerm}
            </Button>
          </div>
        </div>
        <div className={styles.actions}>
          <Button size="sm" onClick={saveGlossary} disabled={isBusy || !isDirty}>
            {isSaving ? t.glossary.section.saving : t.glossary.section.save}
          </Button>
          {isDirty && !isBusy && <span className={styles.hint}>{t.glossary.section.unsaved}</span>}
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
    <SettingGroup title={t.glossary.section.title}>
      <div className={styles.body}>
        <p className={styles.hint}>{t.glossary.section.intro}</p>
        {renderBody()}
      </div>
    </SettingGroup>
  )
}

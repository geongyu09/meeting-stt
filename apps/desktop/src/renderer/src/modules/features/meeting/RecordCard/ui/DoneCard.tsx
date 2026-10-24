import type { CSSProperties } from 'react'
import { formatTranscript, resolveSpeakerNames } from '@meeting-stt/core/format'
import type { Meeting, RefineResult, Speaker, Utterance } from '@shared/types'
import useNow from '@renderer/shared/hooks/common/useNow'
import useOrganizeStatus from '@renderer/shared/hooks/domain/assistant/useOrganizeStatus'
import { useLocale } from '@renderer/shared/provider/context/localeContext'
import { formatDurationShort } from '@renderer/shared/utils/formatDuration'
import { formatMeetingDay, formatMeetingTime } from '@renderer/shared/utils/formatMeetingDate'

import useRecordSummary from '../model/useRecordSummary'
import BrainFiles from './BrainFiles'
import CardFooter from './CardFooter'
import CardHeader from './CardHeader'
import SummaryBlock from './SummaryBlock'
import styles from './DoneCard.module.css'

/** 화자 색은 `--color-speaker-1`~`8`을 등장 순서대로 돌려 쓴다 (회의 상세와 같은 규칙) */
const SPEAKER_TONE_COUNT = 8
/** 날짜 표기("올해면 월·일만")가 해를 넘길 때 갱신되면 충분하다 */
const NOW_REFRESH_MS = 60_000

interface DoneCardProps {
  meeting: Meeting
  utterances: Utterance[]
  speakers: Speaker[]
  refineResult: RefineResult | null
  saveError: Error | null
  onRename: (title: string) => void
  onDelete: () => Promise<boolean>
  onOpenFull: () => void
  onOpenFile: (path: string) => void
}

/** 회의록이 만들어진 카드: 헤더 · 요약 · 화자 범례와 교정 수 · 작업 폴더에 저장한 파일 · 푸터 */
export default function DoneCard({
  meeting,
  utterances,
  speakers,
  refineResult,
  saveError,
  onRename,
  onDelete,
  onOpenFull,
  onOpenFile
}: DoneCardProps) {
  const { t, locale } = useLocale()
  const { now } = useNow({ intervalMs: NOW_REFRESH_MS })
  const { status: organizeStatus } = useOrganizeStatus({ meetingId: meeting.id })
  const summary = useRecordSummary({
    meetingId: meeting.id,
    initialSummary: meeting.summary,
    hasTranscript: utterances.length > 0,
    notePath: organizeStatus?.notePath ?? null,
    organizeStage: organizeStatus?.stage ?? null
  })

  // 번호는 발화 등장 순서로 매긴다 (@meeting-stt/core/format). 발화가 없는 화자는 뒤에 붙는다
  const labels = [
    ...new Set([...utterances.map((u) => u.speakerLabel), ...speakers.map((s) => s.label)])
  ]
  const names = resolveSpeakerNames({
    labels,
    displayNames: Object.fromEntries(
      speakers.map(({ label, displayName }) => [label, displayName])
    ),
    defaultNames: {
      numbered: (index) => t.transcript.defaultSpeakerNames.numbered({ index }),
      unknown: t.transcript.defaultSpeakerNames.unknown
    }
  })
  const refinedCount = refineResult?.appliedPairs.length ?? 0
  const meta = [
    `${formatMeetingDay({ epochMs: meeting.createdAt, now, locale })} ${formatMeetingTime({ epochMs: meeting.createdAt, locale })}`,
    formatDurationShort({ sec: meeting.durationSec, locale }),
    ...(labels.length ? [t.transcript.header.speakerCount({ count: labels.length })] : [])
  ].join(' · ')

  return (
    <>
      <CardHeader
        title={meeting.title}
        meta={meta}
        copyText={formatTranscript({ utterances, displayNames: names, format: 'plain' })}
        saveError={saveError}
        onRename={onRename}
        onDelete={onDelete}
      />
      <SummaryBlock summary={summary} />
      <div className={styles.speakers}>
        {labels.map((label, index) => (
          <span key={label} className={styles.speaker}>
            <span
              className={styles.dot}
              style={
                {
                  background: `var(--color-speaker-${(index % SPEAKER_TONE_COUNT) + 1})`
                } as CSSProperties
              }
              aria-hidden="true"
            />
            {names[label]}
          </span>
        ))}
        {refinedCount ? (
          <span className={styles.refined}>
            {t.transcript.card.refinedCount({ count: refinedCount })}
          </span>
        ) : null}
      </div>
      {organizeStatus ? <BrainFiles status={organizeStatus} onOpenFile={onOpenFile} /> : null}
      <CardFooter summary={summary} onOpenFull={onOpenFull} />
    </>
  )
}

import Icon from '@renderer/shared/components/primitives/ui/Icon'
import useNow from '@renderer/shared/hooks/common/useNow'
import useMeetingSearch from '@renderer/shared/hooks/domain/meeting/useMeetingSearch'
import { useLocale } from '@renderer/shared/provider/context/localeContext'
import { formatClock } from '@renderer/shared/utils/formatClock'
import { formatDurationShort } from '@renderer/shared/utils/formatDuration'
import { formatMeetingDay } from '@renderer/shared/utils/formatMeetingDate'
import { highlightMatch } from '@renderer/shared/utils/highlightMatch'

import styles from './SearchResultCard.module.css'

const CHIP_ICON_SIZE = 14
/** 대화 폭에서 두 줄 안에 들어오는 발화 조각 길이 */
const SNIPPET_MAX_CHARS = 80
const TITLE_MAX_CHARS = 200
const NOW_REFRESH_MS = 60_000

interface SearchResultCardProps {
  query: string
  /** 결과를 누르면 그 회의의 전체 기록 패널을 연다 */
  onOpenRecord: (meetingId: string) => void
}

const Highlighted = ({
  text,
  query,
  maxChars
}: {
  text: string
  query: string
  maxChars: number
}) =>
  highlightMatch({ text, query, maxChars }).map((segment, index) =>
    // 조각은 순서로만 구분되고 다시 정렬되지 않는다
    segment.isMatch ? (
      <mark key={index}>{segment.text}</mark>
    ) : (
      <span key={index}>{segment.text}</span>
    )
  )

/** 기록 찾기 한 번 — 오른쪽 말풍선(칩 + 찾은 말) → 개수 → 결과 목록 (references/features/recording.md "채팅 창의 녹음" > "기록 찾기") */
export default function SearchResultCard({ query, onOpenRecord }: SearchResultCardProps) {
  const { t, locale } = useLocale()
  const labels = t.transcript.search
  const { now } = useNow({ intervalMs: NOW_REFRESH_MS })
  const { results, isSearching, error } = useMeetingSearch({ query })

  const renderResults = () => {
    if (error) {
      return (
        <p className={styles.error} role="alert">
          {error.message}
        </p>
      )
    }
    if (isSearching) return <p className={styles.text}>{labels.searching}</p>
    if (!results.length) return <p className={styles.text}>{labels.none({ query })}</p>

    return (
      <>
        <p className={styles.text}>{labels.count({ query, count: results.length })}</p>
        <div role="list" aria-label={labels.listLabel} className={styles.hits}>
          {results.map(({ meeting, match }) => (
            <button
              key={meeting.id}
              type="button"
              role="listitem"
              className={styles.hit}
              onClick={() => onOpenRecord(meeting.id)}
            >
              <b className={styles.title}>
                <Highlighted text={meeting.title} query={query} maxChars={TITLE_MAX_CHARS} />
              </b>
              <small className={styles.meta}>
                {formatMeetingDay({ epochMs: meeting.createdAt, now, locale })} ·{' '}
                {formatDurationShort({ sec: meeting.durationSec, locale })}
              </small>
              {match ? (
                <q className={styles.snippet}>
                  <span className={styles.time}>{formatClock({ sec: match.startSec })}</span>{' '}
                  <Highlighted text={match.text} query={query} maxChars={SNIPPET_MAX_CHARS} />
                </q>
              ) : null}
            </button>
          ))}
        </div>
        <p className={styles.hint}>{labels.hint}</p>
      </>
    )
  }

  return (
    <>
      <p className={styles.me}>
        <span className={styles.chip}>
          <Icon name="search" size={CHIP_ICON_SIZE} />
          {labels.chip}
        </span>
        {query}
      </p>
      {renderResults()}
    </>
  )
}

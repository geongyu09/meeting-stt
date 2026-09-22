const pad2 = (value: number) => String(value).padStart(2, '0')

/**
 * 회의 목록·상세의 생성 시각 표시용. epoch ms를 사용자의 현지 시각으로 읽는다.
 * Intl 대신 직접 조립하는 이유는 실행 환경의 ICU 데이터에 따라 문구가 달라지지 않게 하기 위해서다.
 */
export const formatMeetingDate = ({ epochMs }: { epochMs: number }) => {
  const date = new Date(epochMs)
  const day = `${date.getFullYear()}년 ${date.getMonth() + 1}월 ${date.getDate()}일`

  return `${day} ${pad2(date.getHours())}:${pad2(date.getMinutes())}`
}

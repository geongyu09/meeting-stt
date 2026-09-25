/**
 * 공통 컴포넌트(`shared/components/**`)와 포맷터의 문구. ko가 타입을 정하고 en은 같은 키를 가져야 한다
 * (references/architecture.md "UI 언어"). 날짜·시간은 Intl 대신 직접 조립한다 — 실행 환경의 ICU 데이터에 따라 문구가 달라지지 않게.
 */
const WEEKDAYS_KO = ['일', '월', '화', '수', '목', '금', '토']
const WEEKDAYS_EN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS_EN = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec'
]

const monthNameEn = (month: number) => MONTHS_EN[month - 1]

export const commonKo = {
  loading: '불러오는 중입니다',
  retry: '다시 시도',
  cancel: '취소',
  copyFailed: '복사하지 못했습니다',
  inlineEdit: {
    editLabel: ({ label }: { label: string }) => `${label} 수정`
  },
  stepper: {
    decrease: ({ label }: { label: string }) => `${label} 줄이기`,
    increase: ({ label }: { label: string }) => `${label} 늘리기`
  },
  levelWaveform: {
    micLevel: '마이크 입력 세기'
  },
  duration: {
    hours: ({ hours }: { hours: number }) => `${hours}시간`,
    minutes: ({ minutes }: { minutes: number }) => `${minutes}분`,
    seconds: ({ seconds }: { seconds: number }) => `${seconds}초`,
    zero: '0초'
  },
  date: {
    /** "오후 2:10". 자정은 오전 12시, 정오는 오후 12시 */
    time: ({ hour12, minute, isPm }: { hour12: number; minute: string; isPm: boolean }) =>
      `${isPm ? '오후' : '오전'} ${hour12}:${minute}`,
    /** "2026년 9월 24일 (목) 오후 2:10" */
    full: ({
      year,
      month,
      day,
      weekday,
      time
    }: {
      year: number
      month: number
      day: number
      weekday: number
      time: string
    }) => `${year}년 ${month}월 ${day}일 (${WEEKDAYS_KO[weekday]}) ${time}`,
    /** 사이드바: "9월 22일" */
    monthDay: ({ month, day }: { month: number; day: number }) => `${month}월 ${day}일`,
    /** 사이드바, 다른 해: "2025년 9월 22일" */
    yearMonthDay: ({ year, month, day }: { year: number; month: number; day: number }) =>
      `${year}년 ${month}월 ${day}일`
  }
}

export const commonEn: typeof commonKo = {
  loading: 'Loading',
  retry: 'Retry',
  cancel: 'Cancel',
  copyFailed: 'Could not copy',
  inlineEdit: {
    editLabel: ({ label }) => `Edit ${label}`
  },
  stepper: {
    decrease: ({ label }) => `Decrease ${label}`,
    increase: ({ label }) => `Increase ${label}`
  },
  levelWaveform: {
    micLevel: 'Microphone input level'
  },
  duration: {
    hours: ({ hours }) => `${hours}h`,
    minutes: ({ minutes }) => `${minutes}m`,
    seconds: ({ seconds }) => `${seconds}s`,
    zero: '0s'
  },
  date: {
    time: ({ hour12, minute, isPm }) => `${hour12}:${minute} ${isPm ? 'PM' : 'AM'}`,
    full: ({ year, month, day, weekday, time }) =>
      `${WEEKDAYS_EN[weekday]}, ${monthNameEn(month)} ${day}, ${year} ${time}`,
    monthDay: ({ month, day }) => `${monthNameEn(month)} ${day}`,
    yearMonthDay: ({ year, month, day }) => `${monthNameEn(month)} ${day}, ${year}`
  }
}

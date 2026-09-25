export interface ByteRange {
  start: number
  /** 포함 끝 (HTTP Content-Range와 같은 규칙) */
  end: number
}

const SINGLE_RANGE_PATTERN = /^bytes=(\d*)-(\d*)$/

interface ParseByteRangeParams {
  header: string | null
  size: number
}

/**
 * `<audio>` 시킹이 보내는 `Range` 헤더를 해석한다. 헤더가 없거나 여러 구간이면 `null`(파일 전체로 응답) —
 * HTTP는 서버가 Range를 무시하는 것을 허용한다. 파일 밖을 가리키면 `'unsatisfiable'`(416).
 */
export const parseByteRange = ({ header, size }: ParseByteRangeParams) => {
  const match = header?.trim().match(SINGLE_RANGE_PATTERN)
  if (!match) return null

  const [, startText, endText] = match
  if (!startText && !endText) return null

  // bytes=-N: 끝에서 N바이트
  if (!startText) {
    const suffix = Number(endText)
    if (suffix === 0 || size === 0) return 'unsatisfiable' as const

    return { start: Math.max(0, size - suffix), end: size - 1 }
  }

  const start = Number(startText)
  const end = endText ? Math.min(Number(endText), size - 1) : size - 1
  if (start >= size || start > end) return 'unsatisfiable' as const

  return { start, end }
}

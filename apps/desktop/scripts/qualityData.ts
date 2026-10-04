// 녹음 품질 측정이 같이 쓰는 입력 (docs/recording-quality-results.md).
// 정답 전사본이 있는 녹음은 jun-meeting 하나뿐이라, 글자 오류를 재는 실험은 전부 이 녹음을 쓴다.
import { readFile } from 'node:fs/promises'
import path from 'node:path'

import { readWavPcm } from '../src/main/pipeline/normalize'
import { normalizeForCer } from './cer'
import { TURN_HEADER_PATTERN } from './diarScore'
import { AUDIO_DIR, FIXTURES_DIR, OUTPUT_DIR } from './paths'

export const QUALITY_DIR = path.join(OUTPUT_DIR, 'quality')
export const MEETING_AUDIO_PATH = path.join(AUDIO_DIR, 'jun-meeting.wav')
/** 앱과 같은 조건(turbo, 정규화, VAD, -mc 0)으로 전체를 인식한 결과 (docs/stt-tuning-results.md) */
export const MEETING_STT_TEXT_PATH = path.join(OUTPUT_DIR, 'jun-meeting.mc0.txt')
const MEETING_REFERENCE_PATH = path.join(
  FIXTURES_DIR,
  'reference',
  'jun-meeting.clova-speakers.txt'
)

const SEC_PER_MIN = 60
const SEC_PER_HOUR = 3600

export interface ReferenceTurnText {
  speaker: string
  start: number
  /** 다음 턴의 시작. 정답본에 끝 시각이 없다 */
  end: number
  /** 채점용으로 글자·숫자만 남긴 본문 */
  chars: string[]
}

/** 화자·시각 헤더 아래의 줄들을 그 턴의 본문으로 묶는다. 첫 헤더 앞의 제목·참석자 줄은 버린다 */
export const parseReferenceTurnTexts = (raw: string) => {
  const turns: { speaker: string; start: number; lines: string[] }[] = []

  for (const line of raw.replace(/^\uFEFF/, '').split(/\r?\n/)) {
    const matched = line.match(TURN_HEADER_PATTERN)
    if (matched) {
      const start =
        Number(matched[2] ?? 0) * SEC_PER_HOUR +
        Number(matched[3]) * SEC_PER_MIN +
        Number(matched[4])
      turns.push({ speaker: matched[1], start, lines: [] })
      continue
    }
    turns.at(-1)?.lines.push(line)
  }

  return turns.map<ReferenceTurnText>((turn, index) => ({
    speaker: turn.speaker,
    start: turn.start,
    end: turns[index + 1]?.start ?? Infinity,
    chars: [...normalizeForCer(turn.lines.join('\n'))]
  }))
}

export const loadMeetingTurns = async () =>
  parseReferenceTurnTexts(await readFile(MEETING_REFERENCE_PATH, 'utf-8'))

export const loadWav = async (filePath: string) => readWavPcm(await readFile(filePath))

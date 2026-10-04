// 화자 분리 채점 공용 로직. diarBench.ts(1차 실험)와 diarEval.ts(2차 실험, docs/diarization-experiments.md)가 같이 쓴다.
// 정답본은 두 형식을 읽는다 — 클로바 노트 텍스트(턴 시작 시각만, 1초 해상도)와 RTTM(구간 시작·길이, 겹침 포함).
import type { MergedUtterance, SpeakerPiece, SpeakerSegment } from '@shared/types'

import { normalizeForCer } from './cer'

/** 클로바 노트는 1시간 전에는 `MM:SS`, 1시간부터는 `H:MM:SS`로 적는다 */
export const TURN_HEADER_PATTERN = /^(.+?) (?:(\d{1,2}):)?(\d{1,2}):(\d{2})$/
const SEC_PER_MIN = 60
const SEC_PER_HOUR = 3600
/** DER 프레임 길이. md-eval·pyannote.metrics와 같은 10ms */
const DER_FRAME_SEC = 0.01
/** DER에서 정답 경계 앞뒤로 채점하지 않는 시간. AMI·DIHARD 관례 */
export const DER_COLLAR_SEC = 0.25

export interface ReferenceTurn {
  speaker: string
  start: number
  end: number
}

export type ReferenceFormat = 'clova' | 'rttm'

export interface Reference {
  format: ReferenceFormat
  /** 시작 순 정렬. clova는 겹침 없이 이어지고, rttm은 겹치거나 비는 구간이 있다 */
  turns: ReferenceTurn[]
  /** 이 시각 범위만 채점한다 (AMI UEM). 없으면 전체 */
  scoredRange?: { start: number; end: number }
}

/** 헤더 줄의 시각을 턴 시작으로, 다음 턴 시작을 턴 끝으로 본다 (정답본에 끝 시각이 없다) */
export const parseReferenceTurns = (text: string): ReferenceTurn[] => {
  const starts: { speaker: string; start: number }[] = []

  for (const line of text.replace(/^\uFEFF/, '').split(/\r?\n/)) {
    const matched = line.match(TURN_HEADER_PATTERN)
    if (!matched) continue
    starts.push({
      speaker: matched[1],
      start:
        Number(matched[2] ?? 0) * SEC_PER_HOUR +
        Number(matched[3]) * SEC_PER_MIN +
        Number(matched[4])
    })
  }

  return starts.map((turn, index) => ({ ...turn, end: starts[index + 1]?.start ?? Infinity }))
}

/** `SPEAKER <file> 1 <start> <duration> <NA> <NA> <speaker> <NA> <NA>` */
export const parseRttm = (text: string): ReferenceTurn[] =>
  text
    .split(/\r?\n/)
    .map((line) => line.trim().split(/\s+/))
    .filter((fields) => fields[0] === 'SPEAKER' && fields.length >= 8)
    .map((fields) => ({
      speaker: fields[7],
      start: Number(fields[3]),
      end: Number(fields[3]) + Number(fields[4])
    }))
    .toSorted((a, b) => a.start - b.start)

/** `<file> 1 <start> <end>` 한 줄 */
export const parseUem = (text: string) => {
  const fields = text.trim().split(/\s+/)
  return fields.length >= 4 ? { start: Number(fields[2]), end: Number(fields[3]) } : undefined
}

export const formatRttm = ({ fileId, turns }: { fileId: string; turns: ReferenceTurn[] }) =>
  turns
    .map(
      (turn) =>
        `SPEAKER ${fileId} 1 ${turn.start.toFixed(3)} ${(turn.end - turn.start).toFixed(3)} <NA> <NA> ${turn.speaker} <NA> <NA>`
    )
    .join('\n')

/** 시각 sec에 말하고 있는 정답 화자들. clova는 항상 한 명이다 */
export const activeSpeakersAt = ({ reference, sec }: { reference: Reference; sec: number }) => {
  const turns = reference.turns
  if (reference.format === 'clova') {
    let low = 0
    let high = turns.length - 1
    while (low < high) {
      const mid = (low + high + 1) >> 1
      if (turns[mid].start <= sec) low = mid
      else high = mid - 1
    }
    return turns.length && turns[low].start <= sec ? [turns[low].speaker] : []
  }

  return [...new Set(turns.filter((t) => t.start <= sec && sec < t.end).map((t) => t.speaker))]
}

/** sec에서 가장 가까운 정답 화자 전환(턴 시작·끝)까지의 거리 */
export const distanceToReferenceBoundary = ({
  reference,
  sec
}: {
  reference: Reference
  sec: number
}) =>
  reference.turns.reduce(
    (best, turn) => Math.min(best, Math.abs(sec - turn.start), Math.abs(sec - turn.end)),
    Infinity
  )

export interface Confusion {
  /** hyp 라벨 → ref 라벨 → 가중치 */
  matrix: Map<string, Map<string, number>>
  total: number
}

export const emptyConfusion = (): Confusion => ({ matrix: new Map(), total: 0 })

export const addWeight = ({
  confusion,
  hyp,
  ref,
  weight
}: {
  confusion: Confusion
  hyp: string
  ref: string
  weight: number
}) => {
  const row = confusion.matrix.get(hyp) ?? new Map<string, number>()
  row.set(ref, (row.get(ref) ?? 0) + weight)
  confusion.matrix.set(hyp, row)
  confusion.total += weight
}

const refLabelsOf = (confusion: Confusion) => [
  ...new Set([...confusion.matrix.values()].flatMap((row) => [...row.keys()]))
]

/** 정사각 비용 행렬의 최소 비용 배정 (헝가리안, 1-based potentials). 행 i → 열 결과[i] */
const solveAssignment = (cost: number[][]) => {
  const size = cost.length
  const u = new Array<number>(size + 1).fill(0)
  const v = new Array<number>(size + 1).fill(0)
  const p = new Array<number>(size + 1).fill(0)
  const way = new Array<number>(size + 1).fill(0)

  for (let i = 1; i <= size; i += 1) {
    p[0] = i
    let j0 = 0
    const minv = new Array<number>(size + 1).fill(Infinity)
    const used = new Array<boolean>(size + 1).fill(false)
    do {
      used[j0] = true
      const i0 = p[j0]
      let delta = Infinity
      let j1 = 0
      for (let j = 1; j <= size; j += 1) {
        if (used[j]) continue
        const current = cost[i0 - 1][j - 1] - u[i0] - v[j]
        if (current < minv[j]) {
          minv[j] = current
          way[j] = j0
        }
        if (minv[j] < delta) {
          delta = minv[j]
          j1 = j
        }
      }
      for (let j = 0; j <= size; j += 1) {
        if (used[j]) {
          u[p[j]] += delta
          v[j] -= delta
        } else minv[j] -= delta
      }
      j0 = j1
    } while (p[j0] !== 0)
    do {
      const j1 = way[j0]
      p[j0] = p[j1]
      j0 = j1
    } while (j0)
  }

  const rowToColumn = new Array<number>(size).fill(-1)
  for (let j = 1; j <= size; j += 1) if (p[j] > 0) rowToColumn[p[j] - 1] = j - 1
  return rowToColumn
}

/** hyp 라벨과 ref 라벨을 일대일로 짝지을 때 맞는 가중치 합을 최대로 하는 배정 */
export const bestOneToOne = (confusion: Confusion) => {
  const hypLabels = [...confusion.matrix.keys()]
  const refLabels = refLabelsOf(confusion)
  const size = Math.max(hypLabels.length, refLabels.length)
  const gain = (i: number, j: number) =>
    i < hypLabels.length && j < refLabels.length
      ? (confusion.matrix.get(hypLabels[i])?.get(refLabels[j]) ?? 0)
      : 0
  const maxGain = Math.max(1, ...hypLabels.flatMap((_, i) => refLabels.map((_, j) => gain(i, j))))
  const cost = Array.from({ length: size }, (_, i) =>
    Array.from({ length: size }, (_, j) => maxGain - gain(i, j))
  )

  const mapping = new Map<string, string>()
  solveAssignment(cost).forEach((j, i) => {
    if (i < hypLabels.length && j >= 0 && j < refLabels.length && gain(i, j) > 0) {
      mapping.set(hypLabels[i], refLabels[j])
    }
  })
  return mapping
}

/** 각 hyp 라벨을 가장 많이 겹치는 ref 라벨로 보내는 다대일 배정 */
export const bestManyToOne = (confusion: Confusion) =>
  new Map(
    [...confusion.matrix].map(([hyp, row]) => [
      hyp,
      [...row].reduce((best, entry) => (entry[1] > best[1] ? entry : best))[0]
    ])
  )

export const sumMapped = ({
  confusion,
  mapping
}: {
  confusion: Confusion
  mapping: Map<string, string>
}) =>
  [...confusion.matrix].reduce(
    (sum, [hyp, row]) => sum + (mapping.has(hyp) ? (row.get(mapping.get(hyp) ?? '') ?? 0) : 0),
    0
  )

/** 병합 뒤 발화의 화자를 단어 조각에 되돌려 붙인다. 사용자가 보는 결과 그대로 채점하기 위해서다 */
export const labelPiecesByUtterance = ({
  pieces,
  utterances
}: {
  pieces: SpeakerPiece[]
  utterances: MergedUtterance[]
}) => {
  let cursor = 0
  return pieces.map((piece) => {
    const mid = (piece.start + piece.end) / 2
    while (cursor < utterances.length - 1 && utterances[cursor].endSec < mid) cursor += 1
    return { ...piece, speaker: utterances[cursor].speakerLabel, utteranceOrd: cursor }
  })
}

export interface ScoredPiece {
  hyp: string
  /** 그 시각에 말하던 정답 화자들 (겹침이면 여럿) */
  refs: string[]
  weight: number
  isNearBoundary: boolean
  utteranceOrd: number
}

interface ScorePiecesParams {
  pieces: (SpeakerPiece & { utteranceOrd: number })[]
  reference: Reference
  boundaryToleranceSec: number
  offsetSec?: number
  range?: { start: number; end: number }
}

/** 조각마다 정답 화자를 찾는다. 정답이 아무도 말하지 않은 시각의 조각(정답본 공백)은 뺀다 */
export const scorablePieces = ({
  pieces,
  reference,
  boundaryToleranceSec,
  offsetSec = 0,
  range
}: ScorePiecesParams): ScoredPiece[] =>
  pieces.flatMap((piece) => {
    const mid = (piece.start + piece.end) / 2 + offsetSec
    const window = range ?? reference.scoredRange
    if (window && (mid < window.start || mid >= window.end)) return []
    const weight = normalizeForCer(piece.text).length
    const refs = activeSpeakersAt({ reference, sec: mid })
    if (!weight || refs.length === 0) return []

    const isNearBoundary =
      distanceToReferenceBoundary({ reference, sec: mid }) < boundaryToleranceSec
    return [{ hyp: piece.speaker, refs, weight, isNearBoundary, utteranceOrd: piece.utteranceOrd }]
  })

/** 겹침 조각은 매핑된 화자가 정답 화자 중 하나면 맞은 것으로 본다. 혼동 행렬에는 첫 정답 화자로 넣는다 */
const confusionOf = (scored: ScoredPiece[]) => {
  const confusion = emptyConfusion()
  for (const piece of scored) {
    addWeight({ confusion, hyp: piece.hyp, ref: piece.refs[0], weight: piece.weight })
  }
  return confusion
}

const accuracyUnder = ({
  scored,
  mapping
}: {
  scored: ScoredPiece[]
  mapping: Map<string, string>
}) => {
  const total = scored.reduce((sum, piece) => sum + piece.weight, 0)
  const correct = scored.reduce(
    (sum, piece) => sum + (piece.refs.includes(mapping.get(piece.hyp) ?? '') ? piece.weight : 0),
    0
  )
  return total ? correct / total : 0
}

/** 일대일(주 지표)·경계 제외·다대일(순도) 정확도 */
export const scoreCharacters = (scored: ScoredPiece[]) => {
  const confusion = confusionOf(scored)
  const mapping = bestOneToOne(confusion)
  return {
    confusion,
    mapping,
    accuracy: accuracyUnder({ scored, mapping }),
    coreAccuracy: accuracyUnder({ scored: scored.filter((p) => !p.isNearBoundary), mapping }),
    purity: accuracyUnder({ scored, mapping: bestManyToOne(confusion) })
  }
}

/**
 * 사용자가 회의록을 정답으로 고치는 데 필요한 조작 수 (앱 UI 기준: 화자 병합 + 발화별 화자 재배정, 분리는 없음).
 * hyp 라벨을 다대일로 정답에 매핑해 같은 정답에 붙은 여분 라벨마다 병합 1회, 병합 뒤에도
 * 발화의 다수 정답 화자와 라벨이 다른 발화마다 재배정 1회로 센다.
 */
export const editCostOf = (scored: ScoredPiece[]) => {
  const mapping = bestManyToOne(confusionOf(scored))
  const merges = [...new Set(mapping.values())].reduce(
    (sum, ref) => sum + [...mapping.values()].filter((value) => value === ref).length - 1,
    0
  )

  const byUtterance = new Map<number, ScoredPiece[]>()
  for (const piece of scored) {
    byUtterance.set(piece.utteranceOrd, [...(byUtterance.get(piece.utteranceOrd) ?? []), piece])
  }
  const reassigns = [...byUtterance.values()].filter((members) => {
    const confusion = confusionOf(members)
    const majorityRef = bestManyToOne(confusion).get(members[0].hyp)
    return mapping.get(members[0].hyp) !== majorityRef
  }).length

  return { merges, reassigns, total: merges + reassigns, utterances: byUtterance.size }
}

/** 병합을 거치지 않은 화자 구간 자체를 시간 단위로 채점한다 (clova 정답 전용 보조 지표) */
export const scoreSegmentsByTime = ({
  speakerSegments,
  reference
}: {
  speakerSegments: SpeakerSegment[]
  reference: Reference
}) => {
  const confusion = emptyConfusion()
  const stepSec = 0.1
  for (const segment of speakerSegments) {
    for (let sec = segment.start; sec < segment.end; sec += stepSec) {
      const refs = activeSpeakersAt({ reference, sec })
      if (refs.length) addWeight({ confusion, hyp: segment.speaker, ref: refs[0], weight: 1 })
    }
  }
  const mapping = bestOneToOne(confusion)
  return confusion.total ? sumMapped({ confusion, mapping }) / confusion.total : 0
}

const activityFrames = ({
  turns,
  frameCount
}: {
  turns: { speaker: string; start: number; end: number }[]
  frameCount: number
}) => {
  const frames = new Map<string, Uint8Array>()
  for (const turn of turns) {
    const active = frames.get(turn.speaker) ?? new Uint8Array(frameCount)
    const from = Math.max(0, Math.round(turn.start / DER_FRAME_SEC))
    const to = Math.min(frameCount, Math.round(turn.end / DER_FRAME_SEC))
    active.fill(1, from, to)
    frames.set(turn.speaker, active)
  }
  return frames
}

/** 채점할 프레임: 범위(UEM) 안이면서 정답 경계 ±collar 밖 */
const scoredFrameMask = ({
  reference,
  frameCount,
  collarSec
}: {
  reference: Reference
  frameCount: number
  collarSec: number
}) => {
  const mask = new Uint8Array(frameCount).fill(1)
  const range = reference.scoredRange
  if (range) {
    mask.fill(0, 0, Math.max(0, Math.round(range.start / DER_FRAME_SEC)))
    mask.fill(0, Math.min(frameCount, Math.round(range.end / DER_FRAME_SEC)))
  }
  const collarFrames = Math.round(collarSec / DER_FRAME_SEC)
  for (const turn of reference.turns) {
    for (const edge of [turn.start, turn.end]) {
      const center = Math.round(edge / DER_FRAME_SEC)
      mask.fill(0, Math.max(0, center - collarFrames), Math.min(frameCount, center + collarFrames))
    }
  }
  return mask
}

/**
 * Diarization Error Rate. 10ms 프레임, 정답 경계 ±collar 제외, 겹침 포함(md-eval 기본과 같음).
 * hyp ↔ ref 매핑은 채점 프레임에서 겹친 시간을 최대로 하는 일대일 배정이다.
 */
export const computeDer = ({
  speakerSegments,
  reference,
  collarSec = DER_COLLAR_SEC
}: {
  speakerSegments: SpeakerSegment[]
  reference: Reference
  collarSec?: number
}) => {
  const lastSec = Math.max(
    ...reference.turns.map((t) => t.end),
    ...speakerSegments.map((s) => s.end),
    reference.scoredRange?.end ?? 0
  )
  const frameCount = Math.ceil(lastSec / DER_FRAME_SEC) + 1
  const mask = scoredFrameMask({ reference, frameCount, collarSec })
  const refFrames = activityFrames({ turns: reference.turns, frameCount })
  const hypFrames = activityFrames({ turns: speakerSegments, frameCount })

  const overlap = emptyConfusion()
  for (const [hyp, hypActive] of hypFrames) {
    for (const [ref, refActive] of refFrames) {
      let frames = 0
      for (let f = 0; f < frameCount; f += 1) frames += mask[f] & hypActive[f] & refActive[f]
      if (frames) addWeight({ confusion: overlap, hyp, ref, weight: frames })
    }
  }
  const mapping = bestOneToOne(overlap)

  let refTotal = 0
  let miss = 0
  let falseAlarm = 0
  let confusionFrames = 0
  for (let f = 0; f < frameCount; f += 1) {
    if (!mask[f]) continue
    let refCount = 0
    let hypCount = 0
    let correct = 0
    for (const active of refFrames.values()) refCount += active[f]
    for (const [hyp, active] of hypFrames) {
      if (!active[f]) continue
      hypCount += 1
      const ref = mapping.get(hyp)
      if (ref && refFrames.get(ref)?.[f]) correct += 1
    }
    refTotal += refCount
    miss += Math.max(0, refCount - hypCount)
    falseAlarm += Math.max(0, hypCount - refCount)
    confusionFrames += Math.min(refCount, hypCount) - correct
  }

  const rate = (value: number) => (refTotal ? value / refTotal : 0)
  return {
    der: rate(miss + falseAlarm + confusionFrames),
    miss: rate(miss),
    falseAlarm: rate(falseAlarm),
    confusion: rate(confusionFrames)
  }
}

export const formatConfusion = ({
  confusion,
  mapping
}: {
  confusion: Confusion
  mapping: Map<string, string>
}) => {
  const refLabels = refLabelsOf(confusion).sort()
  const rows = [...confusion.matrix]
    .map(([hyp, row]) => ({ hyp, row, total: [...row.values()].reduce((a, b) => a + b, 0) }))
    .sort((a, b) => b.total - a.total)
  const header = ['hyp → ref', ...refLabels, '합계'].join('\t')
  const lines = rows.map(({ hyp, row, total }) =>
    [
      `${hyp}${mapping.has(hyp) ? `(=${mapping.get(hyp)})` : ''}`,
      ...refLabels.map((ref) => String(row.get(ref) ?? 0)),
      String(total)
    ].join('\t')
  )
  return [header, ...lines].join('\n')
}

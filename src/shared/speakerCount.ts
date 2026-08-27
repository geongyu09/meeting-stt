/**
 * 녹음 정지 시 입력하는 참석자 수의 허용 범위. 화자 분리의 `--clustering.num-clusters`로 넘어간다
 * (references/architecture.md). 상한은 회의실 규모 기준이며 sherpa-onnx의 제약은 아니다.
 */
export const MIN_SPEAKER_COUNT = 1
export const MAX_SPEAKER_COUNT = 20

/** 정수이면서 허용 범위 안인지. renderer 입력과 main payload 검증이 같은 기준을 쓴다 */
export const isValidSpeakerCount = (value: unknown): value is number =>
  typeof value === 'number' &&
  Number.isInteger(value) &&
  value >= MIN_SPEAKER_COUNT &&
  value <= MAX_SPEAKER_COUNT

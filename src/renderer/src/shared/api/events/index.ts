import type {
  ModelDownloadProgressEvent,
  PipelineProgressEvent,
  RecordingCommandEvent,
  RecordingStateEvent,
  SummaryProgressEvent,
  UpdateAvailableEvent
} from '@shared/ipc'

/**
 * @description 파이프라인 진행률·상태 이벤트를 구독합니다.
 * @param listener - 진행률 이벤트 콜백
 * @returns 구독 해제 함수
 * @example
 * useEffect(() => onPipelineProgress(({ stage }) => refetchOn(stage)), [refetchOn])
 */
export const onPipelineProgress = (listener: (event: PipelineProgressEvent) => void) =>
  window.api.events.onPipelineProgress(listener)

/**
 * @description 요약 진행률·결과 이벤트를 구독합니다. 완료 이벤트에 요약 본문이 함께 옵니다.
 * @param listener - 요약 진행 이벤트 콜백
 * @returns 구독 해제 함수
 * @example
 * useEffect(() => onSummaryProgress(({ stage, summary }) => { ... }), [])
 */
export const onSummaryProgress = (listener: (event: SummaryProgressEvent) => void) =>
  window.api.events.onSummaryProgress(listener)

/**
 * @description 모델 다운로드 진행률 이벤트를 구독합니다. 파일(key)마다 받은 바이트와 퍼센트가 옵니다.
 * @param listener - 진행률 이벤트 콜백
 * @returns 구독 해제 함수
 * @example
 * useEffect(() => onModelDownloadProgress(({ key, percent }) => { ... }), [])
 */
export const onModelDownloadProgress = (listener: (event: ModelDownloadProgressEvent) => void) =>
  window.api.events.onModelDownloadProgress(listener)

/**
 * @description 새 버전 발견 이벤트를 구독합니다. 설정에서 업데이트 확인을 켠 경우 앱 시작 직후 한 번 옵니다.
 * @param listener - 새 버전 이벤트 콜백
 * @returns 구독 해제 함수
 * @example
 * useEffect(() => onUpdateAvailable(({ version }) => setVersion(version)), [])
 */
export const onUpdateAvailable = (listener: (event: UpdateAvailableEvent) => void) =>
  window.api.events.onUpdateAvailable(listener)

/**
 * @description 녹음 상태(진행 중 회의·시작 시각·레벨·참석자 수) 변화를 구독합니다. 위젯과 메인 창이 같은 값을 봅니다.
 * @param listener - 녹음 상태 이벤트 콜백
 * @returns 구독 해제 함수
 * @example
 * useEffect(() => onRecordingState(setState), [])
 */
export const onRecordingState = (listener: (event: RecordingStateEvent) => void) =>
  window.api.events.onRecordingState(listener)

/**
 * @description main이 보내는 녹음 시작/정지 지시를 구독합니다. 오디오 그래프를 가진 위젯 창에서만 씁니다.
 * @param listener - 녹음 명령 콜백
 * @returns 구독 해제 함수
 * @example
 * useEffect(() => onRecordingCommand(({ kind }) => run(kind)), [run])
 */
export const onRecordingCommand = (listener: (event: RecordingCommandEvent) => void) =>
  window.api.events.onRecordingCommand(listener)

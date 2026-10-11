import type {
  ControlDictationRequest,
  ReportDictationErrorRequest,
  SendDictationChunkRequest,
  StartDictationRequest
} from '@shared/ipc'
import { remoteErrorMessageOf } from '@renderer/shared/utils/remoteError'

/** main의 거절 사유(녹음 중·모델 없음)는 그대로 패널에 보이므로 Electron 접두어를 뗀다 */
const invokeDictation = async <T>(call: () => Promise<T>) => {
  try {
    return await call()
  } catch (caught) {
    throw new Error(remoteErrorMessageOf(caught))
  }
}

/**
 * @description 받아쓰기(음성 입력)의 현재 상태를 조회합니다. 창이 늦게 열려 상태 이벤트를 놓쳤을 때와 설정 화면의 권한 표시에 씁니다.
 * @returns 단계·시작 시각·레벨·삽입 방식·마지막으로 넣은 조각·마지막 결과 유무
 * @example
 * const state = await getDictationStateApi()
 */
export const getDictationStateApi = async () => window.api.dictation.state()

/**
 * @description 받아쓰기 시작·정지를 요청합니다. main이 상태를 보고 오디오 그래프를 가진 위젯 창에 명령을 넘기며, 녹음 중이면 안내만 보냅니다.
 * @param kind - 'start' | 'stop' | 'toggle'
 * @returns 없음
 * @example
 * await controlDictationApi({ kind: 'toggle' })
 */
export const controlDictationApi = async ({ kind }: ControlDictationRequest) => {
  await invokeDictation(() => window.api.dictation.control({ kind }))
}

/**
 * @description 받아쓰기 세션을 시작합니다. 위젯 창이 마이크 그래프를 만든 뒤 부릅니다. 녹음 중이거나 모델이 없으면 거절됩니다.
 * @param sampleRate - renderer의 AudioContext가 실제로 쓰는 샘플레이트
 * @returns 시작 직후의 받아쓰기 상태
 * @example
 * const state = await startDictationApi({ sampleRate: context.sampleRate })
 */
export const startDictationApi = async ({ sampleRate }: StartDictationRequest) =>
  invokeDictation(() => window.api.dictation.start({ sampleRate }))

/**
 * @description 받아쓰기 중인 세션에 PCM 청크를 보냅니다. main이 구간에 모아 말이 끊길 때마다 인식하므로 renderer는 누적하지 않습니다.
 * @param pcm - AudioWorklet이 넘긴 Float32 PCM 원본 버퍼
 * @returns 없음
 * @example
 * await sendDictationChunkApi({ pcm })
 */
export const sendDictationChunkApi = async ({ pcm }: SendDictationChunkRequest) => {
  await window.api.dictation.chunk({ pcm })
}

/**
 * @description 받아쓰기 세션을 끝냅니다. 위젯 창이 그래프를 끊은 뒤 부르며, main은 남은 구간을 마지막으로 한 번 인식·삽입합니다.
 * @returns 끝난 직후의 받아쓰기 상태
 * @example
 * await stopDictationApi()
 */
export const stopDictationApi = async () => invokeDictation(() => window.api.dictation.stop())

/**
 * @description 위젯에서만 알 수 있는 받아쓰기 실패(마이크 권한 등)를 main에 알립니다. 두 창이 같은 안내를 봅니다.
 * @param message - 사용자에게 보여줄 안내
 * @returns 없음
 * @example
 * await reportDictationErrorApi({ message: '마이크 사용 권한이 없습니다' })
 */
export const reportDictationErrorApi = async ({ message }: ReportDictationErrorRequest) => {
  await window.api.dictation.reportError({ message })
}

/**
 * @description 시스템 설정의 개인정보 보호 및 보안 → 손쉬운 사용 화면을 엽니다. 접근성 권한이 없을 때 설정 화면에서 안내합니다.
 * @returns 없음
 * @example
 * await openAccessibilitySettingsApi()
 */
export const openAccessibilitySettingsApi = async () => {
  await window.api.dictation.openAccessibilitySettings()
}

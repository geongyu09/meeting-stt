import { existsSync } from 'node:fs'
import path from 'node:path'
import { app, clipboard } from 'electron'
import {
  dictationInsertTextOf,
  dictationTermsOf,
  joinDictationPieces,
  refineDictationText,
  type DictationTerm
} from '@meeting-stt/core/dictation'
import { rmsOf, SAMPLE_RATE_HZ } from '@shared/audio'
import { termNameOf } from '@shared/glossary'
import type {
  ControlDictationRequest,
  DictationCommandEvent,
  DictationInsertMode,
  DictationPhase,
  DictationStateEvent
} from '@shared/ipc'
import {
  dropLiveChunks,
  EMPTY_LIVE_WINDOW,
  liveSamplesOf,
  planCommit,
  pushLiveChunk,
  type LiveWindow
} from '../audio/liveWindow'
import { isRecording } from '../audio/session'
import { transcribeOnce, type WhisperOnceTarget } from '../audio/whisperOnce'
import { whisperBinPath } from '../bin/paths'
import { threadPlan } from '../bin/threads'
import { getGlossarySettings } from '../db/settings'
import { t } from '../locale'
import { info, messageOf, warn } from '../log'
import { liveWhisperModelPath, modelPath } from '../models/paths'
import type { TermPrompt } from '../pipeline/whisper'
import { resolveTermPrompt } from '../pipeline/whisperPrompt'
import { insertDictationText, isAccessibilityTrusted, isInsertToolAvailable } from './insert'

/**
 * 받아쓰기(음성 입력) 세션. 녹음 세션과 별개이고 WAV·회의 행·파이프라인 잡을 만들지 않는다.
 * 위젯이 보내는 청크를 구간으로 모아 말이 끊길 때마다 한 번 인식하고, 다듬어서 커서 자리에 끼워 넣는다
 * (references/architecture.md "받아쓰기").
 */

/**
 * 말이 이어져도 이 길이에 닿으면 구간을 확정한다. 측정에서 28초까지는 인식 시간이 같았지만(1.1~1.6초),
 * 길수록 쉬지 않고 말하는 사람의 글이 늦게 들어가고 30초 창 경계에서는 뒷부분이 잘린다 (docs/dictation-results.md)
 */
export const DICTATION_MAX_WINDOW_SEC = 20
/** 끄는 걸 잊은 마이크를 계속 켜 두지 않는다 */
export const DICTATION_MAX_SEC = 300
const DICTATION_DIR_NAME = 'meeting-stt-dictation'
const DICTATION_FILE_BASE = 'window'
const MS_PER_SEC = 1000
const SECONDS_PER_MINUTE = 60

interface DictationSession {
  startedAt: number
  level: number
  insertMode: DictationInsertMode
  lastInsertedText: string
  /** 이번 세션에서 다듬어 넣은 조각. 끝나면 이어 붙여 `lastResult`가 된다 */
  pieces: string[]
  pending: LiveWindow
  /** 도는 중인 인식. 정지할 때 끝나기를 기다린다 */
  recognition: Promise<void> | null
  isStopping: boolean
  target: WhisperOnceTarget
  termPrompt: TermPrompt | undefined
  terms: DictationTerm[]
  errorMessage: string | undefined
  maxTimer: NodeJS.Timeout
}

let session: DictationSession | null = null
/** 마지막 세션의 전체 텍스트. 저장하지 않고 메모리에만 둔다 (메뉴바 "마지막 받아쓰기 복사") */
let lastResult: string | null = null
/** 접근성 권한 안내 창은 앱 실행 중 한 번만 띄운다 */
let hasPromptedAccessibility = false
/** 자동 종료 안내처럼 세션이 끝난 뒤 한 번 실어 보낼 문구 */
let stopNotice: string | undefined

let notifyState: (event: DictationStateEvent) => void = () => {}
let sendCommand: (event: DictationCommandEvent) => void = () => {}

/** main이 창을 만든 뒤 한 번 등록한다 */
export const setDictationStateListener = (listener: (event: DictationStateEvent) => void) => {
  notifyState = listener
}

/** 위젯(그래프 소유자)에 시작/정지를 넘기는 통로. windows/widget.ts가 등록한다 */
export const setDictationCommandSender = (sender: (event: DictationCommandEvent) => void) => {
  sendCommand = sender
}

const phaseOf = (): DictationPhase => {
  if (!session) return 'idle'

  return session.recognition ? 'recognizing' : 'listening'
}

/** idle일 때는 지금 시작하면 어떤 방식이 될지를 알려 준다 (설정 화면의 권한 상태) */
const idleInsertMode = (): DictationInsertMode =>
  isInsertToolAvailable() && isAccessibilityTrusted({ shouldPrompt: false }) ? 'paste' : 'clipboard'

export const getDictationState = (): DictationStateEvent => ({
  phase: phaseOf(),
  startedAt: session?.startedAt ?? null,
  level: session?.level ?? 0,
  insertMode: session?.insertMode ?? idleInsertMode(),
  lastInsertedText: session?.lastInsertedText ?? '',
  hasLastResult: lastResult !== null,
  ...(session?.errorMessage ? { errorMessage: session.errorMessage } : {})
})

/** 한 번만 실리는 값(시작 거절·자동 종료 안내)은 여기서 얹는다 */
const publish = (extra: Partial<DictationStateEvent> = {}) =>
  notifyState({ ...getDictationState(), ...extra })

export const isDictating = () => session !== null

/** 녹음 시작 핸들러가 부른다 — 마이크 그래프와 GPU를 같이 쓰므로 둘은 동시에 돌지 않는다 */
export const assertNotDictating = () => {
  if (session) throw new Error(t().main.dictation.recordingBlocked)
}

const dictationDir = () => path.join(app.getPath('temp'), DICTATION_DIR_NAME)

/** 라이브 받아쓰기와 같은 모델 규칙(속도 우선 turbo). 파일이 없으면 시작을 거절한다 */
const resolveTarget = async (): Promise<WhisperOnceTarget> => {
  const whisperBin = whisperBinPath()
  const whisperModel = liveWhisperModelPath()
  const vadModel = modelPath('vad')
  if (![whisperBin, whisperModel, vadModel].every((file) => existsSync(file))) {
    throw new Error(t().main.dictation.unavailable)
  }

  const { stt } = await threadPlan()

  return { whisperBin, whisperModel, vadModel, threads: stt }
}

/** 권한이 없어도 막지 않는다 — 클립보드 모드로 진행하고 패널이 ⌘V를 안내한다 */
const resolveInsertMode = (): DictationInsertMode => {
  if (!isInsertToolAvailable()) return 'clipboard'

  const isTrusted = isAccessibilityTrusted({ shouldPrompt: !hasPromptedAccessibility })
  hasPromptedAccessibility = true

  return isTrusted ? 'paste' : 'clipboard'
}

/** 위젯이 마이크 그래프를 만든 뒤 부른다. 전역 용어 사전은 인식 프롬프트와 다듬기 치환에 함께 쓴다 */
export const startDictation = async ({ sampleRate }: { sampleRate: number }) => {
  if (session) throw new Error(t().main.dictation.alreadyActive)
  if (isRecording()) throw new Error(t().main.dictation.blockedByRecording)
  if (sampleRate !== SAMPLE_RATE_HZ) {
    throw new Error(
      t().main.recording.sampleRateUnsupported({ expected: SAMPLE_RATE_HZ, actual: sampleRate })
    )
  }

  const target = await resolveTarget()
  const glossaryTerms = getGlossarySettings().terms
  const termPrompt = await resolveTermPrompt({
    terms: glossaryTerms.map(termNameOf),
    whisperModelPath: target.whisperModel
  })

  stopNotice = undefined
  session = {
    startedAt: Date.now(),
    level: 0,
    insertMode: resolveInsertMode(),
    lastInsertedText: '',
    pieces: [],
    pending: EMPTY_LIVE_WINDOW,
    recognition: null,
    isStopping: false,
    target,
    termPrompt,
    // 내장 읽기 사전은 쓰지 않는다 — 일상 외래어까지 영어 표기로 바꿔 CER을 올렸다 (docs/dictation-results.md 2절)
    terms: dictationTermsOf(glossaryTerms),
    errorMessage: undefined,
    maxTimer: setTimeout(stopByLimit, DICTATION_MAX_SEC * MS_PER_SEC)
  }
  info(`받아쓰기 시작 (${session.insertMode})`)
  publish()

  return getDictationState()
}

/** 최대 길이에 닿으면 위젯에 정지를 지시한다. 그래프를 끊는 쪽이 위젯이라 여기서 바로 끝낼 수 없다 */
const stopByLimit = () => {
  if (!session) return

  stopNotice = t().main.dictation.maxReached({ minutes: DICTATION_MAX_SEC / SECONDS_PER_MINUTE })
  info('받아쓰기 최대 길이에 닿아 정지를 요청합니다')
  sendCommand({ kind: 'stop' })
}

/** 다듬은 조각을 커서 자리에 넣는다. 빈 조각(간투사만)은 넣지 않는다 */
const insertPiece = async ({ active, text }: { active: DictationSession; text: string }) => {
  const piece = refineDictationText({ text, terms: active.terms })
  if (!piece) return

  const isFirst = active.pieces.length === 0
  active.pieces = [...active.pieces, piece]
  const result = await insertDictationText({
    text: dictationInsertTextOf({ piece, isFirst }),
    mode: active.insertMode
  })
  active.lastInsertedText = piece
  active.errorMessage = result.errorMessage
  // 권한이 세션 중에 풀렸으면 남은 조각은 도구를 띄우지 않고 바로 클립보드로 간다
  if (result.fallbackReason === 'accessibility') active.insertMode = 'clipboard'
}

/** 구간 하나를 인식·삽입한다. 확정한 청크는 바로 빼서 그동안 들어온 소리가 다음 구간의 앞이 되게 한다 */
const recognize = async ({
  active,
  chunkCount
}: {
  active: DictationSession
  chunkCount: number
}) => {
  const samples = liveSamplesOf(active.pending.chunks.slice(0, chunkCount))
  active.pending = dropLiveChunks({ window: active.pending, count: chunkCount })

  try {
    const text = await transcribeOnce({
      samples,
      dir: dictationDir(),
      fileBase: DICTATION_FILE_BASE,
      target: active.target,
      termPrompt: active.termPrompt
    })
    await insertPiece({ active, text })
  } catch (caught) {
    warn(`받아쓰기 인식 실패: ${messageOf(caught)}`)
    active.errorMessage = t().main.dictation.recognizeFailed
  }
}

/** 한 번에 하나만 돈다. 끝나면 그동안 쌓인 청크로 바로 다음 구간을 살핀다 */
const runNext = () => {
  const active = session
  if (!active || active.recognition || active.isStopping) return

  const plan = planCommit({ window: active.pending, maxWindowSec: DICTATION_MAX_WINDOW_SEC })
  if (!plan.hasSpeech || !plan.isFinal) return

  active.recognition = recognize({ active, chunkCount: plan.chunkCount }).finally(() => {
    active.recognition = null
    publish()
    if (session === active) runNext()
  })
  publish()
}

export const appendDictationChunk = ({ pcm }: { pcm: ArrayBuffer }) => {
  // 끝난 세션이나 남은 오디오 그래프가 보낸 청크다. 알릴 실패가 아니라 버린다
  if (!session || session.isStopping) return

  const samples = new Float32Array(pcm)
  const rms = rmsOf(samples)
  session.level = rms
  session.pending = pushLiveChunk({ window: session.pending, samples, rms })
  runNext()
  publish()
}

/**
 * 위젯이 그래프를 끊은 뒤 부른다. 도는 중인 인식을 기다리고, 남은 구간에 말소리가 있으면 마지막으로 한 번
 * 인식·삽입한 뒤 세션을 닫는다. 결과는 메모리의 `lastResult`에만 남는다
 */
export const stopDictation = async () => {
  const active = session
  if (!active) throw new Error(t().main.dictation.notActive)
  if (active.isStopping) return getDictationState()

  active.isStopping = true
  clearTimeout(active.maxTimer)
  active.level = 0
  if (active.recognition) await active.recognition

  const plan = planCommit({ window: active.pending, maxWindowSec: DICTATION_MAX_WINDOW_SEC })
  if (plan.hasSpeech) {
    active.recognition = recognize({ active, chunkCount: plan.chunkCount })
    publish()
    await active.recognition
    active.recognition = null
  }

  if (active.pieces.length) lastResult = joinDictationPieces(active.pieces)
  session = null
  const elapsedSec = (Date.now() - active.startedAt) / MS_PER_SEC
  info(`받아쓰기 종료 (${elapsedSec.toFixed(1)}초, 조각 ${active.pieces.length}개)`)
  publish(stopNotice ? { errorMessage: stopNotice } : {})
  stopNotice = undefined

  return getDictationState()
}

/**
 * 전역 단축키·메뉴바·패널 버튼·메인 창의 요청. main이 상태를 알고 있어 토글을 여기서 푼다.
 * 녹음 중이면 위젯까지 가지 않고 바로 안내한다
 */
export const controlDictation = ({ kind }: ControlDictationRequest) => {
  const isActive = session !== null
  if (kind === 'stop' || (kind === 'toggle' && isActive)) {
    if (isActive) sendCommand({ kind: 'stop' })

    return
  }

  if (isRecording()) {
    publish({ errorMessage: t().main.dictation.blockedByRecording })

    return
  }

  sendCommand({ kind: 'start' })
}

/** 마이크 권한 거부처럼 위젯에서만 알 수 있는 실패를 두 창에 전한다 */
export const reportDictationError = ({ message }: { message: string }) =>
  publish({ errorMessage: message })

/** 메뉴바 "마지막 받아쓰기 복사". 삽입이 실패했거나 다른 곳에 들어갔을 때 되살린다 */
export const copyLastDictation = () => {
  if (lastResult === null) return false

  clipboard.writeText(lastResult)

  return true
}

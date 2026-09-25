import { randomUUID } from 'node:crypto'
import { mkdir, open, rm } from 'node:fs/promises'
import path from 'node:path'
import { dialog } from 'electron'
import { runBinary } from '../bin/spawn'
import {
  findMeeting,
  insertMeeting,
  updateMeetingDuration,
  updateMeetingSpeakerCount,
  updateMeetingStatus
} from '../db/meetings'
import { info, messageOf, warn } from '../log'
import { notifyMeetingsChanged } from '../meetingsChanged'
import { enqueuePipelineJob } from '../pipeline/queue'
import { getMainWindow } from '../windows/main'
import { IMPORT_EXTENSIONS, readDataBytes, titleFromFilePath } from './importSource'
import { defaultTitle, getRecordingState, MIN_RECORDING_SEC, recordingsDir } from './session'
import { durationSecOf, WAV_HEADER_BYTES } from './wavWriter'
import { t } from '../locale'

/** macOS 내장 Core Audio 변환기. GUI 앱의 PATH를 믿지 않고 절대 경로로 부른다 */
const AFCONVERT_PATH = '/usr/bin/afconvert'

/** 16kHz mono 16bit LE PCM. `--mix`가 없으면 스테레오의 한 채널을 버린다 (references/pitfalls.md) */
const toAfconvertArgs = ({ inputPath, outputPath }: { inputPath: string; outputPath: string }) => [
  '-f',
  'WAVE',
  '-d',
  'LEI16@16000',
  '-c',
  '1',
  '--mix',
  '--no-filler',
  inputPath,
  outputPath
]

const pickSourceFile = async () => {
  const options = {
    title: t().main.dialogs.importTitle,
    properties: ['openFile' as const],
    filters: [{ name: t().main.dialogs.audioFilter, extensions: IMPORT_EXTENSIONS }]
  }
  const mainWindow = getMainWindow()
  const { canceled, filePaths } = mainWindow
    ? await dialog.showOpenDialog(mainWindow, options)
    : await dialog.showOpenDialog(options)

  return canceled ? null : (filePaths[0] ?? null)
}

const readDurationSec = async (wavPath: string) => {
  const handle = await open(wavPath, 'r')
  try {
    const { buffer } = await handle.read(Buffer.alloc(WAV_HEADER_BYTES), 0, WAV_HEADER_BYTES, 0)
    const dataBytes = readDataBytes(buffer)
    if (dataBytes === null) throw new Error(t().main.importing.unreadable)

    return durationSecOf({ dataBytes })
  } finally {
    await handle.close()
  }
}

/** 변환에 실패하면 반쯤 쓴 출력을 지운다. 회의 행은 아직 없으므로 목록에 흔적이 남지 않는다 */
const convertToWav = async ({
  inputPath,
  outputPath
}: {
  inputPath: string
  outputPath: string
}) => {
  try {
    await runBinary({ command: AFCONVERT_PATH, args: toAfconvertArgs({ inputPath, outputPath }) })

    return await readDurationSec(outputPath)
  } catch (caught) {
    warn(`녹음 파일 변환 실패 ${inputPath}: ${messageOf(caught)}`)
    await rm(outputPath, { force: true })
    throw new Error(t().main.importing.unreadable)
  }
}

/**
 * 앱 밖에서 녹음한 파일을 16kHz mono WAV로 바꿔 녹음한 회의와 같은 파이프라인에 넣는다.
 * 사용자가 대화상자를 취소하면 null (references/architecture.md "녹음 파일 가져오기").
 */
export const importRecording = async () => {
  const sourcePath = await pickSourceFile()
  if (!sourcePath) return null

  const meetingId = randomUUID()
  const audioPath = path.join(recordingsDir(), `${meetingId}.wav`)
  await mkdir(recordingsDir(), { recursive: true })
  const durationSec = await convertToWav({ inputPath: sourcePath, outputPath: audioPath })

  if (durationSec < MIN_RECORDING_SEC) {
    await rm(audioPath, { force: true })
    throw new Error(t().main.recording.tooShort)
  }

  const createdAt = Date.now()
  // 녹음 화면 스테퍼의 값. 녹음과 가져오기가 같은 입력을 쓴다
  const { speakerCount } = getRecordingState()
  insertMeeting({
    id: meetingId,
    title: titleFromFilePath(sourcePath) ?? defaultTitle(createdAt),
    createdAt,
    audioPath
  })
  updateMeetingDuration({ meetingId, durationSec })
  if (speakerCount) updateMeetingSpeakerCount({ meetingId, speakerCount })
  // 큐에서 기다리는 동안 사이드바가 "녹음 중"으로 보이지 않게 바로 처리 중으로 둔다
  updateMeetingStatus({ meetingId, status: 'processing' })
  enqueuePipelineJob({ meetingId })
  notifyMeetingsChanged()
  info(
    `녹음 파일 가져옴 ${meetingId} (${durationSec.toFixed(1)}초${speakerCount ? `, 참석자 ${speakerCount}명` : ''})`
  )

  const meeting = findMeeting({ meetingId })
  if (!meeting) throw new Error(t().main.recording.meetingInfoNotFound)

  return meeting
}

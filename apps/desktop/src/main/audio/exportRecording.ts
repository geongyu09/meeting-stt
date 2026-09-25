import { copyFile } from 'node:fs/promises'
import { dialog } from 'electron'
import { findAudioPath, findMeeting } from '../db/meetings'
import { info, messageOf, warn } from '../log'
import { getMainWindow } from '../windows/main'
import { toExportFileName } from './exportFileName'
import { t } from '../locale'

const WAV_EXTENSIONS = ['wav']

/**
 * 원본 WAV를 사용자가 고른 위치로 복사한다. 대화상자를 취소하면 false (references/architecture.md "녹음본 재생·내보내기·다시 인식").
 * 원본은 그대로 두므로 보관 설정과 무관하다.
 */
export const exportRecording = async ({ meetingId }: { meetingId: string }) => {
  const meeting = findMeeting({ meetingId })
  if (!meeting) throw new Error(t().main.errors.meetingNotFound)

  const audioPath = findAudioPath({ meetingId })
  if (!audioPath) throw new Error(t().main.recording.audioMissing)

  const options = {
    title: t().main.dialogs.exportTitle,
    // 파일명만 준다. 폴더는 macOS가 마지막으로 저장한 위치를 기억한다
    defaultPath: toExportFileName(meeting.title),
    filters: [{ name: t().main.dialogs.wavFilter, extensions: WAV_EXTENSIONS }]
  }
  const mainWindow = getMainWindow()
  const { canceled, filePath } = mainWindow
    ? await dialog.showSaveDialog(mainWindow, options)
    : await dialog.showSaveDialog(options)
  if (canceled || !filePath) return false

  try {
    await copyFile(audioPath, filePath)
  } catch (caught) {
    warn(`회의 ${meetingId} 원본 녹음 내보내기 실패: ${messageOf(caught)}`)
    throw new Error(t().main.recording.exportFailed)
  }
  info(`회의 ${meetingId} 원본 녹음 내보냄`)

  return true
}

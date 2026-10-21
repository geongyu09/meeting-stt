import { rm, stat } from 'node:fs/promises'
import type { MeetingAudioFile } from '@shared/types'
import {
  clearAudioPath,
  deleteMeeting,
  findAudioPath,
  findMeeting,
  listMeetingsWithAudio
} from '../db/meetings'
import { messageOf, warn } from '../log'

/**
 * 원본 WAV를 지우고 DB의 경로를 비운다. 잡이 성공했을 때만 부른다 —
 * 실패한 잡은 재시도용으로 원본을 남긴다 (references/architecture.md).
 */
export const discardRecording = async ({ meetingId }: { meetingId: string }) => {
  const audioPath = findAudioPath({ meetingId })
  if (!audioPath) return

  await rm(audioPath, { force: true })
  clearAudioPath({ meetingId })
}

/** 회의 행(발화·화자는 CASCADE)과 원본 WAV를 함께 지운다. 없는 회의면 false */
export const deleteMeetingWithRecording = async ({ meetingId }: { meetingId: string }) => {
  const audioPath = findAudioPath({ meetingId })
  if (!deleteMeeting({ meetingId })) return false

  if (audioPath) await rm(audioPath, { force: true })

  return true
}

/** 설정 "녹음 파일 관리하기"의 목록. 크기는 stat으로 읽고 파일이 없으면 null (references/features/recording.md "녹음 파일 관리") */
export const listAudioFiles = async (): Promise<MeetingAudioFile[]> =>
  Promise.all(
    listMeetingsWithAudio().map(async ({ file, audioPath }) => ({
      ...file,
      sizeBytes: await stat(audioPath).then(
        ({ size }) => size,
        () => null
      )
    }))
  )

/** 지울 수 없는 회의(없음·원본 없음·녹음 중·처리 중)와 rm 실패는 건너뛰고 센다. 화면이 막아도 main이 다시 확인한다 */
export const deleteAudioFiles = async ({ meetingIds }: { meetingIds: string[] }) => {
  let failedCount = 0
  for (const meetingId of meetingIds) {
    const status = findMeeting({ meetingId })?.status
    const isDeletable = status === 'done' || status === 'error'
    if (!isDeletable || !findAudioPath({ meetingId })) {
      failedCount += 1
      continue
    }
    try {
      await discardRecording({ meetingId })
    } catch (caught) {
      failedCount += 1
      warn(`회의 ${meetingId} 녹음 파일 삭제 실패: ${messageOf(caught)}`)
    }
  }

  return { files: await listAudioFiles(), failedCount }
}

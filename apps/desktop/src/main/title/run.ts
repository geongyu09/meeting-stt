import { mkdir, rm } from 'node:fs/promises'
import path from 'node:path'
import { app } from 'electron'
import {
  autoTitleOf,
  buildTitlePrompt,
  cleanTitleTopic,
  isDefaultTitle,
  TITLE_CTX_TOKENS,
  TITLE_GRAMMAR,
  TITLE_MAX_TOKENS,
  TITLE_SYSTEM_PROMPT
} from '@shared/autoTitle'
import { isLlmReady } from '@shared/llm'
import { findMeeting, findMeetingNote, updateAutoTitle } from '../db/meetings'
import { getAppSettings, getAssistantAutoOrganize, getAssistantFolder } from '../db/settings'
import { listUtterances } from '../db/utterances'
import { createLlmClient, getLlmStatus } from '../llm/provider'
import { info } from '../log'
import { notifyMeetingsChanged } from '../meetingsChanged'

/**
 * 녹음 자동 제목 잡 (references/features/transcript.md "회의록 자동 제목").
 * 몇 초짜리 잡이라 진행률은 없고, 실패는 기본 제목을 그대로 둔다.
 */

/** 프롬프트·문법·출력 파일 자리. 끝나면 실패해도 지운다 */
const titleWorkDir = ({ meetingId }: { meetingId: string }) =>
  path.join(app.getPath('userData'), 'title', meetingId)

const transcriptOf = ({ meetingId }: { meetingId: string }) =>
  listUtterances({ meetingId })
    .map(({ text }) => text)
    .join('\n')

/** 외부 공급자는 사용자가 이미 녹음마다 전송에 동의한 경우에만 쓴다 — 새 스위치를 두지 않는다 */
const isExternalConsented = () =>
  getAppSettings().isAutoRefineExternal ||
  (Boolean(getAssistantFolder()) && getAssistantAutoOrganize())

/** 자동 제목을 건너뛸 이유. 없으면 null */
export const autoTitleSkipReason = async ({ meetingId }: { meetingId: string }) => {
  const meeting = findMeeting({ meetingId })
  if (!meeting || !isDefaultTitle(meeting)) return '기본 제목이 아님'
  if (!listUtterances({ meetingId }).length) return '발화가 없음'

  const status = await getLlmStatus()
  if (!isLlmReady(status)) return 'LLM이 준비되지 않음'
  if (status.provider === 'local' || isExternalConsented()) return null

  return '외부 공급자 자동 전송에 동의하지 않음'
}

/** 노트와 전사본으로 주제를 지어 제목을 바꾼다. 잡이 도는 사이 사용자가 고친 제목은 덮지 않는다 */
export const runAutoTitle = async ({ meetingId }: { meetingId: string }) => {
  const meeting = findMeeting({ meetingId })
  if (!meeting || !isDefaultTitle(meeting)) return

  const client = await createLlmClient()
  const isLocal = client.provider === 'local'
  const workDir = titleWorkDir({ meetingId })
  await mkdir(workDir, { recursive: true })

  try {
    const answer = await client.complete({
      system: TITLE_SYSTEM_PROMPT,
      prompt: buildTitlePrompt({
        transcript: transcriptOf({ meetingId }),
        note: findMeetingNote({ meetingId })
      }),
      maxTokens: TITLE_MAX_TOKENS,
      label: 'title',
      workDir,
      grammar: isLocal ? TITLE_GRAMMAR : undefined,
      contextTokens: TITLE_CTX_TOKENS
    })

    const topic = cleanTitleTopic(answer)
    if (!topic) {
      info(`회의 ${meetingId} 자동 제목 건너뜀: 빈 답 (${client.provider})`)
      return
    }

    const title = autoTitleOf({ createdAt: meeting.createdAt, topic })
    if (!updateAutoTitle({ meetingId, title, defaultTitle: meeting.title })) {
      info(`회의 ${meetingId} 자동 제목 건너뜀: 그사이 제목이 바뀜`)
      return
    }
    notifyMeetingsChanged()
    info(`회의 ${meetingId} 자동 제목 (${client.provider}): ${title}`)
  } finally {
    await rm(workDir, { recursive: true, force: true })
  }
}

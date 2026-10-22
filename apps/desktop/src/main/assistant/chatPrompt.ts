import {
  ROUTINE_MAX_INTERVAL_MIN,
  ROUTINE_MIN_INTERVAL_MIN,
  ROUTINE_NAME_MAX_CHARS
} from '@shared/routine'

/**
 * 채팅 에이전트에만 붙이는 시스템 지시 (references/features/assistant.md "에이전트 실행 경로", "루틴" > "대화로 만들기").
 * Claude는 `--append-system-prompt`, Codex는 `-c developer_instructions`로 넘긴다. 답할 사람이 없는 백그라운드 실행(루틴·정리)에는 붙이지 않는다.
 * UI 문구가 아니라 프롬프트라 UI 언어와 무관하게 한국어다.
 */

const NO_DIALOG_PROMPT =
  '이 대화는 데스크탑 앱의 채팅 창에서 이어집니다. 선택 창을 띄울 수 없으니, 사용자에게 물을 것이 있으면 ' +
  '답변 글에 번호 목록으로 질문을 쓰고 사용자의 다음 메시지를 기다리세요.'

/** 형식을 바꾸면 `splitRoutineProposal`(`src/shared/routine.ts`)도 같이 바꾼다 */
const ROUTINE_CHAT_GUIDE = `사용자가 정해진 주기마다 자동으로 할 일(루틴)을 만들고 싶어 하면, 이 앱의 루틴으로 만드세요. CLI 자체의 예약·cron·클라우드 루틴이나 launchd는 쓰지 않습니다. 이름·할 일·주기를 대화로 정하세요. 할 일은 답할 사람 없이 혼자 끝낼 수 있게 구체적인 지시문으로 쓰세요(읽을 파일, 쓸 파일, 결과 형식).
모두 정해지면 답 끝에 아래 형식의 코드 블록을 하나만 붙이세요. 앱이 이 블록을 확인 카드로 보여 주고, 사용자가 카드의 "루틴 추가"를 눌러야 저장됩니다. 블록 밖에 JSON을 다시 쓰지 마세요.
\`\`\`routine
{"name": "아침 브리핑", "prompt": "tasks.md에서 오늘 할 일을 골라 notes/today.md에 정리해 줘", "schedule": {"kind": "time", "weekdays": [1, 2, 3, 4, 5], "time": "09:00"}}
\`\`\`
name은 ${ROUTINE_NAME_MAX_CHARS}자 이하, weekdays는 0(일요일)~6(토요일), time은 24시간 HH:MM입니다. 일정한 간격으로 돌리려면 schedule을 {"kind": "interval", "minutes": 60}처럼 쓰고 minutes는 ${ROUTINE_MIN_INTERVAL_MIN}~${ROUTINE_MAX_INTERVAL_MIN}입니다.
루틴은 앱이 켜져 있을 때 이 작업 폴더에서 새 대화로 실행되고 결과는 알림으로 갑니다. 앱이 꺼져 있던 동안 놓친 실행은 앱이 켜진 뒤 한 번만 돕니다. 루틴 이야기가 아니면 이 블록을 쓰지 마세요.`

export const CHAT_SYSTEM_PROMPT = `${NO_DIALOG_PROMPT}\n\n${ROUTINE_CHAT_GUIDE}`

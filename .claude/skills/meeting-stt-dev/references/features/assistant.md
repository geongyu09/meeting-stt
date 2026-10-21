# 기능 설계: 개인 비서

`references/architecture.md`에서 나눈 기능별 설계다. 프로세스 경계·디렉터리·IPC 규약 같은 공통 구조는 `references/architecture.md`에 있고,
다른 기능 문서의 절 이름은 그 문서의 "기능별 설계 문서" 목차에서 찾는다. 아래 `src/…`, `scripts/…`, `resources/…`는 모두 `apps/desktop/` 기준이다.

## 개인 비서 모드 (Phase 6, 2026-10-20)

회의록 앱을 **개인 비서**로 넓힌다 (GitHub 이슈 geongyu09/meeting-stt#1, 2026-10-20 사용자 기획).
**2026-10-21 피벗으로 이 절이 앱의 주 기능 설계다** (`SKILL.md` "제품 방향"). 회의록 쪽 절들은 보조 기능 설계다.
녹음은 비서가 사용자를 알아가도록 회의·프로젝트·일상의 일을 글로 옮겨 저장하는 입력 수단이고, 그 기록을 작업 폴더(비서의 뇌)로 잇는 연결은 아래 "녹음 기록 자동 정리" 절이다 (2026-10-21).
사용자가 고른 **작업 폴더**(마크다운 문서와 `CLAUDE.md`·스킬·훅 같은 에이전트 설정이 든 폴더)를 대상으로, 터미널에서 Claude Code를 쓰듯이
앱 안에서 질문하고 문서를 만들거나 고친다. 앱은 **폴더 경로만 저장**하고 개인 문서·설정은 앱 번들이나 DB에 넣지 않는다.

### 이슈의 "정할 것" — 1차 결정 (2026-10-20, 사용자 확인 대기)

이슈가 열어 둔 세 갈림길을 구현을 시작하며 아래처럼 정했다. 사용자가 바꾸면 이 표부터 고친다.

| 갈림길 | 1차 결정 | 이유 |
| --- | --- | --- |
| 회의록과 채팅·에디터 화면 나누기 | 사이드바 아래 "비서" 링크 → **`/assistant` 한 화면**에 왼쪽 채팅, 오른쪽 문서 패널(파일 목록 + 에디터). 창을 따로 띄우지 않는다 | "바뀐 파일을 누르면 에디터에서 연다"가 같은 화면 안에서 끝나 채팅 맥락이 남는다. 창을 늘리면 창 참조·단일 인스턴스·Tray 관리가 같이 늘어난다(위젯 패널 절) |
| 대화 기록 저장 | **저장하지 않는다.** main 메모리에 **현재 대화 하나**(턴 목록 + CLI 세션 id)만 두고, 앱 종료·"새 대화"·작업 폴더 변경으로 사라진다 | CLI가 자기 세션 파일을 남기므로 이어 가기는 세션 id로 충분하다. 대화 목록이 필요해지면 그때 `assistant_sessions` 테이블을 검토한다 |
| 기본 권한 모드 | **`acceptEdits`** + 고정 허용 명령(읽기 전용 git: `git status`·`git diff`·`git log`). 더 넓히려면 작업 폴더의 `.claude/settings.json` `permissions.allow`에 적는다(설정 소스를 비우지 않으므로 그대로 읽힌다). 설정에 **"모든 권한 허용(`bypassPermissions`)" 스위치**를 경고와 함께 두고 기본 꺼짐 | `-p` 모드는 권한 확인 창에 답할 수 없어 허용 목록 밖의 도구는 자동 거절된다. 허용 명령을 앱에서 편집하게 하면 Claude Code 설정과 같은 것을 두 군데서 관리하게 된다 |

### 작업 폴더 (`src/main/assistant/folder.ts`)

- 설정의 "개인 비서" 카테고리에서 main의 `dialog.showOpenDialog({ properties: ['openDirectory', 'createDirectory'] })`로 고른다. 경로는 settings 키 `assistant.folder`(`references/data-model.md`).
- **채팅·에디터를 시작하기 전에** 폴더를 확인한다: 없음(`missing`), 폴더가 아님(`notDirectory`), 읽기·쓰기 권한 없음(`unreadable`, `fs.access(R_OK | W_OK)`). 문제가 있으면 화면이 안내하고 설정 링크를 준다.
- **git 저장소인지**(폴더나 상위 폴더에 `.git`이 있는지)도 같이 보고, 아니면 "변경을 되돌리기 어렵다"는 안내를 설정 행과 채팅 화면에 띄운다.
- 폴더를 바꾸면 현재 대화를 비운다 — Claude Code의 세션은 cwd별로 저장돼 다른 폴더에서 `--resume`할 수 없다. 에이전트가 실행 중이면 폴더 변경을 거절한다.

### 에이전트 실행 경로 (요약 경로와 분리)

요약·용어 초안의 `LlmClient.complete`(한 턴, 도구 끔, 빈 cwd)는 **건드리지 않는다.** 에이전트는 `src/main/assistant/*`의 별도 경로다.
spawn은 main에서 하고(`bin/spawn.ts`의 `runBinary`에 취소용 `signal`을 더했다), renderer는 IPC로 대화 상태를 받는다.

**Claude Code CLI** (`src/main/assistant/claudeAgent.ts`, 인자·스트림 해석은 `src/main/assistant/claudeStream.ts` 순수 함수 + vitest)

```
claude -p --output-format stream-json --verbose --include-partial-messages
  --permission-mode <acceptEdits | bypassPermissions>
  --allowedTools "Bash(git status:*)" "Bash(git diff:*)" "Bash(git log:*)"
  --disallowedTools AskUserQuestion
  --append-system-prompt <선택 창 대신 답변 글로 묻도록 하는 안내>
  [--resume <session_id>]
  (cwd = 작업 폴더, 질문은 stdin으로)
```

- **`--setting-sources`·`--tools`를 비우지 않는다** — 작업 폴더의 `CLAUDE.md`·`.claude/settings.json`·스킬·훅과 사용자 설정을 그대로 읽게 하는 것이 이 기능의 목적이다. 실행 파일 탐색·PATH는 요약 경로와 같은 `llm/claudeCli.ts`·`cliEnv.ts`를 쓴다.
- **`AskUserQuestion`은 끈다.** `-p`에는 선택 창이 없어 그 도구가 불리면 질문이 사라진다. 대신 덧붙인 시스템 프롬프트가 "질문은 답변 글에 번호 목록으로 쓰고 사용자의 다음 메시지를 기다리라"고 지시하고, 사용자는 채팅 답장으로 잇는다(`--resume`).
- 출력은 **한 줄에 JSON 하나**(stream-json). 앱이 쓰는 줄만 해석한다 (2.1.304 실측):
  - `{"type":"system","subtype":"init","session_id"}` → 세션 id. 첫 질문의 id를 저장해 다음 질문에 `--resume`으로 넘긴다.
  - `{"type":"stream_event","event":{"type":"content_block_delta","delta":{"type":"text_delta","text"}}}` → 답변 글 조각. 화면에 바로 붙인다.
  - `{"type":"assistant","message":{"content":[{"type":"tool_use","id","name","input"}]}}` → 실행한 도구(`id`는 목록 key). 화면에는 이름과 대상 한 줄(`input.file_path`·`command`·`pattern`·`url` 중 있는 것, 작업 폴더 안의 절대 경로는 상대 경로로)만 보인다.
    `Write`·`Edit`·`MultiEdit`·`NotebookEdit`의 `file_path`는 **바꾼 파일 목록**에 넣는다(작업 폴더 기준 상대 경로, 폴더 밖이면 절대 경로 그대로 — 에디터로 열지 않는다). 폴더 경로에 심볼릭 링크가 끼면(`/tmp` → `/private/tmp`) CLI가 실제 경로를 쓸 수 있어 `realpath`한 경로로도 상대 경로를 찾는다.
  - `{"type":"result","is_error","result","session_id"}` → 한 턴의 끝. `is_error`면 `result`가 오류 문장이다.
  - 그 밖의 줄(훅·`rate_limit_event`·`thinking` 조각 등)과 JSON이 아닌 줄은 무시한다.
- **취소**: `AbortController.abort()` → spawn의 `signal`이 자식 프로세스에 SIGTERM을 보낸다. `runBinary`는 abort 뒤 **프로세스가 실제로 끝날 때(`close`)까지 기다렸다가** reject하고, `ABORT_KILL_GRACE_MS`(3초) 안에 안 끝나면 SIGKILL한다 —
  `AbortError`가 먼저 오는 시점에 "중지됨"을 알리면 그 사이 에이전트가 파일을 더 고칠 수 있다 (claude 2.1.304는 SIGTERM 뒤 약 0.7초에 종료 코드 143으로 끝난다, 2026-10-20 실측).
  취소한 턴은 그때까지 받은 글을 남기고 "중지했습니다"로 끝낸다. 세션 id는 유지해 다음 질문이 이어진다. 앱 종료(`will-quit`)도 실행 중인 에이전트를 같은 방법으로 끝낸다.
- 한 번에 한 턴만 돈다. 실행 중의 새 질문은 거절한다(화면도 입력을 막는다). 요약·교정 잡 큐(`pipeline/queue.ts`)와는 별개다 — GPU를 쓰지 않고 몇 분씩 걸려 큐를 막으면 안 된다.

**Codex CLI** (`src/main/assistant/codexAgent.ts`, 인자·이벤트 해석은 `src/main/assistant/codexStream.ts` 순수 함수 + vitest, 2026-10-20 codex-cli 0.163.0 실측)

```
첫 질문:   codex exec        --json --skip-git-repo-check <권한> [--model <모델>] -
이어 묻기: codex exec resume --json --skip-git-repo-check <권한> [--model <모델>] <thread_id> -
  권한 = acceptEdits → -c sandbox_mode="workspace-write"  |  bypassPermissions → --dangerously-bypass-approvals-and-sandbox
  (cwd = 작업 폴더, 질문은 stdin으로)
```

- 요약용 인자의 `--ignore-user-config`·`--ignore-rules`·`--ephemeral`·`-s read-only`를 **빼서** 사용자 config·작업 폴더의 `AGENTS.md`·규칙을 읽고 세션 파일을 남긴다(이어 묻기에 필요).
- **`exec resume`에는 `--sandbox`·`--color` 옵션이 없다** — 주면 사용법 오류(종료 코드 2)다. 그래서 샌드박스는 두 경우 모두 `-c sandbox_mode=…`로 넘기고 `--color`는 쓰지 않는다.
- `--skip-git-repo-check`: git 저장소가 아닌 폴더도 허용한다. 대신 화면이 "되돌리기 어렵다"고 알린다.
- 모델은 설정 "요약 · 용어 초안"의 Codex 모델(`llm.codexModel`)을 그대로 쓴다. 비어 있으면 `--model`을 넘기지 않아 **사용자 config의 기본 모델**을 쓴다(요약 경로와 달리 config를 읽으므로). 추론 노력도 config를 따른다.
- 출력은 `--json`(한 줄에 JSON 하나). 앱이 쓰는 줄:
  - `{"type":"thread.started","thread_id"}` → 세션 id(`resume`에 넘긴다).
  - `{"type":"item.completed","item":{"type":"agent_message","text"}}` → **답변 글 한 덩어리**(Claude처럼 조각이 아니다). 한 턴에 여럿이면 빈 줄로 잇는다.
  - `{"type":"item.started","item":{"id","type":"command_execution","command"}}` → 도구 `Shell`. 명령은 `/bin/zsh -lc "…"`로 감싸져 오므로 안쪽만 보여 준다.
  - `{"type":"item.started","item":{"id","type":"file_change","changes":[{"path","kind"}]}}` → 바꾼 파일(`add`·`update`는 바뀐 파일 목록에, `delete`는 도구 줄에만). 경로는 절대 경로다.
  - `{"type":"turn.completed"}` → 한 턴의 끝. `{"type":"turn.failed","error":{"message"}}` → 실패. `message`가 JSON 문자열이면 안쪽 `error.message`를 꺼낸다.
  - 그 밖(`turn.started`, `item.completed`의 도구 줄, `item.type: error` 경고, 최상위 `error`)은 무시한다. 최상위 `error` 뒤에는 `turn.failed`가 온다.
  - item `id`(`item_0`…)는 **턴마다 다시 0부터** 센다 — 도구 목록이 턴 단위라 key로 써도 겹치지 않는다. `file_change`는 파일마다 `<id>:<순번>`으로 나눈다.
- 잘못된 세션 id 같은 시작 실패는 JSON 없이 종료 코드 1과 stderr `Error: thread/resume: …`로 끝난다. 요약 경로의 `codexErrorReason`(stderr 마지막 줄)으로 사유를 꺼낸다.

**로컬 모델**은 도구 호출을 못 해 에이전트 경로에서 뺀다. 아래 "빠른 질문 모드"(후순위)에서 쓴다.

### 대화 상태 (`src/main/assistant/session.ts`)

녹음·받아쓰기와 같은 모양이다 — **진행 중 대화의 단일 출처는 main**이고 `assistant:stateChanged`로 모든 창에 push한다. 화면을 옮겼다 돌아와도 `assistant:state`로 그대로 이어 그린다.

```ts
type AssistantProvider = 'claude-cli' | 'codex-cli'

interface AssistantToolUse {
  /** CLI가 붙인 tool_use id (`toolu_…`). 화면 목록의 key다 */
  id: string
  name: string
  /** 파일 경로·명령·검색어 중 있는 것 한 줄. 없으면 null */
  target: string | null
}

interface AssistantTurn {
  id: string
  role: 'user' | 'assistant'
  text: string
  /** assistant 턴만 쓴다 */
  tools: AssistantToolUse[]
  /** 에이전트가 쓰거나 고친 파일. 작업 폴더 기준 상대 경로(폴더 밖이면 절대 경로) */
  changedFiles: string[]
  /** 실패·취소 문장. 성공이면 null */
  error: string | null
}

interface AssistantChatState {
  /** 이 대화를 연 공급자. 대화가 비어 있으면 null — 세션 id는 공급자 사이에서 이어지지 않는다 */
  provider: AssistantProvider | null
  sessionId: string | null
  turns: AssistantTurn[]
  isRunning: boolean
}
```

- 글 조각마다 상태 전체를 보내면 긴 대화에서 IPC가 커진다. **50ms(`STATE_PUSH_INTERVAL_MS`)에 한 번으로 모아** 보낸다.
- 대화 중에는 공급자를 바꾸지 않는다(화면이 막는다). 바꾸려면 "새 대화".

### 문서 에디터 (`src/main/assistant/files.ts`)

- 작업 폴더의 **`.md` 파일 목록**과 **textarea 에디터**로 시작한다. 에디터 라이브러리는 기존 규칙(SKILL.md 1절 "편집")대로 도입하지 않는다.
- 목록: 재귀로 찾되 점으로 시작하는 폴더(`.git`·`.claude` 등)와 `node_modules`는 건너뛰고, 최대 `MAX_LISTED_FILES`(2,000개)에서 멈춘다. 상대 경로를 사전순으로 돌려준다.
- 읽기·저장은 main이 IPC로 한다. **renderer가 보낸 경로는 신뢰하지 않는다** — 작업 폴더 기준 상대 경로만 받고, `path.resolve` 결과가 폴더 밖이거나(`..`, 절대 경로) `.md`가 아니면 거절한다(`resolveWorkspaceFile`, 순수 함수 + vitest).
  심볼릭 링크로 폴더 밖을 가리키는 경우도 `realpath`로 한 번 더 막는다. 한 파일 최대 `MAX_DOCUMENT_BYTES`(2MB) — 넘으면 읽지 않는다.
- **저장하지 않은 변경은 잃지 않는다**: 다른 문서로 바꾸거나 화면을 떠나면 저장하지 않은 변경을 저장한다. 단, 외부 변경 안내가 떠 있는 동안은 저장하지 않는다(에이전트가 쓴 내용을 덮지 않는다).
- **에이전트가 파일을 고치면** `fs.watch(폴더, { recursive: true })`로 감지해 `assistant:filesChanged`(바뀐 `.md` 상대 경로 목록, 200ms 모아 보냄)로 알린다. 감시는 **비서 화면이 처음 문서 목록을 읽을 때** 시작하고(그 화면을 열지 않은 사용자의 폴더는 보지 않는다), 폴더를 바꾸면 새 폴더로 옮기고, 앱이 끝날 때 닫는다. 감시는 하나만 둔다.
  renderer는 목록을 다시 읽고, 열린 파일이 바뀌었으면 디스크 내용을 읽어 본다 — 마지막으로 저장·로드한 내용과 같으면(앱이 직접 저장한 직후의 이벤트) 무시하고,
  다르면 **편집 중이 아니면 바꿔 보여 주고, 편집 중이면 덮어쓰지 않고** "다른 곳에서 바뀌었습니다 · 다시 읽기"를 띄운다.

### IPC

| 키 | 채널 | 방향 | 요청 → 응답 |
| --- | --- | --- | --- |
| `assistant.status` | `assistant:status` | invoke | 없음 → `AssistantStatus` (폴더·폴더 문제·git 여부·권한 모드·에이전트) |
| `assistant.chooseFolder` | `assistant:chooseFolder` | invoke | 없음 → `AssistantStatus`. 대화상자를 취소하면 그대로, 바꾸면 대화를 비운다 |
| `assistant.setPermissionMode` | `assistant:setPermissionMode` | invoke | `{ permissionMode }` → `AssistantStatus` |
| `assistant.setProvider` | `assistant:setProvider` | invoke | `{ provider }` → `AssistantStatus` (2026-10-22, 설정 모달 "에이전트" 행. `assistant.provider`에 저장) |
| `assistant.state` | `assistant:state` | invoke | 없음 → `AssistantChatState` |
| `assistant.send` | `assistant:send` | invoke | `{ provider, text }` → 없음. 턴 시작만 기다리고 진행은 이벤트로 받는다. 폴더 문제·실행 중·빈 질문·공급자 불일치는 reject |
| `assistant.cancel` | `assistant:cancel` | invoke | 없음 → 없음 |
| `assistant.reset` | `assistant:reset` | invoke | 없음 → `AssistantChatState` (실행 중이면 reject) |
| `assistant.listFiles` | `assistant:listFiles` | invoke | 없음 → `string[]` (상대 경로) |
| `assistant.readFile` | `assistant:readFile` | invoke | `{ path }` → `{ path, content }` |
| `assistant.writeFile` | `assistant:writeFile` | invoke | `{ path, content }` → 없음 |
| `events.assistantState` | `assistant:stateChanged` | push | `AssistantChatState` |
| `events.assistantFilesChanged` | `assistant:filesChanged` | push | `{ paths: string[] }` |

- 핸들러는 `ipc/handlers.ts`가 이미 400줄을 넘어 **`ipc/assistant.ts`의 `registerAssistantHandlers`** 로 따로 두고 `registerIpcHandlers`가 부른다.
- 질문 최대 `MAX_QUESTION_CHARS`(2만 자), 문서 저장 최대 `MAX_DOCUMENT_BYTES`.

### 화면

**2026-10-22부터 채팅이 앱의 첫 화면(`/`)이고 구성은 `features/ui.md` "채팅창 리뉴얼"이 정한다** — 에이전트 `<select>` 없음, `/` 명령 메뉴·`@` 파일 선택, 문서 패널은 필요할 때만 옆에 열림. 아래는 그 전(2026-10-20)의 구성이다.
**에이전트는 설정 모달 "개인 비서"의 "에이전트" 행에서 고른다** (2026-10-22, `features/ui.md` "설정 모달") — 값은 `assistant.provider`, 읽기는 `AssistantStatus.provider`(저장값이 없으면 main이 설치된 첫 CLI로 채움), 대화 중에는 비활성. 채팅은 `state.provider ?? status.provider`로 보낸다.

- 사이드바 하단 설정 링크 위에 **"비서"** 링크(`PATHS.assistant = '/assistant'`).
- `pages/Assistant` — 상단 바 + 두 칸: 왼쪽 `assistant/AssistantChatSection`(채팅), 오른쪽 `assistant/DocumentEditorSection`(파일 목록 + 에디터, 기본 폭 절반).
  채팅의 바뀐 파일을 누르면 에디터가 그 파일을 연다 — widgets는 서로 import하지 않으므로 **페이지가 열린 경로 상태 하나**를 들고 두 위젯에 넘긴다.
- 채팅: 에이전트 선택(`<select>`, Claude Code·Codex 둘 다 보여 주고 기본은 설치된 첫 CLI, 고른 CLI가 없으면 입력 대신 설치 안내 — 경로는 `useLlmStatus`, 대화 중 비활성) · "새 대화" · 턴 목록(사용자 질문, 답변 글은 줄바꿈만 살린 평문, 도구 한 줄씩, 바뀐 파일 버튼, 오류) · 입력란(Enter 전송, Shift+Enter 줄바꿈, **한글 조합 중 Enter는 전송하지 않는다**) · 실행 중이면 "중지".
  폴더가 없거나 문제가 있으면 입력 대신 안내와 설정 링크. git 저장소가 아니면 입력 위에 한 줄 경고.
- 에디터: 파일 목록(`<select>`) · textarea · 저장 버튼(⌘S, 바뀐 것이 없으면 비활성) · 외부 변경 안내.
- 설정 "개인 비서" 카테고리 `setting/AssistantSettingSection`: 작업 폴더 행(경로 + "폴더 고르기", 문제·git 안내), 권한 행("모든 권한 허용" 스위치, 켜면 "작업 폴더 밖 파일과 모든 명령을 묻지 않고 실행합니다" 경고).
- 외부 전송 안내: 질문과 에이전트가 읽은 파일 내용이 공급자(Anthropic·OpenAI) 서버로 전송된다는 사실을 설정 카테고리 설명에 적는다 ("LLM 공급자" 절과 같은 원칙).

### 빠른 질문 모드 (후순위, 미착수)

에이전트 실행은 도구를 부를 때마다 모델 왕복이 생겨 몇 분씩 걸린다. 빠른 질문 모드는 main이 작업 폴더의 마크다운을 **키워드로 먼저 찾아** 상위 몇 개를 프롬프트에 넣고
도구를 끈 한 턴 호출(`LlmClient.complete`)로 답한다. 로컬 모델도 여기서는 쓸 수 있다. 임베딩·벡터 DB는 키워드 검색이 놓치는 질문이 많아질 때 검토한다.

## 녹음 기록 자동 정리 (2026-10-21)

녹음을 멈추면 **STT → 화자 분리(회의만) → 비서의 뇌에 원문 저장 → 정리 에이전트**가 사람 손 없이 이어진다 (2026-10-21 사용자 기획).
녹음이 비서가 사용자를 알아가는 입력 수단이라는 피벗 방향(`SKILL.md` "제품 방향")을 실제로 잇는 연결이다.
아래 결정은 같은 날 사용자가 하나씩 골랐다.

| 갈림길 | 결정 (2026-10-21 사용자) | 이유 |
| --- | --- | --- |
| 비서의 뇌 | **개인 비서의 작업 폴더(`assistant.folder`) 그 자체.** 새 폴더 설정을 두지 않는다 | 채팅 에이전트가 기록을 바로 읽는다. `acceptEdits`는 작업 폴더 밖에 쓰지 못해 폴더를 나누면 권한을 따로 열어야 한다 |
| 누가 무엇을 쓰나 | **원문은 앱, 정리는 에이전트.** 앱이 전사 원문을 `기록/` 아래 정해진 이름으로 먼저 저장하고, 에이전트가 폴더 규칙대로 요약·정리·다른 문서 반영을 한다 | 에이전트가 실패해도 원문은 뇌에 남는다. 형식·위치 규칙은 사용자가 `CLAUDE.md`·스킬로 정한다("하네스에 맞게") |
| 채팅과의 관계 | **채팅과 별도로 백그라운드 실행.** 채팅 대화(`assistant/session.ts`)에 턴을 넣지 않는다 | 채팅 중이어도 충돌하지 않고, 채팅 맥락에 긴 전사본이 쌓이지 않는다. 같은 파일을 채팅 에이전트와 동시에 고칠 수 있는 것은 감수한다 |
| 폴더 규칙이 없을 때 | 앱의 고정 지시가 **"규칙을 먼저 따르고, 없으면 원문 파일 맨 위에 요약을 쓴다"** | 규칙을 쓰지 않은 사용자도 바로 쓸모가 있다. 설정에 지시문 입력란을 두지 않는다 — `CLAUDE.md`와 같은 일을 두 곳에서 관리하게 되고, 프롬프트를 쓰게 하지 않는다는 요약 템플릿 원칙과도 어긋난다 |
| 화자 분리 생략 | **녹음 종류(회의 / 메모)를 고른다.** 메모는 화자 분리를 건너뛴다 | 혼자 하는 기록에는 화자가 필요 없고, 빠르게 끝나야 한다 |
| 종류 고르기 | **종류마다 전역 단축키**(회의 = 기존 `shortcut.recording`, 메모 = 새 `shortcut.memo`). 화면의 선택은 **마지막 고른 값을 기억하고 처음은 메모** | 화면을 보지 않고 의도대로 시작한다. 피벗 방향(빠른 기록)에 맞춰 처음 값은 메모 |
| 외부 전송 | 자동 정리는 **기본 켜짐**(`assistant.autoOrganize`), 설정에서 끈다. 꺼도 원문 저장(로컬)은 한다 | 작업 폴더를 고른 것 자체가 비서(외부 전송) 사용에 동의한 것으로 본다. 설정 설명에 전송 사실을 적는다 |
| 기존 요약 | 회의 상세의 "요약 만들기"(템플릿·로컬 모델)는 **그대로 둔다** | 작업 폴더·CLI 없이 로컬로 요약하는 경로를 남긴다. 뇌 정리와 서로 무관하다 |
| 결과 알림 | **macOS 시스템 알림**(Electron `Notification`). 누르면 메인 창 비서 화면에서 원문을 연다 | 다른 앱을 쓰는 중에도 보인다 ("돌아다니는 비서" 방향) |
| 앱에서 고친 뒤 | 뇌의 원문을 **자동으로 갱신하지 않는다.** 회의 상세의 "다시 보내기"가 원문을 덮어쓰고 정리를 다시 돌린다 | 저장된 뒤의 뇌 파일은 에이전트·사용자의 것이다. 자동으로 덮으면 원문 위에 쓴 요약이나 사용자가 고친 내용이 사라진다 |

### 흐름

```
[녹음 정지 (회의 / 메모)]
  → 파이프라인 잡 (GPU 큐): 정규화 → STT → (회의만) 화자 분리 → 병합 → 저장, status='done'
  → (조건이 맞으면) 자동 교정 잡 (GPU 큐) — 끝나거나 실패하면 다음으로
  → (조건이 맞으면) 자동 제목 잡 (GPU 큐) — 끝나거나 실패하거나 건너뛰면 다음으로
  → 정리 잡 (정리 큐, 동시성 1):
       1. 작업 폴더 확인 — 미설정이면 조용히 건너뜀(로그), 문제(missing·notDirectory·unreadable)면 실패 알림
       2. 원문 저장: <작업 폴더>/기록/<YYYY-MM-DD-HHmm> <주제>.md, meetings.brain_path 갱신
       3. assistant.autoOrganize가 꺼져 있으면 여기서 끝 (알림 없음)
       4. 정리 에이전트 한 턴 (설치된 첫 CLI, 채팅과 같은 권한 모드)
       5. 시스템 알림: 완료(바꾼 파일 수) / 실패(이유, 원문은 저장됨)
```

- **자동 실행은 처음 처리할 때만** 한다 — `brain_path`가 이미 있는 회의는 다시 인식해도 자동으로 보내지 않는다(원문을 두 번 만들지 않는다). 다시 보내려면 상세의 "다시 보내기".
- 순서를 자동 교정·자동 제목 뒤로 두는 이유: 교정된 본문과 내용으로 지은 제목이 뇌에 들어가야 한다. 정리 잡은 **자동 제목 잡의 끝(성공·실패·건너뜀 모두)** 에서 넣는다 — 교정·제목 잡의 연결은 `features/transcript.md` "회의록 자동 제목" "실행과 큐".
- 녹음 파일 가져오기로 만든 회의도 같다(종류는 회의).
- **정리 큐는 GPU 큐(`pipeline/queue.ts`)와 따로 둔다** — 에이전트는 GPU를 쓰지 않고 몇 분씩 걸려, 같은 큐에 넣으면 다음 녹음의 STT를 막는다. 정리 잡끼리는 한 번에 하나씩 돈다(같은 폴더를 두 에이전트가 동시에 고치지 않게).
- 잡은 시작할 때의 작업 폴더를 쓴다. 도는 중에 폴더를 바꿔도 그 잡은 원래 폴더에서 끝난다.

### 녹음 종류 (회의 / 메모)

```ts
type RecordingType = 'meeting' | 'memo'
```

- 종류는 참석자 수처럼 **main 녹음 세션 밖의 값**(`audio/session.ts`)이고 `RecordingStateEvent.recordingType`으로 두 창에 push한다. 바꾸기는 `recording:setType`(`{ type }` → 녹음 상태). 녹음 중에도 바꿀 수 있고 **정지하는 순간의 값**을 `meetings.record_type`에 쓴다.
  참석자 수와 달리 **DB(`recording.type`)에 저장**해 앱을 다시 켜도 마지막 값이 남는다. 처음 값은 `'memo'`.
- 메모를 고르면 참석자 수를 저장하지 않고(`speaker_count` NULL), 정지할 때 기본 제목을 `"2026-10-21 메모"`로 바꾼다(제목은 시작할 때 "회의"로 만들어지므로). 처리가 끝나면 회의와 똑같이 자동 제목이 이 기본 제목을 바꾼다 (`features/transcript.md` "회의록 자동 제목").
- 파이프라인: 메모는 **화자 분리를 spawn하지 않고** 녹음 전체를 덮는 화자 구간 하나(`SPEAKER_00`)를 병합에 넘긴다 — 병합 코드는 손대지 않는다. 진행률은 `diarize` 단계를 시작하자마자 100%로 한 번 보낸다(`src/shared/progress.ts`의 단계 구성을 바꾸지 않는다).
- 전역 단축키: 회의(`shortcut.recording`, 기본 `⌥⌘R`)와 메모(`shortcut.memo`, 기본 `⌥⌘M`). **녹음 중이 아니면** 그 종류로 바꾼 뒤 시작하고, **녹음 중이면 어느 쪽이든 정지**한다(종류는 바꾸지 않는다). `⌥⌘M`은 일부 앱의 "모두 최소화"(Option을 누른 최소화)와 겹치지만 `⌥⌘D`가 Dock 토글과 겹치는 것과 같은 수준으로 감수하고, 설정에서 바꾸거나 끌 수 있다.
- Tray 메뉴는 "녹음 시작"을 "회의 녹음 시작" / "메모 녹음 시작" 둘로 나눈다. 녹음 중에는 "녹음 정지" 하나다.
- 화면: 위젯 패널과 메인 녹음 화면에 **회의 / 메모 선택**(두 칸 세그먼트)을 두고, 메모면 참석자 수 입력을 숨긴다. 회의 목록·상세에는 메모에 "메모" 표시를 붙인다.

### 원문 파일 (`src/main/assistant/recordNote.ts`)

- 경로: `<작업 폴더>/기록/<YYYY-MM-DD-HHmm> <주제>.md` (회의 `created_at` 기준 로컬 시각, 예: `2026-10-21-1430 배포 일정 논의.md`). 폴더 목록만 보고도 어떤 기록인지 알게 하기 위해서다 (2026-10-21).
  주제는 원문을 저장하는 순간의 회의 제목에서 앞의 `YYYY-MM-DD `를 뗀 것이고(날짜가 겹치므로), 파일명에 못 쓰는 문자는 `_`(`audio/exportFileName.ts`와 같은 규칙), `NOTE_TOPIC_MAX_CHARS`(60)자까지다. 제목이 기본 제목 그대로면 주제 없이 `<YYYY-MM-DD-HHmm>.md`다.
  저장한 뒤 제목을 바꿔도 파일 이름은 바꾸지 않는다("다시 보내기"도 `brain_path`의 같은 파일을 덮는다). 폴더가 없으면 만든다. 같은 이름이 있으면 `-2`, `-3`…을 붙이고 **`wx` 플래그로 연다** — 다른 파일을 덮지 않는다. 폴더 이름 `기록`은 UI 언어와 무관하게 고정이다.
- `meetings.brain_path`에 **절대 경로**를 저장한다. 작업 폴더를 바꾼 뒤에도 어떤 파일이었는지 알 수 있게 하기 위해서다. "비서에서 열기"는 그 경로가 지금 작업 폴더 안의 `.md`일 때만 보인다(`resolveWorkspaceFile`과 같은 검증).
- 내용 — 머리말(YAML) + 본문. 형식 조립은 순수 함수(vitest)이고 회의 본문은 `@meeting-stt/core/format`의 `formatTranscript`(markdown)를 그대로 쓴다.

  ```markdown
  ---
  종류: 회의            # 또는 메모
  제목: 2026-10-21 배포 일정 논의
  시작: 2026-10-21 14:30
  길이: 12분 3초
  참석자: 김OO, 화자 2  # 회의만
  ---

  [00:00:12] **김OO**: 지난주 논의했던 배포 일정부터 정리하겠습니다.
  ```

  메모는 화자·시각 없이 발화를 문단(빈 줄)으로 잇는다.
- **녹음 노트**(`features/recording.md` "녹음 노트", 2026-10-21)가 있으면 머리말 바로 아래에 `## 노트` + 노트 원문(사용자가 적은 마크다운 그대로) + `## 전사`를 두고 그 아래에 본문을 잇는다. 노트가 비어 있으면 두 제목 없이 위 형식 그대로다.
  "다시 보내기"는 그때의 노트로 원문을 다시 만든다.
- 원문 저장은 **자동 정리 스위치와 무관하게** 작업 폴더가 있으면 한다 — 로컬 파일 쓰기라 외부로 나가지 않는다.

### 정리 에이전트 (`src/main/assistant/organize.ts`)

- 채팅과 같은 `runClaudeAgent`·`runCodexAgent`를 쓰되 **새 세션**(`--resume` 없음)으로 한 턴만 돌린다. 대화 상태(`session.ts`)를 거치지 않고, 이벤트에서 바꾼 파일만 모은다.
- 에이전트: **설치된 첫 CLI**(Claude Code → Codex, 채팅의 기본 선택과 같은 규칙). 둘 다 없으면 실패 알림("원문만 저장했습니다 · CLI 설치 필요").
- 권한 모드는 채팅 설정(`assistant.permissionMode`)을 따른다.
- 고정 지시(stdin, 사전 `src/shared/locales/assistant.ts`에 두되 UI 언어와 무관하게 한국어):

  > 방금 끝난 {회의|메모}의 전사 원문을 `{작업 폴더 기준 상대 경로}`에 저장했다. 이 작업 폴더의 규칙(CLAUDE.md·AGENTS.md·스킬)에 녹음 기록을 정리하는 방법이 있으면 그대로 따르라.
  > 규칙이 없으면 원문 파일의 머리말 바로 아래에 `## 요약` 섹션을 만들고 핵심 요약·결정 사항·할 일을 적어라. 원문 본문은 지우거나 고치지 마라.
  > 사용자에게 질문하지 말고 끝까지 처리하라.

  Claude는 채팅용 `--append-system-prompt`(질문을 글로 하고 기다리라는 안내)를 붙이지 않는다 — 백그라운드라 답할 사람이 없다. `AskUserQuestion`은 그대로 끈다.
- **노트가 있으면 지시에 두 문단을 더한다** (2026-10-21 사용자 요청 — "링크 자체를 저장하기도 하고, 비서가 내용을 직접 읽어서 정리하기도 한다"):

  > 원문의 `## 노트`는 사용자가 녹음하며 직접 적은 글이다. 전사보다 믿을 만한 단서로 보고(이름·용어 표기, 결정, 할 일) 정리에 반영하라.
  > 노트의 링크는 열어 읽고 관련 내용을 정리에 반영하라. 링크 자체도 정리한 문서의 관련 자리에 남겨라. 열 수 없는 링크(로그인 필요 등)는 링크만 남기고 읽지 못했다고 적어라.

  - **링크 읽기 권한(Claude)**: 노트에서 `extractNoteLinks`로 뽑은 링크의 호스트마다 `--allowedTools`에 `WebFetch(domain:<호스트>)`를 더한다. **그 도메인만** 허용한다 — 정리 에이전트는 작업 폴더를 고칠 수 있어,
    아무 도메인이나 열게 하면 읽은 페이지 속 지시(프롬프트 주입)가 폴더 내용을 다른 주소로 실어 보낼 수 있다. 채팅 에이전트의 허용 목록(`AGENT_ALLOWED_TOOLS`)은 바꾸지 않는다. 링크가 없으면 더하지 않는다.
  - **Codex**는 `workspace-write` 샌드박스가 네트워크를 막아 링크를 읽지 못한다 — 1차는 그대로 두고, 위 지시의 "열 수 없는 링크" 경로로 링크만 남는다. 도메인 단위 허용 방법이 생기면 그때 연다.
- 시간 제한 `ORGANIZE_TIMEOUT_MS`(10분). 넘으면 채팅 취소와 같은 방법(`AbortController`)으로 끝내고 실패로 알린다. 앱 종료(`will-quit`)도 도는 정리를 끝낸다. 남은 정리 잡은 버린다 — 회의 상세의 "다시 보내기"로 다시 돌린다.
- 상태는 main 메모리에만 둔다 — `Map<meetingId, OrganizeStatus>`. **DB 컬럼을 두지 않는다**(요약과 같은 규칙: 앱을 다시 켜면 진행 상태가 사라지고, 원문 저장 여부는 `brain_path`로 안다).

```ts
type OrganizeStage = 'queued' | 'saving' | 'running' | 'done' | 'error'

interface OrganizeStatus {
  meetingId: string
  stage: OrganizeStage
  /** 에이전트가 쓰거나 고친 파일 (작업 폴더 기준 상대 경로). done일 때만 */
  changedFiles: string[]
  /** 한국어 사유. error일 때만 */
  errorMessage: string | null
}
```

### 알림 (`src/main/windows/notify.ts`)

- Electron `Notification`(main). 제목 "기록 정리 완료" / "기록 정리 실패", 본문 "<회의 제목> · 파일 3개 변경"(예: "2026-10-21 배포 일정 논의 · 파일 3개 변경") / 실패 이유. 작업 폴더 미설정으로 건너뛴 경우와 자동 정리가 꺼져 있는 경우는 알리지 않는다.
- 누르면 메인 창을 보이고 `assistant:openFile`(`{ path }`, 작업 폴더 기준 상대 경로)을 push한다. 메인 창 renderer가 `/assistant`로 이동하며 그 파일을 에디터에 연다(페이지가 들고 있는 열린 경로 상태의 초기값). 원문이 아직 있으면 원문, 없으면(에이전트가 옮김) 바꾼 파일 중 첫 `.md`.
- `Notification.isSupported()`가 거짓이면 로그만 남긴다. 알림 권한은 macOS가 처음 보낼 때 묻는다.

### IPC

| 키 | 채널 | 방향 | 요청 → 응답 |
| --- | --- | --- | --- |
| `recording.setType` | `recording:setType` | invoke | `{ type: RecordingType }` → `RecordingStateEvent` |
| `assistant.setAutoOrganize` | `assistant:setAutoOrganize` | invoke | `{ isEnabled }` → `AssistantStatus` (`isAutoOrganizeEnabled` 필드 추가) |
| `organize.status` | `organize:status` | invoke | `{ meetingId }` → `OrganizeStatus \| null` |
| `organize.send` | `organize:send` | invoke | `{ meetingId }` → 없음. 정리 잡을 넣는다. 원문이 있으면 덮어쓴다(2단계 확인은 화면이). 회의가 `done`이 아니면 reject |
| `events.organize` | `organize:progress` | push | `OrganizeStatus` |
| `events.assistantOpenFile` | `assistant:openFile` | push | `{ path }` |

### 화면

- **회의 상세** — 요약 카드 근처에 "비서의 뇌" 한 줄: 원문 경로(작업 폴더 기준), 정리 상태(대기·정리 중·완료와 바꾼 파일 수·실패와 이유), "비서에서 열기", **"비서에게 보내기"**(원문 없음) / **"다시 보내기"**(원문 있음, "뇌의 원문을 덮어쓰고 다시 정리합니다" 2단계 인라인 확인). 작업 폴더가 없으면 설정 링크만.
- **설정 "개인 비서"** — "녹음 기록 자동 정리" 스위치(기본 켜짐). 설명: "녹음이 끝나면 전사 원문을 작업 폴더의 `기록/`에 저장하고 에이전트가 정리합니다. 켜져 있으면 녹음 내용이 Anthropic·OpenAI 서버로 전송되고, 제목도 내용으로 만듭니다. 꺼도 원문은 저장합니다." (제목 전송 조건은 `features/transcript.md` "회의록 자동 제목")
- **설정 "단축키"** — "녹음 시작·정지"를 "회의 녹음 시작·정지"로 바꾸고 "메모 녹음 시작·정지"(`memoShortcut`)를 더한다. 네 단축키는 서로 같을 수 없다.

## 루틴 (2026-10-22)

정해진 주기마다 작업 폴더에서 에이전트에게 **같은 프롬프트를 자동으로 보낸다** (2026-10-22 사용자 요청 — "주기를 정하면 매 주기마다 프롬프트를 실행").
아침 브리핑·주간 회고처럼 사용자가 묻지 않아도 비서가 먼저 일하게 하는 첫걸음이다("진짜 비서처럼 돌아다닌다" 방향, `SKILL.md` "제품 방향"). 아래 결정은 같은 날 사용자가 골랐다.

| 갈림길 | 결정 (2026-10-22 사용자) | 이유 |
| --- | --- | --- |
| 주기 | **시각**(매일 또는 고른 요일의 `HH:MM`)과 **간격**(N분·N시간마다) 둘 다 | 아침 브리핑은 시각이, 자주 확인하는 일은 간격이 맞다 |
| 결과 | **채팅과 별도로 백그라운드 실행**, 끝나면 macOS 알림, 마지막 답은 루틴 목록에서 펼쳐 본다 | 녹음 기록 자동 정리와 같은 방식이다. 채팅 중이어도 충돌하지 않고 대화 맥락에 루틴 결과가 섞이지 않는다 |
| 놓친 실행 | 앱이 꺼져 있었거나 잠자기로 놓쳤으면 **켜진 뒤 한 번만** 실행 | "매일 9시 브리핑"을 10시에 앱을 켜도 받는다. 여러 번 놓쳐도 몰아서 돌리지 않는다 |
| 화면 | 설정 **"개인 비서" 아래 "루틴" 묶음** | 지금 앱 구조에 맞춘다. 채팅창 리뉴얼(`features/ui.md`)의 설정 모달로 옮길 때 같이 옮긴다 |

### 루틴과 저장 (`src/shared/routine.ts`, 순수 함수 + vitest)

```ts
type RoutineSchedule =
  /** 고른 요일(0 = 일 … 6 = 토)의 로컬 시각 `HH:MM` */
  | { kind: 'time'; weekdays: number[]; time: string }
  | { kind: 'interval'; minutes: number }

interface RoutineRun {
  finishedAt: number
  /** 답변 글. 앞 ROUTINE_RESULT_MAX_CHARS자까지 */
  text: string
  /** 에이전트가 쓰거나 고친 파일 (작업 폴더 기준 상대 경로) */
  changedFiles: string[]
  /** 실패 사유. 성공이면 null */
  error: string | null
}

interface Routine {
  id: string
  name: string
  prompt: string
  schedule: RoutineSchedule
  isEnabled: boolean
  /** 다음 실행을 계산하는 기준 시각(epoch ms) — 저장하거나 실행을 시작한 시각 */
  anchorAt: number
  lastRun: RoutineRun | null
}

/** 만들기·고치기 요청. id가 null이면 새로 만든다 */
type RoutineInput = Pick<Routine, 'name' | 'prompt' | 'schedule' | 'isEnabled'> & { id: string | null }
```

- 저장은 settings 키 **`assistant.routines`(JSON 배열) 하나**다. 테이블을 만들지 않는다 — 루틴은 많아야 수십 개이고 용어 사전(`glossary.terms`)처럼 통째로 읽고 쓴다. 형식이 깨진 항목은 읽을 때 버린다.
- 제약 (저장 시 main이 검증, 어기면 거절): 이름 1~`ROUTINE_NAME_MAX_CHARS`(40)자, 프롬프트 1자~`MAX_QUESTION_CHARS`, 요일 0~6 하나 이상, 시각 24시간 `HH:MM`, 간격 `ROUTINE_MIN_INTERVAL_MIN`(10분)~`ROUTINE_MAX_INTERVAL_MIN`(1,440분 = 24시간) 정수.
  10분 아래를 막는 이유: 에이전트 한 턴이 몇 분씩 걸려 더 짧으면 쉬지 않고 연달아 돌며 구독 한도를 쓴다. 24시간보다 긴 주기는 시각 루틴(요일)으로 만든다.

### 다음 실행 계산

- 다음 실행 = `nextRoutineRunAt({ schedule, after: anchorAt })` — 간격은 `anchorAt + 분`, 시각은 `anchorAt`보다 뒤인 첫 "고른 요일의 `HH:MM`"(로컬 시각)이다.
- **실행을 시작하면 `anchorAt`을 지금으로 바꾼다** → 여러 주기를 놓쳤어도 한 번만 돈다(놓친 실행 결정). 간격은 실행 시작 기준이다.
- **저장(만들기·고치기·켜기)도 `anchorAt`을 지금으로 바꾼다** — 고친 순간 이미 지난 시각이 "놓친 실행"으로 바로 돌지 않게 한다.

### 스케줄러와 실행 (`src/main/assistant/routines.ts`)

- 앱이 켜져 있는 동안 **`ROUTINE_TICK_MS`(30초)마다, 그리고 시작 직후 한 번** 켜진 루틴을 훑어 때가 된 것을 큐에 넣는다. 루틴마다 타이머를 맞추지 않는 이유: 잠자기에서 깨어나면 `setTimeout`이 밀리는데, 30초 훑기는 깨어난 직후 놓친 실행을 잡는다.
  앱이 꺼져 있으면 돌지 않는다 — 창을 닫아도 앱은 메뉴바에 남고, 로그인 항목 등록은 하지 않는다.
- 큐는 **동시성 1**이고 GPU 큐·채팅·정리 큐와 별개다. 이미 큐에 있거나 도는 루틴은 다시 넣지 않는다.
- 한 번 실행:
  1. `anchorAt`을 지금으로 저장한다.
  2. 작업 폴더 확인(`requireWorkspaceFolder`) — 없거나 문제가 있으면 실패로 기록한다.
  3. 에이전트는 **채팅과 같은 에이전트** — 설정에서 고른 것(`assistant.provider`), 고른 적이 없으면 설치된 첫 CLI(Claude Code → Codex, `folder.ts`의 `resolveProvider`). 그 CLI가 없으면 실패.
  4. **새 세션 한 턴**(`--resume` 없음). 권한 모드는 채팅 설정(`assistant.permissionMode`), Codex 모델은 `llm.codexModel`. stdin은 고정 머리말 + 사용자 프롬프트다.
     머리말(`routines.ts`의 상수 `ROUTINE_PREAMBLE` — UI 문구가 아니라 프롬프트라 채팅의 `NO_DIALOG_PROMPT`처럼 코드에 두고 UI 언어와 무관하게 한국어): "이 요청은 사용자가 정해 둔 루틴으로, 정해진 주기에 자동으로 실행됐다. 답할 사람이 없으니 질문하지 말고 끝까지 처리하라. 답변 글은 알림과 루틴 목록에 그대로 보인다."
     Claude는 채팅용 `--append-system-prompt`(질문하고 기다리라는 안내)를 붙이지 않는다(`buildClaudeAgentArgs`의 `isUnattended`). `AskUserQuestion`은 그대로 끈다. 도구 권한은 채팅과 같다.
  5. 시간 제한 `ROUTINE_TIMEOUT_MS`(10분). 넘으면 `AbortController`로 끝내고 실패로 기록한다.
  6. `lastRun`을 저장하고 `routines:changed`를 push한 뒤 알린다.
- 루틴을 지우면 큐에서 빼고, 도는 중이면 끝낸다(결과를 남기지 않는다). 고치는 것은 도는 실행에 영향이 없다 — 시작할 때의 프롬프트로 끝난다.
- 앱 종료(`will-quit`)는 도는 루틴을 끝내고 큐를 버린다. 결과는 남기지 않는다(다음 실행 때 다시 돈다 — `anchorAt`이 이미 바뀌어 다음 주기에).
- 도는 루틴 id와 큐는 main 메모리에만 둔다.

### 알림 (`src/main/windows/notify.ts`)

- Electron `Notification`(main). 제목은 루틴 이름, 본문은 답변 글 앞 `NOTIFICATION_BODY_MAX_CHARS`(120자) / 실패면 "실패: <이유>". 누르면 메인 창을 앞으로 가져온다(`showMainWindow`). 녹음 기록 자동 정리의 알림도 이 파일을 쓴다.
- `Notification.isSupported()`가 거짓이면 로그만 남긴다. 알림 권한은 macOS가 처음 보낼 때 묻는다.

### IPC

| 키 | 채널 | 방향 | 요청 → 응답 |
| --- | --- | --- | --- |
| `routines.list` | `routines:list` | invoke | 없음 → `RoutinesState` |
| `routines.save` | `routines:save` | invoke | `RoutineInput` → `RoutinesState`. 형식이 틀리면 reject, 없는 id면 reject |
| `routines.delete` | `routines:delete` | invoke | `{ id }` → `RoutinesState` |
| `routines.run` | `routines:run` | invoke | `{ id }` → `RoutinesState`. 주기와 무관하게 지금 큐에 넣는다("지금 실행"). 꺼진 루틴도 된다 |
| `events.routinesChanged` | `routines:changed` | push | `RoutinesState` |

```ts
interface RoutinesState {
  routines: Routine[]
  /** 도는 루틴. 없으면 null */
  runningId: string | null
  queuedIds: string[]
}
```

### 화면 (`setting/RoutineSection`)

- 설정 페이지에서 `AssistantSettingSection` 바로 아래 **"루틴"** 묶음. 설명: 정해진 주기마다 작업 폴더에서 에이전트에게 프롬프트를 보낸다는 것, 앱이 켜져 있을 때만 돈다는 것, 프롬프트와 읽은 파일이 공급자 서버로 전송된다는 것.
- 작업 폴더가 없으면 한 줄 안내(루틴은 작업 폴더에서 돈다). 만들기는 막지 않는다.
- 루틴 행: 이름 · 주기 요약("매일 09:00", "월·수·금 09:00", "30분마다", "3시간마다") · 다음 실행(켜져 있을 때) · 마지막 실행(시각 · 완료 또는 실패와 이유) · 켜기 스위치 · "지금 실행"(돌면 "실행 중", 큐에 있으면 "대기 중"으로 비활성) · "고치기" · "삭제"(2단계 인라인 확인).
  마지막 답은 `<details>`로 펼친다(줄바꿈만 살린 평문, 바뀐 파일 목록).
- "루틴 추가"·"고치기"는 그 자리의 인라인 폼: 이름 · 프롬프트(textarea) · 주기 종류(라디오 "시각"/"간격") · 시각이면 요일 토글 7개(`aria-pressed`) + `<input type="time">`, 간격이면 숫자 + 단위(분/시간) · 저장/취소. 저장 실패는 폼 아래에 보인다. 새 루틴의 기본값은 평일 09:00이다.

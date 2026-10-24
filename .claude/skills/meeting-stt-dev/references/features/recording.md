# 기능 설계: 녹음

`references/architecture.md`에서 나눈 기능별 설계다. 프로세스 경계·디렉터리·IPC 규약 같은 공통 구조는 `references/architecture.md`에 있고,
다른 기능 문서의 절 이름은 그 문서의 "기능별 설계 문서" 목차에서 찾는다. 아래 `src/…`, `scripts/…`, `resources/…`는 모두 `apps/desktop/` 기준이다.

## 녹음본 재생·내보내기·다시 인식 (2026-09-25)

사용자 요청으로 "녹음본 재생은 요구사항 아님" 결정을 뒤집었다. **원본 WAV가 남아 있는 회의**(설정 `audio.keep`을 켠 뒤 녹음했거나, 파이프라인이 실패한 회의)에서만 동작한다.
보관 기본값(삭제)은 그대로다 — 디스크 사용량 판단은 바뀌지 않았다.

- **원본 유무**: `Meeting.hasAudio`(`audio_path IS NOT NULL`)로 renderer에 알린다. 목록 조회마다 파일을 `stat`하지 않는다 —
  경로는 있는데 파일이 사라진 경우는 재생 실패·다시 인식 실패(`status='error'`)로 드러난다.
- **재생**: 커스텀 프로토콜 `meeting-audio://recording/<meetingId>`를 `src/main/audio/playback.ts`가 처리한다.
  - `file://`을 쓰지 않는 이유: 개발 모드 renderer는 `http://localhost` 출처라 `file://`을 불러올 수 없고, renderer에 파일 경로를 노출하지 않기 위해서다.
    핸들러는 회의 ID만 받아 DB의 `audio_path`로 파일을 찾는다. 없는 회의·원본 없음은 404.
  - `<audio>`의 시킹은 `Range` 요청이다. 핸들러가 `Range: bytes=a-b`를 직접 해석해 `206` + `Content-Range`로 그 구간만 스트림한다 (파일 전체를 메모리에 올리지 않는다).
  - 스킴은 `app.whenReady()` **전에** `protocol.registerSchemesAsPrivileged`로 `standard·secure·stream·supportFetchAPI` 권한을 준다. renderer CSP에 `media-src 'self' meeting-audio:`를 더한다.
- **재생 UI**: 상세 본문의 **하단 고정 녹음 바**(`TranscriptSection/ui/RecordingBar`)에 `<audio>` 하나를 숨겨 두고, 브라우저 기본 `controls` 대신
  **디자인 토큰으로 그린 커스텀 플레이어**(재생/일시정지 버튼 + 현재 시각 + 시킹 슬라이더 + 전체 길이)를 쓴다 (2026-09-26 사용자 요청 — 기본 재생 막대는 "여백" 팔레트와 맞지 않는다).
  재생 상태는 `model/useAudioPlayer`가 `<audio>` 이벤트(`play`·`pause`·`timeupdate`·`durationchange`·`ended`·`error`)를 구독해 갖고, 슬라이더는 `<input type="range">`라 키보드로도 옮길 수 있다. 원본이 있으면 발화 행의 시각이 버튼이 되고, 누르면 그 발화의 `startSec`으로 이동해 재생한다.
  재생 중인 발화 강조는 범위 밖이다.
  - 바의 위치는 2026-09-26 사용자 요청으로 오른쪽 레일 패널에서 **본문 최하단**으로 옮겼다. 회의록·레일이 든 스크롤 영역(`.content`)의 **형제**로 그 아래에 두어
    좌우 전체 폭을 채우고, 회의록을 스크롤해도 창 바닥에 붙어 있다 (`position: sticky`가 아니라 `AppShellLayout`의 `main` flex 열에서 스크롤 영역 밖에 있기 때문이다).
    한 줄 가로 배치 — 제목·안내 문구 없이 플레이어가 남은 폭을 채우고, 오른쪽에 "WAV로 저장"·"다시 인식"만 둔다. 다시 인식 확인은 바 안에서 한 줄 더 펼친다.
- **내보내기**: `meetings:exportAudio`(invoke) → main이 `dialog.showSaveDialog`(메인 창에 붙은 시트)로 저장 위치를 받아 `copyFile`한다.
  기본 파일명은 `<회의 제목>.wav`(파일명에 못 쓰는 문자는 `_`). 응답 `{ isSaved }` — 사용자가 취소하면 `false`이고 오류가 아니다.
  저장 위치 선택은 확인 UI가 아니므로 "네이티브 대화상자 금지" 규칙(1절 확인 UI)의 대상이 아니다.
- **다시 인식**: `meetings:reprocess`(invoke, `{ meetingId, speakerCount: number | null }`) → 참석자 수를 저장하고(`null`이면 임계값 폴백)
  `status='processing'`으로 바꾼 뒤 파이프라인 잡을 큐에 넣는다. 응답은 편집 채널처럼 갱신된 `MeetingDetail`이다.
  - 거절 조건: 회의 없음, 원본 없음, `status`가 `recording`·`processing`(이미 처리 중이거나 줄 서 있음).
  - 성공하면 **회의록을 통째로 새로 만든다**: 발화 전체 교체 + **화자 행 전부 삭제 후 새 라벨로 생성**(새 군집의 라벨은 이전 라벨과 대응하지 않으므로 화자 이름이 초기화된다)
    + 자동 교정 결과(`refine_applied`·`refined_at`) 비움. 이후 자동 교정이 다시 돈다. **요약은 남긴다** — 같은 회의의 내용이고, 사용자가 원하면 다시 요약한다.
    이 교체는 한 트랜잭션이다 (`data-model.md` "다시 인식").
  - 실패하면 첫 처리와 같다 — `status='error'`, 원본 유지. 이전 회의록 행은 성공할 때까지 교체되지 않는다.
  - 성공 뒤에는 첫 처리와 같이 `audio.keep`을 적용한다. 보관을 끈 상태에서 실패 회의를 다시 시도해 성공하면 원본이 지워진다.
  - UI: 하단 녹음 바의 "다시 인식" → 2단계 인라인 확인(참석자 수 `Stepper` + "화자 이름·직접 고친 내용·교정 결과가 사라집니다" 안내).
    실패한 회의는 본문 오류 문구 아래 "다시 시도" 버튼(저장된 참석자 수 그대로, 확인 없음 — 잃을 회의록이 보이지 않는 상태다).
- 원본이 없는 회의의 녹음 바는 "원본 녹음을 보관하지 않아 재생·다시 인식을 할 수 없습니다"와 설정 안내만 보인다.

## 녹음 파일 관리 (2026-10-21)

사용자 요청으로 보관 중인 녹음 파일만 한곳에 모아 보고 지우는 화면을 둔다. `audio.keep`을 켜 두면 녹음이 쌓여(71분 ≈ 136MB) 디스크를 차지하는데,
지금은 회의마다 상세에 들어가 확인하거나 회의를 통째로 지우는 수밖에 없다.

- **지우는 것은 녹음 파일뿐이다.** 회의록(발화·화자·요약·교정 결과)은 남는다. 지운 회의는 `audio.keep`을 끈 채 처리된 회의와 같은 상태가 된다 —
  `hasAudio`가 거짓이고 재생·WAV 내보내기·다시 인식(실패 회의의 "다시 시도" 포함)을 할 수 없다. 회의까지 지우는 것은 기존 회의 삭제가 맡는다.
- **진입**: 설정 "녹음·처리" 카테고리의 "원본 녹음 파일 보관" 아래 행 하나 — 제목 "녹음 파일 관리하기", 설명, 오른쪽 보조 버튼 "관리" → `/recordings`.
  행은 링크만 그리고 데이터를 읽지 않는다(개수·용량은 전용 화면이 보여 준다). `SettingsSection`이 그대로 그린다.
- **전용 화면 `/recordings`** (`pages/Recordings` → `widgets/recording/RecordingFileSection`). 요약 템플릿 화면처럼 상단 바("설정으로" 버튼) + `h1` "녹음 파일 관리하기" 아래에 위젯 하나만 둔다.
  사이드바는 설정 하위 화면이므로 "설정"을 강조한 채로 둔다.
  - 맨 위 한 줄: "보관 중인 녹음 N개 · 총 X" (용량은 `shared/utils/formatBytes`).
  - 도구 줄: 전체 선택 체크박스 + "선택한 N개 삭제"(고른 것이 없으면 비활성).
  - 목록(최근 녹음 먼저): 행마다 체크박스 · 제목(글자만 — 회의 상세 페이지를 없앴으므로(2026-10-22 "옛 페이지 제거") 전체 기록 패널을 밖에서 열 수 있게 되면 링크로 바꾼다) · 녹음 날짜와 길이 · 파일 크기 · 상태 표시 · "삭제" 버튼.
    상태 표시는 처리 실패("처리 실패" — 지우면 다시 시도할 수 없다), 처리 중("처리 중" — 체크박스·삭제 **비활성**, 파이프라인이 파일을 읽고 있다), 파일 없음("파일 없음" — 지우면 기록만 정리된다)일 때만 보인다.
  - 확인은 **2단계 인라인 확인**(1절 확인 UI). 한 행 삭제는 그 행 안에서, 여러 개 삭제는 도구 줄 자리에서
    "N개(X)를 지울까요? 회의록은 남고 재생·내보내기·다시 인식을 할 수 없게 됩니다" + 삭제/취소로 펼친다. 지운 뒤에는 응답의 목록으로 화면을 바꾸고 선택을 비운다.
  - 빈 상태: "보관 중인 녹음 파일이 없습니다" + "원본 녹음 파일 보관을 끄면 회의록을 만든 뒤 녹음을 지웁니다" 안내.
- **IPC** (요청/응답 타입은 `src/shared/ipc.ts`, `MeetingAudioFile`은 `src/shared/types.ts` — `data-model.md` "녹음 파일 관리")

  | 키 | 채널 | 방향 | 요청 → 응답 |
  | --- | --- | --- | --- |
  | `meetings.listAudio` | `meetings:listAudio` | invoke | 없음 → `MeetingAudioFile[]` |
  | `meetings.deleteAudio` | `meetings:deleteAudio` | invoke | `{ meetingIds: string[] }` → `{ files: MeetingAudioFile[]; failedCount: number }` |

- **목록**: `audio_path`가 있는 회의 중 녹음 중(`status='recording'`)인 것을 뺀다 — 아직 녹음 파일이 확정되지 않았다. 파일 크기는 main이 `stat`으로 읽고, 파일이 없으면(`ENOENT`) `sizeBytes: null`이다.
  "목록 조회마다 `stat`하지 않는다"(위 "녹음본 재생·내보내기·다시 인식")는 회의 목록 이야기이고, 이 화면은 크기를 보여 주는 게 목적이라 읽는다.
- **삭제**: 회의마다 기존 `src/main/audio/recordings.ts`의 `discardRecording`을 부른다 — 파일을 먼저 지우고(`rm`, 없는 파일은 성공) 그 뒤 `audio_path`를 `NULL`로 만든다.
  순서를 거꾸로 하면 파일 삭제가 실패했을 때 DB가 가리키지 않는 파일이 화면에서 사라진 채 디스크에 남는다.
  - 거절(건너뛰고 `failedCount`에 센다): 회의 없음, 원본 없음, `status`가 `recording`·`processing`. 화면이 막아도 main이 다시 확인한다 — 화면을 연 뒤 다시 인식이 시작될 수 있다.
  - `rm`이 실패하면(권한 등) 경로를 그대로 두고 로그를 남긴 뒤 다음 회의로 넘어간다. 화면은 `failedCount > 0`이면 "N개를 지우지 못했습니다"를 보여 준다.
  - 응답의 `files`는 삭제 뒤 다시 읽은 목록이다 — 편집 채널처럼 renderer가 응답 하나로 화면을 맞춘다.
  - `meetings:changed`는 보내지 않는다. 사이드바는 `hasAudio`를 그리지 않고, 회의 상세는 들어올 때 다시 읽는다.
- 범위 밖: DB가 가리키지 않는 `recordings/`의 남은 파일 정리, 정렬·검색, 지운 녹음 되살리기.

## 녹음 파일 가져오기 (2026-09-25)

사용자 요청으로 앱 밖에서 녹음한 파일(음성 메모 m4a, 회의 녹화 mp4 등)로도 회의록을 만든다. 브라우저 프로토타입의 파일 입력과 같은 기능이지만
**디코딩은 renderer의 `decodeAudioData`가 아니라 main에서 macOS 내장 `afconvert`로 한다.**

- **왜 `afconvert`인가**: ffmpeg를 동봉하지 않는다는 결정(1절 음량 정규화)은 그대로다. 대상 플랫폼이 macOS 전용이라 시스템 바이너리 `/usr/bin/afconvert`(Core Audio)가 항상 있고,
  서명·다운로드·라이선스 부담이 없다. renderer에서 디코딩하면 1시간 파일의 Float32 PCM(약 230MB)을 IPC로 넘겨야 하고 "무거운 작업은 main" 원칙에도 어긋난다.
  경로는 `/usr/bin/afconvert`로 고정한다 (GUI 앱의 PATH를 믿지 않는다).
- **변환 명령**: `afconvert -f WAVE -d LEI16@16000 -c 1 --mix --no-filler <원본> <recordings/<meetingId>.wav>`.
  `--mix`는 스테레오를 한 채널로 섞고(없으면 채널을 버린다), `--no-filler`는 `FLLR` 패딩 청크를 뺀다.
- **헤더는 앱이 44바이트로 다시 쓴다** (2026-09-26). `afconvert`는 원본에 채널 레이아웃이 있으면(음성 메모처럼 **모노 AAC**가 대표적) 출력 WAV를
  `WAVE_FORMAT_EXTENSIBLE`(fmt 40바이트, 태그 `0xFFFE`, `data`가 68바이트 위치)로 쓰고, 스테레오를 섞은 경우에만 16바이트 fmt의 44바이트 헤더가 나온다.
  `afconvert`에는 이를 끄는 옵션이 없다(`-l` 태그로도 유지). 변환 결과를 **RIFF 청크를 순서대로 걸어** 읽고(`parseImportedWav`: fmt가 PCM 또는 서브포맷 PCM인
  EXTENSIBLE, 16kHz·mono·16bit인지 확인), `data`가 44바이트 위치가 아니면 **PCM 본문을 새 44바이트 헤더 뒤로 스트림 복사해 같은 경로로 바꾼다**
  (`rewriteWithCanonicalHeader`, 임시 파일 → `rename`). 정규화의 `readWavPcm`이 `0xFFFE` 태그를 거부하고 sherpa-onnx의 WAV 리더도
  EXTENSIBLE을 보장하지 않으므로, 이후 단계(정규화·whisper·sherpa·재생·내보내기)가 **녹음한 회의와 똑같은 44바이트 헤더**만 보게 만드는 쪽이
  각 단계를 고치는 것보다 안전하다. 1시간 녹음(약 115MB)의 복사는 1초 안쪽이라 변환 시간에 묻힌다.
- **받는 형식**: `m4a mp3 wav aac aif aiff caf flac mp4 mov` (2026-09-25 실측, 영상 파일은 오디오 트랙만 읽는다). webm·ogg(Opus/Vorbis)는 `afconvert`가 못 읽어 목록에서 뺀다.
  확장자는 열기 대화상자의 필터일 뿐이고, 실제로 못 읽으면 변환 실패 안내로 끝난다.
- **흐름** (`src/main/audio/importRecording.ts`):
  1. `dialog.showOpenDialog`(메인 창 시트, 파일 하나) — 취소하면 `{ meeting: null }`, 오류 아님. 열기 대화상자는 확인 UI가 아니므로 "네이티브 대화상자 금지"의 대상이 아니다.
  2. 회의 ID를 정하고 `afconvert`로 변환. 실패하면 반쯤 쓴 출력 파일을 지우고 안내 문구를 던진다. **회의 행은 변환이 성공한 뒤에 만든다** — 못 읽은 파일로 빈 오류 회의가 목록에 남지 않는다.
  3. WAV 헤더의 `data` 크기로 길이를 계산한다. `MIN_RECORDING_SEC`(1초) 미만이면 녹음과 같은 "너무 짧음" 오류로 끝낸다(파일은 남기지 않는다).
  4. `insertMeeting` → `duration_sec`·참석자 수 저장 → `status='processing'` → 파이프라인 잡 큐. 큐에서 기다리는 동안 사이드바가 "녹음 중"이 아니라 처리 대기로 보이도록 바로 `processing`으로 둔다.
- **제목**은 파일 이름(확장자 제외, 200자까지)이고 비어 있으면 녹음과 같은 기본 제목. **생성 시각**은 가져온 시각이다 — 파일의 수정 시각은 복사·동기화로 쉽게 바뀌어 녹음 날짜를 보장하지 않는다.
- **참석자 수**는 녹음 화면 스테퍼의 값, 즉 main 녹음 세션의 보관값을 그대로 쓴다. 같은 화면의 입력이 녹음과 가져오기에 함께 적용되고, 값의 출처는 여전히 하나다.
- **원본 파일은 건드리지 않는다.** 앱이 관리하는 것은 변환한 WAV뿐이고 `audio.keep` 보관 정책도 그 WAV에만 적용된다.
- 녹음 중에도 가져올 수 있다 — 변환은 짧고, 파이프라인은 큐가 순서대로 처리한다. 다만 UI는 녹음 중에 버튼을 비활성으로 둔다(아래).
- **IPC**: `meetings:import`(invoke, payload 없음) → `ImportMeetingAudioResponse = { meeting: Meeting | null }`.
- **UI**: ~~녹음 화면의 옵션 패널 행(`features/meeting/ImportAudioButton`)~~ → **2026-10-22 채팅창 리뉴얼부터** 채팅의 `/` 명령 "파일로 기록 만들기"와 처음 실행의 칩이 `shared/hooks/domain/meeting/useAudioImport`의 `importAudio`를 부른다 (아래 "채팅 창의 녹음").
  녹음 중에는 비활성(`useRecordingState`로 판단). 변환 중에는 "가져오는 중…", 성공하면 이동 없이 입력창 위 최근 녹음 줄 맨 앞에 그 기록(처리 중)이 생기고, 실패 문구는 입력 도크 위 안내 줄에 빨간 글자로 쓴다.
- **범위 밖**: 창에 파일을 끌어다 놓기, 여러 파일 한 번에 가져오기. 필요해지면 같은 `importRecording`에 경로를 넘기는 채널을 더한다.

## 녹음 (renderer)

**오디오 그래프의 소유자는 위젯 패널 창 하나뿐이다** (Phase 5-3, 아래 절). 메인 창은 녹음을 시작·정지하는
명령만 보내고 상태는 `recording:state`로 받는다. 아래 규칙은 그래프를 실제로 만드는 쪽(위젯)에 적용된다.

- `getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, deviceId? } })`.
  `deviceId`는 설정 `audio.inputDevice`가 있을 때만 `{ ideal: deviceId }`로 붙인다 (아래 "마이크 입력 장치와 테스트" 절).
  제약 객체는 `@renderer/shared/utils/microphone` 한 곳에서 만들고(`buildMicrophoneConstraints`·`openMicrophone`) 녹음·마이크 테스트가 같이 쓴다.
- `new AudioContext({ sampleRate: 16000 })` → `audioWorklet.addModule(workletUrl)` → 프로세서가 128프레임 단위로 받은 Float32를 `CHUNK_SAMPLES`(8192, 약 0.5초)씩 모아 `port.postMessage`.
- **워크릿 파일은 `src/renderer/src/worklet/pcmRecorder.js`에 두고 `import workletUrl from '@renderer/worklet/pcmRecorder.js?url'`로 로드한다.**
  `resources/` 아래에 두면 Vite 개발 서버가 서빙하지 않고 패키징 시에도 `process.resourcesPath`로 흩어져 renderer가 URL로 접근할 수 없다.
  `?url`은 개발 모드에서는 dev 서버 경로를, 빌드에서는 `out/renderer/assets/`에 복사된 경로를 준다.
  단 Vite는 작은 에셋을 `data:` URL로 인라인하는데, renderer의 CSP가 `script-src 'self'`라 인라인되면 `addModule`이 차단된다.
  `electron.vite.config.ts`의 renderer `build.assetsInlineLimit`에서 워크릿만 인라인 대상에서 빼 **항상 파일로 내보낸다**.
- 레벨 미터는 별도 `AnalyserNode`를 붙이지 않고 **main이 `recording:chunk`로 받은 청크의 RMS**를 계산해
  `recording:state`에 실어 보낸다 (노드를 하나 덜 만들고, 위젯과 메인 창이 같은 값을 본다).
  RMS 계산은 `src/shared/audio.ts`의 순수 함수로 두고 vitest로 검증한다.
- 정지 시 `IPC.recording.stop` → main이 WAV 헤더를 확정하고 파이프라인 잡을 큐에 넣는다.
- **참석자 수(1~`MAX_SPEAKER_COUNT`=20, 정수)는 main의 녹음 세션이 들고 있는다.** 위젯과 메인 창 양쪽에 입력란이 있어
  값의 출처가 둘이 되므로, 입력이 바뀔 때마다 `recording:setSpeakerCount`로 main에 보내고 `recording:state`로 양쪽을 동기화한다.
  정지 시점에는 main이 보관값을 `meetings.speaker_count`에 저장해 화자 분리의 `num-clusters`로 쓴다.
  `StopRecordingRequest`에는 `speakerCount`를 싣지 않는다 — 두 경로가 생기면 "어느 쪽 값이 이겼는지"를 따져야 한다.
  비우면 임계값 폴백이며, 그 경우 화자가 과분할될 수 있다고 입력란 옆에 안내한다.
- Float32 → Int16 PCM 변환은 main의 `audio/wavWriter.ts`에서 수행 (renderer는 원본 Float32 `ArrayBuffer`만 전달).
- 샘플레이트·청크 크기 상수는 `src/shared/audio.ts`에 한 번만 정의해 renderer와 main이 함께 쓴다.
- `AudioContext`가 16kHz 요청을 무시할 수 있으므로 실제 `context.sampleRate`를 확인해 다르면 녹음을 시작하지 않고 안내한다 (`references/pitfalls.md`).

### 마이크 입력 장치와 테스트 (2026-09-25)

사용자 요청으로 설정 화면에 **입력 장치 선택**과 **마이크 테스트**를 둔다. 회의 직전에 "어느 마이크로, 소리가 들어오고 있는지"를
녹음을 시작하지 않고 확인하기 위해서다.

- **입력 장치는 `AppSettings.inputDevice`** (`{ deviceId, label } | null`, DB 키 `audio.inputDevice`, 기본 `null` = 시스템 기본 마이크)다.
  새 IPC 채널을 만들지 않는다 — 장치 목록은 renderer의 `navigator.mediaDevices.enumerateDevices()`가 주고, 값은 다른 설정과 함께 `settings:update`로 오간다.
  `label`을 함께 저장하는 이유는 장치를 뺀 뒤에도 설정 화면이 "무엇을 골라 뒀는지"를 보여주기 위해서다 (`deviceId`는 해시라 사람이 읽을 수 없다).
- **녹음 그래프는 시작할 때 설정을 읽어** `deviceId: { ideal }`로 요청한다. `exact`를 쓰지 않는다 — 골라 둔 마이크가 빠져 있으면
  녹음 자체가 실패하는 것보다 시스템 기본 마이크로 녹음되는 편이 낫다. 설정 화면의 설명 문구에 이 폴백을 적는다.
  Chromium의 `deviceId`는 origin별 해시이고 기본 세션(persist)에 소금이 저장되므로 앱을 다시 켜도 같은 값이다.
- **장치 목록**은 `useInputDevices`(domain 훅)가 `audioinput`만 골라 든다. Chromium의 `default`·`communications` 가상 항목은 뺀다 —
  "시스템 기본 마이크" 선택지(`null`)가 그 역할이다. 라벨이 비어 있으면(권한 전) `requestMicrophonePermission` 뒤 짧게 `getUserMedia`를 열었다 닫아 라벨을 받고,
  그래도 비면 `마이크 N`으로 표기한다. `devicechange` 이벤트로 목록을 다시 읽는다. 저장된 장치가 목록에 없으면 `"<label> (연결되지 않음)"`을 비활성 선택지로 보여준다.
  main은 `session.setPermissionCheckHandler`에서 `media`를 허용한다 — Chromium이 라벨을 줄지 결정할 때 이 핸들러를 본다.
- **마이크 테스트는 메인 창(설정 화면)에 짧게 사는 별도 그래프**다. "오디오 그래프 소유자는 위젯 창 하나"라는 규칙은 **녹음 그래프**에 대한 것이고,
  테스트 그래프는 청크를 보내지 않고 세션도 만들지 않는다. 구성은 `getUserMedia(같은 제약) → AudioContext(16kHz) → MediaStreamSource → AnalyserNode → gain 0 → destination`이며
  100ms마다 `getFloatTimeDomainData`의 RMS(`@shared/audio`의 `rmsOf`)를 `level`로 들고 레벨 미터(`LevelWaveform`)에 넘긴다.
  16kHz 확인·권한 요청은 녹음과 같은 경로를 타므로 **녹음이 실패할 환경이면 테스트도 같은 안내로 실패한다** — 그것이 테스트의 목적이다.
  - 녹음 중에는 테스트 버튼을 막는다 (마이크를 두 그래프가 잡아도 되지만 사용자가 헷갈린다). 장치 선택을 바꾸면 테스트를 정지한다.
  - 3초 넘게 피크가 `0.01` 아래면 "소리가 거의 잡히지 않습니다. 음소거되었거나 다른 장치가 선택됐을 수 있습니다"를, 그 위면 "소리가 잘 들어옵니다"를 보여준다.
  - 컴포넌트 언마운트·페이지 이탈 시 그래프를 닫는다 (`useEffect` cleanup).
- 화면은 설정 카테고리 **"마이크"** 하나에 두 행(입력 장치 select, 마이크 테스트 버튼 + 파형)이다. 훅은 `useInputDevices`·`useMicrophoneTest`
  (`shared/hooks/domain/recording`), 행 컴포넌트는 `SettingsSection/ui/{InputDeviceSelect,MicrophoneTest}.tsx`다.

## 녹음 위젯 패널 (Phase 5-3)

회의 중에 앱 창을 앞으로 꺼내지 않고도 녹음을 시작·정지하고, 녹음 중이라는 사실과 경과 시간을 항상 볼 수 있게 한다.
구성은 **화면 우측에 떠 있는 플로팅 패널 + 메뉴바(Tray) 시간 표시 + 전역 단축키** 세 가지다.

### macOS WidgetKit 위젯을 만들지 않는 이유

알림 센터·데스크탑에 놓는 진짜 macOS 위젯은 SwiftUI로 작성한 **앱 확장(Widget Extension)** 이어야 한다.
Electron 번들에 Xcode로 따로 빌드한 확장을 끼워 넣고 App Group으로 상태를 공유하는 편법이 있지만,
확장마다 별도 서명·notarization 대상이 늘고(`references/distribution.md` 6절), 녹음 상태를 프로세스 밖으로 한 번 더
복제해야 하며, 버튼 동작은 `AppIntent`로 호스트 앱을 깨우는 우회가 필요하다. 얻는 것은 외형뿐이라 채택하지 않는다.
**"위젯"은 이 문서에서 항상 아래의 Electron 플로팅 패널을 가리킨다.**

### 창 속성과 배치

| 속성 | 값 | 이유 |
| --- | --- | --- |
| `frame` | `false` | 제목 표시줄 없는 패널. 드래그는 `-webkit-app-region: drag` 영역으로 |
| `type` | `'panel'` | 다른 앱 위에 뜨면서 **키 입력 포커스를 뺏지 않는다**. 회의 중 타이핑을 방해하면 안 된다 |
| `alwaysOnTop` | `true` (`setAlwaysOnTop(true, 'floating')`) | 브라우저·화상회의 창 위에 유지 |
| `visibleOnAllWorkspaces` | `{ visibleOnFullScreen: true }` | 화상회의를 전체화면으로 쓰는 경우가 많다 |
| `resizable` / `maximizable` | `false` | 고정 크기. 레이아웃 분기를 만들지 않는다 |
| `skipTaskbar` | `true` | Dock·앱 전환기에 창이 두 개로 보이지 않게 |
| `vibrancy` | `'popover'` | 네이티브 패널 질감. 배경색을 직접 칠하지 않는다. `'hud'`는 시스템 테마와 무관하게 어두운 재질이라 라이트 모드의 어두운 글자와 겹쳐 색이 깨진다 |
| `visualEffectState` | `'active'` | 기본값(`followWindow`)은 창 포커스에 따라 재질이 바뀐다. 패널은 대부분 비활성 상태라 포커스를 받을 때마다 색이 튄다 |
| 비활성 시 불투명도 | 포커스를 잃으면 `setOpacity(widgetFadeOpacity)`, 받으면 `1` | 회의 화면을 가리는 느낌을 줄인다. `showInactive`로 뜨므로 처음부터 반투명으로 시작한다. 설정 `widget.fade`(기본 켜짐)로 끄면 항상 `1`, 값은 `widget.fadeOpacity`(기본 0.55, 0.2~0.95) |
| `backgroundThrottling` | **`false`** | 숨겨지거나 가려진 창은 타이머·메시지 처리가 throttling된다. 그래프 소유자가 이 창이라 필수 |

- 위치는 `screen.getPrimaryDisplay().workArea` 기준으로 **우측 가장자리에 여백을 두고 세로 중앙**에 놓는다.
  `bounds`가 아니라 `workArea`를 써야 메뉴바·Dock을 침범하지 않는다. 디스플레이 구성이 바뀌면(`screen`의 `display-metrics-changed`) 다시 계산한다.
- 사용자가 패널을 옮기면 그 위치를 기억한다. 저장은 `settings` 테이블(`widget.bounds`)에 두고, 저장된 위치가
  현재 디스플레이 밖이면 버리고 기본 위치로 되돌린다 (외장 모니터를 뺀 뒤 화면 밖에 남는 것을 막는다).

### 라우트와 창 구성

- 위젯은 **별도 HTML 엔트리를 만들지 않고** 같은 `index.html`의 해시 라우트 `#/widget`으로 띄운다
  (`loadFile(..., { hash: '/widget' })` / 개발 모드는 `loadURL(url + '#/widget')`). **해시에 앞의 `/`를 빼면 `#widget`이 되어 라우트가 맞지 않는다**. `createHashRouter`를 쓰기 때문에 가능하고,
  `electron.vite.config.ts`의 rollup input을 건드리지 않아 빌드 구성이 그대로다.
- `/widget`은 `RequireModels` 가드 **밖**에 둔다. 가드 안에 두면 모델이 없을 때 위젯 창에 온보딩 화면이 뜬다.
  대신 위젯이 `models:status`를 직접 조회해 준비 전이면 시작 버튼을 막고 "메인 창에서 모델을 먼저 준비해 주세요"를 보여준다.
- 메인 창 참조를 `windows/main.ts`가 들고 있어야 한다. 기존 `BrowserWindow.getAllWindows()[0]` 방식은 위젯이 0번이 될 수 있어
  **`app.on('activate')`의 재생성 조건과 `second-instance`의 포커스 대상이 깨진다.** 두 곳 모두 "메인 창이 없거나 파괴됐는지"로 바꾼다.
- 창이 둘이므로 진행률·업데이트 브로드캐스트(`broadcast`)는 그대로 두 창에 간다. 위젯은 자기가 쓰지 않는 이벤트를 구독하지 않으면 그만이다.

### 녹음 상태의 단일 출처

녹음이 두 창에서 보이므로 **진행 중 녹음의 상태는 main의 세션(`src/main/audio/session.ts`)이 단일 출처**가 된다.

```ts
export interface RecordingStateEvent {
  meetingId: string | null
  /**
   * 경과 시간의 기준 시각(epoch ms) = 실제 시작 시각 + 지금까지 일시정지한 시간.
   * 경과 시간은 받는 쪽이 (pausedAt ?? Date.now()) - startedAt으로 계산한다 — 창마다 값이 어긋나지 않는다
   */
  startedAt: number | null
  /** 일시정지한 시각(epoch ms). 녹음 중이 아니거나 일시정지하지 않았으면 null */
  pausedAt: number | null
  /** 직전 청크의 RMS (0~1). 청크 주기(약 0.5초)로만 갱신된다 */
  level: number
  /** 세션에 보관 중인 참석자 수. 두 창의 입력란을 같은 값으로 맞춘다 */
  speakerCount?: number
  /** 녹음 노트 (2026-10-21, 아래 "녹음 노트"). 녹음 전 초안 또는 진행 중 회의의 노트. 정지하면 빈 문자열로 돌아간다 */
  note: string
  /** 정지가 끝난 순간 한 번만 실린다. 메인 창이 채팅(`/`)으로 가서 이 회의의 기록 카드를 보여 준다 (2026-10-22, 아래 "채팅 창의 녹음") */
  stoppedMeetingId?: string
  /**
   * 시작·정지가 실패한 순간 한 번만 실린다. 마이크 권한 거부나 그래프 생성 실패는 위젯에서만 일어나는데,
   * 시작을 누른 사람은 메인 창에 있을 수 있다. 실패를 세션에 모아 두 창이 같은 안내를 본다
   */
  errorMessage?: string
}
```

- **경과 시간을 이벤트로 보내지 않는다.** `startedAt`만 주고 각 창이 계산하면 IPC 횟수가 늘지 않고, 창이 가려져 렌더가 밀려도 값이 정확하다.
- 창이 새로 열렸을 때를 위해 조회 채널 `recording:state`(invoke)를 함께 둔다. 이벤트만 있으면 늦게 연 창이 현재 상태를 모른다.
- 전역 단축키·Tray 메뉴로 녹음을 시작하려면 main이 위젯에 지시해야 한다 (`getUserMedia`는 renderer에만 있다).
  이 방향의 push 채널이 `recording:command`(`{ kind: 'start' | 'stop' | 'toggle' }`)다. 위젯이 그래프를 만든 뒤 평소처럼 `recording:start`를 invoke한다.
  main → renderer → main으로 한 바퀴 도는 모양이지만, 마이크 접근이 renderer 전용이라 피할 수 없다.
- **메인 창의 시작·정지 버튼도 같은 경로를 탄다.** 메인 창은 `recording:control`(invoke)로 main에 요청하고,
  main이 위젯에 `recording:command`를 push한다. 메인 창이 `recording:start`를 직접 부르면 그래프 없는 녹음이 시작돼
  빈 WAV가 남는다.
- **위젯 창은 `widget.enabled`와 무관하게 항상 만든다.** 이 창이 오디오 그래프의 소유자라, 창이 없으면 전역 단축키로도
  녹음할 수 없다. 설정은 **보이는지 여부만** 정한다 (숨은 창이 그래프를 들고 있어도 되는 이유가 `backgroundThrottling: false`다).
- **참석자 수 보관값은 정지 후에도 남는다.** 다음 녹음이 같은 값으로 시작하지만 두 창의 입력란에 계속 보이므로 숨은 상태가 아니다.
  세션마다 지우면 위젯에서 시작 → 메인 창에서 입력하는 흐름이 매번 초기화된다.

### 일시정지·재개 (2026-09-26)

사용자 요청으로 녹음을 멈췄다가 같은 회의로 이어 녹음할 수 있게 한다. 쉬는 시간·잡담처럼 회의록에 남기지 않을 구간을 빼는 용도다.

- **일시정지는 main 세션이 청크를 버리는 것으로 구현한다.** 위젯의 오디오 그래프는 그대로 돌고 청크도 계속 오지만,
  세션이 일시정지 상태면 WAV에 쓰지 않는다. 위젯에 새 명령(`recording:command`)을 보내지 않으므로 main → 위젯 → main 왕복이 없고,
  상태의 단일 출처가 여전히 세션 하나다. 마이크 사용 표시는 계속 켜져 있다 — 재개할 때 그래프를 다시 만들며 생기는 지연·권한 재확인을 피하는 값이다.
- 일시정지 중에는 시스템 오디오 버퍼도 같은 길이만큼 **꺼내서 버린다**(`take`). 버리지 않으면 재개 직후 멈춰 있던 동안의 상대방 소리가 섞여 들어간다.
  라이브 받아쓰기에는 넣지 않고, 레벨은 0으로 보낸다.
- 일시정지 구간은 WAV에 없으므로 **회의 길이(`duration_sec`)와 발화 타임스탬프는 녹음된 구간만 센다.** 이어 붙인 경계에 표시를 남기지 않는다.
- 경과 시간: 세션은 `pausedAt`을 들고, 재개할 때 `startedAt`을 멈춰 있던 시간만큼 뒤로 민다. 그래서 받는 쪽 계산식은
  `(pausedAt ?? Date.now()) - startedAt` 하나이고 누적 일시정지 시간을 따로 보내지 않는다. 회의 행의 `created_at`은 실제 시작 시각 그대로다.
- 요청은 `recording:setPaused`(`{ isPaused }`, 응답은 바뀐 녹음 상태) 하나다. 녹음 중이 아니면 오류, 이미 같은 상태면 그대로 돌려준다. 정지는 일시정지 중에도 할 수 있다.
- UI: 메인 창 녹음 화면과 위젯 패널의 정지 버튼 **왼쪽**에 **아이콘만 있는 원형 버튼**(`pause` ↔ `play`, `aria-label`로 "일시정지"/"재개")을 둔다.
  `Button` primitive의 `secondary`를 쓰고 지름은 옆 정지 버튼 높이와 같게 한다(녹음 화면 52px, 위젯 44px) — 따로 그린 버튼은 디자인 시스템과 어긋난다.
  상태 문구는 "일시정지됨"으로 바꾸고, 메뉴바 제목은 `‖ 12:34`로 멈춘 시간을 보여 준다. 트레이 메뉴·전역 단축키에는 추가하지 않는다.

### 메뉴바 (Tray)

- 아이콘은 `resources/trayTemplate.png`(+`@2x`). 파일명이 `Template`으로 끝나야 macOS가 다크/라이트에 맞춰 반전한다.
- 아이콘 원본은 SVG다: 앱 아이콘 `build/icon.svg`(→ `build/icon.{icns,png,ico}`, `resources/icon.png`), 메뉴바 `build/trayTemplate.svg`(→ 28×22 · 56×44 PNG).
  PNG·icns는 손으로 고치지 않고 SVG에서 다시 렌더링한다 (`rsvg-convert` + `iconutil`).
- 녹음 중에는 `tray.setTitle('● 12:34')`로 경과 시간을 1초마다 갱신하고, 녹음 중이 아니면 제목을 비워 아이콘만 남긴다.
  타이머는 **녹음 중에만** 돌리고 정지 시 `clearInterval`한다.
- 트레이 메뉴: 녹음 시작/정지 · 받아쓰기 시작/정지 · 마지막 받아쓰기 복사(결과가 있을 때만 활성, 2026-10-11 `references/features/dictation.md` "받아쓰기" 절) · 위젯 표시/숨김 · 메인 창 열기 · 종료.

### 전역 단축키

- 기본값은 `⌥⌘R` 회의 녹음 토글, `⌥⌘M` 메모 녹음 토글(2026-10-21, `references/features/assistant.md` "녹음 기록 자동 정리" > "녹음 종류" 절), `⌥⌘W` 위젯 표시/숨김, `⌥⌘D` 받아쓰기 토글(2026-10-11, `references/features/dictation.md` "받아쓰기" 절). `app.whenReady` 이후 등록하고 `will-quit`에서 `unregisterAll`한다.
- **앱 시작 시 등록 실패(다른 앱이 선점)는 앱을 멈추지 않는다.** `globalShortcut.register`의 반환값이 거짓이면 경고 로그만 남기고 진행한다.
  단축키가 없어도 패널과 트레이로 모든 동작을 할 수 있다.
- **설정 화면에서 바꿀 수 있다** (2026-09-24 사용자 요청으로 "고정값" 결정을 뒤집음). 값은 Electron accelerator 문자열로
  `shortcut.recording` / `shortcut.widget` / `shortcut.dictation`에 저장한다.
  - 허용 형식은 `src/shared/shortcut.ts`의 `isValidAccelerator` 하나가 정한다: 수식키 `Control`·`Alt`·`Shift`·`Command` 중
    `Control`·`Alt`·`Command`가 **하나 이상**(Shift만으로는 일반 타이핑과 겹친다) + 키 하나(`A`~`Z`, `0`~`9`, `F1`~`F24`, `Space`, 방향키,
    기호 키 `` ` `` `-` `=` `[` `]` `\` `;` `'` `,` `.` `/`). **기능키(`F1`~`F24`)는 글자를 치지 않으므로 수식키 없이 혼자서나 Shift와만 써도 된다**
    (2026-10-17 사용자 요청 "단축키 마음대로").
    renderer의 키 입력 변환(`KeyboardEvent.code` 기준 — `key`는 ⌥ 조합에서 특수문자가 된다)과 main의 검증이 같은 함수를 쓴다.
    기호 키도 `code`(US 배열 물리 키)로 읽어 Electron accelerator의 한 글자 이름으로 적는다.
  - **단축키를 끌 수 있다** (2026-10-17 사용자 요청). 빈 문자열 `''`이 "꺼짐"이고 등록하지 않는다. 저장·읽기 검증은 `isValidShortcut`(꺼짐 또는 `isValidAccelerator`)이다.
    설정 행의 "끄기" 버튼으로 끄고, "기본값으로"가 되살린다. 꺼진 단축키끼리는 "서로 같음"으로 치지 않는다.
    단축키를 보여주는 안내 문구(녹음 화면 힌트, 받아쓰기 사용법)는 꺼져 있으면 키 없이 쓴다.
  - 저장 순서: 검증 → 켜진 단축키 중 둘이 같으면 거절 → **등록을 먼저 시도하고 실패하면 이전 단축키로 되돌린 뒤 한국어 오류를 throw** → 성공했을 때만 DB에 쓴다.
    앱 시작과 달리 설정 변경에서는 실패를 삼키지 않는다 — 사용자가 방금 고른 키가 동작하지 않는 걸 모르면 안 된다.
  - **입력받는 동안은 전역 단축키를 해제한다** (`shortcuts:setSuspended`). 해제하지 않으면 현재 단축키를 누르는 순간 녹음이 시작된다.
    입력이 끝나거나(확정·Esc·포커스 이탈) 설정 화면이 언마운트되면 복구한다.
  - 안내 문구의 단축키 표기는 `formatAccelerator`(`⌥⌘R`)로 현재 설정값을 보여준다. 설정을 모르는 화면은 키를 적지 않고 "전역 단축키"라고만 쓴다.

### 설정

`AppSettings`에 `isWidgetEnabled`(DB 키 `widget.enabled`, **기본 켜짐**)를 추가한다. 끄면 앱 시작 시 패널을 띄우지 않고
`⌥⌘W`로도 열리지 않는다. 트레이와 단축키는 패널과 독립적으로 동작한다 — 패널을 껐다고 녹음 토글까지 사라지면 안 된다.

같은 설정 화면에 위젯 반투명(`isWidgetFadeEnabled`, 기본 켜짐)·비활성 불투명도(`widgetFadeOpacity`, 슬라이더)와
두 전역 단축키(`recordingShortcut`, `widgetShortcut`)를 둔다. 불투명도는 저장 즉시 `windows/widget.ts`의 `applyWidgetOpacity`로 반영하고,
단축키는 위 "전역 단축키" 절의 저장 순서를 따른다.

설정 화면은 **카테고리별로 묶는다** (2026-09-24 사용자 요청). 항목이 늘어 한 줄 나열로는 찾기 어려워졌기 때문이다.
페이지 제목(`h1` "설정")은 `pages/Settings`가 갖고, 각 카테고리는 `h2` 제목을 가진 `section`이다.

| 순서 | 카테고리 | 항목 | 위치 |
| --- | --- | --- | --- |
| 1 | 화면 | 테마(`theme`, 시스템 / 라이트 / 다크, 2026-09-28, `references/features/ui.md` "다크 모드" 절). 자주 바꾸는 항목이라 맨 위에 둔다 (2026-09-29 사용자 요청) | `SettingsSection` |
| 2 | 마이크 | 입력 장치(`inputDevice`), 마이크 테스트 (2026-09-25, 위 "마이크 입력 장치와 테스트" 절) | `SettingsSection` |
| 3 | 녹음·처리 | 원본 녹음 파일 보관(`isAudioKept`), 녹음 파일 관리하기("관리" 버튼 → `/recordings`, 2026-10-21, 위 "녹음 파일 관리" 절), 조용히 처리(`isQuietProcessing`) | `SettingsSection` |
| 4 | 녹음 위젯 | 위젯 패널(`isWidgetEnabled`), 위젯 반투명(`isWidgetFadeEnabled`), 비활성 불투명도(`widgetFadeOpacity`) | `SettingsSection` |
| 5 | 단축키 | 녹음 시작·정지(`recordingShortcut`), 위젯 표시·숨김(`widgetShortcut`), 받아쓰기 시작·정지(`dictationShortcut`, 2026-10-11), 새 대화(`newChatShortcut`, 2026-10-22 — 전역이 아니라 채팅 창 안, `features/ui.md` "채팅창 리뉴얼") | `SettingsSection` |
| 6 | 받아쓰기 | 사용법 한 줄(현재 단축키 표기), 접근성 권한 상태와 시스템 설정 열기 (2026-10-11, `references/features/dictation.md` "받아쓰기" 절) | `setting/DictationSection` (자기 채널 `dictation:state`로 읽는다. 용어 사전처럼 `children`으로 끼운다) |
| 7 | 음성 인식 모델 | 음성 인식 모델 변경 | `ModelDownloadSection` (온보딩과 공유) |
| 8 | 요약 · 용어 초안 | 실행 방식(로컬 / Claude API 키 / Claude Code / OpenAI API 키), 로컬을 골랐을 때만 **로컬 요약 모델 파일** 다운로드, API 키(공급자별), GPT 모델 선택, CLI 상태, 연결 확인 | `setting/LlmSection` — 파일 다운로드 행 `model/SummaryModelSection`은 페이지가 `localModelSlot`으로 끼운다 (`references/features/llm.md` "LLM 공급자" 절). 2026-09-24까지는 "모델" 카테고리에 음성 인식 모델과 나란히 있었는데, 로컬 실행 방식의 부속품이 별개 설정처럼 보여 옮겼다 |
| 9 | 요약 템플릿 | 만든 템플릿 수 + "템플릿 관리" 버튼 → 전용 페이지 `/summary-templates`로 이동 (2026-09-29, 아래 "요약 템플릿 > 화면" 절) | `setting/SummaryTemplateSection` (자기 채널로 목록만 읽는다. 용어 사전과 같이 `children`으로 끼운다) |
| 10 | 용어 사전 | 팀 소개, 초안 만들기, 용어 목록 (Phase 5-4) | `setting/GlossarySection` (자기 채널로 따로 읽고 쓰므로 `SettingsSection`의 한 번 로드와 무관하다. 모델 위젯과 같이 `children`으로 끼운다) |
| 11 | 업데이트 | 업데이트 확인(`isUpdateCheckEnabled`), 지금 확인(`UpdateCheck`) | `SettingsSection` |
| 12 | 언어 | UI 언어(`locale`, 한국어 / 영어, 2026-09-25, `references/features/ui.md` "UI 언어" 절) | `SettingsSection` |

- 설정값 로드는 한 번만 한다. 그래서 `SettingsSection`이 1~5와 11·12를 모두 그리고, 6~10은 `children`으로 받아 5와 11 사이에 끼운다.
  페이지는 `<SettingsSection><DictationSection /><SettingGroup title="음성 인식 모델"><ModelDownloadSection /></SettingGroup><LlmSection localModelSlot={<SummaryModelSection />} /><SummaryTemplateSection /><GlossarySection /></SettingsSection>` 형태로 배치만 한다.
  widgets는 widgets를 import하지 않으므로(`.claude/rules/component-abstract-pattern.md`) `SummaryModelSection`은 페이지가 슬롯으로 넘긴다.
- **오른쪽에 목차(TOC)를 둔다** (2026-09-24 사용자 요청). 카테고리가 7개(지금은 8개)로 늘어 스크롤로 찾기 어려워졌기 때문이다.
  목차는 composite `PageToc`가 스크롤 영역 안의 `h2`를 **DOM에서 읽어** 만든다 — 카테고리가 여러 위젯에 흩어져 있고
  설정 로드 전후로 개수가 달라지므로, 제목 목록을 따로 들고 있으면 순서·문구가 어긋난다. `MutationObserver`로 다시 읽는다.
  항목을 누르면 그 카테고리로 부드럽게 스크롤하고, 스크롤 위치에 맞는 항목을 강조한다(`aria-current`).
  창이 좁으면(본문 + 목차가 들어가지 않으면) 목차를 숨긴다.

## 시스템 오디오 캡처 (Phase 5-2, 2026-09-26)

온라인 회의(Zoom·Meet·Teams·브라우저)의 **상대방 목소리는 마이크가 아니라 스피커로 나온다.** 이를 회의록에 넣으려면 스피커로 나가는 소리를
앱이 직접 잡아야 한다. 사용자 결정: **앱 밖에서 해야 하는 설정은 두지 않는다** — BlackHole 같은 가상 오디오 드라이버 설치·집계 장치 구성을 안내하는 방식은 쓰지 않는다.

### 방식: Core Audio Taps + 동봉 Swift 도구

- macOS 14.2+의 **Core Audio Taps**(`CATapDescription` + `AudioHardwareCreateProcessTap`)를 쓴다. 권한은 **"시스템 오디오 녹음"** 하나뿐이고
  화면 녹화 권한·보라색 화면 녹화 표시가 없다. 대상 플랫폼(macOS 14+)과 거의 겹친다 — 14.0·14.1은 지원하지 않고 안내만 한다.
- Electron 내장 `getDisplayMedia` + `audio: 'loopback'`(Electron 39+)은 쓰지 않는다. macOS에서는 네이티브 화면 공유 피커(`useSystemPicker: true`)를 거쳐야만
  소리가 들어오고(커스텀 피커는 트랙이 바로 끝나는 버그, electron#52738), 녹음마다 창을 고르고 "화면 및 시스템 오디오 녹음" 권한을 받아야 한다.
- 외부 npm 패키지(`audiotee`, `electron-audio-loopback`)도 들이지 않는다 — 릴리스 바이너리가 없어 어차피 Swift를 빌드해야 하고, 필요한 코드가 200줄 남짓이라 직접 갖는 편이 관리가 쉽다.
- 도구는 **`apps/desktop/native/systemAudioTap/main.swift`** 한 파일이고 `scripts/setupBin.ts`가 `swiftc -O -target arm64-apple-macos14.2`로
  `resources/bin/darwin-arm64/systemAudioTap`을 만든다 (Xcode 또는 Command Line Tools 필요. 없으면 경고만 남기고 이 기능만 막힌다).
  다른 동봉 바이너리처럼 `asarUnpack` 대상이고 서명·공증도 같이 받는다 (`references/distribution.md` 5절).
  `Info.plist`에 `NSAudioCaptureUsageDescription`(한국어)을 `electron-builder.yml` `extendInfo`로 넣는다 — 없으면 권한 창이 뜨지 않는다.

### 도구 규약 (`systemAudioTap`)

| 항목 | 값 |
| --- | --- |
| 인자 | 없음 (16kHz mono 고정, `@shared/audio`의 `SAMPLE_RATE_HZ`와 같은 값) |
| stdout | Float32LE mono PCM 16kHz, 연속 스트림 |
| stderr | 한 줄씩. `ready`(집계 장치 시작), `format: …`, `restarted: …`, `warn: …`, `error: …` |
| 종료 | stdin이 닫히거나 SIGTERM → 탭·집계 장치 정리 후 0. 시작 실패는 `error:` 한 줄 뒤 1 |

- 탭은 `CATapDescription(monoGlobalTapButExcludeProcesses: [])`(모든 프로세스 mono 믹스다운, 제외 없음) + `isPrivate` + `muteBehavior = .unmuted`.
  비공개 집계 장치에 기본 출력 장치를 서브 장치로, 탭을 `kAudioAggregateDeviceTapListKey`로 물린다. 채널·샘플 형식은 `kAudioTapPropertyFormat`에서 읽되
  **샘플레이트는 집계 장치의 `kAudioDevicePropertyNominalSampleRate`를 쓴다** — 탭 형식 속성은 만들 때 값(48kHz)에 머무는데 실제 콜백 데이터는 출력 장치 속도(실측 24kHz)를 따라서,
  탭 형식대로 변환하면 소리가 절반 속도로 들어와 길이가 어긋난다. 속도가 재생 중에 바뀌므로 그 속성의 리스너에서 `AVAudioConverter`를 다시 만든다.
- **벽시계 기준 연속 스트림.** 실측(M3 Pro, macOS 26.5)에서 IOProc은 무음에도 512프레임씩 계속 오지만, **첫 실행은 탭이 만들어진 뒤 몇 초 동안 버퍼가 오지 않았다.**
  도구는 프로세스 시작 시각을 기준으로 "지금까지 내보냈어야 할 샘플 수"를 계산해 부족분(`GAP_FILL_THRESHOLD_SEC` 0.1 이상)을 0으로 채운다. 콜백이 멈춰도 0.5초 타이머가 같은 일을 한다.
  main은 그래서 시스템 스트림을 마이크와 같은 속도의 연속 스트림으로 볼 수 있다.
- 기본 출력 장치가 바뀌면(이어폰 연결·해제) 집계 장치의 시계가 끊기므로 `kAudioHardwarePropertyDefaultOutputDevice` 리스너가 탭·집계 장치를 통째로 다시 만든다. 그 사이 구간은 위 규칙으로 0이 채워진다.
- **권한 거부 시 동작은 검증하지 못했다** (개발 기기에서 TCC를 초기화하지 않는다). 탭 생성이 실패하면 `error:`로, 성공한 채 무음이면 그대로 무음이 녹음된다.
  녹음 화면 안내 문구가 시스템 설정 경로(개인정보 보호 및 보안 → 화면 및 시스템 오디오 녹음)를 적는다.

### main: 섞기는 세션 안에서, 파이프라인은 그대로

- **켜기/끄기는 녹음 화면의 스위치**(`recording:setSystemAudio`, `{ isEnabled }` → `GetRecordingStateResponse`)이고 값은 DB 키 `audio.systemCapture`(기본 꺼짐)에 남아 앱을 다시 켜도 유지된다.
  `AppSettings`에 넣지 않는 이유는 켜는 행위가 값 저장이 아니라 **프로브**를 동반하기 때문이다 — 켜는 순간 `src/main/audio/systemAudio.ts`가 도구를 띄워 `ready`까지 기다렸다가(최대 `PROBE_TIMEOUT_MS` 15초 — 첫 실행은 시스템 권한 창이 떠 있는 동안 멈춰 있을 수 있다) 끝낸다.
  회의 시작 전에 시스템 권한 창을 미리 띄우고 바이너리·OS 버전 문제를 그 자리에서 알리기 위해서다. 실패하면 스위치는 켜지지 않고 `systemAudio.errorMessage`를 싣는다.
- 상태는 `RecordingStateEvent.systemAudio: { isEnabled: boolean; errorMessage?: string }`로 두 창에 push한다. 값은 참석자 수처럼 **세션 밖 main 메모리**(DB에서 한 번 읽어 캐시)에 있고 녹음 중에 바꾸면 다음 녹음부터 적용된다 (스위치는 녹음 중 비활성).
- `startRecording`이 켜져 있으면 도구를 spawn한다. 실패(바이너리 없음·비정상 종료)해도 **녹음은 마이크만으로 계속**하고 `systemAudio.errorMessage`로 알린다 — 회의 중에 녹음이 통째로 실패하는 것보다 낫다.
- `appendRecordingChunk`가 마이크 청크(`CHUNK_SAMPLES` 8192)를 받을 때마다 시스템 FIFO에서 같은 개수를 꺼내 **샘플별로 더하고 ±1로 클립**한 뒤 WAV·레벨(RMS)·라이브 받아쓰기에 넘긴다.
  섞은 결과가 파이프라인 입력이므로 정규화·VAD·STT·화자 분리·병합은 손대지 않는다. 상대방이 여러 명이면 화자 분리가 그쪽 목소리도 나눈다.
  `src/main/audio/systemAudioMix.ts`(순수 함수, vitest): FIFO는 부족하면 0으로 채우고(도구 시작 지연·재시작 구간), 꺼낸 뒤 남은 양이 `MAX_BACKLOG_SAMPLES`(1.5초)를 넘으면 오래된 것을 버려 시계 차이로 밀리는 것을 막는다.
  시작 시점의 0 채움만큼 시스템 소리가 마이크보다 뒤로 밀리지만(보통 0.5초 미만, 첫 실행은 몇 초) 한 스트림 안의 순서는 그대로라 STT·화자 분리에는 영향이 없다.
- `stopRecording`은 FIFO에 남은 시스템 샘플(최대 0.5초, 상대방의 마지막 말)을 한 청크 더 쓰고 도구의 stdin을 닫아 끝낸다. 앱 종료(`finalizeActiveRecording`)도 같은 경로다.
- **에코.** 스피커로 회의를 들으면 상대방 목소리가 마이크에도 들어와 두 번 섞인다(수 ms 차이라 잔향처럼 들린다). `getUserMedia`의 `echoCancellation`은 Chromium이 재생한 소리만 지우므로 Zoom 소리에는 효과가 없다.
  스위치 행의 안내 문구에 **이어폰 권장**을 적는다. 마이크 쪽에서 겹치는 구간을 지우는 처리는 하지 않는다 (완료 기준에서 품질을 보고 결정).

### 화면

- ~~`RecorderSection` 오른쪽 옵션 패널의 행~~ → **2026-10-22 채팅창 리뉴얼부터 설정 "마이크" 카테고리 끝의 행**: 제목 "온라인 회의 소리 함께 녹음", 설명 "Zoom·Meet 상대방 목소리도 회의록에 넣습니다. 이어폰을 쓰면 더 정확합니다. 시작 전에 켜 두세요", 오른쪽에 `Switch`.
  녹음 중에는 **비활성**(숨기지 않는다)이고, `systemAudio.errorMessage`가 있으면 설명 자리에 빨간 문구로 바꾼다. 값은 `useRecordingState().systemAudio`에서 읽고 `recording:setSystemAudio`로 바꾼다(설정 테이블이 아니라 녹음 세션의 값이다). 위젯 패널은 바꾸지 않는다.
- 녹음 중 상태 표시 옆에 켜져 있음을 알리는 짧은 배지("상대방 소리 포함")를 둔다 — 회의 중 "지금 저쪽 소리도 잡히고 있나"를 한눈에 알기 위해서다.

## 녹음 품질 안내 (2026-10-02)

녹음 자체가 나빠서 인식이 망가지는 경우를 **녹음 중에 알려 바로 고치게 하고**, 끝난 뒤에는 **회의록이 부정확할 수 있다는 사실과 이유**를 알린다 (2026-10-02 사용자 결정).
녹음은 다시 할 수 없으므로 녹음 중 안내가 먼저이고, 가져온 파일처럼 녹음 중에 손쓸 수 없는 경우는 사후 표시가 맡는다.
임계값은 전부 `docs/recording-quality-results.md`의 측정에서 왔다. 새 모델·새 바이너리는 없고 프레임 RMS 통계만 쓴다.

### 지표와 판정 (`src/shared/audioQuality.ts`, 순수 함수 + vitest)

- 지표는 **50ms 프레임 RMS**(음량 정규화와 같은 프레임, `@meeting-stt/core/normalize`의 `frameSamplesOf`)의 분위수 두 개다:
  **발화 음량** = 90퍼센타일(정규화가 쓰는 값과 같다), **바닥 잡음** = 10퍼센타일(최소 −96 dBFS). 둘의 차이를 **폭**이라 부른다.
- 판정은 `assessAudioQuality({ speechDb, noiseDb })` 하나이고 결과는 `AudioQualityIssue = 'silent' | 'faint'` 또는 `null`(문제 없음)이다.

  | 판정 | 조건 | 근거 |
  | --- | --- | --- |
  | `silent` | 발화 음량 < **−60 dBFS** | 소리가 사실상 없다(음소거·죽은 입력 장치). 폭을 따질 수 없으므로 먼저 본다 |
  | `faint` | 폭 < **20dB** | 말소리가 주변 소리 위로 충분히 솟지 않는다. 폭 21dB에서 CER이 1.6~2.0배, 16~18dB에서 2.2~2.8배이고, 원거리 녹음 다섯 편이 전부 20dB 미만이다 |

- **만들지 않는 판정과 이유** (측정 2절):
  - "목소리가 작다": 음량만 작은 것은 정규화가 복구한다(−52 dBFS까지 CER 그대로). 폭이 같이 좁아졌을 때만 문제이고 그건 `faint`가 잡는다.
  - 클리핑: 샘플의 2.8%가 잘려도 CER이 그대로이고 17.7%가 잘려야 +7%p다. 자동 게인을 거친 앱 녹음에서는 풀스케일에 닿지 않아 재지도 못한다.
  - 블루투스 통화 모드 마이크(대역 제한, +4.8%p): 소리 지표에 드러나지 않는다. 입력 장치 종류로 알려야 하는데 Chromium이 연결 방식을 주지 않아 보류한다.
- 임계값 두 개는 이 파일의 상수 하나씩이고 녹음 중 안내와 사후 표시가 같은 값을 쓴다.

### 녹음 중 안내 (`src/main/audio/qualityMonitor.ts`)

- **계산은 main의 녹음 세션에서 한다.** 레벨 미터와 같은 이유다 — 청크가 이미 main을 지나가고, 두 창이 같은 판정을 봐야 한다.
  `appendRecordingChunk`가 WAV에 쓰는 것과 **같은 샘플**(시스템 오디오를 섞은 결과)을 모니터에 넣는다. 일시정지 중에는 넣지 않는다.
- 모니터는 청크를 50ms 프레임으로 잘라(청크 경계에 걸친 나머지는 다음 청크로 넘긴다) 프레임 RMS를 두 창(window)에 쌓는다.

  | 판정 | 보는 구간 | 판정 시작 | 이유 |
  | --- | --- | --- | --- |
  | `silent` | 최근 **20초** | 20초가 찬 뒤 | 회의 중 20초 침묵은 드물고, 음소거는 처음부터 끝까지 무음이라 빨리 잡아야 한다 |
  | `faint` | 최근 **180초** | **60초**가 찬 뒤 | 말이 구간의 10%(18초)만 있어도 발화 음량이 유지돼 짧은 침묵에 흔들리지 않는다 |

  `silent`가 우선이고, 둘 다 아니면 문제 없음이다. 조건이 풀리면 안내도 바로 사라진다(따로 닫기 버튼을 두지 않는다).
- 판정은 `RecordingStateEvent.qualityIssue?: AudioQualityIssue`로 싣는다. 청크마다 이미 `recording:state`를 보내고 있어 이벤트가 늘지 않는다.
  녹음 중이 아니거나 일시정지 중이면 싣지 않는다. 새 IPC 채널은 없다.
- **화면.** 오류가 아니라 권고다 — 빨강을 쓰지 않고(`--color-text` 계열 + 경고 아이콘 없음), `role="status"`로 알린다. 녹음은 계속된다.
  - 메인 창 녹음 화면(`RecorderSection`): 컨트롤 아래 **안내 두 줄 자리**에 기본 안내 대신 쓴다. 우선순위는 오류 > 품질 안내 > 기본 안내. 높이가 같아 나타나거나 사라져도 아래가 밀리지 않는다.
  - 위젯 패널(`WidgetPanelSection`): 맨 아래 한 줄 안내 자리. 우선순위는 오류 > 모델 준비 안내 > 일시정지 안내 > 품질 안내 > 기본 안내.
  - 문구(한국어): `silent` — "소리가 들어오지 않습니다. / 마이크가 음소거됐거나 다른 입력 장치가 선택됐을 수 있습니다." (위젯: "소리가 들어오지 않습니다. 마이크를 확인해 주세요"),
    `faint` — "말소리가 주변 소리에 묻혀 들어옵니다. / 마이크를 말하는 사람 가까이 두면 회의록이 더 정확해집니다." (위젯: "말소리가 잘 들리지 않습니다. 마이크를 가까이 두세요").
- **메뉴바·알림은 쓰지 않는다.** 위젯 패널이 회의 중 항상 떠 있는 표면이다. 패널을 숨기고 쓰는 사용자에게는 사후 표시가 남는다.
- **한계.** 지금 마이크 제약(`noiseSuppression: true`)에서는 Chromium이 바닥 잡음을 17~20dB 끌어내려 폭이 부풀려지므로 **앱 녹음에서 `faint`가 거의 뜨지 않는다**(측정 4절: 원거리 녹음을 넣어도 폭 24.9dB).
  잡음 억제를 끄면 직접 경로와 같은 폭이 나와 위 임계값이 그대로 통한다. 잡음 억제를 끄는 결정은 `references/roadmap.md` "녹음 품질 안내"에서 사용자 확인을 기다린다.

### 사후 표시

- 파이프라인의 **음량 정규화 단계가 원본 WAV의 프레임 RMS를 이미 계산한다.** 같은 프레임에서 바닥 잡음까지 뽑아 `NormalizeResult`에 싣고,
  `runPipeline`이 발화 목록과 함께 `audioQuality: { speechDb, noiseDb }`를 돌려준다. WAV를 한 번 더 읽지 않는다.
- 큐(`processMeeting`)가 발화를 저장할 때 `meetings.audio_quality`(JSON, 마이그레이션 7)에 **지표를 그대로** 저장한다. 판정이 아니라 지표를 저장하는 이유는
  임계값을 실제 녹음으로 다시 맞출 때 지난 회의를 다시 처리하지 않아도 되기 때문이다 (`references/data-model.md`).
  앱이 녹음한 회의와 가져온 파일이 같은 경로를 타고, "다시 인식"하면 다시 잰다. 이 기능 이전의 회의는 NULL이고 아무것도 표시하지 않는다.
- renderer에는 판정만 준다 — `Meeting.audioQualityIssue?: AudioQualityIssue`. 행을 `Meeting`으로 바꿀 때 `assessAudioQuality`로 계산한다.
- **화면.** 회의 상세의 회의록 맨 위(`TranscriptSection`의 `ui/AudioQualityNotice.tsx`)에 안내 한 덩어리: 제목 한 줄 + 이유와 다음 행동 한 줄. `status === 'done'`일 때만 보인다.
  - `faint` — "녹음 상태가 좋지 않아 회의록이 부정확할 수 있습니다" / "말소리가 주변 소리에 묻혀 녹음됐습니다. 다음에는 마이크를 말하는 사람 가까이 두세요."
  - `silent` — "소리가 거의 녹음되지 않았습니다" / "마이크가 음소거됐거나 다른 입력 장치로 녹음됐을 수 있습니다."
  - 닫기 버튼은 두지 않는다(회의의 사실이지 알림이 아니다). 목록·사이드바에는 표시하지 않는다.
- **발화 단위 표시는 하지 않는다.** 같은 회의 안에서 5dB쯤 작게 들어온 턴의 CER이 1.5배이긴 하지만(측정 3절) 그 턴의 글자 4분의 3은 맞는다.
  발화마다 "잘 안 들림"을 붙이면 틀린 표시가 더 많다. 원본을 자동으로 남기는 것도 하지 않는다 — "원본 삭제가 기본"이라는 약속을 품질 판정이 몰래 뒤집으면 안 된다.

## 녹음 노트 (2026-10-21)

사용자 요청으로 **녹음하면서 글을 적는 칸**을 둔다. 회의 안건·결정·링크처럼 말로는 남지 않거나 인식이 틀리기 쉬운 것을 사용자가 직접 적는다.
노트는 회의마다 하나이고 세 곳에 쓰인다 — **교정의 힌트**(표기 근거), **요약의 재료**(회의록과 맞을 때만), **비서의 뇌 정리**(원문에 함께 저장, 노트의 링크는 정리 에이전트가 열어 읽는다).

- **이름은 "노트"(코드 `note`)다.** 사용자는 "메모"라고 불렀지만 "메모"는 이미 녹음 종류(회의 / 메모, `features/assistant.md` "녹음 종류")의 이름이라 "메모 녹음 중 메모"가 되지 않게 나눈다.
- **형식은 자유 장문 텍스트 하나**(2026-10-21 사용자 결정 — "textarea 느낌으로 장문, md 포맷이면 더 좋음"). 시각이 붙는 줄 메모는 만들지 않는다. 사용자는 마크다운으로 적어도 되고 앱은 그대로 저장한다.
  - **앱 안에서는 마크다운을 그리지 않는다** — 쓰는 곳도 보는 곳도 textarea다(문서 에디터와 같은 규칙, 1절 "편집"의 에디터 라이브러리 금지). 마크다운은 뇌의 원문 파일(`.md`)에 그대로 들어가 그곳에서 서식이 산다.
    앱 안 렌더링은 비서 답변의 렌더러 `shared/components/primitives/ui/Markdown`(`features/ui.md` "대화", 2026-10-22)을 그대로 붙인다(후속).
  - **링크**: 노트의 `https://` 링크(맨 URL과 `[글](https://…)` 모두)를 `extractNoteLinks`(`src/shared/note.ts`, 순수 함수 + vitest)가 뽑는다. 회의 상세의 노트 카드는 textarea 아래에 링크 목록을 두고 누르면 기본 브라우저로 연다 —
    `<a target="_blank">`를 메인 창의 `setWindowOpenHandler`가 받아 `openExternalUrl`(https만)로 넘기므로 새 IPC가 없다. `http:`·`file:` 같은 링크는 목록에 넣지 않는다(열지 않는 스킴).
  - 길이 상한 `NOTE_MAX_CHARS`(100,000자). main이 저장할 때 검사해 넘으면 거절한다(신뢰 경계). 넘을 일이 없는 크기라 화면은 따로 세지 않는다.

### 저장과 단일 출처

- **녹음 중 노트의 단일 출처는 main 녹음 세션**(`audio/session.ts`)이다 — 참석자 수와 같은 이유(두 창이 같은 칸을 보여 준다). `RecordingStateEvent.note: string`으로 두 창에 push하고, 바꾸기는 `recording:setNote`(`{ note }` → 녹음 상태).
  - **녹음 전에도 쓸 수 있다**(안건을 미리 적는다). 세션이 들고 있다가 녹음을 시작하면 새 회의 행에 쓴다. 녹음 전 초안은 앱을 끄면 사라진다.
  - **녹음 중에는 바뀔 때마다 `meetings.note`에 바로 쓴다** — 녹음 도중 앱이 죽어도 노트가 남는다(SQLite UPDATE 한 줄이라 키 입력마다 써도 된다).
  - **정지하면 세션의 노트를 비운다.** 그 노트는 방금 회의의 것이고, 다음 녹음은 빈 노트로 시작한다. 정지 뒤 고치기는 회의 상세가 맡는다.
- **입력 중에는 내 초안이 이긴다.** 키를 빨리 치면 직전 키의 push가 뒤늦게 도착해 칸을 되돌린다. 그래서 칸에 포커스가 있는 동안은 자기 초안을 보여 주고 push를 무시하며,
  포커스를 잃으면 세션 값으로 돌아간다(`useRecordingNote`, `shared/hooks/domain/recording`). 두 창에서 동시에 치는 경우는 고려하지 않는다.
- **녹음이 끝난 회의는 `meetings:updateNote`**(`{ meetingId, note }` → `MutateMeetingResponse`, 편집 채널 규약). 녹음 중(`status='recording'`)인 회의는 거절한다 — 세션이 쓰는 중이다. 처리 중(`processing`)은 허용한다(파이프라인은 노트를 읽지 않는다).
- 다시 인식·교정·요약은 노트를 바꾸지 않는다. 회의를 지우면 노트도 함께 지워진다(같은 행).

### 쓰이는 곳

| 쓰는 곳 | 노트를 어떻게 쓰나 | 설계 |
| --- | --- | --- |
| 문장 교정 (외부 공급자) | 프롬프트에 "참고 노트"로 넣는다. 회의록의 말이 노트의 표기와 같은 것을 가리킬 때 그 표기를 따르는 근거. 노트에만 있는 내용을 더하지 않는다. 발음 가드는 그대로라 소리가 다른 치환은 여전히 걸러진다 | `features/transcript.md` "문장 교정" |
| 용어 교정 (로컬) | **쓰지 않는다.** 로컬은 전역 용어 사전의 단어만 후보로 만든다. 노트의 단어를 후보로 쓰는 것은 후속 | — |
| 요약 | 한 번에 요약(`whole`)과 합치기(`reduce`) 프롬프트에 "노트"로 넣는다. 회의록과 맞고 도움이 될 때만 반영, 회의록에 없는 결정·기한을 노트만 보고 단정하지 않는다, 링크는 관련 항목에 남긴다. 구간 요약(map)에는 넣지 않는다 | `features/llm.md` "로컬 LLM 요약" |
| 뇌 정리 | 원문 파일 머리말 아래 `## 노트` 절. 정리 에이전트가 노트를 전사보다 믿을 만한 단서로 보고, 노트의 링크를 열어 읽어 정리에 반영한다(Claude는 링크 도메인만 `WebFetch` 허용) | `features/assistant.md` "원문 파일"·"정리 에이전트" |
| 인식 단계(`--prompt`) | **쓰지 않는다.** 녹음이 끝난 뒤 인식하므로 넣을 수는 있지만 사용자 요청은 교정 힌트이고, 긴 자유 글이 프롬프트 예산(용어 사전 몫)을 밀어낸다 | — |

### 화면

- **메인 창 녹음 화면** — 오른쪽 옵션 패널의 **마지막 그룹 "노트"**: textarea가 패널의 남은 높이를 채운다(최소 높이 `--space` 기준 6줄 정도, 넘치면 칸 안에서 스크롤). 녹음 전·중 모두 쓸 수 있고 비활성으로 바뀌지 않는다.
  placeholder "안건, 결정, 링크를 적어 두세요. 교정·요약·기록 정리에 함께 씁니다". 노트 그룹이 마지막이 되면서 "온라인 회의 소리" 행은 더 이상 패널의 마지막이 아니다 — 그 행의 오류 문구가 넘치면 노트 그룹 제목 위로 흐를 수 있는데, 드문 오류라 감수한다(고정 규칙의 "튀는 것보다 낫다").
  페이지 스크롤 없음·레이아웃 시프트 없음 원칙은 그대로다 — textarea는 높이가 고정이고 내용은 칸 안에서 스크롤한다.
- **위젯 패널** — 헤더 오른쪽(숨기기 버튼 왼쪽)에 **노트 아이콘 버튼**(`aria-label` "노트", `aria-pressed`). 누르면 패널 본문이 **노트 보기**로 바뀐다: 헤더(녹음 점·"노트"·경과 시간·돌아가기 버튼) + 남은 높이를 채우는 textarea.
  창 크기 300×304는 그대로다(받아쓰기 보기처럼 같은 창의 다른 보기). 노트 보기에서도 녹음은 그대로 돌고, 정지는 돌아가서 한다. 보기 상태는 위젯 창 로컬 상태라 저장하지 않는다. 받아쓰기가 시작되면 받아쓰기 보기가 우선이다.
  노트가 있으면 아이콘에 점을 붙여 비어 있지 않음을 보인다.
- **회의 상세** — 오른쪽 레일 맨 위에 **노트 카드**(요약 카드와 같은 접기/펼치기 헤더, 기본 펼침): textarea(내용 높이만큼 자라되 최대 높이에서 스크롤) + 아래에 **링크 목록**(링크가 있을 때만, 한 줄에 하나, 넘치면 말줄임).
  blur와 `⌘Enter`에 저장(`meetings:updateNote`), `Esc`는 마지막 저장값으로 되돌린다. 저장 실패는 다른 편집과 같은 `saveError` 줄로 보인다. 노트가 비어 있으면 placeholder "회의에 대해 적어 둘 것이 있으면 여기에 적으세요".
  `TranscriptSection`의 `ui/NoteCard.tsx`로 둔다 — 노트는 `MeetingDetail`의 일부라 회의록과 같은 `useMeeting` 상태를 쓴다(화자 목록과 같은 이유).

### IPC

| 키 | 채널 | 방향 | 요청 → 응답 |
| --- | --- | --- | --- |
| `recording.setNote` | `recording:setNote` | invoke | `{ note: string }` → `RecordingStateEvent`. 문자열이 아니거나 `NOTE_MAX_CHARS`를 넘으면 reject |
| `meetings.updateNote` | `meetings:updateNote` | invoke | `{ meetingId, note }` → `MutateMeetingResponse`. 녹음 중인 회의·상한 초과는 reject |

- `RecordingStateEvent`에 `note: string`이 늘고, `MeetingDetail`에 `note: string`이 는다 (`references/data-model.md` "녹음 노트").
- 범위 밖: 회의록 검색에 노트 포함, 복사(전체·마크다운)에 노트 포함, 노트 안 시각 표시, 노트만 따로 내보내기.
- **채팅창 리뉴얼**(`features/ui.md`, 2026-10-21 시안)에서는 위 "메인 창 녹음 화면"이 없어져 **녹음 카드의 펼치는 노트 칸**이 녹음 중 입력 자리다 (2026-10-22, 아래 "채팅 창의 녹음" > "녹음 카드"). 위젯 노트 보기와 전체 기록 패널의 노트(옛 상세 레일 노트 카드 대신, 헤더 아래)는 아직 없다 — 패널 자리는 시안을 고칠 때 정한다.
  main·IPC·프롬프트 쪽은 화면과 무관해 그대로 쓴다.

## 채팅 창의 녹음 (2026-10-22, 채팅창 리뉴얼)

`features/ui.md` "채팅창 리뉴얼"의 녹음 부분이다. 시안 보드 "녹음 중 · 입력창 위에 붙음", "녹음 후 · 기록 카드", "녹음 위젯 패널 (창 밖)"을 옮겼다.
**녹음 화면(`/record`, `pages/Record`)은 없앴다** — 녹음은 채팅 창 안에서 시작·정지하고 결과도 대화 속 카드다. 오디오 그래프 소유자·상태의 단일 출처·IPC는 위 "녹음 위젯 패널" 절 그대로다.

### 시작·정지 입구

- **입력 도크의 마이크 버튼**: 대기 중 "녹음 시작"(`recording:control start`), 녹음 중에는 `aria-pressed` + 강조 연한 바탕(시안 "녹음 중")이고 누르면 정지(`toggle`). 모델 준비는 위젯이 검사해 실패를 세션에 모으므로(`errorMessage`) 버튼은 막지 않는다.
- **`/` 명령** "녹음 시작 ⌥⌘R"(설정의 단축키를 읽어 표기) → start, "파일로 기록 만들기" → `useAudioImport().importAudio`(`shared/hooks/domain/meeting/useAudioImport`, 이동 없음). `features/meeting/ImportAudioButton`은 없앴다.
- 아직 남아 있는 옛 구조(사이드바)의 "새 녹음"은 채팅(`/`)으로 가며 녹음을 시작한다. 위젯·메뉴바·전역 단축키는 그대로다.
- **정지하면 채팅으로 간다.** `MainWindowLayout`이 `stoppedMeetingId`를 받으면 회의 상세가 아니라 `navigate(PATHS.assistant, { state: { stoppedMeetingId } })`. 채팅이 `location.state.stoppedMeetingId`를 읽어 입력창 위 최근 녹음 줄에서 그 기록을 골라 기록 카드를 펼친다(아래 "최근 녹음 줄"). 파일 가져오기는 자동으로 펼치지 않는다.

### 녹음 카드 (`recording/RecorderSection`, 입력창 위)

- **녹음 중에만 그린다**(대기 중이면 null). 페이지가 `AssistantChatSection`의 `recorderSlot`으로 넘긴다 — widgets는 widgets를 import하지 않으므로 슬롯이다(회의 상세의 `aside`와 같은 방식).
- 헤더: 녹음 점(강조색 + 연한 후광, 일시정지면 흐린 점) · "녹음 중"/"일시정지됨" · 경과 시간(mono) · 시스템 오디오가 켜져 있으면 "상대방 소리 포함" 칩 · 오른쪽 끝 보기 토글(파형 | 라이브, `recording:setLiveTranscript`).
- 본문 높이 **112px 고정**: 라이브는 최근 줄만 아래 정렬(위쪽은 마스크로 흐려짐, 말하는 중인 구간은 흐린 글자, 아직 없으면 "듣고 있습니다…"), 파형은 `LevelWaveform`. 보기를 바꿔도 카드 크기가 같다.
- 하단: "참석자" + 알약형 `Stepper`(빈 값 = "모름") · 일시정지 원형 버튼(`features/recording/PauseRecordingButton`, 40px) · 잉크 알약 "정지하고 기록 만들기"(`recording:control stop`).
- 카드 아래 **안내 줄은 채팅이 그린다**(입력창 아래, 시안 위치): "창을 닫아도 녹음은 계속돼요 · ⌥⌘R"(설정 단축키, 꺼져 있으면 키 없이). `qualityIssue`가 있으면 품질 안내가 같은 줄에 대신, 세션 `errorMessage`는 빨간 글자로 대신. 보기 전환·일시정지·정지 요청 실패는 카드 안 마지막 한 줄이다.
- **노트 칸**(2026-10-22): 하단의 참석자 스테퍼 오른쪽에 "노트" 알약 버튼(`secondary` · `sm`, `aria-expanded`). 누르면 푸터 아래에 textarea(4줄, 넘치면 칸 안에서 스크롤)가 펼쳐지고 카드가 아래로 늘어난다. 값은 `useRecordingNote`(`shared/hooks/domain/recording`)가 들고 바뀔 때마다 `recording:setNote`, 포커스 중에는 초안 우선·포커스를 잃으면 세션 값("녹음 노트" > "저장과 단일 출처"). 저장 실패는 카드 안 마지막 줄. 펼침 상태는 카드 로컬이라 저장하지 않는다. 녹음 전 초안 입력 자리는 리뉴얼에 없다(카드가 녹음 중에만 보인다 — 세션의 초안 보관은 그대로).
- 시스템 오디오 스위치는 설정 "마이크"로 옮겼다("시스템 오디오 캡처" > "화면"). 회의/메모 종류 선택은 그 기능이 붙을 때 헤더에 둔다.

### 최근 녹음 줄 (`AssistantChatSection/ui/RecentRecordStrip`, 입력창 위)

2026-10-22 사용자 요청: "녹음들은 하나씩 채팅방에 쌓이는 것이 아니라 채팅창에 붙어있어야 해." 녹음·파일 가져오기로 만든 기록은 **대화에 쌓지 않고** 입력창 바로 위 한 줄 목록에 모은다. 대화가 녹음 카드로 밀려나지 않고, 지난 녹음도 스크롤 없이 다시 연다.

- **무엇**: `useMeetings`의 기록 중 녹음 중이 아닌 것을 최신순으로, 목록에서 뺀 것을 거른 뒤 **10개**(`RECENT_RECORD_COUNT`). 앱을 다시 켜도 보인다. 녹음 중인 회의는 대화 속 "오후 2:00 · 녹음을 시작했어요…" 줄 그대로다.
- **모양**: 한 줄 가로 목록이고 넘치면 **좌우 스크롤**(스크롤바는 숨김, 트랙패드·Shift+휠). 항목은 작은 카드 — 제목(한 줄 말줄임) · "10월 21일 · 48분", 처리 중·실패면 날짜 대신 "처리 중"/"처리 실패"(`t.recording.files.status`). 최신이 왼쪽.
- **열기**: 항목을 누르면 그 기록 카드(`features/meeting/RecordCard`, 아래 "기록 카드")가 **목록 바로 위에 펼쳐지고**, 같은 항목을 다시 누르면 접힌다. 한 번에 하나만(`aria-pressed`). 펼친 카드는 창 높이의 절반을 넘으면 카드 안에서 스크롤한다. 막 멈춘 녹음(`stoppedMeetingId`)은 펼친 채로 시작한다 — 정지 직후 처리 진행·결과를 바로 보게(같은 날 앞선 요청).
- **목록에서 빼기**: 항목에 마우스를 올리거나 키보드 포커스가 들어오면 오른쪽 위에 x 아이콘 버튼(`aria-label` "<제목> 목록에서 빼기")이 나온다. 누르면 **목록에서만** 사라지고 회의·녹음 파일은 그대로다(전체 기록·기록 찾기로 다시 연다). 뺀 id는 창마다 달라도 되는 편의 상태라 설정 DB가 아니라 **localStorage**(`recentRecords.dismissed`, `SetupSection`의 "나중에 받기"와 같은 이유)에 둔다. 펼친 기록을 빼면 카드도 닫힌다.
- **녹음 중에는 숨긴다** — 녹음 카드가 같은 자리를 쓴다. 정지하면 다시 나타난다.
- 옛 동작(앱을 켠 뒤 만든 회의마다 대화 끝에 기록 카드, 막 멈춘 카드만 입력창 위에 붙이고 "녹음을 멈췄어요" 줄로 접기 — `StoppedRecordDock`)은 이 줄로 바꿨다.

### 기록 카드 (`features/meeting/RecordCard`, 최근 녹음 줄 위)

- 카드는 `meetingId`만 받아 `useMeeting`으로 스스로 읽는다. **`useMeeting`은 `meetings:changed`에도 다시 읽는다** — 녹음 → 처리 중 전환은 진행률 이벤트로 알 수 없다.
- **처리 중**: 제목 · 길이 · 단계 문구 + 퍼센트(mono) · 진행 막대(`usePipelineProgress`). **실패**: 제목 · 오류 문구 · 원본이 있으면 "다시 시도"(저장된 참석자 수로 `meetings:reprocess`).
- **끝남**: 헤더(제목 — 패널과 같은 인라인 편집, "10월 21일 오후 2:00 · 48분 · 화자 N명", 기록 복사 아이콘 — 전체 평문 복사, 더보기 아이콘 — 펼치면 "제목 수정"(제목을 편집 상태로 바꾼다, 2026-10-23 사용자 요청) · "회의 삭제" 2단계 인라인 확인) · 요약 블록("요약 · <공급자>" + 요약 복사 아이콘, 본문은 요약 / 진행률 / 안내 — 옛 요약 카드와 같은 규칙. 옛 `meeting/SummarySection`은 없앴다) · 화자 범례(색 점 `--color-speaker-N` + 이름, 등장 순) + 오른쪽 "용어 N곳 교정됨"(`refineResult.appliedPairs` 수, 0이면 없음) · 푸터("전체 기록 보기" → 아래 **전체 기록 패널**을 연다 · 템플릿 `<select>`(사용자 템플릿이 있을 때만) · "다시 요약"/"요약 만들기").
- 범위 밖: 카드 안 인라인 편집·화자 이름 바꾸기(전체 기록에서 한다).

### 위젯 패널 외형

- 시안 "녹음 위젯 패널": 바탕 `--color-sidebar`, 테두리, 반경 `--radius-xl`, 안쪽 여백 18px, 세로 간격 14px. 헤더(점 · 상태 · 오른쪽 끝 일시정지 아이콘 버튼 · 숨기기) · 44px 타이머 · "참석자 수" + 알약 스테퍼 · 전체 폭 버튼(대기: 강조 "녹음 시작", 녹음 중: 흰 바탕·잉크 테두리 "녹음 정지") · 안내 "정지하면 바로 기록을 만들어요". 받아쓰기 보기는 그대로다.
- `Stepper` primitive를 알약형(테두리 알약, 둥근 −/+ 아이콘 버튼, mono 입력)으로 바꿨다 — 회의 상세 녹음 바의 스테퍼도 같이 바뀐다.

### 전체 기록 패널 (`meeting/TranscriptSection`, 대화 옆)

시안 "전체 기록 패널 · 대화 옆에 열림". 옛 회의 상세 페이지(`/meetings/:id`, 상단 바 + 레일 + 하단 바)를 없애고 **같은 위젯을 채팅 옆 600px 카드로** 다시 그렸다. 문서 패널과 같은 자리라 둘 중 하나만 열린다(페이지가 `openMeetingId`를 들고, 기록을 열면 문서 패널을 닫는다).

- 헤더: 제목(인라인 편집) · "10월 21일 오후 2:00 · 48분 · 화자 N명" · 복사 · 마크다운 · 더보기(제목 수정 — 제목을 편집 상태로 · 회의 삭제 2단계) · 닫기(`onClose`). 삭제가 끝나면 패널을 닫는다.
- 헤더 아래 **화자 칩 줄**(색 점 + 이름, 이름을 누르면 바로 고친다) + 오른쪽 "화자 합치기"(모드를 켜면 칩마다 "합치기" → 대상 선택, 되돌릴 수 없는 동작의 두 단계). 레일의 화자 목록(`ui/SpeakerPanel`)이 이 줄이 됐다.
- 본문: 발화 목록(시각 · 화자 점 + 이름 `<select>` · 글 · "교정됨" 칩, 행 복사는 마우스를 올릴 때). 원본이 있으면 시각을 눌러 그 지점부터 재생. 품질 안내·오류는 목록 위, 교정 결과(`features/refine/RefinePanel`, 다시 교정)는 목록 아래.
- 하단 **녹음본 줄**(60px, 원본이 있을 때): 재생 · 현재/전체 시각 · 시킹 · "내보내기"(WAV) · "다시 인식"(참석자 수를 고르는 2단계). 원본이 없으면 설정 안내 한 줄.
- 요약 카드·노트 카드·레일 폭 조절·상단 바는 없다 — 요약은 기록 카드에 있고, 노트는 "녹음 노트" 절의 보류 그대로다.

### 기록 찾기 (대화 속)

시안 "기록 찾기 · 결과가 대화에". `/` 명령 "기록 찾기"는 옛 목록 화면으로 가지 않고 **입력 도크를 찾기 모드로 바꾼다** — 도크 앞에 "기록 찾기" 칩이 붙고 placeholder가 "찾을 말을 적고 Enter"가 된다. Esc나 빈 입력에서 Backspace로 모드를 끈다.
- Enter로 보내면 에이전트가 아니라 `meetings:search`(제목·발화, 최신순 50개)를 부르고, 결과는 대화 속 카드다: 오른쪽 말풍선(칩 "기록 찾기" + 찾은 말) → "'토큰'이 나온 기록이 3개 있어요." → 결과 목록(제목 · "10월 20일 · 32분" · 첫 일치 발화의 시각 + 조각, 일치 부분은 `<mark>`) → "누르면 그 기록이 대화 옆에 열려요". 없으면 "…기록이 없어요".
- 결과를 누르면 **전체 기록 패널**이 그 회의로 열린다. 해당 발화로 스크롤하는 것은 후속이다.
- 찾기 카드는 찾은 순으로 턴 목록 뒤에 놓이는 **renderer 로컬 상태**다(대화 기록처럼 저장하지 않는다). 조각 자르기·강조는 `shared/utils/highlightMatch`(옛 사이드바 유틸을 올렸다).

### 옛 페이지 제거 (2026-10-22)

`/meetings`(옛 홈)·`/meetings/:id`(회의 상세)·`/record`·사이드바(`meeting/MeetingSidebarSection`)·`AppShellLayout`·`RequireModels`·`meeting/SummarySection`을 지웠다. 남은 라우트는 `/`(채팅, 자식 `/settings` 모달)·`/summary-templates`(설정에서 들어오는 전체 창 편집 화면)·`/widget`뿐이다. 모델이 없을 때의 녹음 거절은 위젯이 `errorMessage`로 알린다(가드가 아니라 안내).

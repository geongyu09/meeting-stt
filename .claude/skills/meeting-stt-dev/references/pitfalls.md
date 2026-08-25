# 알려진 함정과 대응

## STT / 화자 분리 품질
- **무음 환각**: Whisper는 무음·잡음 구간에서 없는 문장을 만든다. VAD로 무음을 제거한 뒤 추론하고, VAD가 잘라낸 구간의 오프셋을 타임스탬프에 다시 더해야 한다.
- **작은 음량에서 Whisper가 구간을 통째로 놓친다** (실제 71분 녹음, Phase 1). whisper.cpp는 입력 음량을 정규화하지 않는다.
  원거리 마이크 녹음(발화 RMS −44 dBFS)에서 11초짜리 세그먼트가 "네네" 한 단어로 나오는 식으로 수십 초가 사라졌다.
  대응: STT 전에 RMS 게인 정규화(`src/main/pipeline/normalize.ts`). 10분 발췌에서 글자수 2563 → 3494(+36%), ffmpeg `loudnorm`(3505)과 동등.
  `dynaudnorm` 같은 구간별 가변 게인은 효과가 덜했다(3284). 화자 분리는 정규화해도 결과가 거의 같다.
- **화자 분리 임계값을 올려도 파편 클러스터가 남는다.** `cluster-threshold` 0.6 → 0.8로 올리면 23명 → 12명이 되지만,
  0.9까지 올려도 총 발화 1~8초짜리 화자가 8~9명 남는다(짧은 구간의 임베딩이 불안정). 임계값으로 해결하려 하지 말고
  병합 단계에서 **총 발화 10초 미만 화자를 시간상 가장 가까운 주요 화자에 흡수**한다 (12명 → 3명). `--min-duration-on`을 올려도 큰 차이가 없다.
- **`--embedding.provider=coreml`·`--segmentation.provider=coreml`은 CPU보다 훨씬 느리다** (10분 입력: CPU 141초 완료 vs CoreML 4분 경과에 18%). 프로바이더는 CPU로 고정한다.
- **ffmpeg가 만든 WAV는 헤더가 44바이트가 아니다** (`LIST` 청크가 붙음). PCM을 직접 읽을 때는 `data` 청크를 찾아서 읽어야 한다. 앱이 직접 쓰는 WAV는 44바이트 고정이지만 외부 파일을 받는 경로가 생기면 주의.
- **whisper.cpp `--vad`는 토큰 타임스탬프를 되돌리지 않는다** (whisper-cpp 1.8.4에서 확인, Phase 1).
  `--vad`를 켜면 세그먼트의 `offsets`는 원본 시간축으로 복원되지만, `--output-json-full`의 **토큰 `offsets`(및 `t_dtw`)는 무음이 제거된 압축 시간축 그대로** 남는다.
  무음이 쌓일수록 오차가 커진다(합성 픽스처 115초에서 0.9초 → 4.5초). VAD를 끄면 둘이 정확히 일치한다.
- **whisper 세그먼트의 `offsets.from`은 직전 세그먼트의 `to`를 그대로 쓴 값이다.** 실제 발화 시작이 아니다.
  (합성 픽스처: 실제 발화 시작 11.234초인 세그먼트의 `from`이 직전 세그먼트 끝인 10.640초.) `offsets.to`만 실제 발화 끝을 반영한다.
  대응: `src/main/pipeline/whisper.ts`의 파서가 토큰 시각을 **세그먼트 끝(`to`)에 맞춰 되돌린다** — `원본시각 = segTo - (tokenTo - token)`.
  토큰 구간 길이를 보존하므로 발화 시작이 앞당겨지지 않는다. 세그먼트 시작보다 앞서면 `from`으로 자르고,
  토큰 구간이 세그먼트 구간보다 길면(세그먼트 안에서 무음이 많이 제거된 경우) 선형 재매핑으로 되돌아간다.
- **`-dtw`(토큰 정렬 타임스탬프)는 flash attention과 배타적이다.** `-fa`가 기본 켜짐이라 `-dtw`만 주면
  `dtw_token_timestamps is not supported with flash_attn - disabling` 로그와 함께 **조용히 꺼지고 `t_dtw`가 전부 -1**로 나온다.
  반드시 `--no-flash-attn`을 함께 준다. `t_dtw`의 단위는 ms가 아니라 **10ms**다.
- **`--output-json-full` 결과 파일은 유효한 UTF-8이 아니다.** whisper 토큰은 바이트 조각이라 한글 한 글자가 토큰 둘로 쪼개지고, 그 조각이 그대로 JSON에 들어간다.
  대응: 파일을 `latin1`(바이트 보존)로 읽어 `JSON.parse`한 뒤, 이어붙인 토큰 문자열을 `Buffer.from(text, 'latin1').toString('utf8')`로 되돌린다. UTF-8로 바로 읽으면 글자가 깨진다.
- **세그먼트 내 화자 전환**: Whisper 세그먼트 하나에 두 화자가 섞일 수 있다. 단어 단위 타임스탬프로 배정한 뒤 재문장화한다.
- **겹쳐 말하기**: 단일 라벨로만 붙인다(주 화자 기준). 완벽을 목표로 하지 않는다.
- **비슷한 목소리 오분류**: 알고리즘으로 해결하지 말고 UI의 화자 병합/재배정 기능으로 사용자가 복구하게 한다.
- **작은 모델 유혹**: tiny/base는 한국어에 부적합. 기본값은 large-v3-turbo q5 아래로 내리지 않는다(저사양 폴백만 small).
- **한국어 이중 전사**: 파인튜닝을 시도할 경우 "(7시)/(일곱시)" 형태 전처리가 결과를 좌우한다. 1차 범위에서는 파인튜닝하지 않는다.

## 녹음
- 장시간 녹음 PCM을 renderer 메모리에 누적하지 않는다. 청크 단위로 main에 보내 즉시 append.
- **`AudioWorkletNode`를 destination까지 연결하지 않으면 `process()`가 호출되지 않는다.** 렌더링 그래프는 destination에서 역방향으로 순회하므로
  마이크 → 워크릿만 이어 두면 청크가 한 번도 오지 않는다. 스피커로 소리가 되돌아가는 에코를 막으려면 `gain = 0`인 `GainNode`를 사이에 두고 destination에 연결한다.
- **워크릿 파일이 `data:` URL로 인라인되면 프로덕션 빌드에서만 녹음이 죽는다.** Vite가 4KB 미만 에셋을 인라인하는데 renderer CSP는 `script-src 'self'`라
  `audioWorklet.addModule('data:text/javascript;...')`가 차단된다. 개발 서버에서는 재현되지 않으므로 `pnpm build` 뒤 `out/renderer/assets/`에 워크릿 파일이 있는지 확인한다.
- `AudioContext({ sampleRate: 16000 })`이 일부 장치에서 무시될 수 있다 → 실제 `context.sampleRate`를 확인하고 다르면 main에서 리샘플링하거나 오류 안내.
- 녹음 중 앱 종료/크래시 대비: WAV 헤더는 정지 시 확정하지만, 청크는 이미 디스크에 있으므로 다음 실행 시 "미완료 녹음 복구" 처리를 고려한다 (Phase 3 이후).
- macOS: `NSMicrophoneUsageDescription` 없으면 크래시. `systemPreferences.askForMediaAccess('microphone')`로 명시 요청. Windows: 설정 > 개인정보 > 마이크 꺼짐이면 `getUserMedia`가 실패하므로 안내 UI 필요.

## 프로세스 / 성능
- main 프로세스에서 동기 IO·동기 spawn(`spawnSync`, `execSync`)은 UI를 멈춘다. 비동기 `spawn`만 사용.
- STT와 화자 분리를 무조건 병렬로 돌리지 않는다. `os.cpus().length`가 8 미만이면 순차 실행.
- 잡 큐는 한 번에 하나만 처리한다(여러 회의 동시 처리 금지). 큐 상태는 앱 재시작 시 `status='processing'`인 회의를 `error`로 정리하거나 재시도한다.
- **renderer가 보낸 PCM 청크를 `await` 없이 파일에 쓰면 순서가 섞인다.** WAV writer는 append를 직렬화(이전 쓰기 Promise에 체이닝)하고, `recording:stop`은 그 큐가 비워진 뒤에 헤더를 확정해야 한다.
- whisper 진행률은 stderr/stdout 포맷이 버전에 따라 달라질 수 있으므로 파싱 실패 시 진행률만 숨기고 작업은 계속한다.

## 빌드 / 배포
- **`better-sqlite3`는 Electron ABI로 리빌드되므로 vitest(순수 Node)에서 import하면 `NODE_MODULE_VERSION` 오류로 죽는다.**
  DB 계층(`src/main/db/*`)은 단위 테스트 대상에서 제외하고, 순수 함수(병합·포맷·파서·WAV 헤더)만 테스트한다. DB 동작은 `pnpm dev`로 확인한다.
- 네이티브 애드온(`better-sqlite3`)은 Electron ABI로 리빌드가 필요하다. pnpm 10은 의존성의 install/postinstall 스크립트를 기본 차단하므로 `package.json`의 `pnpm.onlyBuiltDependencies`에 등록하고(`electron`, `esbuild`, `electron-winstaller` 포함) `pnpm install` 로그에 "Ignored build scripts" 경고가 없는지, `electron-builder install-app-deps`가 실행되는지 확인한다.
- pnpm 기본 링커(isolated, 심볼릭 링크)는 electron-builder 패키징·네이티브 리빌드에서 문제를 일으킬 수 있다. `.npmrc`의 `node-linker=hoisted` / `shamefully-hoist=true`를 유지한다.
- `src/main`, `src/preload`는 Node에서 실행된다. 테스트 러너는 vitest(`pnpm test`), TS 스크립트 실행은 tsx(`pnpm tsx scripts/x.ts`)를 쓴다. `bun test`, `bun:*` 모듈, `Bun.*` API는 사용하지 않는다.
- 바이너리는 `asarUnpack` 대상이어야 실행 가능하고, macOS에서는 실행 권한(`chmod +x`)과 quarantine 해제가 필요하다. notarization 시 동봉 바이너리와 dylib까지 모두 서명(`hardenedRuntime`, entitlements에 `com.apple.security.cs.allow-unsigned-executable-memory` 등 필요 여부 확인).
- 모델 파일은 절대 리포지토리나 설치 파일에 포함하지 않는다. `userData/models`에 다운로드하고 `.gitignore`로 차단.
- `electron-builder.yml`의 `publish.url`, `appId`, `NSMicrophoneUsageDescription`은 스캐폴드 기본값이므로 배포 전 반드시 교체.

## 데이터
- 화자 이름을 `utterances`에 복사하지 않는다 (speakers 매핑으로만).
- 삭제는 `ON DELETE CASCADE`에 의존하므로 `PRAGMA foreign_keys = ON`을 연결마다 켠다.
- 원본 WAV 삭제는 `status='done'` 이후에만, 그리고 설정이 "삭제"일 때만 수행한다. 실패한 회의의 WAV는 재시도를 위해 보관한다.

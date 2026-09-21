# 브라우저 STT 프로토타입 계획

브랜치: `test/browser-stt` (워크트리 `../meeting-stt-web`)
작성: 2026-09-18

## 0. 전제 — 기존 기획을 따르지 않는다

이 문서는 `.claude/skills/meeting-stt-dev/SKILL.md`의 SSOT를 **따르지 않는다**. 사용자 지시로
기존 데스크탑 앱의 방향·아키텍처·로드맵·코드 규칙을 전부 무시하고, **모델만 가져와 브라우저에서 돌아가는지
확인하는 테스트**를 만든다. 여기서 나온 결정이 `main`의 문서를 바꾸지 않으며, 반대로 `main`의 결정이
이 브랜치를 구속하지도 않는다.

- 제품이 아니다. 배포·업데이트·서명·온보딩·설정 화면·DB 스키마는 범위 밖이다.
- Electron, IPC, `src/main`, `src/preload`, better-sqlite3, CSS Modules, 컴포넌트 레이어 규칙 모두 쓰지 않는다.
- 이 브랜치의 기존 소스 트리는 참고용으로만 둔다. 프로토타입은 `web/` 아래에 새로 만든다.

## 1. 목표와 비목표

**목표**: 정적 웹 페이지 하나에 오디오 파일을 떨어뜨리거나 **마이크로 그 자리에서 녹음하면**,
브라우저 안에서만 돌아서 화자가 붙은 한국어 회의록이 나온다. 서버로 오디오를 보내지 않는다.

**성공 판정**: 71분짜리 실제 한국어 회의 녹음을 넣어서
(1) 끝까지 죽지 않고 완료되고, (2) 텍스트 품질이 데스크탑 결과와 비슷하고, (3) 주요 화자가 구분되면 성공.

**비목표** (이번에 안 함)

- 요약(LLM), 편집, 저장, 화자 이름 지정, 다중 회의 목록.
- 모바일·Safari 대응. 개발 기기 Chrome 하나만 본다.
- 예쁜 UI. 진행률과 결과 텍스트만 보이면 된다.
- 시스템 오디오(화면 공유 탭 소리) 캡처. 녹음은 마이크만이다.

> **2026-09-18 변경**: 마이크 녹음이 처음에는 비목표였고 S6도 "S5 통과 후 선택"이었으나,
> 사용자 지시로 **범위에 넣고 S5와 무관하게 구현**한다. 파일 입력만으로는 이 프로토타입이
> 데스크탑 앱을 대신할 수 있는지 판단할 수 없기 때문이다. 5절 S6에 완료 기준을 적었다.

## 2. 가져오는 것

`main`에서 **파일 4개만** 복사한다. 순수 TS라 그대로 돌아간다.

| 파일                             | 하는 일                                             | 손볼 곳                                    |
| -------------------------------- | --------------------------------------------------- | ------------------------------------------ |
| `src/shared/merge.ts`            | 화자 구간 + 단어 타임스탬프 → 발화 단위 회의록      | 없음                                       |
| `src/shared/types.ts`            | `SttSegment` / `SpeakerSegment` / `MergedUtterance` | 안 쓰는 타입 제거                          |
| `src/main/pipeline/normalize.ts` | RMS 음량 정규화                                     | 파일 IO 껍데기를 `Float32Array` 입출력으로 |
| `src/shared/format.ts`           | 타임스탬프·회의록 텍스트 포맷                       | 없음                                       |

`merge.ts`의 테스트(`merge.test.ts`)도 같이 가져오면 이식이 깨졌는지 바로 안다.

**나머지는 전부 버린다.** 특히 `whisper.ts`(whisper-cli JSON 파서)와 `diarize.ts`(CLI 출력 파서)는
바이너리 출력 형식에 묶인 코드라 브라우저에서 쓸 데가 없다.

## 3. 엔진 선택

테스트니까 **Emscripten 툴체인이 필요 없는 경로**를 1순위로 잡는다. npm 설치만으로 시작할 수 있어야 한다.
결론부터 쓰면 VAD·STT·분할·임베딩 **네 모델을 전부 `@huggingface/transformers` 하나로** 돌린다.
런타임 의존성이 하나뿐이고, 모델을 전부 Hugging Face에서 받으므로 CORS 확인이 한 번으로 끝난다.

### STT: transformers.js v4 + WebGPU

- 모델: `onnx-community/whisper-large-v3-turbo_timestamped` (ONNX). 데스크탑이 쓰는 `ggml-large-v3-turbo-q5_0`과 같은 가중치의 다른 포맷.
  `_timestamped`가 붙지 않은 기본 저장소는 디코더에 cross-attention 출력이 없어 `return_timestamps: 'word'`가
  "Model outputs must contain cross attentions"로 죽는다. 파일 크기는 같다.
- WebGPU로 GPU를 쓴다. `SharedArrayBuffer`가 필요 없으므로 **COOP/COEP 헤더를 설정하지 않아도 된다** — 배포 난이도가 사라진다.
- 30초 청크 + stride는 라이브러리가 처리한다.
- **확인함**: `return_timestamps: 'word'`는 `_timestamped` 저장소에서만 동작한다. 기본 저장소로는 예외가 난다.

계획을 세울 때는 transformers.js v3을 적었지만 구현 시점의 최신은 v4(4.3.0)라 v4로 간다.

whisper.cpp WASM은 **폴백**으로만 둔다. Emscripten 빌드가 필요하고, 멀티스레드에 COOP/COEP가 붙고,
무엇보다 GPU를 못 써서 CPU로만 돈다.

### 화자 분리: transformers.js + 직접 구현한 군집

sherpa-onnx WASM은 `wasm/speaker-diarization` 예제를 직접 빌드해야 해서 테스트 단계에 맞지 않는다.
`onnxruntime-web`으로 두 ONNX를 직접 돌리는 것도 세션 관리와 전처리(임베딩 모델의 fbank)를 전부 손으로 짜야 한다.
transformers.js가 두 모델을 **이미 지원**하므로 그쪽을 쓴다. 남는 일은 군집뿐이다.

1. **분할**: `onnx-community/pyannote-segmentation-3.0`을 10초 창으로 슬라이딩. 출력은 powerset 클래스라
   argmax 후 화자별 이진 마스크로 푼다 (7클래스 = 무음 + 단독 3 + 동시발화 3).
2. **임베딩**: 창 안에서 얻은 화자 구간마다 `onnx-community/wespeaker-voxceleb-resnet34-LM`으로 임베딩 추출.
3. **군집**: 코사인 거리 + complete-linkage AHC. **참석자 수를 입력받아 클러스터 수를 고정**하는 것이 기본 경로다.

임베딩 모델을 데스크탑과 같은 3D-Speaker ERes2Net 대신 WeSpeaker로 바꾼 이유는 **배포처** 때문이다.
ERes2Net ONNX는 sherpa-onnx의 GitHub Releases에만 있어 CORS를 확인해야 하고 전처리도 직접 짜야 하지만,
WeSpeaker는 Hugging Face에 있고 transformers.js가 전처리까지 처리한다. 화자 품질이 떨어지면 그때 바꾼다.

창 사이의 화자 동일성은 **맞추지 않는다**. 창마다 나온 구간을 전부 임베딩해서 전역으로 한 번에 군집하므로
창 간 순열 정합(permutation matching)이 필요 없다. sherpa-onnx가 하는 일과 같은 구조다.

참석자 수 고정이 기본인 이유는 `docs/phase1-results.md`에 실측이 있다. 임계값 방식은 녹음이 길수록
화자가 무한히 늘어난다(10분 발췌에서 임계값 0.6이 23명, 0.8이 12명, 71분 원본은 0.9에서도 115개 클러스터).
프로토타입 UI에도 "참석자 수" 입력 칸을 반드시 둔다.

### VAD

silero v5를 STT 앞에 붙인다. 데스크탑에서 VAD를 끄면 환각뿐 아니라
**타임스탬프가 밀려서 화자 경계 단어가 앞 화자에게 붙었다**. 품질 비교의 전제 조건이다.

`@ricky0123/vad-web` 대신 `onnx-community/silero-vad`를 transformers.js의 `AutoModel`로 직접 돌린다.
vad-web은 자산 경로를 `document`에서 찾는 가정이 있어 Worker 안에서 깨지고, 어차피 의존성을 하나 더 늘린다.
동작은 whisper.cpp의 `--vad`와 같게 맞춘다 — **무음을 잘라낸 오디오로 추론하고 타임스탬프를 원래 시간으로 되돌린다.**

## 4. 처리 흐름

```
[마이크 녹음: getUserMedia → AudioWorklet(16kHz mono Float32) → Int16 블록 누적 → 정지 시 WAV Blob]
       ↓ (파일과 같은 입구로 들어간다)
[오디오 파일]
  → decodeAudioData + OfflineAudioContext → 16kHz mono Float32Array
  → RMS 정규화 (normalize.ts 이식)
  → ┌ Worker A: 화자 분리 (분할 → 임베딩 → 군집) → SpeakerSegment[] → terminate
    └ Worker B: VAD → 무음 제거 → STT → 시간 되돌리기 → SttSegment[] (단어 포함) → terminate
  → merge.ts → MergedUtterance[]
  → 화면 출력
```

Worker는 **순차로 띄우고 끝나면 즉시 terminate** 한다. WASM 메모리는 한 번 늘면 줄지 않으므로,
동시에 띄우면 최고 사용량이 두 엔진의 합이 된다. 화자 분리를 먼저 돌려서 메모리를 회수한 뒤 STT를 올린다.

녹음이 곧장 `Float32Array`로 파이프라인에 들어가지 않고 **WAV Blob을 거쳐 파일과 같은 입구로 들어가는** 이유는 세 가지다.
(1) 입력 경로가 하나뿐이라 디코딩·정규화·파형·재실행 코드를 나눠 쓸 필요가 없다.
(2) 누적을 Int16으로 하면 피크 메모리가 Float32의 절반이고, 데스크탑이 16bit PCM WAV로 쓰는 것과 결과가 같다.
(3) 녹음한 것을 그대로 내려받아 데스크탑 앱에 넣어 **같은 입력으로 두 구현을 비교**할 수 있다.

## 5. 단계

목표는 "각 단계가 혼자 돌아가는 걸 확인하고 나서 잇기"다. 중간에 막히면 거기서 멈추고 판단한다.

2026-09-18 기준 **S0~S4와 S6을 구현했고, 모델 배선은 Node(`web/scripts/smokeModels.ts`)로 확인했다.**
S0의 WebGPU 어댑터 확인과 S2·S3·S5·S6의 브라우저 실측은 개발 기기 Chrome에서 직접 돌려 봐야 한다.

### S0 — 골격과 환경 확인

`web/`에 Vite + TS + React 최소 구성. `crossOriginIsolated`, WebGPU 어댑터, `deviceMemory`,
`navigator.storage.estimate()`를 찍어 보는 페이지 하나.
**완료 기준**: 개발 기기 Chrome에서 WebGPU 어댑터가 잡힌다. → 화면 첫 패널이 어댑터·shader-f16·`crossOriginIsolated`·저장소 여유를 찍는다. **브라우저에서 확인 필요.**

### S1 — 오디오 로드

파일 드롭 → 16kHz mono `Float32Array` → 정규화 → 파형/길이/평균 dBFS 표시.
**완료 기준**: 71분 파일을 넣어도 탭이 죽지 않고 정규화 전후 dBFS가 데스크탑 결과와 맞는다.
→ dBFS는 **일치 확인**. 10분 발췌에서 −44.6 → −20.0 dBFS(게인 +24.6dB)로 `docs/phase1-results.md`의 −44 dBFS와 맞는다.
71분 디코딩은 브라우저에서 확인 필요.

### S2 — STT 단독

transformers.js로 모델 받고 텍스트 뽑기. 모델 다운로드 진행률, 처리 진행률, 취소.
**완료 기준**: 10분 발췌에서 단어 타임스탬프가 붙은 세그먼트가 나오고, 글자수가 데스크탑(3505자) 대비 ±10% 이내.
→ 단어 타임스탬프는 `_timestamped` 저장소에서 **동작 확인**. 글자수 비교는 turbo를 브라우저에서 돌려야 한다.

### S3 — 화자 분리 단독

분할 → 임베딩 → 군집. 참석자 수 입력 지원.
**완료 기준**: 10분 발췌에서 참석자 수 3으로 돌렸을 때 발표자/진행자/보조 구성이 나온다.
→ 합성 픽스처(115초, 3명)에서 **프레임 정확도 94.9%, 클러스터 3개**. 10분 실제 녹음도 클러스터 3개로 완주했다.

### S4 — 병합

`merge.ts` 붙이고 `merge.test.ts` 통과 확인.
**완료 기준**: 화자가 붙은 회의록이 화면에 나온다.
→ `merge.test.ts`가 이식본에서 그대로 통과하고, 스모크 테스트가 화자 붙은 회의록을 출력한다.

### S5 — 전체 실행과 측정

71분 원본으로 끝까지. 6절 표를 채운다.
**완료 기준**: 완주 + 측정값 기록. **아직 안 함** — 브라우저에서 돌려야 하는 단계다.

### S6 — 마이크 녹음

`getUserMedia` + AudioWorklet으로 16kHz mono Float32 PCM을 직접 모은다. MediaRecorder는 쓰지 않는다 —
컨테이너(webm/opus)로 압축돼 나오면 다시 디코딩해야 하고, 손실 압축이 STT 앞에 한 겹 더 끼어든다.

- 워크릿이 보내는 청크는 **Int16 블록(10초 단위)으로 누적**한다. Float32로 들고 있으면 71분에 273MB이고,
  Int16이면 절반이면서 데스크탑이 쓰는 16bit PCM WAV와 값이 같다.
- 정지하면 블록을 이어 붙여 **WAV Blob → `File`** 로 만들고, 드롭한 파일과 **같은 입구**(`loadAudio`)로 넣는다.
- 녹음 중에는 경과 시간과 **입력 세기를 dBFS로** 보여 준다. 원거리 마이크로 한 시간을 녹음한 뒤에야
  음량이 모자랐다는 걸 알게 되는 것이 이 프로젝트가 이미 한 번 치른 대가다 (7절 첫 항목).
- 녹음본은 **WAV로 내려받을 수 있게** 둔다. 같은 파일을 데스크탑 앱에 넣어야 두 구현을 비교할 수 있다.

**완료 기준**: 개발 기기 Chrome에서 몇 분짜리 회의를 녹음해 (1) 정지 즉시 파형·dBFS가 나오고,
(2) 같은 화면에서 이어 돌린 파이프라인이 화자가 붙은 회의록을 내놓고, (3) 내려받은 WAV가
데스크탑 앱에서도 열리면 통과. **브라우저에서 확인 필요.**

## 6. 측정과 판단 기준

S5에서 아래를 채운다. 비교 대상은 `docs/phase1-results.md`의 M3 Pro 네이티브 실측이다.

| 항목                 | 데스크탑 (네이티브, Metal) | 브라우저 (측정)                    |
| -------------------- | -------------------------- | ---------------------------------- |
| STT, 10분 발췌       | 35초 (RTF 0.058)           |                                    |
| 화자 분리, 10분 발췌 | 141초 (RTF 0.24)           |                                    |
| 전체, 71분           | —                          |                                    |
| 피크 메모리          | —                          |                                    |
| 모델 총 다운로드     | 574MB + 32MB               | q4f16 기준 564MB + 32MB + 2MB(VAD) |

**판단선**: 전체 RTF가 0.5를 넘으면(60분 회의에 30분 이상) 이 구성으로는 쓸 물건이 안 된다.
그때는 whisper를 small로 낮추거나, 화자 분리를 빼고 텍스트만 뽑는 쪽으로 범위를 줄인다.

주의할 점은 **데스크탑에서도 병목이 STT가 아니라 화자 분리였다**는 것이다(RTF 0.24). whisper는
WebGPU로 구제할 여지가 있지만 화자 분리는 그렇지 않을 수 있으므로, S3을 S2보다 먼저 재도 좋다.

## 7. 알려진 함정

기존 프로젝트에서 이미 대가를 치르고 확인한 것들이다.

- **음량이 작은 녹음은 Whisper가 수십 초를 통째로 놓친다.** 원거리 마이크 녹음에서 11초짜리 세그먼트가
  "네네" 한 마디로 나왔다. 정규화를 빼고 비교하면 안 된다.
- **VAD 없이 추론 금지.** 무음에서 환각을 만들고 타임스탬프가 밀린다.
- **silero v5에 512샘플만 넣으면 안 된다.** 직전 창의 끝 64샘플을 앞에 붙여 576샘플을 넣어야 한다
  (silero-vad 저장소 `OnnxWrapper`가 하는 일). 컨텍스트 없이 돌렸더니 10분 원거리 녹음에서
  발화가 **383초 대신 175초**로 잡혔다. 조용한 녹음일수록 차이가 크다.
- **Whisper ONNX 저장소는 `_timestamped`가 붙은 쪽을 써야 단어 타임스탬프가 나온다.** 기본 export에는
  cross-attention 출력이 없어 `return_timestamps: 'word'`가 예외로 죽는다.
- **임계값 군집은 긴 녹음에서 화자가 무한정 늘어난다.** 참석자 수 입력이 기본 경로다.
- **`decodeAudioData`는 컨텍스트의 샘플레이트로 푼다.** 16kHz `OfflineAudioContext`에 디코딩을 맡기면
  원본을 48kHz로 통째로 푸는 일(스테레오 1시간 1.3GB)을 피할 수 있다. 프로토타입은 이 방식을 쓴다.
- **WASM은 32비트 주소라 인스턴스당 4GB가 상한**이고 실제 한도는 더 낮다. WebGPU 버퍼는 이 상한과 별개다.
- **WASM 메모리는 줄지 않는다.** Worker를 terminate해야 회수된다.
- 모델 파일은 CORS 헤더를 주는 곳에서 받아야 한다. Hugging Face는 준다. GitHub Releases는 확인이 필요하다.
- 550MB를 `Uint8Array`로 들고 있으면 JS 힙과 WASM 힙에 두 번 올라간다. 넘긴 뒤 참조를 바로 끊는다.
- **워크릿을 destination까지 잇지 않으면 `process()`가 한 번도 불리지 않는다.** 마이크 → 워크릿만 이어 두면
  청크가 오지 않고, 그냥 이으면 마이크 소리가 스피커로 되돌아간다. `gain = 0`인 `GainNode`를 사이에 둔다.
- **`AudioContext({ sampleRate: 16000 })`이 장치에 따라 무시된다.** 실제 `context.sampleRate`를 확인하고
  다르면 녹음을 시작하지 말고 안내한다. 48kHz로 받아 놓고 16kHz라고 우기면 전사 결과가 통째로 어긋난다.
- **Vite가 4KB 미만 에셋을 `data:` URL로 인라인한다.** 워크릿이 인라인되면 CSP가 붙은 환경에서
  `audioWorklet.addModule('data:…')`이 막히고, 개발 서버에서는 재현되지 않는다. 워크릿은 인라인에서 뺀다.
- **녹음 중 탭을 닫거나 새로고침하면 녹음이 통째로 사라진다.** 디스크에 쓰지 않는 구성이라 그렇다.
  프로토타입은 `beforeunload` 경고까지만 하고, 길게 녹음할 일이 생기면 그때 OPFS를 본다.

## 8. 미결 항목

- ~~`return_timestamps: 'word'`가 large-v3-turbo에서 동작하는가~~ → `_timestamped` 저장소를 쓰면 동작한다 (2026-09-18 확인).
  단어 시각의 **품질**이 데스크탑(whisper.cpp)과 비슷한지는 S2에서 따로 봐야 한다.
- powerset 창 단위 구간을 전역 군집으로 이어붙이는 방식이 sherpa-onnx만큼 나오는가. 창 경계에서 구간이 잘려 임베딩이 짧아지는 것이 걱정거리다.
- 모델 캐시를 OPFS로 할지 Cache API로 할지. transformers.js가 자체 캐시를 쓰므로 그대로 둬도 될 수 있다.
- WeSpeaker(VoxCeleb 학습)가 한국어 화자에 쓸 만한가. 데스크탑의 ERes2Net과 다른 모델이라 S3에서 처음 재는 값이다.
- transformers.js가 기본으로 쓰는 ORT WASM 자산이 jsDelivr CDN에서 온다. 오프라인 확인이 필요하면 로컬로 복사해야 한다.

# 로컬 STT 회의록 데스크탑 앱 개발 가이드

클로바 노트, 젠스파크 회의록과 유사한 기능을 서버 없이 데스크탑 앱 하나로 구현하기 위해 필요한 지식을 정리한 문서입니다. 대상 독자는 JavaScript/TypeScript 개발자이며, 2026년 8월 기준 정보로 작성했습니다.

---

## 1. 요구사항과 전체 그림

만들려는 앱의 요구사항을 기능 단위로 나누면 다음과 같습니다.

| 요구사항                          | 필요한 기술 영역                                              |
| --------------------------------- | ------------------------------------------------------------- |
| 앱 내 녹음                        | 마이크 캡처 (Web Audio API / MediaRecorder), 오디오 포맷 변환 |
| 준수한 성능의 STT (한국어 포함)   | Whisper 계열 로컬 추론 엔진 (whisper.cpp 등)                  |
| 누가 말했는지 구분                | 화자 분리 (Speaker Diarization, pyannote 계열 ONNX 모델)      |
| STT 결과를 화자별 발화문으로 작성 | 타임스탬프 기반 STT-화자 병합 로직                            |
| 복사 / 수정                       | 프론트엔드 에디터, 클립보드 API                               |
| 홈 리스트 → 디테일 페이지         | 로컬 DB (SQLite), 라우팅                                      |
| 서버 없이 동작                    | 데스크탑 프레임워크 (Tauri / Electron), 모델 파일 로컬 배포   |

처리 흐름은 하나의 파이프라인으로 이어집니다.

```
[마이크 녹음]
  → [16kHz mono WAV 변환]
  → [STT 추론 (Whisper): 텍스트 + 세그먼트별 타임스탬프]
  → [화자 분리 (Diarization): 구간별 화자 라벨 + 타임스탬프]
  → [두 결과를 타임스탬프로 병합 → "화자 A: 발화 내용" 형태의 회의록]
  → [SQLite 저장]
  → [홈 리스트 / 디테일 페이지에서 조회·수정·복사]
```

녹음본 재생이 요구사항에 없으므로, 파이프라인 완료 후 원본 오디오 파일을 삭제하거나 옵션으로만 보관하는 설계가 가능하며, 덕분에 저장 용량 관리가 크게 쉬워집니다.

---

## 2. 데스크탑 프레임워크 선택: Tauri vs Electron

JS/TS 개발자가 선택할 수 있는 현실적인 후보는 Tauri v2와 Electron 두 가지입니다.

### 2.1 비교

| 항목               | Tauri v2                                                       | Electron                                    |
| ------------------ | -------------------------------------------------------------- | ------------------------------------------- |
| 백엔드             | Rust + OS 네이티브 WebView                                     | Node.js + 번들된 Chromium                   |
| 번들 크기          | 약 3~10MB                                                      | 약 120~200MB                                |
| 유휴 메모리        | 약 40~80MB                                                     | 약 150~400MB                                |
| 외부 바이너리 실행 | Sidecar 기능 내장 (수명 주기 관리 포함)                        | child_process로 직접 spawn·관리             |
| 렌더링 일관성      | OS별 WebView 차이 존재 (macOS는 WKWebView, Windows는 WebView2) | 모든 OS에서 동일한 Chromium                 |
| 학습 비용          | Rust 기초가 필요할 수 있음                                     | 전부 JS/TS로 작성 가능                      |
| 자동 업데이트      | 전체 바이너리 다운로드 방식                                    | electron-updater (차등 업데이트, 업계 표준) |

2026년 기준 벤치마크에서 Tauri 앱은 Electron 대비 크기가 96% 작고 메모리를 75% 적게 사용하며, 새 프로젝트라면 특별한 이유가 없는 한 Tauri v2로 시작하라는 평가가 일반적입니다. 반면 Electron은 VS Code, Slack 등에서 검증된 성숙도와 순수 JS 스택이라는 장점을 유지하고 있습니다.

### 2.2 결정에 도움이 되는 판단

- STT 앱의 특성상 사용자는 앱을 백그라운드에 오래 켜두게 되므로, 유휴 메모리와 배터리 소모가 작은 Tauri가 제품 관점에서 유리합니다.
- STT 추론과 화자 분리를 외부 바이너리(whisper.cpp CLI, sherpa-onnx CLI)로 돌릴 계획이라면, Tauri의 Sidecar가 spawn·종료·경로 해석을 프레임워크 차원에서 처리해 주기 때문에 Electron에서 직접 프로세스를 관리하는 것보다 코드가 깔끔해집니다.
- 반대로 smart-whisper 같은 Node.js 네이티브 애드온을 메인 프로세스에서 직접 쓰고 싶다면 Electron이 자연스럽습니다. Node 런타임이 앱에 내장되어 있기 때문입니다.
- Rust를 전혀 쓰고 싶지 않다면 Electron을 택해도 무방하며, 실제로 OpenWhispr 같은 로컬 회의록 오픈소스는 Electron 위에서 sherpa-onnx 바이너리를 spawn하는 구조로 동작합니다.

권장 조합은 "Tauri v2 + React(또는 Svelte) + TypeScript 프론트 + whisper.cpp/sherpa-onnx Sidecar"이며, JS만으로 가고 싶다면 "Electron + smart-whisper(네이티브 애드온) + sherpa-onnx node-addon npm 패키지"가 대안입니다.

---

## 3. STT 엔진

### 3.1 Whisper와 런타임

OpenAI Whisper는 68만 시간의 다국어 데이터로 학습된 ASR 모델로, 코드와 가중치 모두 MIT 라이선스라서 다운로드 후 완전히 오프라인으로 제품에 넣어 배포할 수 있습니다. 2026년 현재 로컬 실행 런타임은 사실상 두 가지로 정리됩니다.

| 런타임             | 언어/의존성                              | 강점                                                                                                | 적합한 환경                          |
| ------------------ | ---------------------------------------- | --------------------------------------------------------------------------------------------------- | ------------------------------------ |
| **whisper.cpp**    | 순수 C/C++, 의존성 없음, 바이너리 약 5MB | Metal(Apple Silicon), CUDA, Vulkan, CPU 지원. Apple Silicon에서 large-v3 기준 실시간의 약 10배 속도 | Mac, CPU 전용 PC, 데스크탑 앱 임베딩 |
| **faster-whisper** | Python + CTranslate2                     | NVIDIA GPU에서 int8 양자화로 원본 대비 최대 4배 처리량                                              | NVIDIA GPU가 있는 환경, Python 서버  |

두 런타임 모두 동일한 Whisper 가중치를 사용하므로 정확도는 사실상 같고, 선택 기준은 사용자 하드웨어와 앱 통합 방식입니다. 데스크탑 앱에 임베딩한다는 조건에서는 Python 런타임을 함께 배포해야 하는 faster-whisper보다, 단일 바이너리로 끝나는 whisper.cpp가 압도적으로 유리합니다.

### 3.2 모델 크기와 한국어 성능

Whisper 모델은 tiny/base/small/medium/large-v3/large-v3-turbo로 나뉘며, GGML 포맷(.bin) 파일 크기와 품질이 비례합니다.

| 모델               | GGML 크기(대략) | 한국어 품질 감각                                                                                          |
| ------------------ | --------------- | --------------------------------------------------------------------------------------------------------- |
| tiny / base        | 75MB / 142MB    | 한국어에는 부족. 오인식이 많아 회의록 용도로는 비추천                                                     |
| small              | 466MB           | 조용한 환경의 또렷한 발화면 쓸 만하지만, 회의 환경에서는 아쉬움                                           |
| medium             | 1.5GB           | 실용 하한선. 속도와 품질의 절충안                                                                         |
| **large-v3**       | 약 3GB          | 한국어 기준 최상. 2026년 기준 일반 한국어 인식률이 WER 5~10% 수준으로 상용 API와 비교해도 손색없다는 평가 |
| **large-v3-turbo** | 약 1.6GB        | large-v3의 디코더를 줄인 경량판. 품질 손실이 작고 속도가 빨라 데스크탑 앱 기본값으로 적합                 |

양자화(q5_0, q8_0 등) 버전을 쓰면 파일 크기와 메모리를 절반 이하로 줄이면서 품질 하락을 소폭으로 억제할 수 있으므로, 배포 시에는 `ggml-large-v3-turbo-q5_0.bin` 계열을 기본 모델로 잡고 상위 모델을 옵션으로 제공하는 전략이 현실적입니다.

한국어 특화 관점에서 추가로 알아둘 사실이 있습니다.

- 리턴제로(rtzr)가 Whisper를 한국어 데이터로 파인튜닝한 모델을 공개한 사례가 있고, `rtzr/Awesome-Korean-Speech-Recognition` 저장소에 한국어 STT 벤치마크와 데이터셋 전처리 지식(이중 전사, normalization 등)이 정리되어 있어 한국어 품질을 끌어올릴 때 참고 자료로 좋습니다.
- 한국어 전사 데이터는 "(7시)/(일곱시)"처럼 발음·철자 이중 전사로 되어 있는 경우가 많아서, 파인튜닝을 시도한다면 전처리 방식이 tokenizer vocabulary와 출력 품질을 크게 좌우합니다.
- Whisper는 무음 구간에서 환각(hallucination) 텍스트를 만들어내는 고질적 문제가 있으므로, VAD(음성 활동 감지)로 무음을 잘라낸 뒤 추론하는 전처리가 품질에 직결됩니다. whisper.cpp에도 VAD 옵션이 있고, Silero VAD ONNX 모델을 별도로 앞단에 두는 방식도 널리 쓰입니다.

### 3.3 Whisper 외 대안 모델

- **NVIDIA Parakeet v3**: 영어 WER 6.32%로 Whisper turbo보다 정확하고 M4 Pro에서 103배 실시간 속도를 내지만, 지원 언어가 25개 유럽권 중심이라 한국어 회의록 용도에는 맞지 않습니다.
- **SenseVoice Small**: 중국어·일본어·한국어·광둥어·영어에 특화된 경량 모델로, CJK 언어에서 매우 빠른 속도를 보여 한국어 특화 대안으로 검토할 가치가 있습니다. sherpa-onnx에서 ONNX로 구동 가능합니다.
- **Qwen3-ASR**: 한국어를 포함한 30개 언어를 지원하고 타임스탬프 예측까지 되는 오픈소스 ASR 시리즈이지만, LLM 기반이라 모델이 무겁고 데스크탑 임베딩 난이도가 높습니다.
- **Voxtral (Mistral)**: 가중치가 공개된 LLM 기반 음성 모델로 Whisper large-v3보다 나은 전사 성능을 주장하지만, 유럽 언어에 최적화되어 있고 리소스 요구가 큽니다.

한국어 회의록이라는 목적에서는 "whisper.cpp + large-v3-turbo(또는 large-v3)"를 1순위, "sherpa-onnx + SenseVoice Small"을 경량 대안으로 두는 구성이 합리적입니다.

### 3.4 JS/TS에서 whisper.cpp를 쓰는 방법

세 가지 통합 방식이 있습니다.

**방식 A. CLI 바이너리 + child_process/Sidecar (권장)**

whisper.cpp를 플랫폼별로 빌드한 `whisper-cli` 바이너리를 앱에 동봉하고, 녹음이 끝나면 spawn해서 JSON 출력을 받는 방식입니다. 앱 크래시와 추론 크래시가 분리되고, 빌드 파이프라인에서 Metal/CUDA 가속 빌드를 플랫폼별로 준비하기 쉽다는 장점 때문에 실제 제품들이 가장 많이 택하는 구조입니다.

```bash
# 출력 예시: JSON으로 세그먼트별 타임스탬프를 받음
whisper-cli -m ggml-large-v3-turbo.bin -f meeting.wav \
  -l ko --output-json --print-progress
```

**방식 B. Node.js 네이티브 애드온 (Electron 선택 시)**

- `smart-whisper`: whisper.cpp를 감싼 네이티브 애드온으로, 모델을 한 번 로드해 여러 추론에 재사용하고 자동 오프로딩까지 해 주며, `task.on("transcribed", ...)` 이벤트로 진행 상황을 스트리밍 받을 수 있습니다. GPU 옵션도 지원합니다.
- `nodejs-whisper`: 16kHz WAV 자동 변환, 단어 단위 타임스탬프, txt/srt/vtt/json 출력을 지원하지만 설치 시 make 빌드 도구가 필요합니다.

**방식 C. transformers.js + WebGPU (브라우저 내 추론)**

Whisper ONNX를 WebGPU로 렌더러 프로세스 안에서 직접 돌리는 방식도 존재하지만, large 급 모델에서는 메모리와 속도 제약이 커서 회의록 품질 요구에는 미치지 못하므로 이번 프로젝트에는 권장하지 않습니다.

---

## 4. 화자 분리 (Speaker Diarization)

### 4.1 개념

화자 분리는 "누가 언제 말했는가"를 알아내는 작업으로, 오디오를 화자 단위 구간으로 나누고 각 구간에 SPEAKER_00, SPEAKER_01 같은 익명 라벨을 붙입니다. 표준 파이프라인은 세 단계로 구성됩니다.

1. **세그멘테이션**: 5초 단위 창을 겹쳐 훑으며 발화 구간과 화자 전환 지점을 찾습니다 (pyannote segmentation 3.0이 사실상 표준).
2. **화자 임베딩 추출**: 각 발화 구간에서 목소리 특징 벡터를 뽑습니다 (3D-Speaker ERes2Net, CAM++, NeMo TitaNet 등).
3. **클러스터링**: 임베딩을 묶어 같은 화자끼리 하나의 라벨로 합칩니다 (agglomerative clustering).

학계 표준인 pyannote.audio 파이프라인은 AMI, CALLHOUSE 같은 벤치마크에서 DER(화자 분리 오류율) 12~15% 수준을 기록하며, 상용 클라우드 서비스가 인용하는 수치와 같은 범위입니다.

### 4.2 데스크탑 앱에서의 현실적 선택: sherpa-onnx

pyannote.audio 원본은 PyTorch 기반이라 런타임만 약 1.5GB를 차지하고 GPU 없이는 느려서 데스크탑 앱 동봉이 사실상 불가능한 반면, sherpa-onnx 프로젝트가 pyannote segmentation 3.0을 ONNX로 변환해 배포하고 있어서 6.6MB짜리 단일 파일을 ONNX Runtime으로 CPU에서 돌릴 수 있습니다. 같은 모델을 훨씬 가벼운 형태로 쓰는 셈이며, 실제 로컬 회의록 앱(OpenWhispr 등)이 검증한 구조입니다.

sherpa-onnx 오프라인 화자 분리에 필요한 파일은 두 개입니다.

- 세그멘테이션 모델: `sherpa-onnx-pyannote-segmentation-3-0` (GitHub releases에서 다운로드)
- 화자 임베딩 모델: `3dspeaker_speech_eres2net_base_sv` 계열 또는 NeMo 계열 ONNX (int8 양자화판도 제공)

sherpa-onnx는 C++ 코어에 12개 언어 바인딩을 제공하며, JS 관점에서 중요한 사실은 **node-addon 기반 npm 패키지와 WebAssembly npm 패키지가 공식 제공된다**는 점입니다. 즉 Electron이라면 npm 설치만으로 화자 분리를 메인 프로세스에서 호출할 수 있고, Tauri라면 미리 빌드된 `sherpa-onnx-offline-speaker-diarization` CLI 바이너리를 Sidecar로 실행하면 됩니다.

주요 파라미터로는 예상 화자 수(`num_clusters`, 회의 참석자 수를 알면 지정)와 클러스터링 임계값(`cluster_threshold`, 모를 때 화자 수를 자동 추정하는 민감도)이 있으며, 짧은 발화 병합을 위한 최소 지속 시간 설정은 pyannote 논문의 권장 기본값을 그대로 쓰는 편이 안전합니다.

### 4.3 한계와 대응

- **겹쳐 말하기**: 두 사람이 동시에 말하는 구간은 단일 라벨 부여가 원리상 손실을 동반하므로, 회의록에서는 주 화자 기준으로 붙이고 넘어가는 절충이 일반적입니다.
- **비슷한 목소리**: 같은 성별·유사 음색의 화자가 섞이면 오분류가 늘어나므로, UI에서 화자 라벨을 수동으로 병합·수정하는 기능을 넣어두면 사용자가 스스로 복구할 수 있습니다.
- **화자 이름 부여**: 분리 결과는 SPEAKER_00 같은 익명 라벨이므로, 디테일 페이지에서 라벨을 클릭해 "김OO"처럼 이름을 바꾸면 같은 라벨의 모든 발화에 일괄 반영되는 UX가 클로바 노트와 동일한 패턴입니다.

### 4.4 참고: WhisperX 파이프라인 구조

Python 세계의 사실상 표준인 WhisperX는 "VAD → 배치 Whisper 추론 → wav2vec2 강제 정렬로 단어 단위 타임스탬프 확보 → pyannote 화자 분리 → 단어-화자 매핑"이라는 4단계 구조를 취하며, 우리가 만들 병합 로직의 설계 참고서로 가장 좋습니다. 특히 화자 배정 시 단순 선형 탐색 대신 interval tree로 겹침 질의를 O(log n)에 처리해 장시간 녹음에서 큰 속도 이득을 얻는 구현 디테일까지 공개되어 있습니다.

---

## 5. STT 결과와 화자 분리 결과 병합

두 파이프라인의 출력을 합쳐 최종 회의록을 만드는 로직은 직접 작성해야 하며, 알고리즘 자체는 타임스탬프 겹침 계산입니다.

입력 두 가지가 있다고 하면,

```ts
// Whisper 출력
type SttSegment = { start: number; end: number; text: string }

// Diarization 출력
type SpeakerSegment = { start: number; end: number; speaker: string }
```

각 STT 세그먼트에 대해 시간 구간이 가장 많이 겹치는 화자 구간의 라벨을 붙입니다.

```ts
function assignSpeakers(
  stt: SttSegment[],
  speakers: SpeakerSegment[]
): Array<SttSegment & { speaker: string }> {
  return stt.map((seg) => {
    let best = { speaker: 'UNKNOWN', overlap: 0 }
    for (const sp of speakers) {
      const overlap = Math.min(seg.end, sp.end) - Math.max(seg.start, sp.start)
      if (overlap > best.overlap) best = { speaker: sp.speaker, overlap }
    }
    return { ...seg, speaker: best.speaker }
  })
}
```

품질을 높이는 요령은 다음과 같습니다.

- Whisper 세그먼트는 문장 중간에 화자가 바뀌어도 하나로 뭉쳐 나올 수 있으므로, whisper.cpp의 단어 단위 타임스탬프 옵션을 켜서 단어 레벨로 화자를 배정한 뒤 연속된 동일 화자 단어를 다시 문장으로 묶으면 화자 전환 경계가 훨씬 정확해집니다.
- 배정 후 같은 화자의 연속 발화는 하나의 문단으로 병합하고, 0.5초 미만의 고아 세그먼트는 앞뒤 발화에 흡수시키면 읽기 좋은 회의록이 됩니다.
- 녹음이 길어지면 세그먼트 수가 수천 개가 되므로, WhisperX처럼 화자 구간을 정렬해 두고 이진 탐색으로 겹침을 찾는 최적화를 적용할 수 있습니다.

최종 산출물 형태는 발화 배열이며, 그대로 DB에 저장하고 UI에 렌더링합니다.

```ts
type Utterance = {
  id: string
  speaker: string // "SPEAKER_00" 또는 사용자 지정 이름
  start: number // 초
  end: number
  text: string // 사용자가 수정 가능
}
```

---

## 6. 녹음 구현

### 6.1 마이크 캡처

Tauri와 Electron 모두 WebView 안에서 표준 웹 API를 그대로 쓸 수 있으므로, 녹음은 익숙한 브라우저 API로 구현합니다.

```ts
const stream = await navigator.mediaDevices.getUserMedia({
  audio: {
    channelCount: 1,
    echoCancellation: true,
    noiseSuppression: true
  }
})
```

캡처한 스트림을 파일로 만드는 방법은 두 가지가 있고, Whisper가 16kHz mono PCM WAV를 요구한다는 사실이 선택에 영향을 줍니다.

- **MediaRecorder**: 구현이 가장 쉽지만 출력이 webm/opus라서 추론 전에 ffmpeg 변환 단계가 필요합니다.
- **AudioWorklet으로 PCM 직접 수집 (권장)**: AudioContext를 `sampleRate: 16000`으로 열고 AudioWorkletProcessor에서 Float32 PCM 청크를 그대로 모으면, 변환 없이 WAV 헤더만 붙여 바로 추론에 넘길 수 있으므로 ffmpeg 의존성이 사라집니다. 장시간 녹음 시 메모리에 전부 들고 있지 말고 주기적으로 디스크에 append하는 설계가 안전합니다.

플랫폼 권한도 챙겨야 합니다. macOS는 Info.plist에 `NSMicrophoneUsageDescription`을 넣어야 하고 (Tauri/Electron 빌드 설정에서 지정), Windows는 설정의 마이크 개인정보 권한이 꺼져 있으면 캡처가 실패하므로 오류 안내 UI가 필요합니다.

### 6.2 시스템 오디오(회의 상대방 소리) 캡처

화상회의 회의록을 노리면 마이크뿐 아니라 스피커로 나오는 소리도 잡아야 하는데, OS별 난이도가 크게 다릅니다. Windows는 WASAPI loopback으로 비교적 쉽게 가능하고, macOS는 ScreenCaptureKit(13+) 또는 가상 오디오 드라이버(BlackHole)가 필요해서 난이도가 높습니다. Electron에는 `desktopCapturer`로 화면+오디오를 잡는 경로가 있으나 macOS 오디오는 제약이 있습니다. 1차 버전에서는 마이크 녹음만 지원하고(대면 회의는 마이크 하나로 전원의 목소리가 잡히므로 충분히 성립), 시스템 오디오는 2차 과제로 미루는 편을 권합니다.

---

## 7. 데이터 저장

### 7.1 저장소 선택

회의 목록·발화·메타데이터는 구조화된 질의가 필요하므로 SQLite가 정답에 가깝습니다.

- **Tauri**: 공식 `tauri-plugin-sql` (SQLite 지원) 또는 Rust 쪽에서 rusqlite 사용.
- **Electron**: `better-sqlite3` (동기 API, 메인 프로세스에서 사용)가 사실상 표준.

모델 파일과 임시 오디오는 앱 데이터 디렉터리(Tauri의 `appDataDir`, Electron의 `app.getPath("userData")`) 아래에 둡니다.

### 7.2 스키마 예시

```sql
CREATE TABLE meetings (
  id TEXT PRIMARY KEY,          -- uuid
  title TEXT NOT NULL,          -- 기본값: "2026-08-25 회의" 등
  created_at INTEGER NOT NULL,  -- epoch ms
  duration_sec REAL NOT NULL,
  status TEXT NOT NULL,         -- 'recording' | 'processing' | 'done' | 'error'
  summary TEXT                  -- (선택) 향후 로컬 LLM 요약용
);

CREATE TABLE utterances (
  id TEXT PRIMARY KEY,
  meeting_id TEXT NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  ord INTEGER NOT NULL,         -- 표시 순서
  speaker_label TEXT NOT NULL,  -- 'SPEAKER_00' 등 원본 라벨
  start_sec REAL NOT NULL,
  end_sec REAL NOT NULL,
  text TEXT NOT NULL            -- 사용자가 수정하면 여기가 갱신됨
);

CREATE TABLE speakers (
  meeting_id TEXT NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  label TEXT NOT NULL,          -- 'SPEAKER_00'
  display_name TEXT,            -- 사용자가 지정한 이름
  PRIMARY KEY (meeting_id, label)
);
```

화자 이름을 utterances에 직접 쓰지 않고 speakers 테이블에서 라벨→이름 매핑으로 관리하면, 이름을 한 번 바꿀 때 해당 회의의 모든 발화에 즉시 반영됩니다.

---

## 8. UI 설계

### 8.1 화면 구성

- **홈 화면**: meetings 테이블을 created_at 내림차순으로 리스트업하고, 각 항목에 제목·날짜·길이·처리 상태를 표시합니다. 처리 중(status = processing)인 항목은 진행률 표시가 있으면 좋으며, whisper.cpp의 progress 출력이나 smart-whisper의 transcribed 이벤트로 진행률 데이터를 얻을 수 있습니다.
- **녹음 화면**: 녹음 시작/정지, 경과 시간, 입력 레벨 미터(AnalyserNode로 구현)를 제공하고, 정지 시 자동으로 파이프라인을 시작합니다.
- **디테일 페이지**: 발화를 화자별 말풍선 또는 "이름 + 타임스탬프 + 본문" 리스트로 렌더링합니다.

라우팅은 React Router(또는 TanStack Router) 메모리/해시 라우터로 충분하며, 데스크탑 앱은 URL 공유가 없으므로 브라우저 히스토리 방식에 얽매일 필요가 없습니다.

### 8.2 수정 기능

발화 단위 인라인 편집이 요구사항에 가장 잘 맞습니다. 각 발화 텍스트를 클릭하면 contentEditable 또는 textarea로 전환되고, blur 시 utterances.text를 UPDATE하는 방식이면 별도 에디터 라이브러리 없이 구현됩니다. 화자 라벨 클릭 시에는 이름 변경과 "다른 화자로 재배정" 두 동작을 제공하면 화자 분리 오류를 사용자가 복구할 수 있습니다. 문서 전체를 자유 편집하는 요구가 생기면 그때 TipTap 같은 에디터 도입을 검토해도 늦지 않습니다.

### 8.3 복사 기능

전체 복사와 발화 단위 복사를 제공하고, 전체 복사 시 아래 형태의 플레인 텍스트로 조립합니다.

```
[00:00:12] 김OO: 지난주 논의했던 배포 일정부터 정리하겠습니다.
[00:00:25] 이OO: 네, QA 쪽 이슈가 하나 남아 있습니다.
```

클립보드는 `navigator.clipboard.writeText()`로 처리되며, Tauri에서는 clipboard-manager 플러그인을 써도 됩니다. 마크다운 형식 복사 옵션(화자를 굵게 등)을 추가하면 노션 등으로 옮길 때 편리합니다.

---

## 9. 모델 파일 배포 전략

large-v3-turbo만 해도 1.6GB이므로 설치 파일에 모델을 동봉하면 배포가 무거워집니다. 검증된 패턴은 **첫 실행 시 다운로드**입니다.

- 앱 최초 실행 시 온보딩 화면에서 모델 선택지(권장: large-v3-turbo q5 / 고품질: large-v3 / 저사양: small)를 보여주고, 선택된 GGML 파일을 Hugging Face(`ggerganov/whisper.cpp` 저장소) 또는 자체 CDN에서 받아 앱 데이터 디렉터리에 저장합니다.
- 화자 분리용 ONNX 두 개(세그멘테이션 6.6MB + 임베딩 수십 MB)는 sherpa-onnx GitHub releases에서 같은 방식으로 받습니다.
- 다운로드는 이어받기(HTTP Range)와 체크섬 검증을 넣어야 하며, "설치 후 네트워크 호출은 모델 다운로드 한 번뿐이고 이후 완전 오프라인"이라는 사실을 UI에 명시하면 프라이버시가 강점인 제품 특성과 잘 맞습니다.

---

## 10. 파이프라인 오케스트레이션과 성능

### 10.1 실행 구조

녹음 종료 시점에 백그라운드 잡을 큐에 넣고 순차 실행합니다.

1. WAV 파일 확정 (이미 16kHz mono면 변환 생략)
2. (선택) Silero VAD로 무음 제거 → 환각 감소와 추론 시간 단축
3. whisper.cpp 실행 → JSON 파싱
4. sherpa-onnx 화자 분리 실행 → 세그먼트 파싱
5. 병합 로직 실행 → utterances INSERT, status를 done으로 갱신
6. (설정에 따라) 원본 WAV 삭제

STT와 화자 분리는 서로 의존이 없으므로 병렬 실행이 가능하지만, CPU 코어를 나눠 쓰면 각각이 느려지므로 저사양 기기에서는 순차 실행이 오히려 빠를 수 있어 코어 수에 따라 분기하는 설계가 좋습니다. UI 스레드와 분리하기 위해 Electron이라면 utilityProcess 또는 worker_threads, Tauri라면 Rust async task에서 Sidecar를 돌립니다.

### 10.2 예상 처리 시간 감각

- Apple Silicon(M1 Pro 이상) + Metal 빌드 whisper.cpp + large-v3: 실시간보다 빠르게 동작하므로 1시간 회의가 수 분 내에 처리됩니다.
- 최신 일반 CPU + large-v3-turbo q5: 대략 실시간의 1~3배 시간이 걸릴 수 있으므로, 처리 중에도 앱을 계속 쓸 수 있는 비동기 UX가 필수입니다.
- 화자 분리는 CPU 단독으로도 오디오 1초당 1초 미만이 일반적이라 STT보다 부담이 작습니다.

빌드 시 whisper.cpp를 macOS는 Metal, Windows는 CUDA(있으면)/Vulkan/CPU 폴백으로 각각 컴파일해 두고 런타임에 감지해 선택하면 하드웨어 편차에 대응할 수 있습니다.

---

## 11. 배포와 코드 사이닝

2026년 기준 macOS Gatekeeper와 Windows Defender 모두 서명 없는 앱을 강하게 경고하므로, 개인 배포라도 코드 사이닝이 사실상 필수입니다.

- **macOS**: Apple Developer Program($99/년) 가입 후 Developer ID 서명 + notarization. 마이크 권한 문구(NSMicrophoneUsageDescription)도 여기서 함께 설정합니다.
- **Windows**: EV 또는 OV 코드 사이닝 인증서. 없으면 SmartScreen 경고가 뜹니다.
- **자동 업데이트**: Electron은 electron-updater가 차등 업데이트까지 지원하는 업계 표준이고, Tauri v2 updater는 전체 바이너리를 받는 방식이지만 바이너리 자체가 작아 실용상 문제가 되지 않습니다.
- Tauri는 크로스 컴파일이 제한적이므로 GitHub Actions에서 macOS/Windows 러너로 각각 빌드하는 CI 구성이 표준입니다.

---

## 12. 개발 로드맵 제안

**Phase 1: 파이프라인 검증 (스크립트 단계)**
데스크탑 앱을 만들기 전에, 준비된 회의 녹음 WAV 하나로 "whisper.cpp CLI → sherpa-onnx CLI → Node 스크립트 병합"이 한국어에서 원하는 품질을 내는지부터 확인합니다. 여기서 모델 크기·양자화·클러스터링 임계값을 튜닝해 두면 이후 앱 개발이 순탄해집니다.

**Phase 2: 앱 골격**
Tauri(또는 Electron) 프로젝트를 만들고, 녹음 → WAV 저장 → Phase 1 파이프라인 호출 → SQLite 저장 → 홈 리스트/디테일 조회까지 관통하는 최소 기능을 완성합니다.

**Phase 3: 편집·복사·화자 관리**
인라인 편집, 화자 이름 지정, 전체/부분 복사, 처리 진행률 표시를 붙입니다.

**Phase 4: 배포 품질**
첫 실행 모델 다운로드, 코드 사이닝, 자동 업데이트, 저사양 폴백(small 모델 안내)을 정리합니다.

**Phase 5 (확장): 요약과 시스템 오디오**
로컬 LLM(llama.cpp) 기반 회의 요약, macOS/Windows 시스템 오디오 캡처를 검토합니다.

---

## 13. 참고 자료

- whisper.cpp: https://github.com/ggml-org/whisper.cpp
- Whisper GGML 모델 파일: https://huggingface.co/ggerganov/whisper.cpp
- sherpa-onnx (화자 분리 포함): https://github.com/k2-fsa/sherpa-onnx
- sherpa-onnx 화자 분리 문서: https://k2-fsa.github.io/sherpa/onnx/speaker-diarization/index.html
- pyannote-audio: https://github.com/pyannote/pyannote-audio
- WhisperX (병합 로직 설계 참고): https://github.com/m-bain/whisperX
- smart-whisper (Node 네이티브 애드온): https://github.com/JacobLinCool/smart-whisper
- nodejs-whisper: https://github.com/ChetanXpro/nodejs-whisper
- 한국어 STT 벤치마크 모음: https://github.com/rtzr/Awesome-Korean-Speech-Recognition
- 로컬 화자 분리 실제 사례(OpenWhispr): https://openwhispr.com/blog/local-speaker-diarization
- Tauri: https://v2.tauri.app / Electron: https://www.electronjs.org
- Silero VAD: https://github.com/snakers4/silero-vad

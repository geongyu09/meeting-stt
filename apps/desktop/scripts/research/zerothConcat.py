"""Zeroth 테스트 문장을 이어 붙여 STT 모델 비교용 WAV와 정답 전사본을 만든다 (docs/stt-tuning-results.md "다른 STT 모델 비교").

먼저 zerothExtract.py로 화자별 WAV와 색인을 뽑아 둔다.
사용: scripts/fixtures/.venv/bin/python scripts/research/zerothConcat.py
출력: scripts/fixtures/audio/zeroth100.wav, scripts/fixtures/reference/zeroth100.txt
"""

import json
import random
from pathlib import Path

import numpy as np
import soundfile as sf

FIXTURES_DIR = Path(__file__).resolve().parents[1] / "fixtures"
ZEROTH_DIR = FIXTURES_DIR / "datasets" / "zeroth"
SAMPLE_RATE_HZ = 16000
SENTENCE_COUNT = 100
GAP_SEC = 1.0
# 모델 사이에 같은 문장을 비교하려고 시드를 고정한다
SEED = 0


def main() -> None:
    items = [x for x in json.loads((ZEROTH_DIR / "index.json").read_text()) if x["split"] == "test"]
    random.seed(SEED)
    picked = random.sample(items, SENTENCE_COUNT)
    gap = np.zeros(int(SAMPLE_RATE_HZ * GAP_SEC), dtype="float32")

    parts = []
    for item in picked:
        audio, rate = sf.read(ZEROTH_DIR / "wav" / str(item["speaker"]) / f"{item['id']}.wav", dtype="float32")
        if rate != SAMPLE_RATE_HZ:
            raise ValueError(f"{item['id']}: {rate}Hz")
        parts += [audio, gap]

    sf.write(FIXTURES_DIR / "audio" / "zeroth100.wav", np.concatenate(parts), SAMPLE_RATE_HZ, subtype="PCM_16")
    (FIXTURES_DIR / "reference" / "zeroth100.txt").write_text("\n".join(x["text"] for x in picked))
    print(f"{SENTENCE_COUNT}문장, {sum(len(p) for p in parts) / SAMPLE_RATE_HZ:.1f}초")


if __name__ == "__main__":
    main()

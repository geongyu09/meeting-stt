"""Zeroth-Korean parquet에서 화자별 WAV와 색인을 뽑는다 (docs/diarization-experiments.md 3-1절 D3s·D4s 재료).

사용: scripts/fixtures/.venv/bin/python scripts/research/zerothExtract.py
출력: scripts/fixtures/datasets/zeroth/wav/<speaker>/<id>.wav (16kHz mono int16), zeroth/index.json
"""

import io
import json
from pathlib import Path

import pyarrow.parquet as pq
import soundfile as sf

ZEROTH_DIR = Path(__file__).resolve().parents[1] / "fixtures" / "datasets" / "zeroth"
SAMPLE_RATE_HZ = 16000
# 화자당 20분이면 모의 회의에 충분하다. 학습 조각 전체(9시간)를 풀지 않는다
MAX_SEC_PER_SPEAKER = 1200


def extract(split: str):
    table = pq.ParquetFile(ZEROTH_DIR / f"{split}.parquet")
    used_sec: dict[int, float] = {}
    entries = []
    for batch in table.iter_batches(batch_size=64):
        for row in batch.to_pylist():
            speaker = row["speaker_id"]
            if used_sec.get(speaker, 0) >= MAX_SEC_PER_SPEAKER:
                continue
            samples, rate = sf.read(io.BytesIO(row["audio"]["bytes"]), dtype="int16")
            if rate != SAMPLE_RATE_HZ or samples.ndim != 1:
                raise ValueError(f"{row['id']}: {rate}Hz, ndim {samples.ndim}")
            out = ZEROTH_DIR / "wav" / str(speaker) / f"{row['id']}.wav"
            out.parent.mkdir(parents=True, exist_ok=True)
            sf.write(out, samples, rate, subtype="PCM_16")
            sec = len(samples) / rate
            used_sec[speaker] = used_sec.get(speaker, 0) + sec
            entries.append(
                {"id": row["id"], "speaker": speaker, "split": split, "sec": round(sec, 3), "text": row["text"]}
            )
    return entries


def main():
    entries = extract("test") + extract("train0")
    (ZEROTH_DIR / "index.json").write_text(json.dumps(entries, ensure_ascii=False, indent=1), encoding="utf-8")
    totals: dict[str, float] = {}
    for entry in entries:
        key = f"{entry['split']}:{entry['speaker']}"
        totals[key] = totals.get(key, 0) + entry["sec"]
    for key, sec in sorted(totals.items(), key=lambda item: -item[1]):
        print(f"{key}\t{sec / 60:.1f}분")


if __name__ == "__main__":
    main()

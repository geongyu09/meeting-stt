"""diarScore.ts의 DER 구현을 pyannote.metrics와 대조한다 (docs/diarization-experiments.md 3-2절).

사용: scripts/fixtures/.venv/bin/python scripts/research/derCheck.py <ref.rttm> <hyp 구간.txt> [uem]
hyp는 sherpa-onnx CLI 형식(`시작 -- 끝 speaker_XX`) 줄이다.
"""

import re
import sys

from pyannote.core import Annotation, Segment, Timeline
from pyannote.metrics.diarization import DiarizationErrorRate

# pyannote의 collar는 경계 양쪽을 합친 폭이다. diarScore.ts의 ±0.25초와 같게 하려면 0.5
COLLAR_TOTAL_SEC = 0.5


def load_rttm(path):
    annotation = Annotation()
    for line in open(path, encoding="utf-8"):
        fields = line.split()
        if fields and fields[0] == "SPEAKER":
            start, duration = float(fields[3]), float(fields[4])
            annotation[Segment(start, start + duration), len(annotation)] = fields[7]
    return annotation


def load_cli(path):
    annotation = Annotation()
    for line in open(path, encoding="utf-8"):
        matched = re.match(r"\s*([\d.]+)\s*--\s*([\d.]+)\s+(\S+)", line)
        if matched:
            annotation[Segment(float(matched[1]), float(matched[2])), len(annotation)] = matched[3]
    return annotation


def main():
    reference, hypothesis = load_rttm(sys.argv[1]), load_cli(sys.argv[2])
    uem = None
    if len(sys.argv) > 3:
        fields = open(sys.argv[3]).read().split()
        uem = Timeline([Segment(float(fields[2]), float(fields[3]))])
    metric = DiarizationErrorRate(collar=COLLAR_TOTAL_SEC, skip_overlap=False)
    detail = metric(reference, hypothesis, uem=uem, detailed=True)
    total = detail["total"]
    print(
        f"DER {detail['diarization error rate'] * 100:.2f}% "
        f"miss {detail['missed detection'] / total * 100:.2f}% "
        f"fa {detail['false alarm'] / total * 100:.2f}% "
        f"conf {detail['confusion'] / total * 100:.2f}% total {total:.1f}s"
    )


if __name__ == "__main__":
    main()

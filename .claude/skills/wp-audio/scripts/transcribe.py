"""Transcribe a 16 kHz mono wav with mlx-whisper and write a timestamped markdown transcript."""
import argparse
import re
import sys
from pathlib import Path

DEFAULT_MODEL = "mlx-community/whisper-large-v3-mlx"
PARAGRAPH_GAP = 2.0   # seconds of silence that start a new paragraph
PARAGRAPH_MAX = 45.0  # seconds; keeps timestamps frequent enough to cite

# Scripts that do not belong in a Thai/English meeting; their presence means the model lost the audio.
FOREIGN = re.compile(r"[\uac00-\ud7af\u3040-\u30ff\u4e00-\u9fff\u0400-\u04ff\u0600-\u06ff]")


def unclear(seg) -> bool:
    return bool(
        FOREIGN.search(seg["text"])
        or seg.get("avg_logprob", 0.0) < -1.0
        or seg.get("compression_ratio", 0.0) > 3.5  # repetition loop
        or seg.get("no_speech_prob", 0.0) > 0.8
    )


def stamp(seconds: float) -> str:
    s = int(seconds)
    return f"{s // 3600:02d}:{s % 3600 // 60:02d}:{s % 60:02d}"


def paragraphs(segments):
    current, start, last_end = [], 0.0, 0.0
    for seg in segments:
        text = seg["text"].strip()
        if not text:
            continue
        if unclear(seg):
            text = f"⟦ไม่ชัด: {text}⟧"
        if current and (seg["start"] - last_end > PARAGRAPH_GAP or seg["end"] - start > PARAGRAPH_MAX):
            yield start, " ".join(current)
            current = []
        if not current:
            start = seg["start"]
        current.append(text)
        last_end = seg["end"]
    if current:
        yield start, " ".join(current)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("wav")
    ap.add_argument("out")
    ap.add_argument("--source", default="")
    ap.add_argument("--language", default="th", help="language code, or 'auto' to detect")
    ap.add_argument("--model", default=DEFAULT_MODEL)
    ap.add_argument("--glossary", help="text file of names and terms, one per line, to bias recognition")
    args = ap.parse_args()

    import mlx_whisper

    prompt = None
    if args.glossary:
        terms = [t.strip() for t in Path(args.glossary).read_text(encoding="utf-8").splitlines() if t.strip()]
        prompt = ", ".join(terms)[:800] or None

    result = mlx_whisper.transcribe(
        args.wav,
        path_or_hf_repo=args.model,
        language=None if args.language == "auto" else args.language,
        initial_prompt=prompt,
        condition_on_previous_text=False,  # stops one bad segment from repeating through the rest
        # Greedy decoding only. Thai text compresses well, which trips Whisper's default
        # "retry at a higher temperature" check and yields random foreign-script garbage.
        temperature=0.0,
        verbose=None,
    )
    segments = result.get("segments", [])
    duration = segments[-1]["end"] if segments else 0.0
    n_unclear = sum(1 for seg in segments if seg["text"].strip() and unclear(seg))
    lines = [
        "# Transcript",
        "",
        f"- ไฟล์ต้นทาง: {args.source or args.wav}",
        f"- ความยาว: {stamp(duration)}",
        f"- ภาษา: {result.get('language', args.language)}",
        f"- โมเดล: {args.model}",
        "- หมายเหตุ: ถอดเสียงอัตโนมัติ ไม่แยกผู้พูด ชื่อเฉพาะและตัวเลขอาจผิด",
        f"- ช่วงที่ถอดได้ไม่ชัด: {n_unclear} ช่วง (อยู่ในเครื่องหมาย ⟦ไม่ชัด: …⟧)",
        "",
    ]
    for start, text in paragraphs(segments):
        lines += [f"[{stamp(start)}] {text}", ""]
    Path(args.out).write_text("\n".join(lines), encoding="utf-8")
    print(f"{args.out} ({stamp(duration)}, {len(segments)} segments, {n_unclear} unclear)")
    return 0 if segments else 4


if __name__ == "__main__":
    sys.exit(main())

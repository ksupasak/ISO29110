#!/usr/bin/env bash
# Audio or video file -> transcript.md with [hh:mm:ss] timestamps. Runs locally.
# Usage: bash transcribe.sh <audio-or-video> <out-dir> [--language th] [--model REPO] [--glossary FILE]
set -euo pipefail
[ $# -ge 2 ] || { echo "usage: bash transcribe.sh <audio-or-video> <out-dir> [--language th] [--model REPO] [--glossary FILE]" >&2; exit 2; }
IN="$1"; OUT="$2"; shift 2
HOME_DIR="${WP_AUDIO_HOME:-$HOME/.cache/wp-audio}"
PYBIN="$HOME_DIR/venv/bin/python"
HERE="$(cd "$(dirname "$0")" && pwd)"

[ -f "$IN" ] || { echo "ไม่พบไฟล์: $IN" >&2; exit 1; }
[ -x "$PYBIN" ] || { echo "ยังไม่ได้ติดตั้งตัวถอดเสียง — รัน: bash $HERE/setup.sh" >&2; exit 3; }
mkdir -p "$OUT"
WAV="$OUT/.audio-16k.wav"
ffmpeg -nostdin -loglevel error -y -i "$IN" -vn -ac 1 -ar 16000 -c:a pcm_s16le "$WAV"
trap 'rm -f "$WAV"' EXIT
"$PYBIN" "$HERE/transcribe.py" "$WAV" "$OUT/transcript.md" --source "$(basename "$IN")" "$@"

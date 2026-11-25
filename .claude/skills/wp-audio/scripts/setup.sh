#!/usr/bin/env bash
# One-time install of the local transcription tool (mlx-whisper, Apple Silicon) into its own
# virtual environment. Nothing is installed system-wide. Safe to run again.
set -euo pipefail
HOME_DIR="${WP_AUDIO_HOME:-$HOME/.cache/wp-audio}"
VENV="$HOME_DIR/venv"

command -v ffmpeg >/dev/null || { echo "ไม่พบ ffmpeg — ติดตั้งด้วย: brew install ffmpeg" >&2; exit 1; }
[ "$(uname -m)" = "arm64" ] || { echo "mlx-whisper ใช้ได้เฉพาะ Mac ชิป Apple Silicon" >&2; exit 1; }

PY=""
for c in python3.12 python3.13 python3.11 python3; do
  if command -v "$c" >/dev/null; then PY="$c"; break; fi
done
[ -n "$PY" ] || { echo "ไม่พบ python3" >&2; exit 1; }

if [ ! -x "$VENV/bin/python" ]; then
  mkdir -p "$HOME_DIR"
  "$PY" -m venv "$VENV"
fi
"$VENV/bin/python" -m pip install --quiet --upgrade pip
"$VENV/bin/python" -m pip install --quiet "mlx-whisper>=0.4" defusedxml lxml  # last two: for the docx skill's scripts
"$VENV/bin/python" -c "import mlx_whisper; print('พร้อมใช้งาน: mlx-whisper ที่', '$VENV')"

#!/bin/sh
# Rerun the whole benchmark: models, excerpts, measurement, then compute and validate.
# Needs: brew install whisper-cpp ffmpeg; a venv at ../../.venv (or PY=...) with
# jiwer==4.0.0 whisper-normalizer==1.0.1 soundfile certifi.
set -eu
cd "$(dirname "$0")/.."
PY="${PY:-../../.venv/bin/python}"
ASTROLABE="${ASTROLABE:-npx tsx ../../src/cli/index.ts}"
export SSL_CERT_FILE="$($PY -c 'import certifi; print(certifi.where())')"
mkdir -p models audio data outputs
./scripts/fetch_models.sh
"$PY" -I scripts/fetch_data.py
caffeinate -dims "$PY" -I scripts/measure.py "$@"
$ASTROLABE compute
$ASTROLABE validate

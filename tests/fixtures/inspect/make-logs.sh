#!/usr/bin/env bash
# Writes the Inspect logs the importer tests read, with the mock model: no API key needed.
# Requires uv. The JSON logs keep everything the importer reads; their transcripts are dropped to keep them small.
set -euo pipefail
cd "$(dirname "$0")"

INSPECT="uv run --no-project --with inspect-ai==0.3.290 inspect"
WORK="$(mktemp -d)"

$INSPECT eval tasks.py@arithmetic --model mockllm/model -T skill=0.8 --epochs 2 --metadata candidate=model_a --log-dir "$WORK/a" --display none
$INSPECT eval tasks.py@arithmetic --model mockllm/model -T skill=0.4 --epochs 2 --metadata candidate=model_b --log-dir "$WORK/b" --log-format json --display none
$INSPECT eval tasks.py@edge_cases tasks.py@limited --model mockllm/model --model-role grader=mockllm/model --epochs 2 \
  --no-fail-on-error --log-dir "$WORK/edge" --log-format json --display none

cp "$WORK"/a/*.eval arithmetic-model_a.eval
uv run --no-project python - "$WORK" <<'PY'
import glob, json, sys, zipfile
work = sys.argv[1]
def slim(source, target):
    log = json.load(open(source))
    for sample in log.get("samples", []):
        for heavy in ("events", "events_data", "attachments", "messages", "timelines", "store"):
            sample.pop(heavy, None)
    json.dump(log, open(target, "w"), indent=1)
slim(glob.glob(f"{work}/b/*.json")[0], "arithmetic-model_b.json")
slim(glob.glob(f"{work}/edge/*edge-cases*.json")[0], "edge-cases.json")
slim(glob.glob(f"{work}/edge/*limited*.json")[0], "limited.json")
PY
rm -rf "$WORK"

# Inspect wrote deflate before zstd; this copy keeps that format covered, and readable on Node versions without zstd.
uv run --no-project --python 3.14 python - <<'PY'
import zipfile
with zipfile.ZipFile("arithmetic-model_a.eval") as source, zipfile.ZipFile("arithmetic-model_a-deflate.eval", "w", zipfile.ZIP_DEFLATED) as target:
    for entry in source.infolist():
        target.writestr(entry.filename, source.read(entry.filename))
PY

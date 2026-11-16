#!/usr/bin/env bash
# Writes files/logs/: five models on eight categories, two epochs, with Inspect's mock model. Requires uv.
set -euo pipefail
cd "$(dirname "$0")"
INSPECT="uv run --no-project --with inspect-ai==0.3.290 inspect"
WORK="$(mktemp -d)"
models=(aurora-7 basalt-2 cirrus-pro delta-xl ember-3)
skills=(0.66 0.64 0.67 0.62 0.65)
categories=(billing shipping returns accounts warranty privacy outages pricing)

for index in "${!models[@]}"; do
  model=${models[$index]}
  for category_index in "${!categories[@]}"; do
    category=${categories[$category_index]}
    skill=$(python3 -c "import random; r=random.Random('$model-$category'); print(round(${skills[$index]} + r.uniform(-0.06, 0.06), 3))")
    $INSPECT eval "make-logs.py@$category" --model "mockllm/$model" -T skill="$skill" -T seed="$index$category_index" \
      --epochs 2 --metadata candidate="$model" --log-dir "$WORK/$model" --log-format json --display none
  done
done

rm -rf files/logs && mkdir -p files/logs
uv run --no-project python - "$WORK" <<'PY'
import glob, json, os, sys
work = sys.argv[1]
for source in sorted(glob.glob(f"{work}/*/*.json")):
    log = json.load(open(source))
    for sample in log.get("samples", []):
        for heavy in ("events", "events_data", "attachments", "messages", "timelines", "store"):
            sample.pop(heavy, None)
    name = f"{log['eval']['metadata']['candidate']}_{log['eval']['task']}.json"
    json.dump(log, open(os.path.join("files/logs", name), "w"), separators=(",", ":"))
PY
rm -rf "$WORK"

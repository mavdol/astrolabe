#!/usr/bin/env python3
"""Transcribe every excerpt with every model and write one raw row per observation.

  python scripts/measure.py            full run  -> data/runs.jsonl
  python scripts/measure.py --pilot    one excerpt per group, each run twice (determinism check)
                                       -> data/runs.jsonl (overwritten later by the full run)

Per (model, excerpt), one whisper-cli process under /usr/bin/time -l:
  wer                 word error rate in %, Whisper English normalizer on both sides, jiwer
  sec_per_audio_min   wall time of the whole process (model load included) / audio minutes
  peak_footprint_mib  macOS "peak memory footprint" of the process (includes Metal buffers)
  completed           1 if the process exited 0 and wrote a non-empty transcript, else 0
A process that fails gets null time/memory rows with a status; its WER is scored on an empty
transcript (every reference word deleted = 100 %), so a crash is never better than an answer.
Order: excerpts shuffled, and the order of the models shuffled again for every excerpt.
"""
import json, os, random, re, subprocess, sys, time, datetime
import jiwer
from whisper_normalizer.english import EnglishTextNormalizer

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MODELS = {"tiny": "ggml-tiny.bin", "base": "ggml-base.bin", "small": "ggml-small.bin",
          "medium": "ggml-medium.bin", "turbo": "ggml-large-v3-turbo.bin"}
SEED = 7
norm = EnglishTextNormalizer()


def transcribe(cand, item, out_dir, duration_ms=None):
    wav = os.path.join(ROOT, "audio", f"{item}.wav")
    out = os.path.join(out_dir, f"{item}")
    cmd = ["/usr/bin/time", "-l", "whisper-cli", "-m", os.path.join(ROOT, "models", MODELS[cand]),
           "-f", wav, "-l", "en", "-t", "4", "-otxt", "-of", out]
    if duration_ms:  # warm-up only
        cmd += ["-d", str(duration_ms)]
    t0 = time.perf_counter()
    p = subprocess.run(cmd, capture_output=True, text=True)
    wall = time.perf_counter() - t0
    m = re.search(r"(\d+)\s+peak memory footprint", p.stderr)
    load = re.search(r"load time =\s*([\d.]+) ms", p.stderr)
    text = ""
    if os.path.exists(out + ".txt"):
        text = open(out + ".txt").read()
    return {"rc": p.returncode, "wall": wall, "footprint": int(m.group(1)) / 2**20 if m else None,
            "load_ms": float(load.group(1)) if load else None, "text": text, "stderr": p.stderr}


def score(ref, hyp):
    r, h = norm(ref), norm(hyp)
    o = jiwer.process_words(r, h)
    words = o.hits + o.substitutions + o.deletions
    return 100.0 * (o.substitutions + o.deletions + o.insertions) / words, {
        "ref_words": words, "sub": o.substitutions, "del": o.deletions, "ins": o.insertions}


def main():
    pilot = "--pilot" in sys.argv
    meta = json.load(open(os.path.join(ROOT, "data", "items.json")))
    items = meta["items"]
    rng = random.Random(SEED)
    if pilot:
        seen, chosen = set(), []
        for it in items:
            if it["node"] not in seen:
                seen.add(it["node"]); chosen.append(it)
        items, repeats = chosen, 2
    else:
        items, repeats = list(items), 1
    rng.shuffle(items)
    tag = "pilot" if pilot else "full"
    raw = open(os.path.join(ROOT, "data", "runs.jsonl"), "w")

    # Warm-up: one untimed 10 s transcription per model (fills the file cache, compiles Metal kernels).
    for cand in MODELS:
        d = os.path.join(ROOT, "outputs", "warmup", cand); os.makedirs(d, exist_ok=True)
        transcribe(cand, items[0]["item"], d, duration_ms=10000)

    started = time.time()
    for n, it in enumerate(items):
        for rep in range(1, repeats + 1):
            order = list(MODELS); rng.shuffle(order)
            for cand in order:
                d = os.path.join(ROOT, "outputs", tag if repeats == 1 else f"{tag}-r{rep}", cand)
                os.makedirs(d, exist_ok=True)
                r = transcribe(cand, it["item"], d)
                ok = r["rc"] == 0 and r["text"].strip() != ""
                wer, parts = score(it["reference"], r["text"] if r["rc"] == 0 else "")
                cluster = it["item"].replace("ami_ihm_", "ami_").replace("ami_sdm_", "ami_")
                base = {"candidate": cand, "item": it["item"], "node": it["node"], "cluster": cluster,
                        "ts": datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds")}
                if repeats > 1:
                    base["repeat"] = rep
                rows = [dict(base, measure="wer", value=round(wer, 4), **parts),
                        dict(base, measure="completed", value=1 if ok else 0)]
                if r["rc"] == 0:
                    rows.append(dict(base, measure="sec_per_audio_min",
                                     value=round(r["wall"] / (it["duration_s"] / 60), 4),
                                     wall_s=round(r["wall"], 3), audio_s=it["duration_s"], load_ms=r["load_ms"]))
                    rows.append(dict(base, measure="peak_footprint_mib", value=round(r["footprint"], 2)
                                     if r["footprint"] is not None else None,
                                     **({} if r["footprint"] is not None else {"status": "no_reading"})))
                else:
                    st = f"exit_{r['rc']}"
                    rows.append(dict(base, measure="sec_per_audio_min", value=None, status=st))
                    rows.append(dict(base, measure="peak_footprint_mib", value=None, status=st))
                    open(os.path.join(d, f"{it['item']}.stderr"), "w").write(r["stderr"])
                for row in rows:
                    raw.write(json.dumps(row) + "\n")
                raw.flush()
                print(f"[{time.time() - started:6.0f}s] {n + 1}/{len(items)} r{rep} {cand:6s} {it['item']:28s} "
                      f"rc={r['rc']} wall={r['wall']:.1f}s", file=sys.stderr)
    raw.close()


if __name__ == "__main__":
    main()

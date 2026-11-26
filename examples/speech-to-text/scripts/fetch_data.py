#!/usr/bin/env python3
"""Build the 24 test excerpts from freely licensed recordings with human transcripts.

Four groups, 6 excerpts each, every excerpt about 90 s:
  librispeech  LibriSpeech test-clean (CC BY 4.0), read audiobooks, clean
  ami_ihm      AMI Meeting Corpus test, individual headset mics (CC BY 4.0)
  ami_sdm      AMI Meeting Corpus test, single distant room mic (CC BY 4.0): noise, reverb, crosstalk
  earnings22   Earnings-22 (CC BY-SA 4.0), earnings calls, non-native accents, phone/remote audio

An excerpt is a run of consecutive dataset segments from ONE recording, in time order,
joined with 0.3 s of silence, until it reaches at least 90 s. Its reference is the
concatenation of the segments' human transcripts. The selection is fixed by SEED and
was made before any model was run.

Writes audio/<item>.wav (16 kHz mono s16) and data/items.json.
"""
import json, os, random, subprocess, sys, time, urllib.parse, urllib.request
import csv, io

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
AUDIO = os.path.join(ROOT, "audio")
SEED = 20261125
TARGET_S = 90.0
GAP_S = 0.3
PER_GROUP = 6
API = "https://datasets-server.huggingface.co"

AMI_TEST = [f"{m}{x}" for m in ("EN2002", "ES2004", "IS1009", "TS3003") for x in "abcd"]
REVISIONS = {
    "openslr/librispeech_asr": "71cacbfb7e2354c4226d01e70d77d5fca3d04ba1",
    "edinburghcstr/ami": "46f28f2503e2ec48f8867a84eef356c70476beab",
    "distil-whisper/earnings22": "0a034f9ed86d33a3859d9025d3e621cf243773ab",
}
EARNINGS_META = "https://raw.githubusercontent.com/revdotcom/speech-datasets/main/earnings22/metadata.csv"


def get_json(url, tries=6):
    for i in range(tries):
        try:
            with urllib.request.urlopen(url, timeout=60) as r:
                return json.load(r)
        except Exception as e:  # rate limits, transient errors
            if i == tries - 1:
                raise
            time.sleep(2 + 3 * i)


def filter_rows(dataset, config, split, where, page=100):
    rows, offset = [], 0
    while True:
        q = urllib.parse.urlencode({"dataset": dataset, "config": config, "split": split,
                                    "where": where, "offset": offset, "length": page})
        d = get_json(f"{API}/filter?{q}")
        rows += [r["row"] for r in d["rows"]]
        offset += page
        if offset >= d["num_rows_total"]:
            return rows


def pcm16k(url):
    """Download one segment and decode it to 16 kHz mono s16le bytes with ffmpeg."""
    for i in range(6):
        try:
            with urllib.request.urlopen(url, timeout=60) as r:
                data = r.read()
            break
        except Exception:
            if i == 5:
                raise
            time.sleep(2 + 3 * i)
    p = subprocess.run(["ffmpeg", "-v", "error", "-i", "pipe:0", "-ac", "1", "-ar", "16000",
                        "-f", "s16le", "pipe:1"], input=data, capture_output=True, check=True)
    return p.stdout


def take_run(segs, start_idx):
    """Consecutive segments from start_idx until TARGET_S of speech."""
    out, dur = [], 0.0
    for s in segs[start_idx:]:
        out.append(s)
        dur += s["end"] - s["begin"]
        if dur >= TARGET_S:
            return out
    return None


def build(item_id, node, source, segs, extra):
    silence = b"\x00\x00" * int(16000 * GAP_S)
    pcm = bytearray()
    path = os.path.join(AUDIO, f"{item_id}.wav")
    for i, s in enumerate(segs if not os.path.exists(path + ".done") else []):
        if i:
            pcm += silence
        pcm += pcm16k(s["url"])
    path = os.path.join(AUDIO, f"{item_id}.wav")
    if os.path.exists(path) and os.path.exists(path + ".done"):  # resume after an interrupted fetch
        n = int(open(path + ".done").read())
        return {"item": item_id, "node": node, "source": source, "duration_s": round(n / 2 / 16000, 3),
                "reference": " ".join(s["text"] for s in segs), "segments": [s["id"] for s in segs], **extra}
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "s16le", "-ar", "16000", "-ac", "1",
                    "-i", "pipe:0", path], input=bytes(pcm), check=True)
    open(path + ".done", "w").write(str(len(pcm)))
    return {"item": item_id, "node": node, "source": source,
            "duration_s": round(len(pcm) / 2 / 16000, 3),
            "reference": " ".join(s["text"] for s in segs),
            "segments": [s["id"] for s in segs], **extra}


def main():
    os.makedirs(AUDIO, exist_ok=True)
    rng = random.Random(SEED)
    items = []

    # LibriSpeech test-clean: 6 chapters from 6 different speakers, from the chapter's first utterance.
    ls_rows, offset = [], 0
    while True:
        d = get_json(f"{API}/rows?dataset=openslr/librispeech_asr&config=clean&split=test&offset={offset}&length=100")
        ls_rows += [r["row"] for r in d["rows"]]
        offset += 100
        if offset >= d["num_rows_total"]:
            break
    chapters = {}
    for r in ls_rows:
        chapters.setdefault((r["speaker_id"], r["chapter_id"]), []).append(r)
    speakers = sorted({k[0] for k in chapters})
    cache_path = os.path.join(AUDIO, "librispeech_durations.json")
    dur_cache = json.load(open(cache_path)) if os.path.exists(cache_path) else {}
    for spk in rng.sample(speakers, PER_GROUP):
        ch = sorted(k for k in chapters if k[0] == spk)[0]
        utts = sorted(chapters[ch], key=lambda r: r["id"])
        segs, t = [], 0.0
        for r in utts:  # durations unknown until decoded: decode lazily
            if r["id"] not in dur_cache:
                dur_cache[r["id"]] = len(pcm16k(r["audio"][0]["src"])) / 32000
                json.dump(dur_cache, open(cache_path, "w"))
            d_s = dur_cache[r["id"]]
            segs.append({"id": r["id"], "text": r["text"], "url": r["audio"][0]["src"], "begin": t, "end": t + d_s})
            t += d_s
            if t >= TARGET_S:
                break
        items.append(build(f"ls_{spk}_{ch[1]}", "librispeech", "LibriSpeech test-clean", segs,
                           {"recording": f"speaker {spk}, chapter {ch[1]}"}))
        print("built", items[-1]["item"], items[-1]["duration_s"], file=sys.stderr)

    # AMI: 6 test meetings; one random start after the first 5 minutes; the SAME segments
    # (same speakers and times) are taken from the headset (ihm) and the room mic (sdm).
    for meeting in sorted(rng.sample(AMI_TEST, PER_GROUP)):
        ihm = filter_rows("edinburghcstr/ami", "ihm", "test", f"\"meeting_id\"='{meeting}'")
        sdm = filter_rows("edinburghcstr/ami", "sdm", "test", f"\"meeting_id\"='{meeting}'")
        key = lambda r: (round(r["begin_time"], 2), r["speaker_id"])
        sdm_by_key = {key(r): r for r in sdm}
        ihm = sorted((r for r in ihm if key(r) in sdm_by_key), key=key)
        segs_i = [{"id": r["audio_id"], "text": r["text"], "url": r["audio"][0]["src"],
                   "begin": r["begin_time"], "end": r["end_time"], "k": key(r)} for r in ihm]
        candidates = [i for i, s in enumerate(segs_i) if s["begin"] >= 300 and take_run(segs_i, i)]
        start = rng.choice(candidates)
        run_i = take_run(segs_i, start)
        run_s = [{"id": sdm_by_key[s["k"]]["audio_id"], "text": sdm_by_key[s["k"]]["text"],
                  "url": sdm_by_key[s["k"]]["audio"][0]["src"], "begin": s["begin"], "end": s["end"]} for s in run_i]
        t0 = int(run_i[0]["begin"])
        extra = {"recording": f"meeting {meeting}, from {t0} s"}
        items.append(build(f"ami_ihm_{meeting}_{t0}", "ami_ihm", "AMI test, headset mics", run_i, extra))
        print("built", items[-1]["item"], items[-1]["duration_s"], file=sys.stderr)
        items.append(build(f"ami_sdm_{meeting}_{t0}", "ami_sdm", "AMI test, single distant mic", run_s, extra))
        print("built", items[-1]["item"], items[-1]["duration_s"], file=sys.stderr)

    # Earnings-22: the dataset server indexes only part of the HF copy (24 of 125 calls), so the
    # draw is among indexed calls. One call per non-native language region present there, then
    # the 6th drawn among the remaining non-native calls; random start after 5 min.
    with urllib.request.urlopen(EARNINGS_META, timeout=60) as r:
        meta = list(csv.DictReader(io.StringIO(r.read().decode())))
    stats = get_json(f"{API}/statistics?dataset=distil-whisper/earnings22&config=chunked&split=test")
    indexed = next(c for c in stats["statistics"] if c["column_name"] == "file_id")["column_statistics"]["frequencies"]
    region_of = {m["File ID"]: m["Language Family + Area Based"] for m in meta}
    pool = sorted(f for f in indexed if region_of.get(f) not in (None, "English"))
    picks = []
    for region in sorted({region_of[f] for f in pool}):
        picks.append(rng.choice([f for f in pool if region_of[f] == region]))
    while len(picks) < PER_GROUP:
        picks.append(rng.choice([f for f in pool if f not in picks]))
    print("earnings22 calls:", [(f, region_of[f]) for f in picks], file=sys.stderr)
    for fid in picks:
        region = region_of[fid]
        country = next(m["Country by Ticker"] for m in meta if m["File ID"] == fid)
        rows = filter_rows("distil-whisper/earnings22", "chunked", "test", f"\"file_id\"='{fid}'")
        segs = sorted(({"id": f"{fid}-{r['segment_id']}", "text": r["transcription"], "url": r["audio"][0]["src"],
                        "begin": r["start_ts"], "end": r["end_ts"]} for r in rows), key=lambda s: s["begin"])
        candidates = [i for i, s in enumerate(segs) if s["begin"] >= 300 and take_run(segs, i)]
        start = rng.choice(candidates)
        run = take_run(segs, start)
        t0 = int(run[0]["begin"])
        items.append(build(f"e22_{fid}_{t0}", "earnings22", "Earnings-22", run,
                           {"recording": f"call {fid} ({country}, {region} region), from {t0} s"}))
        print("built", items[-1]["item"], items[-1]["duration_s"], file=sys.stderr)

    with open(os.path.join(ROOT, "data", "items.json"), "w") as f:
        json.dump({"seed": SEED, "revisions": REVISIONS, "items": items}, f, indent=1)


if __name__ == "__main__":
    main()

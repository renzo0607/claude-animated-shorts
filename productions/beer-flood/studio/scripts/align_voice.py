# Align the known script to a recorded voice.wav WITHOUT a speech model: find speech / pause segments from the
# loudness envelope, map the script's sentence + comma breaks onto the longest pauses (in order), and spread the words
# of each stretch by syllable weight. Good to ~0.1 s; hand-fix the hits that matter afterwards (or replace with a
# speech-to-text word alignment when one is available).
# usage: python3 scripts/align_voice.py SCRIPT.md voice/voice.wav voice/words.json
import json, re, sys
import numpy as np
sys.path.insert(0, "audio")
from dsp import read_wav, SR

script, wav, out = sys.argv[1:4]
src = open(script, encoding="utf-8").read()
body = src.split("## Script (voice-over, read straight through)")[1].split("## Beats")[0].strip()
toks = body.split()

def syl(w):
    w = re.sub(r"[^a-z]", "", w.lower())
    if not w: return 1
    n = len(re.findall(r"[aeiouy]+", w))
    if w.endswith("e") and not w.endswith(("le", "ee")) and n > 1: n -= 1
    return max(1, n)

x, _sr = read_wav(wav)
assert _sr == SR, f'convert to {SR} Hz first (ffmpeg -i in -ar 48000 -ac 1 voice.wav)'
x = x.mean(0)
hop = int(0.01 * SR)
rms = np.sqrt(np.convolve(x ** 2, np.ones(hop * 3) / (hop * 3), "same")[::hop] + 1e-12)
db = 20 * np.log10(rms)
thr = np.percentile(db, 95) - 30
voiced = db > thr
# pauses: unvoiced runs >= 80 ms between voiced audio
idx = np.flatnonzero(voiced)
start, end = idx[0] * 0.01, idx[-1] * 0.01 + 0.01
pauses = []
run = None
for i in range(idx[0], idx[-1]):
    if not voiced[i]:
        run = i if run is None else run
    elif run is not None:
        if (i - run) >= 8: pauses.append((run * 0.01, i * 0.01))
        run = None
# script breaks: after tokens ending in . ? ! (strong) or , (weak)
breaks = [k for k, t in enumerate(toks[:-1]) if re.search(r"[.?!,]$", t)]
strength = {k: (2 if re.search(r"[.?!]$", toks[k]) else 1) for k in breaks}
# choose the longest pauses, as many as there are breaks, and keep time order; match greedily by expected position
weights = np.array([0.6 + 0.55 * syl(t) for t in toks])
cum = np.concatenate([[0], np.cumsum(weights)]) / weights.sum()
exp_t = {k: start + cum[k + 1] * (end - start) for k in breaks}
cands = sorted(pauses, key=lambda p: -(p[1] - p[0]))[: int(len(breaks) * 1.3) + 2]
anchors = []  # (token index after which the pause falls, pause start, pause end)
used = set()
for k in sorted(breaks, key=lambda k: -strength[k]):
    best, bd = None, 1e9
    for j, (a, b) in enumerate(cands):
        if j in used: continue
        d = abs((a + b) / 2 - exp_t[k]) * (0.7 if strength[k] == 2 else 1.0)
        if d < bd and d < 1.2: best, bd = j, d
    if best is not None:
        used.add(best); anchors.append((k, *cands[best]))
anchors.sort()
# drop anchors that break time order
clean, last = [], -1
for a in anchors:
    if a[1] > last: clean.append(a); last = a[2]
segs, s_tok, s_t = [], 0, start
for k, a, b in clean:
    segs.append((s_tok, k + 1, s_t, a)); s_tok, s_t = k + 1, b
segs.append((s_tok, len(toks), s_t, end))
words = []
for i0, i1, t0, t1 in segs:
    w = weights[i0:i1]; c = np.concatenate([[0], np.cumsum(w)]) / w.sum()
    for j in range(i1 - i0):
        a = t0 + c[j] * (t1 - t0); b = t0 + c[j + 1] * (t1 - t0)
        words.append({"w": toks[i0 + j], "s": round(a, 3), "e": round(b - 0.02, 3)})
# refine: snap each word start to the nearest speech onset (unvoiced -> voiced after >= 30 ms gap) within 0.3 s,
# keeping the order; word ends follow the next word's start
on = [i * 0.01 for i in range(1, len(voiced)) if voiced[i] and not voiced[max(0, i - 3):i].any()]
on = np.array(on)
prev = -1.0
for k, w in enumerate(words):
    if len(on):
        j = np.argmin(np.abs(on - w["s"]))
        if abs(on[j] - w["s"]) < 0.3 and on[j] > prev + 0.06: w["s"] = round(float(on[j]), 3)
    w["s"] = max(w["s"], prev + 0.06); prev = w["s"]
for k in range(len(words) - 1): words[k]["e"] = round(min(words[k]["e"], words[k + 1]["s"] - 0.02), 3) if words[k]["e"] > words[k]["s"] else round(words[k + 1]["s"] - 0.02, 3)
json.dump(words, open(out, "w"), indent=0)
print(f"{len(words)} words, {len(clean)}/{len(breaks)} breaks anchored, speech {start:.2f}-{end:.2f}s")

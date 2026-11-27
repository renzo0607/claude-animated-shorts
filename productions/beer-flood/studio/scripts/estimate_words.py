# Placeholder word timings from SCRIPT.md (until the real voice.wav is aligned): syllable-weighted, ~3.7 words/s.
import json, re, sys
src = open(sys.argv[1], encoding="utf-8").read()
body = src.split("## Script (voice-over, read straight through)")[1].split("## Beats")[0].strip()
def syl(w):
    w = re.sub(r"[^a-z]", "", w.lower())
    if not w: return 1
    n = len(re.findall(r"[aeiouy]+", w))
    if w.endswith("e") and not w.endswith(("le", "ee")) and n > 1: n -= 1
    return max(1, n)
toks = body.split()
TOTAL = 68.0
gaps = [0.14 if re.search(r"[.?!]$", t) else (0.06 if t.endswith(",") else 0.0) for t in toks]
weights = [0.6 + 0.55 * syl(t) for t in toks]
k = (TOTAL - 0.15 - sum(gaps)) / sum(weights)
out, t = [], 0.08
for tok, w, g in zip(toks, weights, gaps):
    d = w * k
    out.append({"w": tok, "s": round(t, 3), "e": round(t + d * 0.92, 3)})
    t += d + g
json.dump(out, open(sys.argv[2], "w"), indent=0)
print(len(out), "words, ends", round(out[-1]["e"], 2), "s")

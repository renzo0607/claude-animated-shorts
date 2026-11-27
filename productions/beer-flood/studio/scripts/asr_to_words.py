# Map the script's tokens onto speech-recognition word times (difflib on normalised words); unmatched script words
# are spread between their matched neighbours by syllable weight.  usage: asr_to_words.py SCRIPT.md asr.json out.json
import json, re, sys, difflib
src = open(sys.argv[1], encoding="utf-8").read()
toks = src.split("## Script (voice-over, read straight through)")[1].split("## Beats")[0].split()
asr = json.load(open(sys.argv[2]))
norm = lambda w: re.sub(r"[^a-z0-9]", "", w.lower())
A, B = [norm(t) for t in toks], [norm(w["w"]) for w in asr]
sm = difflib.SequenceMatcher(None, A, B, autojunk=False)
tim = [None] * len(toks)
for a, b, n in sm.get_matching_blocks():
    for k in range(n): tim[a + k] = (asr[b + k]["s"], asr[b + k]["e"])
def syl(w):
    w = re.sub(r"[^a-z]", "", w.lower()) or "x"
    return max(1, len(re.findall(r"[aeiouy]+", w)))
i = 0
while i < len(toks):
    if tim[i] is None:
        j = i
        while j < len(toks) and tim[j] is None: j += 1
        t0 = tim[i - 1][1] + 0.03 if i > 0 else 0.0
        t1 = tim[j][0] - 0.03 if j < len(toks) else asr[-1]["e"]
        ws = [0.6 + 0.55 * syl(toks[k]) for k in range(i, j)]; tot = sum(ws); c = t0
        for k, wgt in zip(range(i, j), ws):
            d = (t1 - t0) * wgt / tot; tim[k] = (round(c, 3), round(c + d - 0.02, 3)); c += d
        print("filled:", " ".join(toks[i:j]), f"{t0:.2f}-{t1:.2f}")
        i = j
    else: i += 1
json.dump([{"w": t, "s": s, "e": e} for t, (s, e) in zip(toks, tim)], open(sys.argv[3], "w"), indent=0)
print(len(toks), "words, ends", tim[-1][1])

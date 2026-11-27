# "The Wave Made of Beer": all sound effects + an original score, synthesized (numpy/scipy), timed from the same
# words.json the picture uses (story.ts mirrored below). Writes stems + mix.wav (48 kHz, exact picture length).
# Mix rule (user standard): music +3 dB, SFX -6 dB, voice unchanged. Usage:
#   python audio/beer_audio.py voice/words.json out/beer/audio [voice/voice.wav]
import json, os, sys
import numpy as np
from dsp import (SR, ns, tt, rng, dbg, lp, hp, bp, peq, pan, st, place, fades, widen, make_ir, convolve_st, colored,
                 smooth_noise, modal, phase, integrated, true_peak, write_wav, read_wav)
import sfx_gen as G
import instruments as I

WORDS = json.load(open(sys.argv[1]))
OUT = sys.argv[2]
VOICE = sys.argv[3] if len(sys.argv) > 3 else None
os.makedirs(OUT, exist_ok=True)
FPS = 30
W = lambda i: WORDS[min(i, len(WORDS) - 1)]["s"]
F = lambda i, lead=2: max(0, round(W(i) * FPS) - lead)
TOTAL = round(WORDS[-1]["e"] * FPS) + 14
DUR = TOTAL / FPS
N = ns(DUR)
# ---- story.ts mirror ----
T_POP, T_CRASH, T_EX, T_CRACK = W(56) - 0.05, W(59) - 0.03, W(89) - 0.03, W(91) - 0.03
T_WALL, T_FLAT, T_POUR, T_LOSE, T_SNAP2 = W(106) - 0.05, W(131) + 0.1, W(135), W(211) - 0.03, W(222) - 0.03
CUTS = [0, 15, 28, 50, 63, 74, 90, 105, 111, 127, 135, 146, 156, 164, 185, 206, 224, 236]
SHOT_T = [F(i) / FPS for i in CUTS] + [DUR]
shot = lambda k: (SHOT_T[k - 1], SHOT_T[k])
FLASH = SHOT_T[1]

R = rng(1814)
rr = lambda: rng(int(R.integers(1 << 30)))

def mono_at(buf, x, t, g=1.0, p=0.0):
    """place a mono (or stereo) clip into a stereo buffer at time t"""
    y = pan(x, p) if x.ndim == 1 else x
    place(buf, y * g, t)

def env_seg(dur, fin=0.3, fout=0.4):
    n = ns(dur); e = np.ones(n)
    a, b = ns(fin), ns(fout)
    if a: e[:a] = np.linspace(0, 1, a)
    if b: e[-b:] *= np.linspace(1, 0, b)
    return e

def norm(x, lufs):
    L = integrated(x if x.ndim == 2 else st(x))
    return x * dbg(lufs - L) if np.isfinite(L) else x

# ======================================================== SFX
def room_tone(dur, r, low=110, level=1.0):
    n = ns(dur)
    x = lp(colored(n, r, 1.6), low, 2) * 0.8 + bp(colored(n, r, 0.6), 200, 900, 1) * 0.08
    return st(x * level)

def rush(dur, r, close=1.0, rise=0.0):
    """roaring liquid: broadband rush + low rumble + bubbling, optional swell"""
    n = ns(dur); t = np.arange(n) / SR
    sw = np.clip(t / max(rise, 1e-3), 0, 1) ** 1.5 if rise else np.ones(n)
    out = np.zeros((2, n))
    for ch in range(2):
        body = bp(colored(n, r, 0.7), 120, 5000, 1) * (0.75 + 0.25 * smooth_noise(n, r, 2.0))
        rum = lp(colored(n, r, 2.0), 140, 2) * 1.4
        bub = G.bubbles(dur, r, 260 * close + 30, 200, 2200, (0.006, 0.03)) * 0.8 * close
        out[ch] = (body * 0.6 + rum + bub) * sw
    return out

def metal_clang(r, big=1.0):
    d = 2.4
    y = modal(d, [(196, 0.9, 0.9), (447, 0.8, 0.6), (803, 0.6, 0.45), (1260, 0.45, 0.3), (1922, 0.3, 0.2), (2790, 0.2, 0.12)], r)
    t = tt(d)
    y += lp(r.standard_normal(len(t)), 900) * np.exp(-t / 0.03) * 1.2
    y += np.exp(-t / 0.12) * np.sin(phase(70 * (1 + 0.3 * np.exp(-t / 0.02)))) * 1.0
    wob = G.rattle(1.2, r, 22, np.exp(-np.linspace(0, 1, ns(1.2)) * 2.5), heavy=True) * 0.5
    place_m(y, wob, 0.25)
    return fades(y * big, 0, 0.3)

def place_m(buf, x, t):
    k = ns(t); L = min(len(x), len(buf) - k)
    if L > 0: buf[k:k + L] += x[:L]

def boom(r, f=48, dur=2.0, g=2.5):
    t = tt(dur)
    return np.exp(-t / (dur / 4)) * np.sin(phase(f * (1 + 0.6 * np.exp(-t / 0.04)))) * g + lp(r.standard_normal(len(t)), 220) * np.exp(-t / 0.35) * 0.9

def scratch(dur, r):
    """quill on paper: bursts of band noise at ~6 strokes/s"""
    n = ns(dur); t = np.arange(n) / SR
    strokes = 0.5 + 0.5 * np.sin(2 * np.pi * 6.2 * t + 2 * np.sin(2 * np.pi * 0.7 * t))
    return bp(r.standard_normal(n), 2500, 7500, 2) * strokes ** 3 * (0.6 + 0.4 * smooth_noise(n, r, 4))

def tick(r):
    return G.clink(r, 2600, 0.06, 0.7) * 0.8

def coins(r, n=14, dur=0.8):
    y = np.zeros(ns(dur + 0.3))
    for k in range(n):
        place_m(y, G.clink(r, r.uniform(3200, 6200), 0.12, 1.0) * r.uniform(0.3, 1.0), r.uniform(0, dur) ** 1.3)
    return y

def pop(r):
    t = tt(0.12)
    return np.exp(-t / 0.018) * np.sin(phase(520 * (1 + 1.5 * t / 0.12))) + bp(r.standard_normal(len(t)), 800, 3000, 1) * np.exp(-t / 0.006) * 0.4

def sfx():
    S = np.zeros((2, N))
    add = lambda x, t, g=1.0, p=0.0: mono_at(S, x, t, g, p)
    # ---- beds ----
    for k in (2, 15, 18):  # street by day
        a, b = shot(k); d = b - a + 0.2; r = rr()
        x = G.breeze(d, r, 1.0, 0.15, 850)
        x = x + pan(G.bird_chirps(d, r, 0.4, "sparrow") * 0.1, 0.4) + pan(G.babble(d, r, 130, 1.0, 4.0, 0.5) * 0.05, -0.3)
        add(norm(x, -36) * env_seg(d, 0.15, 0.2), a - 0.1)
    for k in (3, 4, 5, 6, 7, 12, 13, 14, 16):  # brewery hall
        a, b = shot(k); d = b - a + 0.15; r = rr()
        x = room_tone(d, r) + pan(G.bubbles(d, r, 3, 300, 900, (0.01, 0.03)) * 0.25, 0.3)
        add(norm(x, -38) * env_seg(d, 0.1, 0.15), a - 0.05)
    a, b = shot(11); add(norm(room_tone(b - a, rr(), 90), -42), a)            # wake room: near silence
    a, b = shot(17); add(norm(room_tone(b - a + 0.2, rr(), 140) + pan(G.babble(b - a + 0.2, rr(), 120, 1.0, 3.0, 0.3) * 0.03, 0.2), -38), a)
    # ---- shot 1: the wave rolls at the lens (flash-forward) ----
    a, b = shot(1)
    add(norm(rush(b - a + 0.25, rr(), 1.0, rise=b - a), -16) * env_seg(b - a + 0.25, 0.05, 0.25), a)
    add(G.whoa(rr(), dur=0.5), 0.6, 0.35, -0.4); add(G.whoa(rr(), 120, 0.45), 1.5, 0.3, 0.4)
    add(norm(G.whoosh(1.1, rr(), peak=0.85, f_lo=300, f_hi=3000), -18), FLASH - 0.85)
    # ---- shot 2: pride of the neighbourhood ----
    for k in range(5): add(G.hurrah(rr(), rr().uniform(110, 230), rr().uniform(1.0, 1.15)) * 0.12, W(24) + 0.05 * k, 1.0, (k - 2) * 0.3)
    # ---- shot 3: vat creaks, foam fizz on top ----
    add(norm(G.creak(1.4, rr(), 60, 110, G.TIMBER), -30), W(33))
    add(norm(st(G.bubbles(2.0, rr(), 900, 1500, 6000, (0.002, 0.008))), -32) * env_seg(2.0, 0.2, 0.6), W(43))
    # ---- shot 4: hoop pops, crashes ----
    add(norm(G.bolt_strain(rr(), 1.0, 0.3), -24), T_POP - 0.25, 1.0, 0.2)
    add(norm(G.clink(rr(), 2200, 0.3), -22), T_POP, 1.0, 0.2)
    add(norm(G.whoosh(0.6, rr(), peak=0.4, f_lo=500, f_hi=1800), -28), T_POP + 0.05)
    add(norm(metal_clang(rr()), -15), T_CRASH, 1.0, 0.1)
    # ---- shot 6: tick-tock "an hour later", quill scratching ----
    for k in range(4): add(tick(rr()) * (0.5 if k % 2 else 0.7), shot(6)[0] + 0.15 + 0.5 * k)
    add(norm(st(scratch(T_EX - W(77), rr())), -32), W(77))
    add(norm(G.creak(1.2, rr(), 50, 95, G.TIMBER), -28), T_EX - 1.3)
    # ---- the explosion + chain reaction ----
    add(norm(G.wood_crack(rr()), -10), T_EX); add(norm(boom(rr(), 42, 2.6, 3.0), -12), T_EX)
    add(norm(G.splash_big(rr()), -14), T_EX + 0.05); add(norm(G.timber_tear(rr(), 0.6), -20), T_EX + 0.02)
    for k, dt in enumerate((0.0, 0.5, 0.9)):
        add(norm(G.wood_crack(rr()), -14 - 2 * k), T_CRACK + dt, 1.0, (-0.5, 0.5, -0.2)[k])
        add(norm(G.splash_big(rr()), -17 - 2 * k), T_CRACK + dt + 0.05, 1.0, (-0.5, 0.5, -0.2)[k])
    d = shot(7)[1] - T_EX; add(norm(rush(d, rr(), 0.8), -18) * env_seg(d, 0.2, 0.2), T_EX + 0.2)
    # ---- the wall goes ----
    add(norm(boom(rr(), 38, 2.4, 3.0), -11), T_WALL)
    add(norm(G.rattle(1.4, rr(), 120, np.exp(-np.linspace(0, 1, ns(1.4)) * 2.5), heavy=True), -16), T_WALL + 0.05)
    add(norm(G.wood_crack(rr()), -14), T_WALL)
    add(norm(G.splash_big(rr()), -14), T_WALL + 0.1)
    a, b = shot(8)[0], shot(10)[1]
    add(norm(rush(b - T_WALL, rr(), 1.0, rise=0.4), -15) * env_seg(b - T_WALL, 0.05, 0.3), T_WALL)
    for k in range(4): add(G.whoa(rr(), dur=rr().uniform(0.35, 0.5)) * 0.3, W(116) + 0.4 * k, 1.0, (k - 1.5) * 0.4)
    # cellar gulping + the house going down
    add(norm(G.water_bed(1.6, rr(), 1.2, 1.5), -22), W(128))
    add(norm(G.timber_tear(rr(), 0.9), -14), T_FLAT - 0.1); add(norm(boom(rr(), 46, 2.0, 2.6), -13), T_FLAT + 0.3)
    add(norm(G.rattle(1.0, rr(), 80, np.exp(-np.linspace(0, 1, ns(1.0)) * 2), heavy=True), -20), T_FLAT + 0.35)
    # ---- the wake: a door, porter sloshing in ----
    add(norm(G.creak(0.8, rr(), 140, 220, G.WOOD), -30), T_POUR - 0.1, 1.0, 0.5)
    d = shot(11)[1] - T_POUR; add(norm(G.water_bed(d, rr(), 0.8, 1.0), -24) * env_seg(d, 0.4, 0.3), T_POUR + 0.2)
    # ---- rescue: drips; "Unluckily": one drip + air through the hole ----
    a, b = shot(12); add(norm(st(G.bubbles(b - a, rr(), 6, 500, 1500, (0.01, 0.03))), -32), a)
    a, b = shot(13)
    add(norm(G.breeze(b - a, rr(), 1.0, 0.2, 700), -36), a)
    for k in range(2): add(norm(G.bubbles(0.2, rr(), 30, 700, 900, (0.02, 0.03)), -30), a + 0.5 + 1.1 * k, 1.0, 0.1)
    # ---- arrows pop in; "deeper" swell ----
    for k in range(5): add(norm(pop(rr()), -28 + k), W(167) + 0.15 * k, 1.0, (-0.3, 0.3)[k % 2])
    add(norm(G.whoosh(0.9, rr(), peak=0.7, f_lo=150, f_hi=900), -28), W(177))
    # ---- suitcase strain ----
    add(norm(G.creak(2.0, rr(), 70, 150, G.WOOD, [(0, 0), (0.3, 0.7), (0.7, 1), (1, 0.4)]), -26), W(194))
    add(norm(G.creak(1.4, rr(), 90, 170, G.WOOD), -27), W(199), 1.0, 0.3)
    add(norm(G.oof(rr(), "oof"), -30), W(194) + 0.1)
    # ---- the hoops lesson ----
    add(norm(G.clink(rr(), 2000, 0.25), -26), T_LOSE); add(norm(metal_clang(rr(), 0.8), -18), T_LOSE + 0.55)
    add(norm(G.creak(T_SNAP2 - T_LOSE - 0.6, rr(), 300, 520, G.SMALLMETAL), -28), T_LOSE + 0.6)
    add(norm(G.bolt_snap(rr()), -14), T_SNAP2); add(norm(G.splash_big(rr()), -24), T_SNAP2 + 0.08)
    # ---- court: gavel; payoff: coins ----
    add(norm(G.hammer_hit(rr(), 0.8), -22), shot(17)[0] + 0.35)
    add(norm(coins(rr(), 10, 0.5), -24), W(240) + 0.1); add(norm(coins(rr(), 18, 0.9), -20), W(244))
    # ---- whooshes on the glides that cut between places ----
    for k in (3, 8, 9, 11, 14, 15, 17, 18):
        add(norm(G.whoosh(0.5, rr(), peak=0.25, f_lo=400, f_hi=2200), -34), shot(k)[0] - 0.25)
    return S

# ======================================================== MUSIC (original: D major hornpipe theme)
BPM = 118; BEAT = 60 / BPM
m2f = I.m2f
D4 = 62
THEME = [(0, 9, 1), (1, 11, 0.5), (1.5, 9, 0.5), (2, 7, 0.5), (2.5, 4, 0.5), (3, 2, 1),          # bar 1-2 (scale degrees -> semitones over D)
         (4, 4, 0.5), (4.5, 7, 0.5), (5, 9, 1), (6, 7, 0.5), (6.5, 4, 0.5), (7, 2, 1),
         (8, 9, 1), (9, 11, 0.5), (9.5, 14, 0.5), (10, 12, 0.5), (10.5, 11, 0.5), (11, 9, 1),
         (12, 7, 0.5), (12.5, 9, 0.5), (13, 4, 0.5), (13.5, 6, 0.5), (14, 2, 2)]
CH_MAJ = [(0, [2, 9]), (4, [7, 11]), (8, [2, 9]), (12, [9, 13])]   # bass roots per 4-beat bar: D, G, D, A (semitones over D2)

class Band:
    def __init__(self): self.tr = {}
    def add(self, name, x, t, g=1.0, p=0.0):
        if name not in self.tr: self.tr[name] = np.zeros((2, N))
        mono_at(self.tr[name], x, t, g, p)

def theme(b, t0, reps=1, inst="fife", vel=0.7, tr=0, upto=None):
    for rep in range(reps):
        for beat, semi, dur in THEME:
            t = t0 + (rep * 16 + beat) * BEAT
            if upto is not None and t >= upto: return
            f = m2f(D4 + 12 + semi + tr) if inst != "pluck" else m2f(D4 + semi + tr)
            x = I.fife(f, dur * BEAT * 0.92, vel, rr()) if inst == "fife" else I.pluck(f, vel, rr(), 0.6) if inst == "pluck" else I.glock(f, vel, rr(), 1.0)
            b.add(inst, x, t, 1.0, 0.15)

def oompah(b, t0, t1, roots=(0, 5, 0, 7), vel=0.6, minor=False):
    t, i = t0, 0
    while t < t1 - 0.05:
        root = roots[(i // 2) % len(roots)]
        if i % 2 == 0:
            b.add("tuba", I.brass(m2f(38 + root), BEAT * 0.7, vel, rr(), "tuba"), t)
        else:
            third = 3 if minor else 4
            for s in (root + 12, root + 12 + third, root + 19):
                b.add("pah", I.brass(m2f(50 + s), BEAT * 0.35, vel * 0.45, rr(), "horn"), t, 1.0, 0.25)
        t += BEAT; i += 1

def drums(b, t0, t1, vel=0.45, busy=False):
    t, i = t0, 0
    step = BEAT / (4 if busy else 2)
    while t < t1 - 0.02:
        acc = 1.0 if i % (8 if busy else 4) == 2 * (2 if busy else 1) else 0.45
        if busy or i % 2 == 1 or acc == 1.0:
            b.add("snare", I.snare(vel * acc, rr(), 0.25), t, 1.0, -0.15)
        t += step; i += 1

def music():
    b = Band()
    # hook: timpani roll under the wave, stab into the flash
    for k, (t, v) in enumerate(I.snare_roll(0.2, FLASH - 0.1, 0.1, 0.7, rr(), 18)): b.add("snare", I.snare(v * 0.6, rr(), 0.2), t)
    for k in range(int((FLASH - 0.3) / 0.25)): b.add("timpani", I.timpani(m2f(38), 0.3 + 0.6 * k / 14, rr(), 0.6), 0.25 + k * 0.25)
    b.add("stab", I.brass(m2f(50), 0.35, 0.9, rr(), "stab"), FLASH - 0.05); b.add("cymbal", I.cymbal(0.7, rr(), 2.0), FLASH - 0.05)
    # the brewery's tune: fife theme + oompah + light drums, from the flash to the hoop pop
    t0 = FLASH + 0.15
    theme(b, t0, 2, "fife", 0.65, upto=T_POP - 0.2)
    oompah(b, t0, T_POP - 0.1, vel=0.55); drums(b, t0, T_POP - 0.1, 0.35)
    b.add("stab", I.brass(m2f(45), 0.25, 0.8, rr(), "stab"), T_CRASH)
    # cheeky pizzicato while the clerk shrugs and writes; ticking glock; tension roll into the explosion
    tp = T_CRASH + 0.6
    theme(b, tp, 1, "pluck", 0.55, upto=W(74))
    oompah(b, tp, W(74), vel=0.35)
    for k in range(int((T_EX - W(76)) / (BEAT))): b.add("glock", I.glock(m2f(81 + (k % 2) * 2), 0.35, rr(), 0.5), W(76) + k * BEAT)
    for t, v in I.snare_roll(T_EX - 2.2, T_EX - 0.05, 0.05, 0.9, rr(), 22): b.add("snare", I.snare(v * 0.7, rr(), 0.2), t)
    b.add("stab", I.brass(m2f(38), 0.6, 1.0, rr(), "stab"), T_EX); b.add("cymbal", I.cymbal(0.9, rr(), 2.6), T_EX)
    # the flood: urgent galop in D minor until the cellars
    tg = T_EX + 0.55
    oompah(b, tg, W(127), roots=(0, 0, 3, 5, 0, 0, 7, 7), vel=0.7, minor=True)
    drums(b, tg, W(127), 0.5, busy=True)
    MIN = [(0, 9, 0.5), (0.5, 8, 0.5), (1, 9, 0.5), (1.5, 12, 0.5), (2, 10, 0.5), (2.5, 9, 0.5), (3, 7, 1)]
    k = 0
    while tg + k * 4 * BEAT < W(127) - 0.3:
        for beat, s, d in MIN:
            t = tg + (k * 4 + beat) * BEAT
            if t < W(127) - 0.2: b.add("fife", I.fife(m2f(D4 + 12 + s + (k % 2) * -2), d * BEAT * 0.9, 0.7, rr()), t, 1.0, 0.15)
        k += 1
    b.add("timpani", I.timpani(m2f(38), 0.9, rr(), 2.0), T_WALL); b.add("cymbal", I.cymbal(0.8, rr(), 2.4), T_WALL)
    b.add("timpani", I.timpani(m2f(36), 0.9, rr(), 2.0), T_FLAT)
    # cellars, houses, the wake: no drums, a low D-minor pad (respectful)
    a = W(127) - 0.3
    b.add("pad", I.pad([m2f(50), m2f(53), m2f(57)], W(146) - a, 0.45, rr(), 0.8, 0.8), a)
    # "Luckily": a bright little major lift; "Unluckily": two deadpan low notes
    for k, s in enumerate((0, 4, 7, 12)): b.add("pluck", I.pluck(m2f(62 + s), 0.6, rr(), 0.8), W(146) + 0.09 * k)
    b.add("tuba", I.brass(m2f(45), 0.45, 0.6, rr(), "soft"), W(156) + 0.1)
    b.add("tuba", I.brass(m2f(44), 0.9, 0.6, rr(), "soft", fall=-0.6), W(156) + 0.6)
    # explanation: music-box ostinato in D, light pizzicato bass
    te = W(164) + 0.1
    ost = [14, 9, 6, 9, 11, 9, 6, 9]
    k = 0
    while te + k * BEAT / 2 < T_SNAP2 - 0.1:
        b.add("musicbox", I.musicbox(m2f(D4 + 12 + ost[k % 8] + (5 if (k // 16) % 2 else 0)), 0.45, rr(), 1.0), te + k * BEAT / 2, 1.0, 0.2)
        if k % 4 == 0: b.add("pluck", I.pluck(m2f(38 + (0, 5, 0, 7)[(k // 8) % 4]), 0.6, rr(), 0.8), te + k * BEAT / 2)
        k += 1
    b.add("stab", I.brass(m2f(50), 0.3, 0.9, rr(), "stab"), T_SNAP2)
    # "Eight people died": quiet pad; "act of God": a high heavenly chord swell
    b.add("pad", I.pad([m2f(50), m2f(53), m2f(57)], W(232) - W(224), 0.35, rr(), 0.5, 0.6), W(224))
    b.add("pad", I.pad([m2f(74), m2f(78), m2f(81), m2f(86)], W(236) - W(232) + 0.4, 0.5, rr(), 0.35, 0.5), W(232))
    b.add("triangle", I.triangle(0.5, rr()), W(233))
    # payoff: the brewery tune comes back brisk and cadences on "lost"
    tf = W(236) + 0.05
    theme(b, tf, 1, "fife", 0.7, upto=WORDS[-1]["s"] - 0.3)
    oompah(b, tf, WORDS[-1]["s"] - 0.2, vel=0.6); drums(b, tf, WORDS[-1]["s"] - 0.2, 0.4)
    end = WORDS[-1]["s"]
    for s in (0, 4, 7, 12): b.add("fife" if s == 12 else "pah", I.brass(m2f(50 + s), 0.9, 0.8, rr(), "horn"), end)
    b.add("tuba", I.brass(m2f(38), 0.9, 0.9, rr(), "tuba"), end); b.add("cymbal", I.cymbal(0.8, rr(), 2.0), end)
    b.add("glock", I.glock(m2f(86), 0.6, rr(), 1.2), end + 0.12)
    # balance inside the band, then a short hall
    TARGET = {"fife": 0.0, "pluck": -3.0, "glock": -7.0, "tuba": -3.0, "pah": -8.0, "snare": -7.0, "cymbal": -11.0, "stab": -2.0,
              "timpani": -5.0, "pad": -4.0, "musicbox": -2.0, "triangle": -14.0}
    out = np.zeros((2, N))
    for k, x in b.tr.items():
        L = integrated(x)
        if np.isfinite(L): out += x * dbg(-20 + TARGET.get(k, -6) - L)
    hall = make_ir(1.2, 7, pre=0.015, hf=1.4)
    out = out + 0.25 * convolve_st(out.mean(0), hall)[:, :N]
    return hp(out, 30, 2)

# ======================================================== MIX
def duck(words, depth=-3.0):
    g = np.zeros(N)
    for w in words:
        a, b = ns(max(0, w["s"] - 0.08)), ns(min(DUR, w["e"] + 0.12)); g[a:b] = 1
    k = np.ones(ns(0.15)) / ns(0.15)
    g = np.convolve(g, k, "same")
    return dbg(depth * np.clip(g, 0, 1))

def main():
    s = sfx(); m = music()
    v = None
    if VOICE and os.path.exists(VOICE):
        vx = read_wav(VOICE); vx = vx if vx.ndim == 2 else st(vx)
        v = np.zeros((2, N)); L = min(N, vx.shape[1]); v[:, :L] = vx[:, :L]
    # reference: voice at -16 LUFS (or as if it were); music bed ~ -27 then +3 dB, sfx naive levels -6 dB
    vref = -16.0
    if v is not None: v = v * dbg(vref - integrated(v))
    m = m * dbg((vref - 11.0) - integrated(m)) * dbg(3.0) * duck(WORDS)
    s = s * dbg(-6.0)
    s = s * dbg(min(0.0, -24.0 - integrated(s)))  # keep the effects bed under the voice (-16) after the -6 dB rule
    mix = m + s + (v if v is not None else 0)
    peak = np.max(np.abs(mix))
    if peak > dbg(-1.0): mix *= dbg(-1.0) / peak
    write_wav(os.path.join(OUT, "stem_music.wav"), m); write_wav(os.path.join(OUT, "stem_sfx.wav"), s)
    if v is not None: write_wav(os.path.join(OUT, "stem_voice.wav"), v)
    write_wav(os.path.join(OUT, "mix.wav"), mix)
    print(f"mix {DUR:.3f}s  LUFS {integrated(mix):.1f}  music {integrated(m):.1f}  sfx {integrated(s):.1f}  voice {'-' if v is None else round(integrated(v), 1)}")

if __name__ == "__main__":
    main()

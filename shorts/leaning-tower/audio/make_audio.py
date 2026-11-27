# Soundtrack of "The Tower Saved by a War": an original light Italian-flavoured score (mandolin-style tremolo plucks,
# tuba oom-pah, glockenspiel, pads, snare march, sneaky pizzicato) + synthesized SFX on the picture's frames
# (project/src/videos/pisa/story.ts + cast.ts) + the voice. Mix: voice unchanged, music bed ducked -3 dB under speech,
# user standard music +3 dB / SFX -6 dB, master to -14 LUFS with a true-peak ceiling of -1 dBTP.
# Writes mix.wav (48 kHz stereo 24-bit, exactly TOTAL frames long), stems and cues.md.
import os, json
import numpy as np
from scipy import signal
from dsp import SR, ns, rng, pan, dbg, read_wav, write_wav, integrated, true_peak, lp, hp, make_ir, convolve_st
import instruments as I
import sfx_gen as S

HERE = os.path.dirname(os.path.abspath(__file__))
VOICE = os.path.join(HERE, "..", "voice")
FPS, TOTAL = 30, 2045
DUR = TOTAL / FPS
N = ns(DUR)
fr = lambda f: f / FPS
F = I.m2f

def buf(): return np.zeros((2, N))
def put(b, x, t, db=0.0, p=0.0, norm=True):
    """place a mono or stereo sound at time t (s), peak-normalised to db dBFS (norm) or scaled by db (not norm)"""
    x = np.asarray(x, float)
    if norm:
        m = np.abs(x).max() or 1.0
        x = x / m
    x = x * dbg(db)
    if x.ndim == 1: x = pan(x, p)
    i = ns(t)
    if i >= N: return
    if i < 0: x = x[:, -i:]; i = 0
    n = min(x.shape[1], N - i)
    b[:, i:i + n] += x[:, :n]

cues = []
def cue(t, what): cues.append((t, what))

# ============================================================ music
Q = 0.5  # quarter note at 120 bpm
CH = {"C": ([48, 55], [60, 64, 67]), "G": ([43, 50], [59, 62, 67]), "Am": ([45, 52], [60, 64, 69]), "F": ([41, 48], [60, 65, 69]),
      "Dm": ([38, 45], [62, 65, 69]), "E7": ([40, 47], [59, 62, 68]), "A7": ([45, 52], [61, 64, 67])}
THEME = [  # (bar, beat, beats, midi) in C major
    (0, 0, 1, 76), (0, 1, .5, 79), (0, 1.5, .5, 77), (0, 2, 1, 76), (0, 3, 1, 72),
    (1, 0, 1, 74), (1, 1, .5, 77), (1, 1.5, .5, 76), (1, 2, 2, 74),
    (2, 0, 1, 72), (2, 1, .5, 76), (2, 1.5, .5, 74), (2, 2, 1, 72), (2, 3, 1, 69),
    (3, 0, 1.5, 77), (3, 1.5, .5, 76), (3, 2, 1, 74), (3, 3, 1, 72),
    (4, 0, 1, 76), (4, 1, .5, 79), (4, 1.5, .5, 77), (4, 2, 1, 76), (4, 3, 1, 84),
    (5, 0, 1, 83), (5, 1, .5, 81), (5, 1.5, .5, 79), (5, 2, 2, 74),
    (6, 0, 1, 77), (6, 1, 1, 76), (6, 2, 1, 74), (6, 3, 1, 71),
    (7, 0, 3, 72),
]
BARS = ["C", "G", "Am", "F", "C", "G", "F", "C"]

def mandolin(b, t, beats, midi, vel, r, p=0.15, gain=0.0):
    """a plucked note; long notes become mandolin tremolo (8 plucks per second)"""
    dur = beats * Q
    if dur < 0.6:
        put(b, I.pluck(F(midi), vel, r, dur=0.6, bright=0.7), t, gain - 8 + 6 * vel, p)
        return
    k = 0
    while k * 0.11 < dur - 0.05:
        v = vel * (0.85 if k else 1.0) * (1 - 0.25 * k * 0.11 / dur)
        put(b, I.pluck(F(midi), v, r, dur=0.4, bright=0.6), t + k * 0.11, gain - 8 + 6 * v, p)
        k += 1

def band(b, t0, t1, r, mel=True, glock=False, bass=True, chords=True, vel=0.8, transpose=0, gain=0.0, start_bar=0):
    """the theme (looping) from t0 to t1"""
    bar_t = 4 * Q
    nb = int(np.ceil((t1 - t0) / bar_t))
    for k in range(nb):
        bt = t0 + k * bar_t
        bi = (k + start_bar) % 8
        root, tri = CH[BARS[bi]]
        if bass:
            for j, m in enumerate([root[0], root[1], root[0], root[1]][:4:2]):
                tt0 = bt + j * 2 * Q
                if tt0 < t1: put(b, I.brass(F(m + transpose - 12 if m > 47 else m + transpose), 0.38, 0.75 * vel, r, kind="tuba"), tt0, gain - 9, -0.1)
        if chords:
            for j in (1, 3):
                tt0 = bt + j * Q
                if tt0 < t1:
                    for m in tri: put(b, I.pluck(F(m + transpose), 0.45 * vel, r, dur=0.35, bright=0.4), tt0 + r.uniform(0, 0.012), gain - 16, 0.25)
        if mel:
            for (bar, beat, beats, m) in THEME:
                if bar != bi: continue
                tt0 = bt + beat * Q
                if tt0 >= t1 - 0.05: continue
                mandolin(b, tt0, min(beats, (t1 - tt0) / Q), m + transpose, vel, r, gain=gain)
                if glock: put(b, I.glock(F(m + transpose + 12), 0.5 * vel, r, dur=1.0), tt0, gain - 13, -0.25)

def stab(b, t, chord, r, vel=0.9, gain=0.0, dur=0.35):
    root, tri = CH[chord]
    put(b, I.brass(F(root[0] - 12 if root[0] > 47 else root[0]), dur, vel, r, kind="tuba"), t, gain - 6)
    for m in tri: put(b, I.brass(F(m - 12), dur, vel, r, kind="horn"), t, gain - 10, 0.2)

def roll(b, t0, t1, v0, v1, r, gain=0.0):
    t = t0
    while t < t1:
        u = (t - t0) / max(t1 - t0, 1e-3)
        put(b, I.snare(v0 + (v1 - v0) * u, r, dur=0.12), t, gain - 16 + 10 * (v0 + (v1 - v0) * u))
        t += 1 / 26

def music():
    b, r = buf(), rng(7)
    # A hook (0 - 4.27): full theme, bright
    band(b, 0.0, fr(128) - 0.05, r, glock=True, vel=0.85)
    put(b, I.cymbal(0.5, r, dur=1.6), fr(126), -16)
    # B town 1173 (4.27 - 9.6): theme with glock, festive
    band(b, fr(128), fr(288), r, glock=True, vel=0.8, start_bar=0)
    # C building (9.6 - 14.2): lighter, no glock; dings handled as SFX
    band(b, fr(288), fr(425), r, glock=False, vel=0.65, start_bar=4)
    # D tension (14.2 - 20.3): low pad, heartbeat timpani, roll into the reveal hit
    put(b, I.pad([F(48), F(55), F(63)], fr(608) - fr(425), 0.45, r, att=1.2, rel=0.4), fr(425), -14, norm=True)
    for k, f0 in enumerate(range(440, 590, 30)): put(b, I.timpani(F(36), 0.45 + 0.08 * k, r, dur=1.2), fr(f0), -18 + 1.5 * k)
    for m, f0 in [(67, 446), (63, 476), (62, 505), (60, 535)]: put(b, I.pluck(F(m), 0.4, r, dur=0.9), fr(f0), -20)
    roll(b, fr(580), fr(608), 0.25, 0.95, r)
    stab(b, fr(610) - 0.02, "E7", r, 1.0, gain=-2, dur=0.7); put(b, I.cymbal(0.9, r, dur=2.2), fr(610) - 0.02, -9); put(b, I.timpani(F(40), 1.0, r), fr(610) - 0.02, -8)
    # E cut-away (21.1 - 24.3): low murky pad
    put(b, I.pad([F(45), F(52), F(60)], fr(728) - fr(632), 0.35, r, att=0.4, rel=0.4, warm=600), fr(632), -18)
    # F war (24.3 - 27.9): snare march + low brass ostinato in A minor
    for k in range(int((fr(836) - fr(728)) / Q)):
        t = fr(728) + k * Q
        put(b, I.snare(0.75 if k % 2 == 0 else 0.5, r, dur=0.2), t, -12)
        if k % 2 == 1: put(b, I.snare(0.35, r, dur=0.15), t + Q / 2, -18)
        m = [45, 45, 52, 45, 43, 43, 50, 43][k % 8]
        put(b, I.brass(F(m), 0.4, 0.8, r, kind="tuba"), t, -10)
        if k % 4 == 0: put(b, I.fife(F([81, 79, 76, 77][k // 4 % 4]), 0.9, 0.6, r), t, -16, 0.2)
    # G a hundred years (27.9 - 29.1): music box, slow
    for m, t in [(84, 836), (79, 846), (76, 856), (72, 866)]: put(b, I.musicbox(F(m), 0.5, r, dur=1.6), fr(t), -15, -0.2)
    # H grandkids (29.1 - 34.3): theme returns, then the stacking rises floor by floor
    band(b, fr(877), fr(960), r, glock=True, vel=0.75)
    for k in range(5):
        t = fr(962 + k * 10.4)
        stab(b, t, ["C", "Dm", "Am", "F", "G"][k], r, 0.7 + 0.05 * k, gain=-6, dur=0.25)
        put(b, I.glock(F(72 + [0, 2, 4, 5, 7][k] + 12), 0.7, r), t, -12)
    # I luckily (34.4): resolving chord; unluckily (36.3): sad tuba slide; banana (38.8): plink
    stab(b, fr(1034), "C", r, 0.8, gain=-4, dur=0.9); put(b, I.cymbal(0.4, r, dur=1.4), fr(1034), -18)
    for k, (m, d) in enumerate([(55, 0.45), (54, 0.45), (53, 0.45), (52, 1.1)]):
        put(b, I.brass(F(m - 12), d, 0.75, r, kind="tuba", fall=(-3.0 if k == 3 else 0.0)), fr(1095) + k * 0.48, -6)
    put(b, I.glock(F(88), 0.6, r), fr(1165), -12)
    # J golden mattress (39.6 - 47.4): warm pad + slow vibes arpeggios (F major-ish lullaby)
    for k, ch in enumerate(["F", "C", "Dm", "C"]):
        t = fr(1188) + k * 1.95
        root, tri = CH[ch]
        put(b, I.pad([F(m) for m in tri], 2.0, 0.4, r, att=0.5, rel=0.8), t, -16)
        for j, m in enumerate(tri + [tri[1] + 12]): put(b, I.vibes(F(m + 12), 0.45, r, dur=1.4), t + j * 0.48, -16, 0.2)
    put(b, I.pad([F(53), F(57), F(60)], fr(1528) - fr(1422) + 0.2, 0.4, r, att=0.5, rel=0.6), fr(1414), -16)  # K clay
    for m, t in [(72, 1430), (76, 1460), (79, 1490), (84, 1515)]: put(b, I.vibes(F(m), 0.5, r, dur=1.4), fr(t), -15)
    # L topple (50.9 - 54.3): straight stack fast stabs, roll, crash, silence
    for k in range(5): put(b, I.pluck(F(60 + 2 * k), 0.6, r, dur=0.4), fr(1545 + k * 6), -12)
    roll(b, fr(1583), fr(1612), 0.3, 1.0, r)
    put(b, I.cymbal(1.0, r, dur=2.6), fr(1613), -7); put(b, I.timpani(F(33), 1.0, r, dur=2.5), fr(1613), -6)
    # M 1990 sneaky (54.4 - 60.1): staccato pizzicato tiptoe in D minor
    seq = [62, 65, 69, 65, 62, 65, 69, 70, 69, 65, 62, 61, 62, None, 57, None]
    k = 0; t = fr(1634)
    while t < fr(1802) - 0.1:
        m = seq[k % 16]
        if m: put(b, I.pluck(F(m - 12), 0.55, r, dur=0.3, bright=0.3), t, -12, 0.1)
        if k % 4 == 0: put(b, I.pluck(F(38), 0.6, r, dur=0.4, bright=0.2), t, -12, -0.15)
        k += 1; t += Q / 2
    # N straighten (60.1 - 62.8): rising glock, then a dead stop on "stopped", a small ta-da on "on purpose"
    for k in range(10): put(b, I.glock(F(72 + [0, 2, 4, 5, 7, 9, 11, 12, 14, 16][k]), 0.55, r, dur=0.8), fr(1812) + k * 0.2, -15)
    put(b, I.pad([F(48), F(52), F(55)], fr(1880) - fr(1806), 0.35, r, att=0.3, rel=0.05), fr(1806), -18)
    stab(b, fr(1903), "C", r, 0.7, gain=-8, dur=0.4); put(b, I.triangle(0.5, r), fr(1905), -16)
    # O final (64.5 - 68.2): the theme reprise, button chord on the last word
    band(b, fr(1934), fr(2016), r, glock=True, vel=0.8, start_bar=4)
    stab(b, fr(2018), "C", r, 1.0, gain=-3, dur=0.6); put(b, I.cymbal(0.6, r, dur=1.4), fr(2018), -14)
    ir = make_ir(1.1, 3)
    wet = convolve_st(b, ir)
    return b + 0.18 * wet

# ============================================================ sfx
DIG = [(-9.4, 3.0), (-9.9, 5.4), (-8.6, 7.4)]
def sfx():
    b, r = buf(), rng(11)
    # ambience beds per era / light
    def bed(t0, t1, kind, db):
        d = t1 - t0
        if kind == "day":
            put(b, S.breeze(d, r, level=0.6), t0, db - 6)
            put(b, S.bird_chirps(d, r, density=0.4), t0, db - 8, 0.3)
        elif kind == "golden":
            put(b, S.crickets(d, r), t0, db - 12, -0.2)
            put(b, S.breeze(d, r, level=0.4), t0, db - 10)
        elif kind == "crowd":
            for k in range(3): put(b, S.babble(d, r, 110 + 40 * k, 1.0 + 0.05 * k), t0, db - 14, -0.4 + 0.4 * k)
    bed(0, fr(128), "crowd", 0); bed(0, fr(128), "day", 0)
    bed(fr(128), fr(632), "day", 0); bed(fr(128), fr(288), "crowd", 2)
    bed(fr(728), fr(1188), "day", 0); bed(fr(836), fr(873), "golden", 2)
    bed(fr(1188), fr(1528), "golden", 0); bed(fr(1528), DUR, "day", 0); bed(fr(1934), DUR, "crowd", 0)
    put(b, S.whoosh(0.7, r, peak=0.4), fr(66) - 0.3, -16); cue(fr(66), "whoosh: push in on 'war'")
    put(b, S.whoosh(0.5, r, peak=0.6, f_lo=900, f_hi=5000), fr(124), -12); cue(fr(128), "flash shimmer")
    # tourists: shutter click + laugh in the hook and the end
    for t in (fr(30), fr(1990)):
        put(b, S.clink(r, 2600, 0.05) + 0, t, -14, 0.3); put(b, S.clink(r, 1800, 0.06), t + 0.07, -16, 0.3); cue(t, "camera shutter")
    # 1173 cheer on "rich, proud"
    for k in range(5): put(b, S.hurrah(r, 120 + 25 * k, 1.0 + 0.04 * k, kid=k == 4), fr(192) + 0.12 * k, -8 - k, -0.5 + 0.25 * k)
    put(b, S.applause(2.4, r, people=24), fr(200), -12); cue(fr(192), "townsfolk cheer")
    # site work: distant chisel clinks
    for k in range(14):
        t = fr(130) + k * 0.71 + r.uniform(0, 0.2)
        if t < fr(496): put(b, S.hammer_hit(r, 0.4), t, -24 + (6 if t > fr(425) else 0), r.uniform(-0.6, 0.6))
    # floors land
    for f0 in (318, 377):
        put(b, S.wood_crack(r), fr(f0), -9); put(b, I.timpani(F(38), 1.0, r, dur=1.2), fr(f0), -10); put(b, S.whoosh(0.4, r, peak=0.8), fr(f0) - 0.32, -16)
        cue(fr(f0), "floor lands (thud + dust)")
    for f0 in (342, 397): put(b, I.triangle(0.7, r, dur=1.2, f=2093), fr(f0) - 0.03, -12); cue(fr(f0), "ding: perfect")
    put(b, S.clink(r, 1500, 0.15), fr(496), -12); put(b, S.stroll_step(r, 0.2), fr(497), -18); cue(fr(496), "hammer put down")
    put(b, S.creak(0.6, r, rate0=60, rate1=40), fr(533), -16); cue(fr(535), "head tilt creak")
    put(b, S.creak(0.7, r, rate0=30, rate1=18, modes=S.TIMBER, rough=0.2), fr(596), -8); cue(fr(598), "stone grinding: the lean")
    for k in range(4): put(b, S.whoa(r, 120 + 15 * k), fr(610) + 0.05 * k, -12, -0.4 + 0.25 * k)
    put(b, S.whoosh(0.6, r, peak=0.5, f_lo=200, f_hi=900), fr(628), -14); cue(fr(632), "whoosh into the ground")
    put(b, S.bubbles(1.4, r, 14, f_lo=180, f_hi=900), fr(698), -12); cue(fr(698), "squelch: soft wet clay")
    put(b, S.creak(1.0, r, rate0=24, rate1=16, modes=S.TIMBER, rough=0.25), fr(690), -12); cue(fr(690), "sinking groan")
    # war: boots on grass, flags, tools dropped
    t0 = fr(728)
    for k in range(int((fr(836) - t0) / 0.47)):
        put(b, S.stroll_step(r, 0.7), t0 + k * 0.47, -15, 0.3 - 0.6 * k / 20)
    put(b, S.flag_flutter(3.5, r), t0, -18, 0.2)
    for k in range(6): put(b, S.hammer_hit(r, 0.5), fr(799 + 3 * k), -16, -0.3 + 0.1 * k)
    cue(fr(799), "tools dropped, builders walk off")
    # grandkids walk in, bulb, floors stack
    for k in range(10): put(b, S.stroll_step(r, 0.4), fr(877) + k * 0.33, -16, -0.3)
    put(b, I.glock(F(96), 0.8, r, dur=1.2), fr(934), -10); put(b, I.triangle(0.6, r, f=2637), fr(934), -14); cue(fr(935), "idea bulb ding")
    for k in range(5): put(b, S.wood_crack(r), fr(962 + k * 10.4 + 6), -14 + k); cue(fr(962), "floors stack (5 thuds)")
    for k in range(4): put(b, S.hurrah(r, 130 + 20 * k, 1.0), fr(1036) + 0.1 * k, -11 - k, -0.3 + 0.2 * k)
    put(b, S.creak(1.2, r, rate0=40, rate1=26, modes=S.TIMBER), fr(1120), -16); cue(fr(1120), "tower creak: banana")
    # mattress
    for f0, db in [(1286, -10), (1346, -12), (1369, -10), (1397, -9)]:
        put(b, S.creak(0.35, r, rate0=180, rate1=120, modes=S.SMALLMETAL, rough=0.1), fr(f0), db, 0.2)
    put(b, S.stroll_step(r, 0.1), fr(1286), -14); put(b, S.whoosh(0.5, r, peak=0.7), fr(1398), -16); put(b, S.oof(r, "oh"), fr(1410), -12)
    cue(fr(1286), "mattress springs (sit, sink, sink, slide)")
    # clay squeeze
    put(b, S.bubbles(1.6, r, 18, f_lo=250, f_hi=1400), fr(1480), -11); cue(fr(1480), "water squeezed out")
    # topple
    put(b, S.creak(1.0, r, rate0=30, rate1=60, modes=S.TIMBER, rough=0.3), fr(1580), -8)
    put(b, S.whoosh(1.0, r, peak=0.85, f_lo=150, f_hi=900), fr(1583), -10)
    put(b, S.wood_crack(r), fr(1613), -2); put(b, S.timber_tear(r, 1.2), fr(1613), -6)
    for k in range(3): put(b, S.oof(r, "oof"), fr(1618) + 0.15 * k, -16)
    cue(fr(1613), "tower hits the lawn (crash)")
    # 1990: shovel scrapes on every dig, tiptoe steps, innocent whistle
    for i, _ in enumerate(DIG):
        k = 0
        while True:
            t = (k + 0.5 - i * 0.37) / 0.9
            if t > fr(1802): break
            if t >= fr(1712): put(b, S.whoosh(0.25, r, peak=0.5, f_lo=1200, f_hi=4500), t, -16, -0.3 + 0.3 * i); put(b, S.stroll_step(r, 1.0), t + 0.18, -18)
            k += 1
    for k in range(12): put(b, S.stroll_step(r, 0.05), fr(1712) + k * 0.72, -22, 0.4)
    st0, w = I.whistle([(0, 0.25, 79, 0.6), (0.3, 0.25, 76, 0.6), (0.6, 0.5, 72, 0.6), (1.4, 0.25, 79, 0.6), (1.7, 0.6, 81, 0.6)], r)
    put(b, w, fr(1730) + st0, -14, 0.4); cue(fr(1712), "shovels + innocent whistle")
    put(b, S.creak(1.6, r, rate0=22, rate1=30, modes=S.TIMBER, rough=0.2), fr(1812), -10); cue(fr(1812), "tower eases back (grind)")
    put(b, S.clink(r, 3000, 0.1), fr(1881), -12); cue(fr(1883), "stop")
    return b

# ============================================================ mix
def words():
    return json.load(open(os.path.join(VOICE, "words.json")))

def duck_curve(depth_db=-3.0):
    g = np.zeros(N)
    for w in words():
        a, e = ns(max(0, w["s"] - 0.08)), ns(w["e"] + 0.12)
        g[a:e] = 1
    sm = signal.lfilter([1 - np.exp(-1 / (0.15 * SR))], [1, -np.exp(-1 / (0.15 * SR))], g)
    return dbg(depth_db * np.clip(sm, 0, 1))

def limiter(x, ceil_db=-1.2):
    up = signal.resample_poly(x, 4, 1, axis=1)
    pk = np.abs(up).max(0)
    pk = signal.resample_poly(pk, 1, 4)[: x.shape[1]]
    c = dbg(ceil_db)
    g = np.minimum(1, c / np.maximum(pk, 1e-9))
    win = ns(0.004)
    g = -ndmax(-g, win)
    g = signal.lfilter([1 - np.exp(-1 / (0.05 * SR))], [1, -np.exp(-1 / (0.05 * SR))], g - 1) + 1
    g = np.minimum(g, -ndmax(-np.minimum(1, c / np.maximum(pk, 1e-9)), win))
    return x * g

def ndmax(x, w):
    from scipy.ndimage import maximum_filter1d
    return maximum_filter1d(x, size=w, origin=0)

if __name__ == "__main__":
    v, sr = read_wav(os.path.join(VOICE, "voice.wav")); assert sr == SR
    vo = np.zeros(N); vm = v.mean(0); vo[: min(N, len(vm))] = vm[:N]
    voice = np.stack([vo, vo])
    m = music(); s = sfx()
    Lv = integrated(voice)
    m *= dbg((Lv - 11.0 + 3.0) - integrated(m)) * duck_curve(-3.0)   # music bed 10 LU under the voice (+3 dB standard)
    s *= dbg((Lv - 12.0 - 6.0) - integrated(s) + 6.0)                  # sfx -6 dB standard against a -12 LU bed
    mix = voice + m + s
    mix *= dbg(-14.0 - integrated(mix))
    mix = limiter(mix, -1.7)
    write_wav(os.path.join(HERE, "mix.wav"), mix)
    write_wav(os.path.join(HERE, "stem_music.wav"), m); write_wav(os.path.join(HERE, "stem_sfx.wav"), s)
    with open(os.path.join(HERE, "cues.md"), "w") as fh:
        fh.write(f"# Sound cues (frame @30 fps)\n\nmix: {integrated(mix):.1f} LUFS, true peak {true_peak(mix):.1f} dBTP, voice {Lv:.1f} LUFS, length {N / SR:.3f} s\n\n")
        for t, w in sorted(cues): fh.write(f"- f{round(t * FPS):4d}  {t:6.2f}s  {w}\n")
    print("mix", round(integrated(mix), 2), "LUFS, TP", round(true_peak(mix), 2), "voice", round(Lv, 2), "music", round(integrated(m), 2), "sfx", round(integrated(s), 2))

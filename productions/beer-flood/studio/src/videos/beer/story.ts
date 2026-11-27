// "The Wave Made of Beer" (London Beer Flood, 17 Oct 1814): timeline, story physics and cameras.
// EVERYTHING is keyed to the voice: words.json (w, s, e in seconds). Re-aligning the real recording re-times
// every cut, event, camera move and expression automatically. W(i) = onset of word i (0-based, see SCRIPT.md).
import WORDS from "./words.json";

export const FPS = 30;
export const D0 = 0; // ground level everywhere
export type V3 = [number, number, number];
type Word = { w: string; s: number; e: number };
const WD = WORDS as Word[];
/** onset (s) of word i */
export const W = (i: number) => WD[Math.min(i, WD.length - 1)].s;
/** frame of word i, LEAD frames early (reference: reactions land 0-3 f before the word) */
export const F = (i: number, lead = 2) => Math.max(0, Math.round(W(i) * FPS) - lead);
export const TOTAL = Math.round(WD[WD.length - 1].e * FPS) + 14;

export const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
export const smooth = (x: number) => { const u = clamp01(x); return u * u * (3 - 2 * u); };
export const easeOut = (u: number) => 1 - (1 - clamp01(u)) ** 4;
export const hh = (i: number, s = 0) => { const v = Math.sin(i * 127.1 + s * 311.7) * 43758.5453; return v - Math.floor(v); };

// ---------------- places (one scene, sets far apart) ----------------
/** brewery hall interior (vats) */
export const IX = 400;
export const VAT: V3 = [IX, 0, -3];
export const VAT_R = 3.0, VAT_H = 6.7, PLINTH = 0.4;
export const VATS: { c: V3; r: number; h: number }[] = [
  { c: VAT, r: VAT_R, h: VAT_H },
  { c: [IX - 9.5, 0, -6.5], r: 2.4, h: 5.6 },
  { c: [IX + 9.5, 0, -6.5], r: 2.4, h: 5.6 },
  { c: [IX - 11, 0, 4.5], r: 2.0, h: 4.8 },
];
export const HOOPS = [0.07, 0.2, 0.34, 0.48, 0.62, 0.76, 0.9]; // fractions of the vat height
export const DESK: V3 = [IX + 7, 0, 4]; // clerk's standing desk (clerk stands behind it, faces +z)
export const LADDER: V3 = [IX - 2.6, 0, -0.9];
export const RUBBLE: V3 = [IX + 4.2, 0, 3.2];
/** St Giles street: runs along +z from the brewery wall at z = 0; house fronts at |x| = 4.4 */
export const STREET_W = 4.4;
export const HOLE = { x0: -3.6, x1: 3.6, y1: 5.0 }; // where the beer breaks the brewery wall
export const FLAT_HOUSE: V3 = [-8.4, 0, 47.5];      // the house that is knocked flat
export const CELLAR: V3 = [3.75, 0, 44.5];          // cellar opening in the pavement
export const SUITCASE: V3 = [0.4, 0, 66];
/** wake room (a cut-away room, open toward +z); door in the right wall */
export const WX = -400;
export const DOOR: V3 = [WX + 3.5, 0, -0.6];
/** courtroom */
export const CZ = -400;

// ---------------- story events (seconds) ----------------
export const T_POP = W(56) - 0.05;      // "slides": the hoop springs off
export const T_CRASH = W(59) - 0.03;    // "crashes": it hits the floor
export const T_EX = W(89) - 0.03;       // "explodes"
export const T_CRACK = W(91) - 0.03;    // "cracks open the vats next to it"
export const T_WALL = W(106) - 0.05;    // "straight through the back wall"
export const T_FLAT = W(131) + 0.1;     // "flattens two houses"
export const T_POUR = W(135);           // "pours into a room"
export const T_LOSE = W(211) - 0.03;    // "Lose one"
export const T_SNAP2 = W(222) - 0.03;   // "the next one snaps"
export const WAVE_V = 7.0;              // m/s down the street

/** wave front z (street) at story time tau, and its crest height */
export const waveZ = (tau: number) => (tau < T_WALL ? -1 : WAVE_V * (tau - T_WALL) * (1 - 0.006 * (tau - T_WALL)));
export const waveH = (tau: number) => { const z = waveZ(tau); return z < 0 ? 0 : 4.6 * smooth(z / 5) * (0.75 + 0.25 * Math.exp(-z / 60)); };

// ---------------- shots ----------------
export type Light = "day" | "golden";
export type Set = "street" | "hall" | "wake" | "court";
/** vat mode: intact (with optional single-hoop pop), burst at T_EX, aftermath (settled), lesson (straps beat) */
export type VatMode = "intact" | "live" | "after" | "lesson";
export type ShotDef = { id: number; a: number; b: number; light: Light; set: Set; tau: (t: number) => number; vat?: VatMode; sunAz?: number; sunEl?: number };
const END = TOTAL;
export const SHOTS: ShotDef[] = [
  { id: 1, a: 0, b: F(15), light: "golden", set: "street", tau: (t) => T_WALL + 3.6 + t, sunAz: 165, sunEl: 30 }, // hook: flash-forward
  { id: 2, a: F(15), b: F(28), light: "day", set: "street", tau: (t) => t - 200, sunAz: 145, sunEl: 42 },
  { id: 3, a: F(28), b: F(50), light: "day", set: "hall", tau: (t) => t, vat: "live", sunAz: 140, sunEl: 40 },
  { id: 4, a: F(50), b: F(63), light: "day", set: "hall", tau: (t) => t, vat: "live", sunAz: 140, sunEl: 40 },
  { id: 5, a: F(63), b: F(74), light: "day", set: "hall", tau: (t) => t, vat: "live", sunAz: 140, sunEl: 40 },
  { id: 6, a: F(74), b: F(90), light: "golden", set: "hall", tau: (t) => t, vat: "live", sunAz: 140, sunEl: 22 },
  { id: 7, a: F(90), b: F(105), light: "golden", set: "hall", tau: (t) => t, vat: "live", sunAz: 140, sunEl: 22 },
  { id: 8, a: F(105), b: F(111), light: "golden", set: "street", tau: (t) => t, sunAz: 165, sunEl: 30 },
  { id: 9, a: F(111), b: F(127), light: "golden", set: "street", tau: (t) => t, sunAz: 165, sunEl: 30 },
  { id: 10, a: F(127), b: F(135), light: "golden", set: "street", tau: (t) => t, sunAz: 150, sunEl: 30 },
  { id: 11, a: F(135), b: F(146), light: "golden", set: "wake", tau: (t) => t, sunAz: 100, sunEl: 14 },
  { id: 12, a: F(146), b: F(156), light: "golden", set: "hall", tau: (t) => t, vat: "after", sunAz: 140, sunEl: 22 },
  { id: 13, a: F(156), b: F(164), light: "golden", set: "hall", tau: (t) => t, vat: "after", sunAz: 160, sunEl: 20 },
  { id: 14, a: F(164), b: F(185), light: "day", set: "hall", tau: (t) => t, vat: "intact", sunAz: 140, sunEl: 40 },
  { id: 15, a: F(185), b: F(206), light: "day", set: "street", tau: (t) => t - 200, sunAz: 145, sunEl: 42 },
  { id: 16, a: F(206), b: F(224), light: "day", set: "hall", tau: (t) => t, vat: "lesson", sunAz: 140, sunEl: 40 },
  { id: 17, a: F(224), b: F(236), light: "day", set: "court", tau: (t) => t, sunAz: 140, sunEl: 40 },
  { id: 18, a: F(236), b: END, light: "day", set: "street", tau: (t) => t - 200, sunAz: 145, sunEl: 42 },
];
/** crossfades (frames) at place/time changes; a white 4-frame flash after the hook */
export const XFADE: Record<number, number> = { 6: 8, 11: 6, 14: 8, 17: 8, 18: 6 };
export const FLASH_AT = SHOTS[1].a;

export const shotAt = (f: number) => SHOTS.find((s) => f >= s.a && f < s.b) ?? SHOTS[SHOTS.length - 1];
export const layersAt = (f: number): { id: number; alpha: number }[] => {
  for (const s of SHOTS) {
    const x = XFADE[s.id];
    if (x && f >= s.a - x / 2 && f < s.a + x / 2) return [{ id: s.id - 1, alpha: 1 }, { id: s.id, alpha: (f - (s.a - x / 2) + 1) / (x + 1) }];
  }
  return [{ id: shotAt(f).id, alpha: 1 }];
};

// ---------------- camera ----------------
// Grammar (reference motion study): cuts on big reframes, symmetric smootherstep glides of 18-40 f, every hold creeps
// in (0.15-0.35 %/f, ~0.6 %/f on punch words), rolls of 4-5 deg, impact kicks flip sign every frame over 7 f.
export type Cam = { pos: V3; look: V3; fov: number; roll: number };
type Shot = Partial<Cam> & { pos: V3; look: V3 };
type Key = { f: number; dur?: number; cut?: boolean; s: (f: number) => Shot };
export const glide = (u: number) => { const x = clamp01(u); return x * x * x * (x * (6 * x - 15) + 10); };
const mix = (a: Cam, b: Cam, k: number): Cam => ({
  pos: a.pos.map((v, i) => v + (b.pos[i] - v) * k) as V3, look: a.look.map((v, i) => v + (b.look[i] - v) * k) as V3,
  fov: a.fov + (b.fov - a.fov) * k, roll: a.roll + (b.roll - a.roll) * k,
});
const full = (c: Shot): Cam => ({ fov: 40, roll: 0, ...c });
const run = (keys: Key[], f: number) => {
  let cur = full(keys[0].s(f));
  for (let i = 1; i < keys.length; i++) {
    const k = keys[i];
    if (f < k.f) break;
    cur = k.cut ? full(k.s(f)) : mix(cur, full(k.s(f)), glide((f - k.f) / (k.dur ?? 24)));
  }
  return cur;
};
const pushK = (f: number, f0: number, rate: number, punch = 0, n = 35) => {
  const x = Math.max(0, f - f0);
  let s = rate * x;
  if (punch > rate) for (let i = 0; i < Math.min(x, n); i++) s += (punch - rate) * Math.max(0, Math.min(1, (i + 0.5) / 8, (n - i - 0.5) / 8));
  return Math.exp(-s);
};
const dolly = (pos: V3, look: V3, k: number, rest: Partial<Cam> = {}): Shot =>
  ({ pos: [look[0] + (pos[0] - look[0]) * k, look[1] + (pos[1] - look[1]) * k, look[2] + (pos[2] - look[2]) * k], look, ...rest });
const zoom = (pos: V3, look: V3, fov: number, k: number, rest: Partial<Cam> = {}): Shot =>
  ({ pos, look, fov: (360 / Math.PI) * Math.atan(Math.tan((fov * Math.PI) / 360) * k), ...rest });
const rolled = (s: (f: number) => Shot, roll: number) => (f: number): Shot => ({ ...s(f), roll });
const I = (x: number, y: number, z: number): V3 => [IX + x, y, z];
const Wk = (x: number, y: number, z: number): V3 => [WX + x, y, z];

const CAMS: Record<number, Key[]> = {
  // 1 hook: low in the street, the wave rolls at the lens; tilt up as it towers ("made of beer")
  1: [
    { f: 0, s: (f) => dolly([1.3, 1.1, 66], [0, 2.6, 44], pushK(f, 0, 0.0025), { fov: 46, roll: -0.03 }) },
    { f: F(9), dur: 30, s: (f) => dolly([0.8, 0.8, 64.5], [0, 4.2, 52], pushK(f, F(9), 0.002, 0.006, 30), { fov: 50, roll: 0.045 }) },
  ],
  // 2 setting: the brewery facade at the end of the street, then the proud brewer ("pride")
  2: [
    { f: F(15), s: (f) => zoom([2.6, 2.0, 34], [0, 6.5, 0], 44, pushK(f, F(15), 0.002)) },
    { f: F(23), cut: true, s: (f) => dolly([2.4, 1.55, 9.6], [1.2, 1.55, 4.0], pushK(f, F(23), 0.0025, 0.006, 30), { fov: 40, roll: -0.035 }) },
  ],
  // 3 the vat: low and wide, a tilt up its height ("twenty-two feet tall"), then over the top ("half a million litres")
  3: [
    { f: F(28), s: (f) => dolly(I(1.6, 1.0, 13.5), I(0, 2.4, -3), pushK(f, F(28), 0.002), { fov: 50 }) },
    { f: F(32), dur: 40, s: (f) => dolly(I(2.0, 4.4, 13.0), I(0, 6.0, -3), pushK(f, F(32), 0.002), { fov: 50 }) },
    { f: F(43), cut: true, s: (f) => dolly(I(2.4, 10.4, 3.2), I(0, 7.0, -3), pushK(f, F(43), 0.0025, 0.006, 30), { fov: 44, roll: 0.04 }) },
  ],
  // 4 the hoop pops off and crashes down
  4: [
    { f: F(50), s: (f) => dolly(I(6.2, 2.6, 9.0), I(1.0, 1.6, -0.4), pushK(f, F(50), 0.0025), { fov: 46 }) },
    { f: F(56), dur: 20, s: (f) => dolly(I(5.6, 1.6, 9.0), I(1.0, 0.9, -0.4), pushK(f, F(56), 0.002), { fov: 46, roll: -0.04 }) },
  ],
  // 5 the clerk at his standing desk: not worried
  5: [
    { f: F(63), s: (f) => dolly(I(7.8, 1.65, 8.6), I(7.0, 1.55, 4.0), pushK(f, F(63), 0.0025), { fov: 38 }) },
    { f: F(67), dur: 22, s: (f) => dolly(I(7.5, 1.7, 7.4), I(7.0, 1.6, 4.0), pushK(f, F(67), 0.002), { fov: 36, roll: 0.035 }) },
  ],
  // 6 an hour later (golden): quill on the note, the clerk, then the vat explodes
  6: [
    { f: F(74) - 4, s: (f) => dolly(I(7.55, 2.0, 5.9), I(7.0, 1.16, 4.55), pushK(f, F(74), 0.003), { fov: 34 }) },
    { f: F(84), cut: true, s: (f) => dolly(I(7.4, 1.7, 7.2), I(7.0, 1.6, 4.0), pushK(f, F(84), 0.003), { fov: 36, roll: -0.03 }) },
    { f: F(89), cut: true, s: (f) => dolly(I(2.2, 2.2, 12.5), I(0, 3.6, -3), pushK(f, F(89), 0.002), { fov: 52, roll: 0.045 }) },
  ],
  // 7 the chain reaction across the hall
  7: [
    { f: F(90), s: (f) => dolly(I(14.5, 3.4, 10.5), I(-2, 2.8, -5), pushK(f, F(90), 0.002), { fov: 54, roll: -0.03 }) },
    { f: F(98), dur: 26, s: (f) => dolly(I(11.5, 2.4, 9.0), I(-2, 2.2, -5), pushK(f, F(98), 0.0025), { fov: 54, roll: 0.03 }) },
  ],
  // 8 the street side of the brewery wall: it bursts toward the lens
  8: [
    { f: F(105), s: (f) => dolly([2.6, 1.6, 19], [0, 3.6, 0], pushK(f, F(105), 0.003, 0.006, 20), { fov: 46, roll: 0.04 }) },
  ],
  // 9 high over St Giles: the wave rolls down the street
  9: [
    { f: F(111), s: (f) => dolly([1.6, 11.5, 62], [0, 1.5, 20], pushK(f, F(111), 0.002), { fov: 46 }) },
    { f: F(118), dur: 36, s: (f) => dolly([2.4, 9.5, 64], [0, 1.0, 32], pushK(f, F(118), 0.002), { fov: 46, roll: -0.03 }) },
  ],
  // 10 cellars flood; then the house goes down
  10: [
    { f: F(127), s: (f) => dolly([0.2, 7.0, 54.5], [3.7, 0.3, 44.5], pushK(f, F(127), 0.003), { fov: 46, roll: 0.03 }) },
    { f: F(131), cut: true, s: (f) => dolly([3.0, 2.2, 64], [-6.5, 4.2, 47.5], pushK(f, F(131), 0.002), { fov: 46, roll: -0.04 }) },
  ],
  // 11 the wake: candles, mourners, then the beer comes in under the door
  11: [
    { f: F(135), s: (f) => dolly(Wk(0.2, 1.55, 5.2), Wk(0.3, 1.25, -1.0), pushK(f, F(135), 0.0018), { fov: 46 }) },
  ],
  // 12 the workers pulled out of the rubble, alive
  12: [
    { f: F(146), s: (f) => dolly(I(5.2, 1.4, 9.8), I(4.4, 1.0, 3.3), pushK(f, F(146), 0.0025), { fov: 40 }) },
    { f: F(150), dur: 24, s: (f) => dolly(I(4.9, 1.5, 8.4), I(4.4, 1.1, 3.3), pushK(f, F(150), 0.002), { fov: 38, roll: 0.035 }) },
  ],
  // 13 "Unluckily": empty plinth, foam trail, the hole in the back wall (deadpan push)
  13: [
    { f: F(156), s: (f) => dolly(I(0.4, 1.6, 11.5), I(0, 2.4, -14), pushK(f, F(156), 0.0035), { fov: 44 }) },
  ],
  // 14 "You see": the whole vat, pressure arrows (bigger toward the bottom)
  14: [
    { f: F(164) - 4, s: (f) => dolly(I(0.6, 3.8, 19), I(0, 3.6, -3), pushK(f, F(164), 0.0018), { fov: 50 }) },
    { f: F(177), dur: 30, s: (f) => dolly(I(0.4, 2.2, 15.5), I(0, 2.4, -3), pushK(f, F(177), 0.002), { fov: 50, roll: -0.03 }) },
  ],
  // 15 the suitcase you have to sit on
  15: [
    { f: F(185) - 3, s: (f) => dolly([1.6, 1.35, 70.8], [SUITCASE[0], 0.85, SUITCASE[2]], pushK(f, F(185), 0.0025), { fov: 40 }) },
    { f: F(197), dur: 24, s: (f) => dolly([1.15, 0.75, 68.6], [SUITCASE[0], 0.4, SUITCASE[2]], pushK(f, F(197), 0.002, 0.006, 30), { fov: 38, roll: 0.04 }) },
  ],
  // 16 the hoops are the straps: one drops, the rest strain, the next one snaps
  16: [
    { f: F(206) - 3, s: (f) => dolly(I(1.6, 2.9, 8.2), I(0, 3.0, -3), pushK(f, F(206), 0.002), { fov: 44 }) },
    { f: F(219), dur: 26, s: (f) => dolly(I(4.6, 3.8, 11.5), I(0.6, 3.5, -1.0), pushK(f, F(219), 0.003), { fov: 46, roll: -0.04 }) },
  ],
  // 17 the court: act of God
  17: [
    { f: F(224) - 4, s: (f) => dolly([0.6, 2.7, CZ + 2.2], [0, 2.9, CZ - 4.7], pushK(f, F(224), 0.0018), { fov: 42 }) },
    { f: F(232), dur: 26, s: (f) => dolly([0.3, 2.9, CZ - 0.6], [0, 3.1, CZ - 4.7], pushK(f, F(232), 0.002), { fov: 40, roll: 0.03 }) },
  ],
  // 18 Parliament hands the brewer his tax back
  18: [
    { f: F(236) - 3, s: (f) => dolly([0.3, 1.6, 12.8], [0.15, 1.45, 6.1], pushK(f, F(236), 0.002), { fov: 40 }) },
    { f: F(242), dur: 24, s: (f) => dolly([0.5, 1.6, 11.0], [0.3, 1.5, 6.1], pushK(f, F(242), 0.0025, 0.006, 30), { fov: 38, roll: -0.035 }) },
  ],
};

// impact kicks: image offset flips sign every frame, decays over 7 f
const KICKS: [number, number][] = [[T_CRASH, 0.8], [T_EX, 1.6], [T_CRACK, 1.0], [T_CRACK + 0.5, 0.7], [T_WALL, 1.6], [T_FLAT, 1.2], [T_SNAP2, 1.0]];
const T = (f: number) => f / FPS;
export const kickAt = (t: number) => {
  let a = 0;
  for (const [t0, g] of KICKS) {
    const n = Math.floor((t - t0) * FPS + 1e-6);
    if (n >= 0 && n < 7) a += g * (n % 2 ? -1 : 1) * (1 - n / 7) ** 1.5;
  }
  return a;
};
export const camAt = (id: number, f: number): Cam => {
  const c = run(CAMS[id], f), a = kickAt(T(f));
  if (!a) return c;
  const d: V3 = [c.look[0] - c.pos[0], c.look[1] - c.pos[1], c.look[2] - c.pos[2]];
  const L = Math.hypot(...d), h = Math.hypot(d[0], d[2]) || 1;
  const m = (3 / 640) * Math.tan((c.fov * Math.PI) / 360) * L * a;
  return { ...c, look: [c.look[0] - (d[2] / h) * m, c.look[1] + 0.6 * m, c.look[2] + (d[0] / h) * m], roll: c.roll + a * 0.004 };
};
export { rolled };

// ---------------- lens ----------------
export type Dof = { f: number; dur?: number; cInf: number; focus?: (f: number) => V3 };
export const DOF: Dof[] = [
  { f: 0, cInf: 8 },                                   // hook: mild, focus = look
  { f: F(15), cInf: 0 },                               // facade wide
  { f: F(23), cInf: 12, focus: () => [1.2, 1.6, 4.0] }, // brewer MS
  { f: F(28), cInf: 0 },                               // vat wide / tilt / top
  { f: F(50), cInf: 11 },                              // hoop MS
  { f: F(63), cInf: 13, focus: () => I(7.0, 1.6, 4.0) }, // clerk
  { f: F(74) - 4, cInf: 15 },                          // quill CU
  { f: F(84), cInf: 13, focus: () => I(7.0, 1.6, 4.0) },
  { f: F(89), cInf: 0 },                               // burst wide, chain reaction, wall, aerial
  { f: F(127), cInf: 10 },                             // cellar
  { f: F(131), cInf: 0 },                              // house
  { f: F(135), cInf: 7 },                              // wake
  { f: F(146), cInf: 10 },                             // rescue
  { f: F(156), cInf: 0 },                              // empty hall, diagram
  { f: F(185), cInf: 12 },                             // suitcase
  { f: F(206), cInf: 0 },                              // hoops lesson
  { f: F(219), cInf: 9 },
  { f: F(224), cInf: 7 },                              // court
  { f: F(236), cInf: 11, focus: () => [0.15, 1.55, 6.1] }, // payoff
];
export const dofAt = (f: number) => {
  let i = 0; while (i + 1 < DOF.length && f >= DOF[i + 1].f) i++;
  const d = DOF[i], p = DOF[Math.max(0, i - 1)];
  const k = d.dur ? Math.min(1, (f - d.f) / d.dur) : 1;
  return { cInf: p.cInf + (d.cInf - p.cInf) * k, focus: d.focus };
};

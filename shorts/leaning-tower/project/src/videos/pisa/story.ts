// Timeline of "The Tower Saved by a War": shots timed to the voice (shorts/leaning-tower/voice/words.json, 30 fps),
// the tower's story state per shot, and the camera grammar of the bridge short (smootherstep glides, creeping
// push-ins on every hold, hard cuts on big reframes, flip-sign impact kicks, 4-5 deg rolls on emphasis).
import { TowerState } from "./tower";

export const FPS = 30;
export const TOTAL = 2045;
export const D0 = 0; // ground level
export type V3 = [number, number, number];

export const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
export const smooth = (x: number) => { const u = clamp01(x); return u * u * (3 - 2 * u); };
export const easeOut = (u: number) => 1 - (1 - clamp01(u)) ** 4;
export const lin = (pts: [number, number][], x: number) => {
  if (x <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) if (x <= pts[i][0]) {
    const [x0, y0] = pts[i - 1], [x1, y1] = pts[i];
    return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
  }
  return pts[pts.length - 1][1];
};

// ---------------- places ----------------
export const CUT: V3 = [500, 0, 0];         // the underground cut-away diorama (face plane z = 0, tower stub behind it)
export const MAT: V3 = [24, 0, 34];          // the old mattress on the lawn (golden explanation)
export const STUB_Z = -(7.6 + 0.5);          // stub centre behind the cut face

// ---------------- shots ----------------
export type Light = "day" | "golden";
export type Era = "modern" | "1173" | "1272" | "1990";
export type ShotDef = { id: number; a: number; b: number; light: Light; era: Era; sunAz?: number; sunEl?: number };
export const SHOTS: ShotDef[] = [
  { id: 1, a: 0, b: 128, light: "day", era: "modern" },            // hook: tourists "holding up" the leaning tower
  { id: 2, a: 128, b: 288, light: "day", era: "1173" },            // 1173, proud town, the building site
  { id: 3, a: 288, b: 425, light: "day", era: "1173" },            // ground floor, first floor: perfect
  { id: 4, a: 425, b: 576, light: "day", era: "1173" },            // the foreman puts down his hammer, tilts his head
  { id: 5, a: 576, b: 632, light: "day", era: "1173" },            // the whole tower is leaning
  { id: 6, a: 632, b: 728, light: "day", era: "1173" },            // cut-away: 3 m foundation on soft wet clay
  { id: 7, a: 728, b: 836, light: "day", era: "1173" },            // Pisa goes to war, the builders walk off
  { id: 8, a: 836, b: 873, light: "day", era: "1173" },            // almost a hundred years (overgrown)
  { id: 9, a: 873, b: 1030, light: "day", era: "1272" },           // grandkids, genius plan, taller on the short side
  { id: 10, a: 1030, b: 1088, light: "day", era: "1272" },         // luckily it didn't fall over
  { id: 11, a: 1088, b: 1188, light: "day", era: "1272" },         // unluckily: bent like a banana
  { id: 12, a: 1188, b: 1422, light: "golden", era: "modern" },    // the old mattress
  { id: 13, a: 1422, b: 1528, light: "golden", era: "1173" },      // the clay squeezes out its water
  { id: 14, a: 1528, b: 1630, light: "day", era: "1272" },         // without the break: straight over
  { id: 15, a: 1630, b: 1802, light: "day", era: "1990" },         // 1990: closed, engineers sneak dirt out
  { id: 16, a: 1802, b: 1934, light: "day", era: "1990" },         // straightened 45 cm, then stopped on purpose
  { id: 17, a: 1934, b: TOTAL, light: "day", era: "modern" },      // a tower that stands up straight is just a tower
];
/** crossfades (frames) at place/time changes; a white 4-frame flash after the hook */
export const XFADE: Record<number, number> = { 6: 8, 7: 8, 8: 10, 9: 10, 12: 10, 13: 8, 14: 8, 15: 8, 17: 8 };
export const FLASH_AT = 128;

export const shotAt = (f: number) => SHOTS.find((s) => f >= s.a && f < s.b) ?? SHOTS[SHOTS.length - 1];
export const layersAt = (f: number): { id: number; alpha: number }[] => {
  for (const s of SHOTS) {
    const x = XFADE[s.id];
    if (x && f >= s.a - x / 2 && f < s.a + x / 2) return [{ id: s.id - 1, alpha: 1 }, { id: s.id, alpha: (f - (s.a - x / 2) + 1) / (x + 1) }];
  }
  return [{ id: shotAt(f).id, alpha: 1 }];
};

// ---------------- the tower's story ----------------
const T = (f: number) => f / FPS;
export const LEAN_MOD = 0.12, LEAN_1990 = 0.14, LEAN_FIX = 0.122;
/** the newest floor drops in over 6 frames ending at f, then a 6-frame squash */
const landAt = (f: number, fl: number) => ({ grow: smooth((f - (fl - 6)) / 6), pop: f >= fl && f < fl + 8 ? Math.sin(((f - fl) / 8) * Math.PI) : 0 });
export const towerAt = (id: number, f: number): TowerState => {
  switch (id) {
    case 1: case 12: case 17: return { floors: 8, lean: LEAN_MOD, kinks: true };
    case 2: return { floors: 0.55, lean: 0, kinks: false };
    case 3: {
      const a = landAt(f, 318), b = landAt(f, 377);
      return { floors: f < 377 - 6 ? 0.55 + 0.45 * a.grow : 1 + b.grow, lean: 0, kinks: false, pop: Math.max(a.pop, b.pop) };
    }
    case 4: return { floors: 2 + 0.5 * smooth((f - 440) / 30), lean: 0.004, kinks: false };
    case 5: return { floors: 2.5, lean: 0.015 + 0.115 * smooth((f - 598) / 16), kinks: false };
    case 6: return { floors: 2.5, lean: 0.1 + 0.015 * smooth((f - 690) / 30), kinks: false, sink: 0.25 + 0.3 * smooth((f - 690) / 30) };
    case 7: case 8: return { floors: 2.5, lean: 0.1, kinks: false };
    case 9: {
      // "build the new floors taller on the short side": one floor per ~10 frames from "Build" (965) to "side" (1009)
      const k = clamp01((f - 962) / 52) * 4.5;
      return { floors: 2.5 + (f < 962 ? 0 : k), lean: 0.1 + 0.02 * clamp01((f - 962) / 52), kinks: true };
    }
    case 10: case 11: return { floors: 7 + smooth((f - 1034) / 8), lean: LEAN_MOD, kinks: true };
    case 13: return { floors: 2.5, lean: 0.115, kinks: false, sink: 0.55 };
    case 14: {
      // straight stack added fast, then it goes over (rotation about the low edge, accelerating like a falling stick)
      const fl = Math.min(8, 2.5 + clamp01((f - 1545) / 30) * 5.5), u = clamp01((f - 1583) / 30);
      return { floors: fl, lean: 0.1, kinks: false, topple: u < 1 ? 1.45 * u * u * u : 1.45 };
    }
    case 15: return { floors: 8, lean: LEAN_1990, kinks: true };
    case 16: return { floors: 8, lean: LEAN_1990 + (LEAN_FIX - LEAN_1990) * smooth((f - 1812) / 55), kinks: true };
    default: return { floors: 8, lean: LEAN_MOD, kinks: true };
  }
};
export const TOPPLE_HIT = 1613; // the falling tower meets the lawn
export const scaffoldOn = (id: number) => id >= 2 && id <= 8;

// ---------------- camera ----------------
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

// cast anchors used by cameras and the cast
export const FOREMAN: V3 = [3.2, 0, 13.2];
export const BANANA_KID: V3 = [7.6, 0, 66];
export const TOURISTS_Z = 74;
const CX = CUT[0];

// 1 hook: low behind the tourists, the tower over their shoulders; punch on "war", lift to the tower top on "finishing"
const S1a = (f: number) => dolly([-3, 1.5, 88], [2, 13, 0], pushK(f, 0, 0.0007), { fov: 50 });
const S1b = (f: number) => dolly([-2, 1.4, 86], [2.5, 15, 0], pushK(f, 70, 0.0007, 0.003, 30), { fov: 48, roll: -0.035 });
// 2 aerial over the 1173 piazza, the site in the middle; drifts down on "proud"
const S2a = (f: number) => zoom([62, 42, 100], [-12, 4, -8], 42, pushK(f, 124, 0.0018));
const S2b = (f: number) => dolly([16, 2.2, 44], [2, 4.5, 0], pushK(f, 200, 0.002, 0.005, 30), { fov: 46 });
// 3 the floors land: MS low on the site, then wider for the first floor
const S3a = (f: number) => dolly([8, 2.2, 30], [0, 6.5, 0], pushK(f, 288, 0.002), { fov: 44 });
const S3b = (f: number) => dolly([10, 2.0, 38], [0, 10, 0], pushK(f, 352, 0.002, 0.005, 25), { fov: 44, roll: 0.03 });
// 4 the foreman: MS -> slow creep into a CU on "tilts his head"
const S4a = (f: number) => dolly([FOREMAN[0] - 1.2, 1.75, FOREMAN[2] + 5.2], [FOREMAN[0] - 0.4, 1.9, FOREMAN[2]], pushK(f, 425, 0.0016), { fov: 38 });
const S4b = (f: number) => dolly([FOREMAN[0] - 0.4, 1.95, FOREMAN[2] + 2.9], [FOREMAN[0] - 0.05, 1.95, FOREMAN[2]], pushK(f, 520, 0.0022), { fov: 36, roll: 0.04 });
// 5 reveal: wide low from the front, dutch roll matching the lean; kick on "leaning"
const S5a = (f: number) => dolly([-6, 1.4, 52], [3, 11, 0], pushK(f, 576, 0.0025), { fov: 46, roll: 0.0 });
// 6 cut-away: the section face, tower base on top, clay below
const S6a = (f: number) => dolly([CX + 1, 2, 50], [CX + 1, 2, 0], pushK(f, 624, 0.0015), { fov: 46 });
const S6b = (f: number) => dolly([CX + 3, -3.5, 28], [CX + 2.5, -4, 0], pushK(f, 685, 0.002, 0.005, 25), { fov: 44, roll: -0.03 });
// 7 war: side view of the column marching off to the left past the site; 8 the overgrown site
const S7a = (f: number) => dolly([14, 2.0, 40], [2, 3.2, 14], pushK(f, 720, 0.002), { fov: 44 });
const S7b = (f: number) => dolly([18, 1.8, 36], [4, 2.6, 12], pushK(f, 790, 0.002), { fov: 42, roll: 0.03 });
const S8a = (f: number) => dolly([22, 3.0, 50], [0, 7, 0], pushK(f, 828, 0.0025), { fov: 44 });
// 9 grandkids walk in (wide), bulb CU on "genius plan", then low wide while the floors stack
const S9a = (f: number) => dolly([14, 1.8, 36], [2, 2.6, 14], pushK(f, 865, 0.002), { fov: 44 });
const S9b = (f: number) => dolly([FOREMAN[0] + 1.2, 1.9, FOREMAN[2] + 4.4], [FOREMAN[0], 2.1, FOREMAN[2]], pushK(f, 920, 0.002, 0.006, 25), { fov: 38 });
const S9c = (f: number) => dolly([14, 1.6, 82], [3, 26, 0], pushK(f, 958, 0.0012), { fov: 48 });
// 10 relief wide with the grandkids; 11 banana CU vs the bent tower (side view to show the curve)
const S10a = (f: number) => dolly([-10, 1.4, 88], [4, 27, 0], pushK(f, 1030, 0.0015), { fov: 48 });
const S11a = (f: number) => dolly([BANANA_KID[0] + 0.3, 1.75, BANANA_KID[2] + 2.8], [BANANA_KID[0] - 0.6, 2.4, BANANA_KID[2]], pushK(f, 1088, 0.002), { fov: 40 });
const S11b = (f: number) => dolly([BANANA_KID[0] + 2.4, 1.6, BANANA_KID[2] + 7], [1, 16, 0], pushK(f, 1135, 0.001, 0.004, 25), { fov: 50, roll: 0.04 });
// 12 golden: the mattress
const S12a = (f: number) => dolly([MAT[0] + 3.4, 1.6, MAT[2] + 6.2], [MAT[0], 0.7, MAT[2]], pushK(f, 1180, 0.002), { fov: 42 });
const S12b = (f: number) => dolly([MAT[0] + 0.8, 1.1, MAT[2] + 4.2], [MAT[0] - 0.4, 0.75, MAT[2]], pushK(f, 1320, 0.0022, 0.005, 30), { fov: 40, roll: -0.04 });
// 13 golden cut-away: water squeezed out of the clay
const S13a = (f: number) => dolly([CX + 2, -1, 40], [CX + 1.5, -1.5, 0], pushK(f, 1414, 0.002), { fov: 46 });
// 14 the hypothetical: straight up then over, wide
const S14a = (f: number) => dolly([4, 3, 125], [24, 20, 0], pushK(f, 1520, 0.0012), { fov: 48 });
// 15 1990: barrier, engineers sneaking dirt out from under the high (-x) side
const S15a = (f: number) => dolly([-8, 2.0, 86], [2, 24, 0], pushK(f, 1622, 0.0015), { fov: 48 });
const S15b = (f: number) => dolly([-16, 1.6, 18], [-9.5, 1.0, 4], pushK(f, 1712, 0.0022, 0.005, 25), { fov: 42 });
// 16 the tower eases back, then the boss engineer: stop
const S16a = (f: number) => dolly([16, 1.2, 88], [3, 27, 0], pushK(f, 1802, 0.0012), { fov: 48 });
const S16b = (f: number) => dolly([-11, 1.8, 17.5], [-12.5, 1.9, 12], pushK(f, 1872, 0.002, 0.006, 25), { fov: 38 });
// 17 the tourists again, crane out to the whole tower
const S17a = (f: number) => dolly([-3, 1.5, 88], [2, 13, 0], pushK(f, 1926, 0.0007), { fov: 50 });
const S17c = (f: number): Shot => {
  const a = S17a(1975), s = glide((f - 1975) / 70);
  const b: V3 = [34, 26, 135], l: V3 = [3, 24, 0];
  return { pos: a.pos.map((v, i) => v + (b[i] - v) * s) as V3, look: a.look.map((v, i) => v + (l[i] - v) * s) as V3, fov: 50, roll: 0 };
};

const CAMS: Record<number, Key[]> = {
  1: [{ f: 0, s: S1a }, { f: 66, dur: 30, s: S1b }],
  2: [{ f: 124, s: S2a }, { f: 200, cut: true, s: S2b }],
  3: [{ f: 288, s: S3a }, { f: 352, dur: 26, s: S3b }],
  4: [{ f: 425, s: S4a }, { f: 520, dur: 28, s: S4b }],
  5: [{ f: 576, s: S5a }, { f: 600, dur: 20, s: rolled(S5a, 0.05) }],
  6: [{ f: 624, s: S6a }, { f: 685, dur: 28, s: S6b }],
  7: [{ f: 720, s: S7a }, { f: 790, dur: 24, s: S7b }],
  8: [{ f: 828, s: S8a }],
  9: [{ f: 865, s: S9a }, { f: 920, cut: true, s: S9b }, { f: 958, cut: true, s: S9c }],
  10: [{ f: 1030, s: S10a }],
  11: [{ f: 1088, s: S11a }, { f: 1135, cut: true, s: S11b }],
  12: [{ f: 1180, s: S12a }, { f: 1320, dur: 30, s: S12b }],
  13: [{ f: 1414, s: S13a }],
  14: [{ f: 1520, s: S14a }],
  15: [{ f: 1622, s: S15a }, { f: 1712, cut: true, s: S15b }],
  16: [{ f: 1802, s: S16a }, { f: 1872, cut: true, s: S16b }],
  17: [{ f: 1926, s: S17a }, { f: 1975, cut: true, s: S17c }],
};

// impact kicks: image offset flips sign every frame, decays over 7 f
const KICKS: [number, number][] = [[318 / FPS, 0.5], [377 / FPS, 0.6], [610 / FPS, 1.0], [TOPPLE_HIT / FPS, 1.8], [1883 / FPS, 0.4]];
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

// ---------------- lens ----------------
export type Dof = { f: number; dur?: number; cInf: number; focus?: (f: number) => V3 };
const at = (p: V3, dy = 1.75): (() => V3) => () => [p[0], p[1] + dy, p[2]];
export const DOF: Dof[] = [
  { f: 0, cInf: 8, focus: () => [2.5, 1.7, 74] },                   // hook: tourists sharp, tower soft-ish
  { f: 128, cInf: 0 },                                                 // aerial, site wides
  { f: 425, cInf: 12, focus: at(FOREMAN) },                            // foreman MS
  { f: 520, dur: 28, cInf: 14, focus: at(FOREMAN, 1.95) },             // foreman CU
  { f: 576, cInf: 0 },                                                 // reveal wide, cut-away, war, overgrown
  { f: 920, cInf: 12, focus: at(FOREMAN, 2.0) },                       // bulb CU
  { f: 958, cInf: 0 },                                                 // stacking wide, relief wide
  { f: 1088, cInf: 13, focus: at(BANANA_KID, 2.0) },                   // banana CU
  { f: 1135, cInf: 0 },                                                // banana vs tower
  { f: 1188, cInf: 7, focus: () => [MAT[0], 0.9, MAT[2]] },            // mattress
  { f: 1422, cInf: 0 },                                                // golden cut-away, hypothetical, 1990
  { f: 1712, cInf: 9, focus: () => [-9.5, 1.2, 5] },                   // engineers digging
  { f: 1802, cInf: 0 },
  { f: 1872, cInf: 12, focus: () => [-12.5, 1.9, 12] },               // boss: stop
  { f: 1934, cInf: 8, focus: () => [2.5, 1.7, 74] },                 // tourists
  { f: 1975, dur: 40, cInf: 0 },
];
export const dofAt = (f: number) => {
  let i = 0; while (i + 1 < DOF.length && f >= DOF[i + 1].f) i++;
  const d = DOF[i], p = DOF[Math.max(0, i - 1)];
  const k = d.dur ? Math.min(1, (f - d.f) / d.dur) : 1;
  return { cInf: p.cInf + (d.cInf - p.cInf) * k, focus: d.focus };
};

// ---------------- the mattress (shot 12) ----------------
/** cx = dent centre along the mattress (local x, the sitter is on the +x edge), depth (m), tilt of the sitter (rad),
 *  sat = 0 standing beside it .. 1 sitting */
export const MAT_YAW = 0.2;
export const mattressAt = (f: number) => {
  const sat = smooth((f - 1284) / 8);
  const depth = sat * lin([[1284, 0], [1296, 0.1], [1346, 0.12], [1356, 0.17], [1369, 0.18], [1380, 0.23], [1397, 0.25], [1414, 0.34]], f);
  const slide = smooth((f - 1394) / 22);
  return { sat, depth, cx: 0.66 + 0.24 * slide, tilt: sat * (0.05 + 0.3 * slide + 0.12 * smooth((f - 1350) / 30)) };
};

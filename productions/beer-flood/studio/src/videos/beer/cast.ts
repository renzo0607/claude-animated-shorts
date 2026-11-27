// Our cast as lit flat sprites in the 3D world. Each frame every character asks for a drawing (a key + a draw call);
// the pool keeps one canvas per distinct drawing, so soldiers marching in step share canvases (7 head shapes x 4
// outfits). Characters are yaw-only billboards shaded by cardShade() (scene tint, bright floor, side gradient toward
// the sun, painted crescent in the drawing); standing ones get a soft multiply contact blob. Effects are unlit cards.
// Cards, effects and blobs live on the NOINK layer so the world ink pass never outlines their quads.
import * as THREE from "three";
import { Pen, bodyFront, bodySide, townsfolk, KID, fxBurst, fxCreak, fxShadow, fxContact, fxPuff, Outfit, Expr, FrontOpts, SideOpts, INK, mix } from "./toon";
import { FPS, SHOTS, smooth, clamp01 } from "./story";
import { NOINK } from "./ink";
import { cardShade, blobMaterial, CARD_K } from "./cardshade";

// ---------------- canvas pool ----------------
type Entry = { cv: HTMLCanvasElement; tex: THREE.CanvasTexture; w: number; h: number };
export type Req = { key: string; w: number; h: number; k: number; draw: (p: Pen) => void; tex?: THREE.CanvasTexture };
const makeEntry = (w: number, h: number): Entry => {
  const cv = document.createElement("canvas");
  cv.width = w; cv.height = h;
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
  return { cv, tex, w, h };
};
export class Pool {
  private live = new Map<string, Entry>();
  private free: Entry[] = [];
  private reqs: Req[] = [];
  req(key: string, w: number, h: number, k: number, draw: (p: Pen) => void) {
    const r: Req = { key: `${w}x${h}|${key}`, w, h, k, draw };
    this.reqs.push(r);
    return r;
  }
  flush() {
    const want = new Map<string, Req[]>();
    for (const r of this.reqs) { const l = want.get(r.key); if (l) l.push(r); else want.set(r.key, [r]); }
    for (const [key, e] of this.live) if (!want.has(key)) { this.live.delete(key); this.free.push(e); }
    for (const [key, rs] of want) {
      let e = this.live.get(key);
      if (!e) {
        const r = rs[0], i = this.free.findIndex((x) => x.w === r.w && x.h === r.h);
        e = i >= 0 ? this.free.splice(i, 1)[0] : makeEntry(r.w, r.h);
        const g = e.cv.getContext("2d")!;
        g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, e.w, e.h); g.setTransform(r.k, 0, 0, r.k, 0, 0);
        r.draw(new Pen(g));
        e.tex.needsUpdate = true;
        this.live.set(key, e);
      }
      for (const r of rs) r.tex = e.tex;
    }
    this.reqs = [];
  }
}

// ---------------- sprite meshes ----------------
const blank = (() => { const c = document.createElement("canvas"); c.width = c.height = 2; return new THREE.CanvasTexture(c); })();
export const SU = 0.00216; // metres per design unit: 1000 units = 2.16 m
const BODY = (() => { const g = new THREE.PlaneGeometry(600 * SU, 1000 * SU); g.translate(0, (975 - 500) * SU, 0); return g; })();
const CARD = new THREE.PlaneGeometry(1, 1);
/** world roots that hold actors (to find the scene's sun when world.ts does not pass it) */
const ROOTS = new Set<THREE.Object3D>();

/** lit flat character: cardShade() material, receives shadows (dims to the bright floor only), casts its silhouette
 *  when world.ts says so (golden). Drawn after the contact blobs (renderOrder 1). */
export class Actor {
  mesh: THREE.Mesh; mat: THREE.MeshLambertMaterial; dmat: THREE.MeshDepthMaterial; r: Req | null = null;
  constructor(parent: THREE.Object3D, geo: THREE.BufferGeometry = BODY) {
    this.mat = cardShade(new THREE.MeshLambertMaterial({ map: blank, alphaTest: 0.5, side: THREE.DoubleSide }));
    this.mat.alphaToCoverage = false; // A2C + MSAA left 1 px sky-depth seams on blurred far cards (POST)
    this.dmat = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: blank, alphaTest: 0.5, side: THREE.DoubleSide });
    this.mesh = new THREE.Mesh(geo, this.mat);
    this.mesh.customDepthMaterial = this.dmat;
    // rim width is in output pixels: tell the card shader the render height (1920 = 1080 x 1920 frame)
    this.mesh.onBeforeRender = (r) => { const rt = r.getRenderTarget(); CARD_K.uPx.value = (rt ? rt.height : r.domElement.height) / 1920; };
    this.mesh.castShadow = false; this.mesh.receiveShadow = true; this.mesh.visible = false;
    this.mesh.rotation.order = "YXZ"; this.mesh.renderOrder = 1; this.mesh.layers.set(NOINK);
    parent.add(this.mesh);
    ROOTS.add(parent);
  }
  bind() { const t = this.r?.tex; if (t) { this.mat.map = t; this.dmat.map = t; } }
}
/** unlit effect card: hard cut-out (ink drawings), soft see-through (dust, mist) or a multiply ground blob */
export class Fx {
  mesh: THREE.Mesh; mat: THREE.MeshBasicMaterial; soft: THREE.MeshBasicMaterial; blob: THREE.MeshBasicMaterial; r: Req | null = null;
  constructor(parent: THREE.Object3D) {
    this.mat = new THREE.MeshBasicMaterial({ map: blank, alphaTest: 0.5, side: THREE.DoubleSide });
    this.mat.alphaToCoverage = false; // A2C + MSAA left 1 px sky-depth seams on blurred far cards (POST)
    this.soft = new THREE.MeshBasicMaterial({ map: blank, transparent: true, depthWrite: false, side: THREE.DoubleSide });
    this.blob = blobMaterial(blank);
    this.mesh = new THREE.Mesh(CARD, this.mat);
    this.mesh.visible = false; this.mesh.layers.set(NOINK);
    parent.add(this.mesh);
  }
  use(soft: boolean) { this.mesh.material = soft ? this.soft : this.mat; }
  bind() {
    const t = this.r?.tex;
    if (!t) return;
    if (this.r!.key.includes("|blob|")) {
      // no mipmaps: at grazing views the mip chain averages the blob with its white surround and it fades out
      if (t.generateMipmaps) { t.generateMipmaps = false; t.minFilter = THREE.LinearFilter; t.needsUpdate = true; }
      this.blob.map = t; this.mesh.material = this.blob; this.mesh.renderOrder = 0.5;
    }
    else { this.mat.map = t; this.soft.map = t; this.mesh.renderOrder = 0; }
  }
}

// ---------------- placements ----------------
export type Place = {
  key: string; draw: (p: Pen) => void; x: number; y: number; z: number;
  scale?: number; mirror?: boolean; yaw?: number; geo?: "body" | "swing"; roll?: number; size?: [number, number, number];
};
export type FxPlace = { key: string; cw: number; ch: number; draw: (p: Pen) => void; x: number; y: number; z: number; w: number; h: number; flat?: boolean; rot?: number; soft?: boolean };
/** sun = world direction TOWARD the sun (optional: when absent the scene's shadow-casting light is used) */
export type CamInfo = { pos: THREE.Vector3; right: THREE.Vector3; sun?: THREE.Vector3 };

const hh = (i: number, s = 0) => { const v = Math.sin(i * 127.1 + s * 311.7) * 43758.5453; return v - Math.floor(v); };
const q = (v: number, n = 120) => Math.round(v * n) / n;
const FOLK = [0, 1, 2, 3, 4, 5].map((v) => townsfolk(v));
const vOf = (i: number) => (i * 7 + (i >> 2)) % 4;
/** head-shape seed: 7 shapes, so marching soldiers in step still share canvases */
const seedOf = (i: number) => ((i * 5 + 3) % 7) + 1;
/** drawing resolution by distance: [canvas w, h, scale from the 600 x 1000 design]; sized for the 1440 x 2560 final */
const tier = (d: number): [number, number, number] =>
  d < 3.2 ? [1800, 3000, 3.0] : d < 6.5 ? [1080, 1800, 1.8] : d < 16 ? [480, 800, 0.8] : [240, 400, 0.4];

// ---------------- light ----------------
const SUN = new THREE.Vector3(0.5, 0.75, -0.4).normalize();
const tmp = new THREE.Vector3();
let LNAME: "day" | "golden" = "day";
const sunOf = (root: THREE.Object3D) => {
  let s: THREE.DirectionalLight | null = null;
  root.traverse((o) => { if (!s && o instanceof THREE.DirectionalLight && o.castShadow) s = o; });
  return s as THREE.DirectionalLight | null;
};
/** the sun of the world that is calling: the attached root whose sun target sits on this camera's view axis */
const findSun = (cam: CamInfo, out: THREE.Vector3) => {
  if (cam.sun) return out.copy(cam.sun).normalize();
  let best: THREE.DirectionalLight | null = null, err = Infinity;
  for (const r of ROOTS) {
    if (!r.parent) continue;
    const s = sunOf(r);
    if (!s) continue;
    const d = tmp.copy(s.target.position).sub(cam.pos), e = Math.abs(d.dot(cam.right)) / (d.length() || 1);
    if (e < err) { err = e; best = s; }
  }
  return best ? out.copy(best.position).sub(best.target.position).normalize() : out;
};
/** canvas angle the sun comes FROM on an upright card facing the camera, in 45-degree steps (small texture cache) */
const light2D = (cam: CamInfo, mirror: boolean) => {
  const sx = SUN.dot(cam.right) * (mirror ? -1 : 1), sy = -SUN.y;
  return Math.round(Math.atan2(sy, sx) / (Math.PI / 4)) * (Math.PI / 4);
};

/** front / side view and mirroring for someone at (x, z) walking along (dx, dz); fs = foreshortening of the walk */
const viewOf = (cam: CamInfo, x: number, z: number, dx: number, dz: number) => {
  const tx = cam.pos.x - x, tz = cam.pos.z - z, tl = Math.hypot(tx, tz) || 1;
  const c = (tx * dx + tz * dz) / tl;
  return { side: c < 0.57, mirror: dx * cam.right.x + dz * cam.right.z < 0, fs: Math.round(Math.sqrt(Math.max(0, 1 - c * c)) * 20) / 20 };
};

// ---------------- life: blinks and reaction timing ----------------
/** reference expression and action changes land 0-3 f before the word onset */
const LEAD = 2 / FPS;
/** eyelid 0 open .. 1 shut. Reference: gaps 0.5-2.3 s, 4-frame blink half / shut / shut / half, plus a blink across
 *  every expression swap (the shut frames hide the swap) */
const LID = [0.5, 1, 1, 0.5];
const lidAt = (t: number, i: number, swaps: number[] = []) => {
  const f = Math.round(t * FPS);
  for (const ts of swaps) { const k = f - Math.round((ts - LEAD) * FPS) + 1; if (k >= 0 && k < 4) return LID[k]; }
  let s = Math.round(-60 * hh(i, 9));
  for (let n = 0; s <= f && n < 400; n++) {
    const k = f - s;
    if (k >= 0 && k < 4) return LID[k];
    s += Math.round(15 + 54 * hh(i * 31 + n, 13)); // next blink 0.5-2.3 s later
  }
  return 0;
};
const fkey = (o: object) => JSON.stringify(o, (_k, v) => (typeof v === "number" ? q(v) : v));

type Who = { i: number; o: Outfit; okey: string };
/** one character drawing in the 600 x 1000 design space, sized by distance, lit from the scene's sun */
const person = (cam: CamInfo, who: Who, x: number, y: number, z: number, view: { side: boolean; mirror: boolean }, fo: FrontOpts, so: SideOpts, scale = 1): Place & { tierKey: string } => {
  const d = cam.pos.distanceTo(tmp.set(x, y + 1.2, z)) / scale;
  const [w, h, k] = tier(d);
  const mirror = view.side && view.mirror, light = light2D(cam, mirror), seed = seedOf(who.i);
  const f2: FrontOpts = { ...fo, light, seed }, s2: SideOpts = { ...so, light, seed };
  const key = view.side ? `S|${who.okey}|${fkey(s2)}` : `F|${who.okey}|${fkey(f2)}`;
  return {
    key, x, y, z, scale, mirror, tierKey: `${w}`,
    draw: (p) => (view.side ? bodySide(p, who.o, s2) : bodyFront(p, who.o, f2)),
    size: [w, h, k],
  };
};

/** ground shadow under a standing / sitting card (review rounds 2-4), multiply, blue-violet: a TIGHT contact pool right under
 *  the feet (~.5 on screen at the core) so nobody floats, plus by day (cards cast no real shadow) a lighter soft tail
 *  stretched AWAY from the sun, length ~1.6 m / tan(sun elevation), capped. Golden: world.ts casts real card shadows. */
const CONTACT: Record<"day" | "golden", [number, number, number]> = { day: [0.2, 0.21, 0.33], golden: [0.24, 0.2, 0.33] };
const TAIL: [number, number, number] = [0.42, 0.44, 0.62];
const toSrgb = (v: number) => { const c = clamp01(v); return c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055; };
const hexOf = (c: [number, number, number], k: number) => "#" + c.map((v) => Math.round(255 * toSrgb(1 - (1 - v) * k)).toString(16).padStart(2, "0")).join("");
const blob = (out: Stage, x: number, y: number, z: number, sc = 1, k = 1) => {
  const hl = Math.hypot(SUN.x, SUN.z) || 1, ox = -SUN.x / hl, oz = -SUN.z / hl, rot = Math.atan2(-ox, -oz);
  if (LNAME === "day") {
    const el = Math.asin(Math.min(0.99, Math.max(0.1, SUN.y)));
    const len = Math.min(2.4, Math.max(0.5, 1.6 / Math.tan(el))) * sc, h = len + 0.55 * sc, c = 0.3 * h; // feet at v = .2 of the card
    const tc = hexOf(TAIL, k);
    out.fx.push({ key: `blob|shadow|${tc}`, cw: 128, ch: 256, draw: (p) => fxShadow(p, tc), x: x + ox * c, y: y + 0.018, z: z + oz * c,
      w: 0.72 * sc, h, flat: true, rot });
  }
  const cc = hexOf(CONTACT[LNAME], k);
  out.fx.push({ key: `blob|contact|${cc}`, cw: 128, ch: 128, draw: (p) => fxContact(p, cc), x: x + ox * 0.03 * sc, y: y + 0.022, z: z + oz * 0.03 * sc,
    w: 0.52 * sc, h: 0.4 * sc, flat: true, rot });
};

// ---------------- crowd by shot ----------------
export type Stage = { places: Place[]; fx: FxPlace[] };

// =====================================================================================================
// The London Beer Flood cast. Outfits (our own designs, 1814 London): brewer, clerk, brewery workers, St Giles
// townsfolk, mourners, judge, a man from Parliament, a traveller with an overstuffed suitcase.
import {
  IX, VAT, VAT_R, VAT_H, PLINTH, HOOPS, DESK, LADDER, RUBBLE, STREET_W, SUITCASE, WX, DOOR, CZ, V3,
  T_POP, T_EX, T_CRACK, T_WALL, T_FLAT, T_POUR, T_LOSE, T_SNAP2, W, waveZ, waveH, CELLAR, WAVE_V, hh as H2,
} from "./story";

const BREWER: Outfit = { jacket: "#6b2f2f", pants: "#3b3f52", boots: "#3a2418", hat: "tophat", moustache: "#5a3b2a", build: "stout", skin: "#f5c9a0" };
const CLERK: Outfit = { jacket: "#2f4f6f", pants: "#4a4a52", boots: "#2a201a", hat: "hair", hair: "#6a4a2e", skin: "#ffe2c2" };
const WORKER = (v: number): Outfit => ({ jacket: ["#8a6a4a", "#5d7a3a", "#7a5a3a", "#b5653f"][v % 4], pants: "#3d4440", boots: "#3a2418", hat: "cap",
  cap: ["#3a3d47", "#6a4a2e", "#2f5f6a", "#4a3442"][v % 4], skin: ["#f5c9a0", "#ffe2c2", "#ecd0b6", "#c99067"][v % 4], moustache: v % 3 === 1 ? "#4a3426" : undefined });
const MOURN = (v: number): Outfit => v % 2
  ? { jacket: "#3a3448", pants: "#2e2d36", boots: "#2a201a", hat: "bonnet", dress: "#3d3a4a", skin: ["#ffe2c2", "#f5c9a0"][v % 2] }
  : { jacket: "#2e2d36", pants: "#2e2d36", boots: "#2a201a", hat: "tophat", skin: ["#ecd0b6", "#ffe2c2"][(v >> 1) % 2], moustache: v === 2 ? "#4a3426" : undefined };
const JUDGE: Outfit = { jacket: "#8a2230", pants: "#2e2d36", boots: "#2a201a", hat: "hair", hair: "#f2efe6", build: "stout", skin: "#f5c9a0" };
const MP: Outfit = { jacket: "#23222b", pants: "#2e2d36", boots: "#1d1b22", hat: "tophat", moustache: "#2a201a", skin: "#ffe2c2" };
const TRAVELLER: Outfit = { jacket: "#3f6fb5", pants: "#3b3f52", boots: "#5a3b2a", hat: "cap", cap: "#e2453c", skin: "#ecd0b6" };
const FOLK6 = [0, 1, 2, 3, 4, 5].map((v) => townsfolk(v));

const between = (t: number, a: number, b: number) => t >= a && t < b;
/** expression by word: [word index, expression] steps, LEAD frames early */
const exprBy = (t: number, steps: [number, Expr][], first: Expr): Expr => {
  let e = first;
  for (const [i, x] of steps) if (t >= W(i) - LEAD) e = x;
  return e;
};
const stand = (cam: CamInfo, out: Stage, i: number, o: Outfit, okey: string, x: number, y: number, z: number, fo: FrontOpts, sc = 1, shadow = true) => {
  out.places.push(person(cam, { i, o, okey }, x, y, z, { side: false, mirror: false }, { mode: "stand", blink: lidAt(fo.blink === undefined ? 0 : 0, i), ...fo }, {}, sc));
  if (shadow) blob(out, x, y, z, sc);
};
const runner = (cam: CamInfo, out: Stage, t: number, i: number, o: Outfit, okey: string, x: number, z: number, expr: Expr = "shock") => {
  const phase = q(((t * 2.3 + H2(i, 3)) % 1), 24);
  out.places.push(person(cam, { i, o, okey }, x, 0, z, { side: false, mirror: false }, { mode: "march", phase, expr, lift: 95, blink: 0, look: 0 }, {}));
  blob(out, x, 0, z);
};

// ---------------- effect drawings ----------------
const PORTER = "#5a3018", FOAMC = "#f6e8c8", FOAMS = "#e2cd9f";
/** beer splash crown on an 800 x 800 canvas; t in 0..1 */
const beerSplash = (p: Pen, t: number) => {
  const c = 400, size = 800, rise = Math.sin(Math.min(1, t * 1.3) * Math.PI);
  if (rise > 0.02) {
    const pts: [number, number][] = [];
    for (let i = 0; i < 19; i++) {
      const h = (i % 2 ? 260 : 130) * rise * (0.7 + 0.3 * Math.sin(i * 1.7));
      pts.push([c - 330 + (660 * i) / 18, size - 120 - h]);
    }
    p.poly([...pts, [c + 330, size - 110], [c - 330, size - 110]], "#8c4a1c", 10);
    p.poly(pts.map(([x, y]) => [x, y + 26] as [number, number]).concat([[c + 300, size - 170], [c - 300, size - 170]]), FOAMC, 0);
  }
  for (let i = 0; i < 8; i++) {
    const a = ((200 + i * 18) * Math.PI) / 180, d = 120 + 380 * t, y = size - 160 + d * Math.sin(a) + 520 * t * t, r = 26 * (1 - t) + 6;
    if (t > 0.08 && y < size - 40) p.ell(c + d * Math.cos(a), y, r, r * 1.25, i % 3 ? "#a8622a" : FOAMC, 7);
  }
};
/** foam blob cluster on a 400 x 300 canvas (soft, see-through edges) */
const foamPuff = (p: Pen, k: number) => {
  for (let i = 0; i < 7; i++) {
    const a = i * 0.9 + k, r = 46 + 22 * Math.sin(i * 1.7 + k);
    p.ell(200 + 120 * Math.cos(a) * (i / 7), 170 + 50 * Math.sin(a) * (i / 7), r, r * 0.82, i % 3 ? FOAMC : FOAMS, 7);
  }
};
/** pressure arrow (pointing right) on a 400 x 200 canvas */
const arrow = (p: Pen) => p.poly([[20, 70], [250, 70], [250, 22], [380, 100], [250, 178], [250, 130], [20, 130]], "#ffd04a", 12);
/** a bag of coins on a 300 x 300 canvas */
const coinBag = (p: Pen) => {
  p.poly([[70, 270], [55, 180], [90, 120], [120, 100], [110, 70], [190, 70], [180, 100], [210, 120], [245, 180], [230, 270]], "#d8c08a", 11);
  p.stroke([[112, 96], [190, 96]], 12, "#7a5a3a");
  for (const [x, y] of [[150, 190], [120, 220], [180, 228]] as const) { p.ell(x, y, 26, 26, "#f2c94c", 8); p.ell(x, y, 13, 13, "#e0b030", 0); }
};
/** quill pen on a 120 x 400 canvas, nib at the bottom */
const quill = (p: Pen) => {
  p.poly([[60, 390], [52, 300], [40, 140], [36, 40], [60, 10], [86, 60], [80, 160], [68, 300]], "#f4f1ea", 7);
  p.stroke([[60, 388], [58, 300], [56, 150], [54, 40]], 4, "#b8b0a0");
  p.poly([[54, 330], [66, 330], [60, 392]], "#241726", 0);
};
/** handwriting scribble lines on a 400 x 500 canvas, k = progress 0..1 */
const scribble = (p: Pen, k: number) => {
  const lines = 7, n = Math.floor(k * lines * 12);
  for (let l = 0; l < lines; l++) {
    const pts: [number, number][] = [];
    for (let i = 0; i < 12 && l * 12 + i < n; i++) pts.push([50 + i * 25, 80 + l * 50 + 8 * Math.sin(i * 2.3 + l)]);
    if (pts.length > 1) p.stroke(pts, 7, "#2b2030");
  }
};
/** a hat floating on the beer (tophat) on a 300 x 220 canvas */
const floatHat = (p: Pen) => {
  p.poly([[90, 30], [210, 30], [200, 160], [100, 160]], "#2e2a36", 10);
  p.band([[96, 140], [204, 140]], "#8c3b4a", 18, 4);
  p.ell(150, 165, 120, 22, "#1d1b22", 9);
};
/** soft warm light beam from above on a 300 x 800 canvas */
const beam = (p: Pen) => {
  const g = p.g, gr = g.createLinearGradient(0, 0, 0, 800);
  gr.addColorStop(0, "rgba(255,240,190,0.75)"); gr.addColorStop(1, "rgba(255,240,190,0)");
  g.fillStyle = gr; g.beginPath(); g.moveTo(110, 0); g.lineTo(190, 0); g.lineTo(290, 800); g.lineTo(10, 800); g.closePath(); g.fill();
};
/** wet drips on a 200 x 300 canvas */
const drips = (p: Pen, k: number) => {
  for (let i = 0; i < 4; i++) { const y = 40 + ((k * 260 + i * 70) % 260); p.ell(40 + i * 40, y, 9, 13, "#8c4a1c", 4); }
};

// ---------------- staging per shot ----------------
const waveFx = (out: Stage, tau: number, t: number, zMax = 999) => {
  const zf = waveZ(tau), Hh = waveH(tau);
  if (zf <= 0 || zf > zMax) return;
  for (let k = 0; k < 4; k++) {
    const x = -STREET_W + 1.1 + k * ((2 * STREET_W - 2.2) / 3), u = q(((t * 1.7 + H2(k, 2)) % 1), 24);
    out.fx.push({ key: `bsplash${u}`, cw: 800, ch: 800, draw: (p) => beerSplash(p, u), x, y: Hh * 0.92 - 0.6, z: zf + 0.9, w: 3.0, h: 3.0 });
  }
  for (let k = 0; k < 5; k++) {
    const x = -STREET_W + 1.2 + k * 1.6 + 0.3 * Math.sin(t * 3 + k), kk = q((t * 0.8 + k) % 6.28, 6);
    out.fx.push({ key: `foam${kk}`, cw: 400, ch: 300, draw: (p) => foamPuff(p, kk), x, y: Hh + 0.1, z: zf + 0.2, w: 1.8, h: 1.35 });
  }
  // a top hat riding the crest
  out.fx.push({ key: "floatHat", cw: 300, ch: 220, draw: floatHat, x: 0.9 + 0.2 * Math.sin(t * 2), y: Hh + 0.3 + 0.1 * Math.sin(t * 5), z: zf - 1.2, w: 0.7, h: 0.51, rot: 0.3 * Math.sin(t * 3) });
};

const burstFx = (out: Stage, t: number, t0: number, at: V3, size: number, dur = 0.4, col = "#fff3b0") => {
  if (t < t0 || t >= t0 + dur) return;
  const u = q((t - t0) / dur, 30);
  out.fx.push({ key: `burst${col}${u}`, cw: 500, ch: 500, draw: (p) => fxBurst(p, u, col), x: at[0], y: at[1], z: at[2], w: size, h: size });
};
const splashAt = (out: Stage, t: number, t0: number, at: V3, size: number, dur = 1.0) => {
  if (t < t0 || t >= t0 + dur) return;
  const u = q((t - t0) / dur, 30);
  out.fx.push({ key: `bsplash${u}`, cw: 800, ch: 800, draw: (p) => beerSplash(p, u), x: at[0], y: at[1] + size * 0.36, z: at[2], w: size, h: size });
};
const puffAt = (out: Stage, t: number, t0: number, at: V3, size: number, dur = 0.9) => {
  if (t < t0 || t >= t0 + dur) return;
  const u = q((t - t0) / dur, 30);
  out.fx.push({ key: `puff${u}`, cw: 300, ch: 300, draw: (p) => fxPuff(p, u), x: at[0], y: at[1], z: at[2], w: size, h: size, soft: true });
};

export const stage = (id: number, t: number, tau: number, cam: CamInfo): Stage => {
  const out: Stage = { places: [], fx: [] };
  const s = SHOTS[id - 1];
  LNAME = s.light;
  findSun(cam, SUN);
  switch (id) {
    case 1: {
      runner(cam, out, t, 1, FOLK6[1], "f1", -1.7, 46.5 + 3.3 * t);
      runner(cam, out, t, 2, FOLK6[2], "f2", 1.9, 44.8 + 3.5 * t);
      waveFx(out, tau, t);
      break;
    }
    case 2: {
      const e: Expr = exprBy(t, [[24, "grin"]], "smile_closed");
      stand(cam, out, 10, BREWER, "brewer", 1.2, 0, 4.0, { expr: e, facing: -1 });
      const spots: [number, number, number][] = [[-2.3, 6.4, 0], [3.0, 7.6, 3], [-3.0, 10.2, 4], [2.6, 12.5, 5], [-0.9, 13.5, 2]];
      spots.forEach(([x, z, v], k) => stand(cam, out, 20 + k, FOLK6[v], `f${v}`, x, 0, z, { expr: (["smile", "grin", "smile_closed", "smile", "laugh"] as Expr[])[k], look: x < 0 ? 1 : -1 }));
      stand(cam, out, 30, KID, "kid", -1.4, 0, 8.2, { expr: "grin" }, 0.72);
      break;
    }
    case 3: case 4: {
      stand(cam, out, 40, WORKER(0), "w0", LADDER[0], 3.7, LADDER[2] + 0.82, { expr: "neutral" }, 1, false);
      const shock = id === 4 && t > T_POP - LEAD;
      stand(cam, out, 41, WORKER(1), "w1", IX + 3.1, 0, 1.7, { expr: shock ? "shock" : "smile", look: shock ? -1 : 0 });
      if (id === 4) {
        burstFx(out, t, T_POP, [VAT[0] + 1.3, PLINTH + HOOPS[2] * VAT_H, VAT[2] + VAT_R + 0.2], 0.9);
        puffAt(out, t, W(59) - 0.03, [VAT[0] + 1.6, 0.25, VAT[2] + VAT_R + 0.4], 1.6);
        burstFx(out, t, W(59) - 0.03, [VAT[0] + 1.6, 0.2, VAT[2] + VAT_R + 0.5], 1.1, 0.3, "#ffffff");
      }
      break;
    }
    case 5: case 6: case 7: {
      const e: Expr = id === 5 ? exprBy(t, [[65, "smile_closed"], [67, "smile"]], "neutral") : t > T_EX - LEAD ? "shock" : "neutral";
      stand(cam, out, 50, CLERK, "clerk", DESK[0], 0, DESK[2] - 0.15, { expr: e, look: id === 5 ? 0 : t > T_EX ? -1 : 0, headTilt: id === 6 && t < T_EX ? 0.12 : 0 }, 1, false);
      if (id === 6 && t < T_EX) {
        const k = clamp01((t - W(74)) / (W(88) - W(74)));
        out.fx.push({ key: `scrib${q(k, 30)}`, cw: 400, ch: 500, draw: (p) => scribble(p, q(k, 30)), x: DESK[0] - 0.05, y: 1.135, z: DESK[2] + 0.55, w: 0.36, h: 0.45, flat: true });
        const wig = 0.04 * Math.sin(t * 14), adv = q(k, 30);
        out.fx.push({ key: "quill", cw: 120, ch: 400, draw: quill, x: DESK[0] - 0.2 + 0.25 * ((adv * 7) % 1) + wig, y: 1.3, z: DESK[2] + 0.45 + 0.3 * adv, w: 0.1, h: 0.34, rot: -0.35 });
      }
      if (id >= 6) {
        burstFx(out, t, T_EX, [VAT[0], 3.5, VAT[2] + VAT_R + 0.5], 4.5, 0.45);
        splashAt(out, t, T_EX + 0.05, [VAT[0] - 1.5, 0, VAT[2] + 3.5], 6, 1.2);
        splashAt(out, t, T_EX + 0.15, [VAT[0] + 2.2, 0, VAT[2] + 2.5], 5, 1.1);
        burstFx(out, t, T_CRACK, [IX - 9.5, 3.2, -3.6], 3.6, 0.4);
        burstFx(out, t, T_CRACK + 0.5, [IX + 9.5, 3.2, -3.6], 3.6, 0.4);
        splashAt(out, t, T_CRACK + 0.1, [IX - 8, 0, -2], 5.5, 1.1);
        splashAt(out, t, T_CRACK + 0.6, [IX + 8, 0, -2], 5.5, 1.1);
      }
      if (id === 7) {
        runner(cam, out, t, 42, WORKER(2), "w2", IX + 4.5 + 2.6 * (t - W(90)), 6.5);
        runner(cam, out, t, 43, WORKER(3), "w3", IX + 6.5 + 2.4 * (t - W(90)), 1.2);
      }
      break;
    }
    case 8: {
      burstFx(out, t, T_WALL, [0, 2.6, 0.8], 6, 0.45);
      splashAt(out, t, T_WALL + 0.1, [0, 0, 3.0], 7, 1.0);
      waveFx(out, tau, t);
      break;
    }
    case 9: {
      for (let k = 0; k < 6; k++) runner(cam, out, t, 60 + k, FOLK6[k], `f${k}`, -3 + k * 1.2 + (H2(k, 1) - 0.5), 46 + k * 2.6 + 3.4 * (t - W(111)));
      waveFx(out, tau, t);
      break;
    }
    case 10: {
      waveFx(out, tau, t);
      // pouring into the cellar
      if (tau > T_WALL + (CELLAR[2] - 1) / WAVE_V) for (let k = 0; k < 2; k++) {
        const u = q(((t * 1.3 + k * 0.5) % 1), 24);
        out.fx.push({ key: `bsplash${u}`, cw: 800, ch: 800, draw: (p) => beerSplash(p, u), x: CELLAR[0] - 0.1, y: 0.5, z: CELLAR[2] - 0.5 + k, w: 1.6, h: 1.6 });
      }
      puffAt(out, t, T_FLAT + 0.15, [-6.5, 1.5, 46], 6, 1.2);
      puffAt(out, t, T_FLAT + 0.3, [-6.0, 1.2, 50], 5, 1.2);
      break;
    }
    case 11: {
      const turn = t > T_POUR + 0.5;
      const spots: [number, number][] = [[-1.75, -0.4], [-0.6, 0.2], [0.65, -0.25], [1.7, 0.45]];
      spots.forEach(([x, z], k) => stand(cam, out, 70 + k, MOURN(k), `m${k}`, WX + x, 0, z, { expr: turn ? (k % 2 ? "shock" : "nervous") : (k === 1 ? "stern" : "neutral"), look: turn ? 1 : 0 }));
      if (t > T_POUR + 0.2) {
        const u = q(((t * 1.4) % 1), 24);
        out.fx.push({ key: `bsplash${u}`, cw: 800, ch: 800, draw: (p) => beerSplash(p, u), x: DOOR[0] - 0.2, y: 0.55, z: DOOR[2], w: 1.6, h: 1.6 });
      }
      break;
    }
    case 12: {
      const e: Expr = exprBy(t, [[155, "relief"]], "dazed");
      out.places.push(person(cam, { i: 80, o: WORKER(1), okey: "w1" }, RUBBLE[0] + 0.5, 0.2, RUBBLE[2] + 1.9, { side: false, mirror: false }, { mode: "sit", expr: e, blink: lidAt(t, 80) }, {}));
      stand(cam, out, 81, WORKER(2), "w2", RUBBLE[0] - 0.25, 0, RUBBLE[2] + 1.0, { expr: exprBy(t, [[154, "relief_open"]], "grin"), look: 1 });
      stand(cam, out, 82, WORKER(0), "w0", RUBBLE[0] + 1.25, 0, RUBBLE[2] + 1.1, { expr: exprBy(t, [[154, "laugh"]], "smile"), look: -1 });
      for (const [x, k] of [[RUBBLE[0] + 0.5, 0], [RUBBLE[0] - 0.25, 1], [RUBBLE[0] + 1.25, 2]] as const) {
        const u = q((t * 0.8 + k * 0.3) % 1, 20);
        out.fx.push({ key: `drips${u}`, cw: 200, ch: 300, draw: (p) => drips(p, u), x, y: 0.9, z: RUBBLE[2] + 2.8, w: 0.45, h: 0.67 });
      }
      break;
    }
    case 13: {
      // a foam trail on the floor leading out through the hole
      for (let k = 0; k < 9; k++) out.fx.push({ key: `foam${k}`, cw: 400, ch: 300, draw: (p) => foamPuff(p, k), x: IX + (H2(k, 1) - 0.5) * 2.5, y: 0.05, z: -12.5 + k * 1.7, w: 1.6, h: 1.2, flat: true, rot: k });
      break;
    }
    case 14: {
      // arrows push out of the vat: more of them and bigger toward the bottom ("the deeper it gets, the harder it pushes")
      const deep = smooth((t - W(177)) / 0.6);
      for (let k = 0; k < 5; k++) {
        const fr = 0.85 - k * 0.18, y = PLINTH + fr * VAT_H, depth = 1 - fr, t0 = W(167) + 0.15 * k;
        if (t < t0) continue;
        const pop = smooth((t - t0) / 0.2), size = (1.1 + 3.0 * depth * (0.45 + 0.55 * deep)) * pop;
        for (const side of [-1, 1]) {
          const x = VAT[0] + side * (VAT_R - 0.15 + size * 0.5 + 0.06 * Math.sin(t * 6 + k));
          out.fx.push({ key: "arrow", cw: 400, ch: 200, draw: arrow, x, y, z: VAT[2] + 0.9, w: size, h: size * 0.5, rot: side > 0 ? 0 : Math.PI });
        }
      }
      break;
    }
    case 15: {
      const e: Expr = exprBy(t, [[194, "pained"], [201, "nervous"]], "grin");
      out.places.push(person(cam, { i: 90, o: TRAVELLER, okey: "trav" }, SUITCASE[0], 0.45, SUITCASE[2] + 0.18, { side: false, mirror: false },
        { mode: "sit", expr: e, blink: lidAt(t, 90), tilt: t > W(194) ? 3 * Math.sin(t * 7) : 0 }, {}));
      blob(out, SUITCASE[0], 0, SUITCASE[2], 1.6);
      if (t > W(198) - LEAD) for (const x of [-0.3, 0.3]) {
        const u = q((t * 1.3 + x) % 1, 30);
        out.fx.push({ key: `creak${u}`, cw: 300, ch: 300, draw: (p) => fxCreak(p, u), x: SUITCASE[0] + x * 1.7, y: 0.62, z: SUITCASE[2] + 0.3, w: 0.42, h: 0.42, rot: x * 2 });
      }
      break;
    }
    case 16: {
      // after one hoop goes, the others strain; then the next one snaps
      if (t > T_LOSE + 0.3 && t < T_SNAP2 + 0.2) for (const k of [2, 4, 5]) {
        const u = q((t * 1.3 + k * 0.37) % 1, 30), y = PLINTH + HOOPS[k] * VAT_H;
        out.fx.push({ key: `creak${u}`, cw: 300, ch: 300, draw: (p) => fxCreak(p, u), x: VAT[0] + VAT_R + 0.35, y: y + 0.2, z: VAT[2] + 0.6, w: 0.8, h: 0.8, rot: 0.9 });
      }
      burstFx(out, t, T_SNAP2, [VAT[0] + 0.9, PLINTH + HOOPS[4] * VAT_H, VAT[2] + VAT_R + 0.2], 2.2, 0.45);
      if (t > T_SNAP2 + 0.05) {
        const u = q(((t - T_SNAP2) * 1.2) % 1, 24);
        out.fx.push({ key: `bsplash${u}`, cw: 800, ch: 800, draw: (p) => beerSplash(p, u), x: VAT[0] + 0.6, y: PLINTH + HOOPS[4] * VAT_H - 0.4, z: VAT[2] + VAT_R + 0.3, w: 2.2, h: 2.2, rot: -0.6 });
      }
      break;
    }
    case 17: {
      const up = t > W(232) - LEAD;
      stand(cam, out, 100, JUDGE, "judge", 0, 1.45, CZ - 4.7, { expr: up ? "smile_closed" : "stern", headTilt: up ? -0.12 : 0, look: 0 }, 1, false);
      stand(cam, out, 101, CLERK, "clerk", 2.4, 0, CZ - 3.0, { expr: "neutral", look: -1 });
      stand(cam, out, 102, MOURN(1), "m1", -2.5, 0, CZ - 2.6, { expr: "neutral", look: 1 });
      if (up) {
        const a = smooth((t - W(232)) / 0.5);
        out.fx.push({ key: "beam", cw: 300, ch: 800, draw: beam, x: 0, y: 4.2, z: CZ - 4.5, w: 2.6 * a, h: 5.5, soft: true });
      }
      break;
    }
    case 18: {
      const e: Expr = exprBy(t, [[240, "grin"], [244, "laugh"]], "smile");
      stand(cam, out, 10, BREWER, "brewer", 0.7, 0, 6.0, { expr: e, look: -1 });
      stand(cam, out, 110, MP, "mp", -0.45, 0, 6.25, { expr: "neutral", look: 1 });
      const k = smooth((t - W(240)) / 0.6);
      out.fx.push({ key: "coinBag", cw: 300, ch: 300, draw: coinBag, x: -0.15 + 0.6 * k, y: 1.0 + 0.25 * Math.sin(k * Math.PI), z: 6.55, w: 0.5, h: 0.5 });
      burstFx(out, t, W(244), [0.45, 1.3, 6.6], 0.9, 0.4, "#f2c94c");
      break;
    }
  }
  return out;
};
void [INK, mix, bodySide, smooth, between, T_CRACK, DOOR, VAT_H] as unknown;
export type { SideOpts };

// Our cast as lit flat sprites in the 3D world (same machinery as the bridge short): each frame every character asks
// for a drawing (key + draw call), the pool keeps one canvas per distinct drawing; yaw-only billboards shaded by
// cardShade(); soft multiply contact blobs; effects are unlit cards. Everything lives on the NOINK layer.
import * as THREE from "three";
import {
  Pen, bodyFront, bodySide, fxBurst, fxShadow, fxContact, fxBulb, fxDrop, fxDust, fxDing, fxClod, fxStars, fxPuff, fxPisaFlag,
  Outfit, Expr, FrontOpts, SideOpts, SKINS, INK, KID,
} from "./toon";
import { FPS, D0, SHOTS, V3, smooth, clamp01, FOREMAN, BANANA_KID, MAT, MAT_YAW, mattressAt, TOPPLE_HIT, CUT } from "./story";
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
const vOf = (i: number) => (i * 7 + (i >> 2)) % 4;
/** head-shape seed: 7 shapes, so marching soldiers in step still share canvases */
const seedOf = (i: number) => ((i * 5 + 3) % 7) + 1;
/** drawing resolution by distance: [canvas w, h, scale from the 600 x 1000 design]; sized for the 1440 x 2560 final */
/** canvas scale for the output size (1 = sized for the 1440 x 2560 final; 0.5 for the 720 x 1280 preview) */
export const CAST_CFG = { k: 1 };
const tier0 = (d: number): [number, number, number] =>
  d < 3.2 ? [1800, 3000, 3.0] : d < 6.5 ? [1080, 1800, 1.8] : d < 16 ? [480, 800, 0.8] : [240, 400, 0.4];
const tier = (d: number): [number, number, number] => {
  const [w, h, k] = tier0(d), c = Math.max(CAST_CFG.k, 240 / w);
  return [Math.round(w * c), Math.round(h * c), k * c];
};

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

// ---------------- outfits ----------------
export type Stage = { places: Place[]; fx: FxPlace[] };
const BUILDER = (v: number): Outfit => {
  const tun = ["#b8823f", "#8c5a3c", "#6f7f4a", "#a4553a", "#7a6a9a", "#c59a52"][v % 6];
  return { jacket: tun, pants: ["#5a4a3a", "#4a4f5a", "#6a5040"][v % 3], boots: "#5a3b2a", hat: v % 2 ? "cap" : "hair", cap: ["#7a5236", "#c8323a", "#3f6fb5"][v % 3],
    hair: ["#5a3b2a", "#2a201a", "#8a5a34"][v % 3], skin: SKINS[v % 4], moustache: v % 3 === 1 ? "#4a3426" : undefined };
};
const BOSS: Outfit = { jacket: "#2f5f9a", pants: "#4a3f36", boots: "#4a3426", hat: "cap", cap: "#c8323a", moustache: "#4a3020", build: "stout", skin: SKINS[1], belt: "#7a5236" };
const GRANDBOSS: Outfit = { ...BOSS, moustache: undefined, build: "adult", hat: "hair", hair: "#8a5a34", skin: SKINS[0] };
const FOLK = (v: number): Outfit => {
  const coat = ["#3f6fb5", "#8c3b4a", "#5d7a3a", "#b5653f", "#2f5f6a", "#7b5ac9"][v % 6];
  const o: Outfit = { jacket: coat, pants: "#4a3f36", boots: "#4a3426", skin: SKINS[v % 4] };
  return v % 2 ? { ...o, hat: "bonnet", dress: ["#d9a441", "#c25a7a", "#5a8fc2"][v % 3] } : { ...o, hat: "hair", hair: ["#2a201a", "#5a3b2a", "#9a6a3a"][v % 3] };
};
const SOLDIER = (v: number): Outfit => ({ jacket: "#c8323a", pants: "#e8e2d4", boots: INK, hat: "helmet", spear: true, belt: "#f1efe6", skin: SKINS[v % 4], moustache: v % 3 === 0 ? "#3a2a20" : undefined });
const TOURIST = (v: number): Outfit => {
  const tee = ["#f2c230", "#e2453c", "#3fb5a8", "#7b5ac9", "#f08a2c", "#4f8fd9"][v % 6];
  return { jacket: tee, pants: ["#3b5b9a", "#2f3442", "#c9b48a"][v % 3], boots: "#f4f1ea", hat: v % 3 === 0 ? "cap" : "hair", cap: ["#2f3442", "#e2453c"][v % 2],
    hair: ["#2a201a", "#c9a050", "#5a3b2a", "#8a3a20"][v % 4], skin: SKINS[(v + 1) % 4] };
};
const ENGINEER = (v: number): Outfit => ({ jacket: "#3b4a6b", pants: "#2f3442", boots: "#4a3426", hat: "hardhat", vest: "#ff8a1e", skin: SKINS[(v + 2) % 4], moustache: v === 0 ? "#3a2a20" : undefined });

// ---------------- helpers ----------------
const W = (i: number, o: Outfit, key: string): Who => ({ i, o, okey: key });
const front = (cam: CamInfo, t: number, who: Who, x: number, z: number, fo: FrontOpts, out: Stage, scale = 1, y = D0) => {
  out.places.push(person(cam, who, x, y, z, { side: false, mirror: false }, { blink: lidAt(t, who.i), ...fo }, {}, scale));
  if (y < D0 + 0.05) blob(out, x, D0, z, scale);
};
const walker = (cam: CamInfo, t: number, who: Who, x: number, z: number, dx: number, dz: number, phase: number, expr: Expr, out: Stage, lift = 40) => {
  const view = viewOf(cam, x, z, dx, dz);
  const fo: FrontOpts = { mode: "march", phase, expr, blink: lidAt(t, who.i), lift };
  const so: SideOpts = { mode: "march", phase, expr, blink: lidAt(t, who.i), stomp: 0.7, stride: view.fs };
  out.places.push(person(cam, who, x, D0, z, view, fo, so));
  blob(out, x, D0, z);
};
const fxAt = (out: Stage, key: string, cw: number, ch: number, draw: (p: Pen) => void, x: number, y: number, z: number, w: number, h: number, rot = 0, soft = false) =>
  out.fx.push({ key, cw, ch, draw, x, y, z, w, h, rot, soft });
const pop = (f: number, f0: number, n = 6) => (f < f0 ? 0 : f < f0 + n ? Math.sin(((f - f0) / n) * Math.PI * 0.5) : 1);
const L = 2; // reactions land 2 frames before the word

// ---------------- the building site (1173 / 1272) ----------------
const SITE: [number, number][] = [[-7.5, 10.5], [-3.5, 12.2], [7.2, 10.8], [9.5, 8.2], [-10.2, 7.0], [0.4, 14.6]];
const builders = (cam: CamInfo, t: number, f: number, out: Stage, expr: (i: number) => Expr, look = 0, grand = false) =>
  SITE.forEach(([x, z], i) => {
    const o = grand ? { ...BUILDER(i + 3), moustache: undefined } : BUILDER(i);
    front(cam, t, W(10 + i + (grand ? 20 : 0), o, (grand ? "g" : "b") + i), x, z, { mode: "stand", expr: expr(i), look, facing: x > 0 ? -1 : 1 }, out);
  });
const foreman = (cam: CamInfo, t: number, f: number, out: Stage, fo: FrontOpts, grand = false) =>
  front(cam, t, W(grand ? 61 : 60, grand ? GRANDBOSS : BOSS, grand ? "gboss" : "boss"), FOREMAN[0], FOREMAN[2], { mode: "stand", ...fo }, out);
const folk = (cam: CamInfo, t: number, f: number, out: Stage) => {
  const on = f >= 190 - L && f < 245;
  for (let i = 0; i < 16; i++) {
    const x = -9 + (i % 8) * 3.2 + hh(i) * 1.2, z = 22 + (i >> 3) * 4 + hh(i, 2) * 2;
    const kid = i % 5 === 3, hop = kid && on ? Math.max(0, Math.sin(t * 7 + i)) * 0.18 : 0;
    const fo: FrontOpts = { mode: "stand", expr: on ? (["grin", "laugh", "smile"] as Expr[])[i % 3] : "smile_closed", wave: on && i % 3 !== 2 ? q(Math.sin(t * 9 + i * 1.3), 30) : undefined };
    front(cam, t, W(100 + i, kid ? KID : FOLK(i), kid ? "kid" : "f" + (i % 6)), x, z, fo, out, kid ? 0.72 : 1, D0 + hop);
  }
};

// ---------------- the war (shot 7) ----------------
const army = (cam: CamInfo, t: number, f: number, out: Stage) => {
  const t0 = 728 / FPS, sp = 1.7;
  for (let i = 0; i < 14; i++) {
    const row = i >> 1, x = 9 - sp * (t - t0) + row * 1.4 + (hh(i) - 0.5) * 0.1, z = 17.2 + (i & 1) * 1.3;
    const phase = q(((t - t0) * 1.06 + 10) % 1, 60);
    walker(cam, t, W(200 + i, SOLDIER(i), "sol" + (i % 4)), x, z, -1, 0, phase, i % 4 === 1 ? "grin" : "stern", out, 60);
    if (i % 6 === 0) { // Pisan flag carried on a pole over the column
      fxAt(out, "pisaFlag", 400, 280, fxPisaFlag, x + 0.4, 3.4 + 0.05 * Math.sin(t * 6 + i), z, 1.1, 0.77, 0.05 * Math.sin(t * 5 + i));
    }
  }
  // builders drop their tools and follow, out of step ("walk off the job")
  SITE.forEach(([x0, z0], i) => {
    const go = 801 + i * 3 - L;
    if (f < go) { front(cam, t, W(10 + i, BUILDER(i), "b" + i), x0, z0, { mode: "stand", expr: f > 770 ? "shock" : "neutral", look: -1 }, out); return; }
    const tt = (f - go) / FPS, x = x0 - 1.3 * tt * smooth(tt / 0.4);
    walker(cam, t, W(10 + i, BUILDER(i), "b" + i), x, z0, -1, 0, q((tt * 0.9 + hh(i)) % 1, 60), "neutral", out, 30);
  });
};

// ---------------- grandkids (shots 9-11, 14) ----------------
const grandkids = (cam: CamInfo, t: number, f: number, out: Stage, id: number) => {
  SITE.forEach(([x1, z1], i) => {
    const arrive = 877 + i * 4, walkT = 26;
    const o = { ...BUILDER(i + 3), moustache: undefined };
    let expr: Expr = id === 10 ? (i % 2 ? "relief_open" : "relief") : id === 14 ? "shock" : f > 968 ? "grin" : "smile";
    if (id === 9 && f < arrive + walkT) {
      const u = clamp01((f - arrive) / walkT), x = x1 - 9 * (1 - u);
      walker(cam, t, W(30 + i, o, "g" + i), x, z1, 1, 0, q(((f - arrive) / FPS * 1.0) % 1, 60), "smile", out, 30);
      return;
    }
    if (id === 11 && f > 1165 - L) expr = "smile_closed";
    front(cam, t, W(30 + i, o, "g" + i), x1, z1, { mode: "stand", expr, look: id === 9 && f > 960 ? 0 : 0, wave: id === 10 && f > 1036 && i % 2 === 0 ? q(Math.sin(t * 8 + i), 30) : undefined, facing: x1 > 0 ? -1 : 1 }, out);
  });
  // the grandson foreman (at FOREMAN): the genius plan bulb
  const fo: FrontOpts = { expr: id === 9 ? (f > 935 - L ? "grin" : "neutral") : id === 14 ? "shock" : "grin", look: 0 };
  if (id !== 11) foreman(cam, t, f, out, fo, true);
  if (id === 9 && f >= 935 - L && f < 962) {
    const k = pop(f, 935 - L, 5);
    fxAt(out, "bulb", 300, 400, fxBulb, FOREMAN[0] + 0.25, 2.75 + 0.05 * Math.sin(t * 6), FOREMAN[2], 0.55 * k, 0.73 * k);
  }
};

// ---------------- 1990 engineers ----------------
const DIG: V3[] = [[-9.4, 0, 3.0], [-9.9, 0, 5.4], [-8.6, 0, 7.4]];
const engineers = (cam: CamInfo, t: number, f: number, out: Stage, id: number) => {
  DIG.forEach(([x, , z], i) => {
    const cyc = ((t * 0.9 + i * 0.37) % 1), k = id === 16 && f > 1883 - L ? 1 : q(smooth(cyc < 0.5 ? cyc * 2 : 2 - cyc * 2), 20);
    const expr: Expr = id === 16 && f > 1883 - L ? "nervous" : "whistle";
    front(cam, t, W(300 + i, ENGINEER(i + 1), "eng" + i), x, z, { mode: "stand", expr, prop: ["shovel", k], facing: -1 }, out);
    if (id === 15 && cyc > 0.45 && cyc < 0.95) { // a clod arcs over to the spoil heap
      const u = (cyc - 0.45) / 0.5, hx = x - 1.2 - (12.2 - 1.2 + x) * 0 , tx = -12.2, tz = 7.5;
      fxAt(out, "clod", 200, 160, fxClod, x + (tx - x) * u - 0.3, 1.6 + 2.2 * Math.sin(Math.PI * u), z + (tz - z) * u, 0.32, 0.26, u * 4);
      void hx;
    }
  });
  // a fourth one tiptoes past with a bucket, whistling innocently
  if (id === 15) {
    const u = ((t - 1712 / FPS) * 0.6) % 1, x = -13.5 + 5 * u, z = 10.5;
    walker(cam, t, W(310, ENGINEER(0), "eng3"), x, z, 1, 0, q((t * 1.4) % 1, 60), "whistle", out, 70);
  }
  // the boss engineer: "and then stopped. On purpose."
  const stop = id === 16 && f > 1883 - L;
  front(cam, t, W(320, { ...ENGINEER(0), build: "stout" }, "engBoss"), -12.5, 12, {
    mode: "stand", expr: stop ? (f > 1905 - L ? "smile_closed" : "stern") : "neutral", wave: stop ? 1 : undefined, facing: 1,
  }, out);
};

// ---------------- tourists (hook + ending) ----------------
const tourists = (cam: CamInfo, t: number, f: number, out: Stage, end: boolean) => {
  // the poser "holding up" the tower: side view, facing left, arms out
  const pose = end ? 1 : smooth((f - 20) / 12);
  out.places.push(person(cam, W(400, TOURIST(0), "t0"), 1.4, D0, 74.2, { side: true, mirror: true }, {}, { mode: "push", pose: q(pose, 20), expr: "grin", blink: lidAt(t, 400) }));
  blob(out, 1.4, D0, 74.2);
  front(cam, t, W(401, TOURIST(1), "t1"), -3.6, 72.2, { mode: "stand", expr: end && f > 2006 - L ? "smile_closed" : "laugh", wave: q(0.9 + 0.1 * Math.sin(t * 3), 20) }, out);
  front(cam, t, W(402, KID, "kidT"), -1.2, 76.2, { mode: "stand", expr: "lick", prop: "icecream", facing: -1 }, out, 0.72);
  for (let i = 0; i < 9; i++) {
    const x = -16 + i * 4 + hh(i, 4) * 1.2, z = 62 + hh(i, 5) * 4;
    front(cam, t, W(410 + i, TOURIST(i + 2), "t" + ((i + 2) % 6)), x, z, { mode: "stand", expr: (["smile", "grin", "smile_closed"] as Expr[])[i % 3], wave: i % 4 === 1 ? 0.8 : undefined }, out);
  }
};

/** everything with a face (and every effect card) in shot `id` at frame f */
export const stage = (id: number, f: number, cam: CamInfo): Stage => {
  const out: Stage = { places: [], fx: [] };
  const s = SHOTS[id - 1], t = f / FPS;
  LNAME = s.light;
  findSun(cam, SUN);
  switch (id) {
    case 1: tourists(cam, t, f, out, false); break;
    case 17: tourists(cam, t, f, out, true); break;
    case 2: folk(cam, t, f, out); builders(cam, t, f, out, (i) => (f > 205 ? "grin" : "smile")); foreman(cam, t, f, out, { expr: "smile_closed", prop: ["hammer", 1] }); break;
    case 3: {
      const happy = (f > 342 - L && f < 356) || f > 397 - L;
      builders(cam, t, f, out, (i) => (happy ? "grin" : i % 2 ? "smile" : "neutral"));
      foreman(cam, t, f, out, { expr: happy ? "grin" : "smile_closed", prop: ["hammer", 1] });
      for (const fd of [342, 397]) if (f >= fd - L && f < fd + 10) fxAt(out, `ding${q((f - fd + L) / 12, 30)}`, 300, 300, (p) => fxDing(p, q((f - fd + L) / 12, 30)), FOREMAN[0] + 0.55, 2.55, FOREMAN[2], 0.7, 0.7);
      for (const fl of [318, 377]) if (f >= fl && f < fl + 14) { const u = q((f - fl) / 14, 30); fxAt(out, `dust${u}`, 600, 400, (p) => fxDust(p, u), 0, 0.6 + (fl === 377 ? 11 : 0), 9.5, 9, 6, 0, true); }
      break;
    }
    case 4: {
      const down = f > 496 - L, tilt = 16 * smooth((f - (535 - L)) / 10);
      builders(cam, t, f, out, () => "neutral");
      foreman(cam, t, f, out, { expr: f > 548 - L ? "nervous" : down ? "neutral" : "smile_closed", prop: down ? null : ["hammer", 1], headTilt: tilt, look: f > 548 - L ? -1 : 0 });
      break;
    }
    case 5: builders(cam, t, f, out, () => (f > 608 - L ? "shock" : "neutral"), 0); foreman(cam, t, f, out, { expr: f > 608 - L ? "shock" : "nervous", headTilt: 16 }); break;
    case 6: case 13: {
      // water beads in the wet clay: shot 6 they glisten, shot 13 they squeeze up and out
      for (let i = 0; i < 14; i++) {
        const x = CUT[0] - 9 + i * 1.5 + hh(i) * 0.8, y0 = -4.6 - hh(i, 2) * 6;
        if (id === 6) {
          const k = pop(f, 698 + i * 2 - L, 6) * (0.85 + 0.15 * Math.sin(t * 5 + i));
          fxAt(out, "drop", 200, 260, fxDrop, x, y0, 0.25, 0.32 * k, 0.42 * k);
        } else {
          const u = clamp01((f - 1480 - i * 3) / 40), y = y0 + (0.2 - y0) * smooth(u);
          if (u > 0 && u < 1) fxAt(out, "drop", 200, 260, fxDrop, x, y, 0.25, 0.32, 0.42);
          if (u >= 1 && f < 1480 + i * 3 + 52) { const v = q((f - (1480 + i * 3 + 40)) / 12, 30); fxAt(out, `puff${v}`, 300, 300, (p) => fxPuff(p, v), x, 0.4, 0.3, 0.9, 0.9, 0, true); }
        }
      }
      break;
    }
    case 7: army(cam, t, f, out); break;
    case 9: case 10: case 11: case 14: grandkids(cam, t, f, out, id);
      if (id === 11) front(cam, t, W(70, { ...BUILDER(5), moustache: undefined }, "bananaKid"), BANANA_KID[0], BANANA_KID[2], { mode: "stand", expr: f > 1165 - L ? "smile_closed" : "neutral", prop: "banana", facing: -1 }, out);
      if (id === 14 && f >= TOPPLE_HIT - 2) {
        const u = q(clamp01((f - TOPPLE_HIT + 2) / 24), 30);
        for (const [x, s2] of [[18, 10], [32, 13], [46, 15], [58, 12]] as const) fxAt(out, `dust${u}`, 600, 400, (p) => fxDust(p, u), x, s2 * 0.3, 0, s2 * 1.6, s2, 0, true);
        if (f < TOPPLE_HIT + 6) { const v = q((f - TOPPLE_HIT + 2) / 8, 30); fxAt(out, `burst${v}`, 500, 500, (p) => fxBurst(p, v), 40, 4, 2, 14, 14); }
      }
      break;
    case 12: {
      const m = mattressAt(f), c = Math.cos(MAT_YAW), sn = Math.sin(MAT_YAW);
      const o = TOURIST(4), who = W(500, o, "sitter");
      if (m.sat < 0.5) front(cam, t, who, MAT[0] + c * 1.35, MAT[2] - sn * 1.35 + 0.3, { mode: "stand", expr: "smile", facing: -1 }, out);
      else {
        const lx = m.cx, wx = MAT[0] + c * lx + sn * 0.15, wz = MAT[2] - sn * lx + c * 0.15;
        const expr: Expr = f > 1397 - L ? "shock" : f > 1346 - L ? "nervous" : "smile";
        out.places.push({ ...person(cam, who, wx, 0.3 - m.depth - 0.1, wz, { side: false, mirror: false }, { mode: "sit", expr, blink: lidAt(t, 500) }, {}), roll: -m.tilt });
      }
      break;
    }
    case 15: case 16: engineers(cam, t, f, out, id); break;
  }
  return out;
};
export { FPS, fxStars };

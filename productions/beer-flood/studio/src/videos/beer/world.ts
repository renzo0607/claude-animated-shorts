// The London Beer Flood as one three.js scene with four sets far apart: St Giles street + the brewery wall,
// the brewery hall with the vats, the wake room and the courtroom. update(id, f, camera) poses everything for shot
// `id` at frame f as a pure function of (id, f): vat staves and hoops, the bursting wall, the beer wave, the
// collapsing house, the floods, candles, the suitcase, and the cast from cast.ts.
import * as THREE from "three";
import { getInputProps } from "remotion";
import { Batch, boxGeo, V, lam, Kit, Ray, house, quad, tri, setSight, roofMat } from "./build";
import { rep, ctex, planksHD, beamHD, stoneHD, cobbleHD, brick, facadeHD, cloudHD } from "./paint";
import { Pen } from "./toon";
import { LIGHTS, LOOK, LightPreset } from "./lights";
import { TONE, CHAR, twoTone, untone } from "./shade";
import { NOINK } from "./ink";
import { Pool, Actor, Fx, stage } from "./cast";
import {
  FPS, SHOTS, ShotDef, V3, camAt, smooth, clamp01, hh, IX, VAT, VATS, VAT_R, VAT_H, PLINTH, HOOPS, DESK, LADDER, RUBBLE, STREET_W, HOLE,
  FLAT_HOUSE, CELLAR, SUITCASE, WX, DOOR, CZ, T_POP, T_CRASH, T_EX, T_CRACK, T_WALL, T_FLAT, T_POUR, T_LOSE, T_SNAP2, W,
  waveZ, waveH, VatMode,
} from "./story";

export const loadKit = () => Promise.resolve({} as Kit);

// ---------------- materials ----------------
const PORTER = "#4a2715", FOAM = "#f2e2bd";
const M = {
  cobble: () => lam("cobbleHD", () => ({ map: cobbleHD() })),
  brickW: () => lam("brickWall", () => ({ map: brick() })),
  planks: () => lam("planksHD", () => ({ map: planksHD() })),
  stave: () => lam("stave", () => ({ color: "#a0683a" })),
  staveD: () => lam("staveD", () => ({ color: "#86542e" })),
  iron: () => twoTone(new THREE.MeshPhongMaterial({ color: "#3a3d47", specular: "#7a7a7a", shininess: 50 }), 0.15),
  wood: () => lam("woodBeam", () => ({ map: beamHD() })),
  stone: () => lam("stoneHD", () => ({ map: stoneHD("stoneHD") })),
  dark: () => lam("darkGlass", () => ({ color: "#2b3142" })),
  trim: () => lam("trimCream", () => ({ color: "#efe3c8" })),
};
const ironMat = M.iron();
const porterMat = twoTone(new THREE.MeshLambertMaterial({ color: "#3a1d0e", side: THREE.DoubleSide }), 0.6);
/** a pool of porter seen from above: dark centre, amber band, ragged foam rim (CircleGeometry uv = unit square) */
const poolTex = () => ctex("poolTex", 512, 512, (g, r) => {
  const gr = g.createRadialGradient(256, 256, 0, 256, 256, 256);
  gr.addColorStop(0, "#3a1d0e"); gr.addColorStop(0.75, "#4a2512"); gr.addColorStop(0.86, "#7a3f1a"); gr.addColorStop(0.9, "#efdcb2"); gr.addColorStop(1, "#f6e8c8");
  g.fillStyle = gr; g.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 90; i++) { const a = r() * 6.283, d = 200 + r() * 40, rr = 6 + r() * 14; g.fillStyle = i % 3 ? "#f2e2bd" : "#e2cd9f"; g.beginPath(); g.ellipse(256 + d * Math.cos(a), 256 + d * Math.sin(a), rr * 1.4, rr, a, 0, 7); g.fill(); }
  for (let i = 0; i < 30; i++) { const a = r() * 6.283, d = r() * 180, rr = 4 + r() * 10; g.fillStyle = "rgba(240,220,170,0.6)"; g.beginPath(); g.ellipse(256 + d * Math.cos(a), 256 + d * Math.sin(a), rr * 1.5, rr, a, 0, 7); g.fill(); }
});
const poolMat = twoTone(new THREE.MeshLambertMaterial({ map: poolTex(), side: THREE.DoubleSide }), 0.6);
const foamMat = twoTone(new THREE.MeshLambertMaterial({ color: FOAM, side: THREE.DoubleSide }));

// ---------------- small builders ----------------
const box = (b: Batch, mat: THREE.Material, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, tile = 0) =>
  b.add(boxGeo(V(Math.min(x0, x1), Math.min(y0, y1), Math.min(z0, z1)), V(Math.max(x0, x1), Math.max(y0, y1), Math.max(z0, z1)), tile), mat);
/** wall quad facing +n (axis-aligned): along x at z (facing +z if dir>0) or along z at x */
const wallZ = (b: Batch, mat: THREE.Material, x0: number, x1: number, y0: number, y1: number, z: number, dir: number, tile = 2) => {
  const u = Math.abs(x1 - x0) / tile, v = (y1 - y0) / tile;
  b.add(dir > 0 ? quad(V(x0, y0, z), V(x1, y0, z), V(x1, y1, z), V(x0, y1, z), u, v) : quad(V(x1, y0, z), V(x0, y0, z), V(x0, y1, z), V(x1, y1, z), u, v), mat);
};
const wallX = (b: Batch, mat: THREE.Material, z0: number, z1: number, y0: number, y1: number, x: number, dir: number, tile = 2) => {
  const u = Math.abs(z1 - z0) / tile, v = (y1 - y0) / tile;
  b.add(dir > 0 ? quad(V(x, y0, z1), V(x, y0, z0), V(x, y1, z0), V(x, y1, z1), u, v) : quad(V(x, y0, z0), V(x, y0, z1), V(x, y1, z1), V(x, y1, z0), u, v), mat);
};
const floor = (b: Batch, mat: THREE.Material, x0: number, x1: number, z0: number, z1: number, y = 0, tile = 4) =>
  b.add(quad(V(x0, y, z1), V(x1, y, z1), V(x1, y, z0), V(x0, y, z0), (x1 - x0) / tile, (z1 - z0) / tile), mat);
const ceil = (b: Batch, mat: THREE.Material, x0: number, x1: number, z0: number, z1: number, y: number, tile = 4) =>
  b.add(quad(V(x0, y, z0), V(x1, y, z0), V(x1, y, z1), V(x0, y, z1), (x1 - x0) / tile, (z1 - z0) / tile), mat);
const barrel = (b: Batch, x: number, y: number, z: number, s = 1, lying = false) => {
  const m = new THREE.Matrix4().compose(V(x, y + (lying ? 0.34 * s : 0.45 * s), z), new THREE.Quaternion().setFromEuler(new THREE.Euler(lying ? Math.PI / 2 : 0, x * 3.1, 0)), V(s, s, s));
  const g = new THREE.CylinderGeometry(0.33, 0.33, 0.9, 16, 3, false);
  const pos = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) { const yy = pos.getY(i), k = 1 + 0.12 * (1 - (yy / 0.45) ** 2); pos.setX(i, pos.getX(i) * k); pos.setZ(i, pos.getZ(i) * k); }
  g.computeVertexNormals();
  b.add(g, M.stave(), m);
  for (const yy of [-0.3, 0.3]) b.add(new THREE.TorusGeometry(0.37, 0.025, 5, 20).rotateX(Math.PI / 2).translate(0, yy, 0), ironMat, m);
};

// signs / emblems (unlit painted cards)
const horseshoeTex = () => ctex("horseshoe", 512, 384, (g) => {
  const p = new Pen(g);
  g.fillStyle = "#1f4a3a"; g.fillRect(0, 0, 512, 384);
  g.strokeStyle = "#d9b45a"; g.lineWidth = 14; g.strokeRect(16, 16, 480, 352);
  g.lineCap = "round"; g.strokeStyle = "#241726"; g.lineWidth = 86;
  g.beginPath(); g.arc(256, 170, 100, Math.PI * 0.85, Math.PI * 2.15, false); g.stroke();
  g.strokeStyle = "#e6c066"; g.lineWidth = 62;
  g.beginPath(); g.arc(256, 170, 100, Math.PI * 0.85, Math.PI * 2.15, false); g.stroke();
  for (let i = 0; i < 6; i++) { const a = Math.PI * (0.95 + (i / 5) * 1.1); p.dot(256 + 100 * Math.cos(a), 170 + 100 * Math.sin(a), 9, "#241726"); }
});
const emblemTex = () => ctex("courtEmblem", 512, 512, (g) => {
  g.fillStyle = "rgba(0,0,0,0)"; g.clearRect(0, 0, 512, 512);
  const p = new Pen(g);
  p.ell(256, 256, 220, 220, "#7a1f2a", 14);
  p.ell(256, 256, 170, 170, "#e3c15f", 12);
  p.poly([[176, 300], [196, 196], [236, 250], [256, 176], [276, 250], [316, 196], [336, 300]], "#7a1f2a", 12); // crown
  p.poly([[170, 300], [342, 300], [342, 336], [170, 336]], "#7a1f2a", 12);
});
const pictureTex = () => ctex("wakePicture", 256, 320, (g) => {
  g.fillStyle = "#6b4a2e"; g.fillRect(0, 0, 256, 320);
  g.fillStyle = "#d8c7a3"; g.fillRect(26, 26, 204, 268);
  const p = new Pen(g);
  p.ell(128, 140, 50, 56, "#c9b28a", 0); p.ell(128, 250, 76, 50, "#b39a72", 0);
});
const wallpaperTex = () => ctex("wallpaper", 256, 256, (g, r) => {
  g.fillStyle = "#7d8a68"; g.fillRect(0, 0, 256, 256);
  g.fillStyle = "rgba(240,230,200,0.12)";
  for (let x = 0; x < 256; x += 32) g.fillRect(x, 0, 10, 256);
  for (let i = 0; i < 40; i++) { g.fillStyle = `rgba(60,50,40,${0.04 + r() * 0.05})`; g.fillRect(r() * 256, r() * 256, 18, 18); }
});
const panelTex = () => ctex("woodPanel", 512, 512, (g, r) => {
  g.fillStyle = "#7a4b2a"; g.fillRect(0, 0, 512, 512);
  for (let x = 0; x < 512; x += 128) for (let y = 0; y < 512; y += 256) {
    g.fillStyle = "#6a3f22"; g.fillRect(x + 10, y + 10, 108, 236);
    g.fillStyle = "#8a5a35"; g.fillRect(x + 22, y + 22, 84, 212);
    g.fillStyle = `rgba(40,20,10,${0.05 + 0.05 * r()})`; g.fillRect(x + 22, y + 22, 84, 212);
  }
});

/** the wave's paint: a foamy crest band at the front (v = 0), amber streaks, then deep porter behind */
const waveTex = () => ctex("waveTex", 512, 1024, (g, r) => {
  const gr = g.createLinearGradient(0, 0, 0, 1024);
  gr.addColorStop(0, "#f6e8c8"); gr.addColorStop(0.1, "#efdcb2"); gr.addColorStop(0.14, "#a85e26"); gr.addColorStop(0.3, "#7a3f1a");
  gr.addColorStop(0.6, "#5a2e15"); gr.addColorStop(1, "#4a2512");
  g.fillStyle = gr; g.fillRect(0, 0, 512, 1024);
  // ragged foam edge + foam islands + amber streaks
  for (let i = 0; i < 70; i++) { const x = r() * 512, y = 100 + r() * 70, rr = 14 + r() * 30; g.fillStyle = i % 3 ? "#f2e2bd" : "#e2cd9f"; g.beginPath(); g.ellipse(x, y, rr * 1.4, rr, 0, 0, 7); g.fill(); g.beginPath(); g.ellipse(x - 512, y, rr * 1.4, rr, 0, 0, 7); g.fill(); g.beginPath(); g.ellipse(x + 512, y, rr * 1.4, rr, 0, 0, 7); g.fill(); }
  for (let i = 0; i < 60; i++) { const x = r() * 512, y = 200 + r() * 800, l = 40 + r() * 140; g.strokeStyle = r() < 0.5 ? "rgba(255,226,170,0.35)" : "rgba(170,95,40,0.5)"; g.lineWidth = 4 + r() * 8; g.lineCap = "round"; g.beginPath(); g.moveTo(x, y); g.lineTo(x + (r() - 0.5) * 40, y + l); g.stroke(); }
  for (let i = 0; i < 40; i++) { const x = r() * 512, y = 220 + r() * 600, rr = 6 + r() * 16; g.fillStyle = "rgba(246,232,200,0.8)"; g.beginPath(); g.ellipse(x, y, rr * 1.5, rr, 0, 0, 7); g.fill(); }
});

/** every lens position looking at its subject (street shots only: the houses there are culled from them) */
const sightLines = (): Ray[] => {
  const out: Ray[] = [];
  for (const s of SHOTS) {
    if (s.set !== "street") continue;
    for (let f = s.a - 8; f < s.b + 8; f += 2) {
      const c = camAt(s.id, Math.max(0, f)), o = V(...c.pos), look = V(...c.look);
      const fw = look.clone().sub(o), len = fw.length();
      fw.normalize();
      const rt = fw.clone().cross(V(0, 1, 0)).normalize(), up = rt.clone().cross(fw);
      const ty = Math.tan((c.fov * Math.PI) / 360), tx = ty * (9 / 16);
      for (const [sx, sy] of [[0, 0], [-0.6, 0], [0.6, 0], [0, 0.6], [0, -0.4]])
        out.push({ o, d: fw.clone().addScaledVector(rt, sx * tx).addScaledVector(up, sy * ty), len, core: sx === 0 && sy === 0 });
    }
  }
  return out;
};

// ---------------- the vats ----------------
const NST = 30;
type VatState = { burst: number; pop: { k: number; u: number }[]; snap: { k: number; u: number } | null; after: boolean };
class VatRig {
  staves: THREE.InstancedMesh; puddle: THREE.Mesh; hoops: THREE.Mesh[] = []; foam: THREE.Mesh; liquid: THREE.Mesh; liqTop: THREE.Mesh;
  private m4 = new THREE.Matrix4(); private q = new THREE.Quaternion(); private e = new THREE.Euler(0, 0, 0, "YXZ");
  constructor(root: THREE.Object3D, public c: V3, public r: number, public h: number, public i: number) {
    const w = ((2 * Math.PI * r) / NST) * 0.985;
    const g = new THREE.BoxGeometry(w, h, 0.16);
    this.staves = new THREE.InstancedMesh(g, M.stave(), NST);
    this.staves.castShadow = true; this.staves.receiveShadow = true; this.staves.frustumCulled = false;
    const cols = ["#a0683a", "#93603a", "#a8703f", "#8f5d34"].map((x) => new THREE.Color(x));
    for (let k = 0; k < NST; k++) this.staves.setColorAt(k, cols[(k * 7 + i) % 4]);
    root.add(this.staves);
    for (let k = 0; k < HOOPS.length; k++) {
      const m = new THREE.Mesh(new THREE.TorusGeometry(r + 0.07, 0.075, 6, 56).rotateX(Math.PI / 2), ironMat);
      m.castShadow = true; m.receiveShadow = true; root.add(m); this.hoops.push(m);
    }
    this.foam = new THREE.Mesh(new THREE.CircleGeometry(r - 0.1, 40).rotateX(-Math.PI / 2), foamMat);
    this.foam.receiveShadow = true; root.add(this.foam);
    this.puddle = new THREE.Mesh(new THREE.CircleGeometry(r + 0.3, 40).rotateX(-Math.PI / 2), poolMat);
    this.puddle.position.set(c[0], PLINTH + 0.015, c[2]); this.puddle.receiveShadow = true; this.puddle.visible = false; root.add(this.puddle);
    this.liquid = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 40, 1, true).translate(0, 0.5, 0), porterMat);
    this.liqTop = new THREE.Mesh(new THREE.CircleGeometry(1, 40).rotateX(-Math.PI / 2), poolMat);
    for (const m of [this.liquid, this.liqTop]) { m.receiveShadow = true; m.visible = false; root.add(m); }
  }
  pose(st: VatState) {
    const { c, r, h } = this, base = PLINTH, two = Math.PI * 2;
    const s = st.after ? 9 : st.burst;
    for (let k = 0; k < NST; k++) {
      const th = (k / NST) * two + this.i, cs = Math.cos(th), sn = Math.sin(th);
      let rr = r, y = base + h / 2, tip = 0, spin = 0;
      if (s >= 0) {
        const v = 3 + 3.5 * hh(k, this.i + 1), u = clamp01(s / 0.75);
        rr = r + (v * (1 - Math.exp(-s * 1.7))) / 1.7;
        tip = (Math.PI / 2) * smooth(u) * (0.96 + 0.04 * hh(k, 3));
        const hop = Math.max(0, (1.5 + 2.5 * hh(k, 4)) * s - 4.9 * s * s);
        y = (base * (1 - smooth(u))) + (h / 2) * Math.cos(tip) + 0.08 * Math.sin(tip) + hop;
        spin = (hh(k, 5) - 0.5) * 1.2 * smooth(u);
      }
      this.e.set(tip, Math.PI / 2 - th + spin, 0);
      this.m4.compose(V(c[0] + rr * cs, y, c[2] + rr * sn), this.q.setFromEuler(this.e), V(1, 1, 1));
      this.staves.setMatrixAt(k, this.m4);
    }
    this.staves.instanceMatrix.needsUpdate = true;
    HOOPS.forEach((fr, k) => {
      const m = this.hoops[k], y0 = base + fr * h;
      m.visible = true; m.rotation.set(0, 0, 0); m.scale.set(1, 1, 1);
      m.position.set(c[0], y0, c[2]);
      const pop = st.pop.find((p) => p.k === k);
      if (s >= 0) {
        const fall = Math.min(s, Math.sqrt((2 * Math.max(0, y0 - 0.08)) / 9.8));
        const sc = 1 + 0.35 * smooth(s / 0.35) + (k % 2) * 0.1;
        m.scale.set(sc, 1, sc);
        m.position.set(c[0] + (hh(k, this.i) - 0.5) * 1.2 * smooth(s), Math.max(0.08, y0 - 4.9 * fall * fall), c[2] + (hh(k, 7) - 0.5) * 1.2 * smooth(s));
        m.rotation.set((hh(k, 8) - 0.5) * 0.3 * (1 - smooth(s - 0.4)), 0, (hh(k, 9) - 0.5) * 0.3 * (1 - smooth(s - 0.4)));
      } else if (pop && pop.u > 0) {
        const u = clamp01(pop.u), sc = 1.12;
        m.scale.set(sc, 1, sc);
        m.position.y = y0 + (0.08 - y0) * u * u;
        m.position.x = c[0] + 0.25 * Math.sin(u * Math.PI);
        m.rotation.z = 0.28 * Math.sin(u * Math.PI);
      }
      if (st.snap && st.snap.k === k && st.snap.u > 0) {
        const u = st.snap.u;
        m.scale.set(1.25, 1, 1.25);
        m.position.y = Math.max(0.08, y0 - 4.9 * Math.min(u, 0.9) ** 2);
        m.rotation.z = 0.5 * smooth(u * 2);
      }
    });
    // foam top + the column of porter that slumps out when the vat goes
    const u = s < 0 ? 0 : clamp01(s / 1.0);
    this.foam.visible = s < 0;
    this.puddle.visible = s >= 0;
    this.foam.position.set(c[0], base + h - 0.22, c[2]);
    const showLiq = s >= 0 && !st.after && u < 1;
    this.liquid.visible = this.liqTop.visible = showLiq;
    if (showLiq) {
      const R = r * (1 + 2.6 * u), H = (h - 0.25) * (1 - u) ** 1.6 + 0.05;
      this.liquid.position.set(c[0], 0, c[2]); this.liquid.scale.set(R, H, R);
      this.liqTop.position.set(c[0], H + 0.01, c[2]); this.liqTop.scale.set(R, 1, R);
    }
  }
}

type Brick = { x: number; y: number; vx: number; vy: number; vz: number; w: number; tl: number };

export class World {
  root = new THREE.Group();
  private pool = new Pool();
  private actors: Actor[] = [];
  private fxs: Fx[] = [];
  private hemi: THREE.HemisphereLight; private sun: THREE.DirectionalLight;
  private sky: THREE.Mesh; private skyMat: THREE.ShaderMaterial;
  private fog = new THREE.Fog("#bccbec", 25, 420);
  private sunDisc: THREE.Sprite;
  private sunCache = new Map<number, THREE.Vector3>();
  private cloudMaps: Record<"day" | "golden", THREE.Texture[]>;
  private clouds: THREE.Mesh[] = [];
  private vats: VatRig[] = [];
  private bricks!: THREE.InstancedMesh; private brickData: Brick[] = [];
  private wave!: THREE.Mesh; private waveGeo!: THREE.BufferGeometry;
  private flatHouse = new THREE.Group();
  private hallFlood!: THREE.Mesh; private wakeFlood!: THREE.Mesh; private cellarPour!: THREE.Mesh;
  private wallIntact = new THREE.Group(); private wallHoled = new THREE.Group(); private afterGroup = new THREE.Group();
  private hoopOnFloor!: THREE.Mesh;
  private suitcase = new THREE.Group();
  private smoke: { m: THREE.Mesh; mat: THREE.MeshLambertMaterial; k: number }[] = [];
  private frustum = new THREE.Frustum();
  private m4 = new THREE.Matrix4(); private v = new THREE.Vector3(); private sph = new THREE.Sphere();

  constructor(_kit: Kit) {
    const R = this.root;
    // ---- sky + light (as the bridge short) ----
    this.skyMat = new THREE.ShaderMaterial({
      uniforms: { c0: { value: new THREE.Color() }, c1: { value: new THREE.Color() }, c2: { value: new THREE.Color() },
        c3: { value: new THREE.Color() }, c4: { value: new THREE.Color() }, e: { value: new THREE.Vector4() } },
      vertexShader: "varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
      fragmentShader: `uniform vec3 c0, c1, c2, c3, c4; uniform vec4 e; varying vec3 vP;
        void main(){ float el = asin(clamp(normalize(vP).y, -1.0, 1.0));
          vec3 c = mix(c0, c1, smoothstep(0.0, e.x, el));
          c = mix(c, c2, smoothstep(e.x, e.y, el));
          c = mix(c, c3, smoothstep(e.y, e.z, el));
          c = mix(c, c4, smoothstep(e.z, e.w, el));
          gl_FragColor = vec4(c, 1.0); }`,
      side: THREE.BackSide, depthWrite: false, fog: false,
    });
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(1100, 48, 24), this.skyMat);
    this.sky.renderOrder = -1; this.sky.frustumCulled = false; this.sky.layers.set(NOINK);
    R.add(this.sky);
    this.sunDisc = new THREE.Sprite(new THREE.SpriteMaterial({ map: ctex("sunDisc", 128, 128, (g) => {
      const gr = g.createRadialGradient(64, 64, 58, 64, 64, 64); gr.addColorStop(0, "rgba(255,255,255,1)"); gr.addColorStop(1, "rgba(255,255,255,0)");
      g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
    }), color: new THREE.Color(6.0, 4.4, 2.4), fog: false, depthWrite: false }));
    this.sunDisc.frustumCulled = false; this.sunDisc.layers.set(NOINK); R.add(this.sunDisc);
    this.hemi = new THREE.HemisphereLight("#cfe6ff", "#6c5c8c", 1.1);
    this.sun = new THREE.DirectionalLight("#fff0d6", 2.6);
    this.sun.castShadow = true;
    const sm = (getInputProps() as { post?: { shadow?: number } }).post?.shadow ?? 4096;
    this.sun.shadow.mapSize.set(sm, sm);
    R.add(this.hemi, this.sun, this.sun.target);
    this.cloudMaps = { day: [0, 1, 2, 3].map((k) => cloudHD(k, LOOK.day.cloud)), golden: [0, 1, 2, 3].map((k) => cloudHD(k, LOOK.golden.cloud)) };
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2 + 0.3, d = 620 + (i % 3) * 60;
      const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: this.cloudMaps.day[i % 4], color: new THREE.Color(1.1, 1.1, 1.1), transparent: true, depthWrite: false, fog: false }));
      const w = 130 + (i % 4) * 30;
      m.position.set(Math.cos(a) * d, 120 + (i % 4) * 38, Math.sin(a) * d); m.scale.set(w, w / 2, 1);
      m.layers.set(NOINK); this.clouds.push(m); R.add(m);
    }
    this.buildStreet();
    this.buildHall();
    this.buildWake();
    this.buildCourt();
  }

  // ============ St Giles street + the brewery ============
  private buildStreet() {
    const R = this.root, b = new Batch();
    floor(b, M.cobble(), -260, 260, -60, 320, 0, 4);
    // pavements: a raised kerb strip along each house row
    const pave = lam("pave", () => ({ map: stoneHD("paveHD", ["#c9c0b2", "#bfb5a6", "#d2c9bb", "#b7ac9c"], "#8e8476") }));
    for (const s of [-1, 1]) box(b, pave, s * STREET_W, 0, 0.5, s * (STREET_W - 1.25), 0.12, 128, 2);
    // brewery block: facade at z = 0 (facing +z) with the hole region filled by loose bricks
    const bw = M.brickW();
    wallZ(b, bw, -16, HOLE.x0, 0, 13, 0, 1);
    wallZ(b, bw, HOLE.x1, 16, 0, 13, 0, 1);
    wallZ(b, bw, HOLE.x0, HOLE.x1, HOLE.y1, 13, 0, 1);
    wallX(b, bw, -26, 0, 0, 13, -16, -1); wallX(b, bw, -26, 0, 0, 13, 16, 1);
    wallZ(b, bw, -16, 16, 0, 13, -26, -1);
    const stoneT = lam("copeHD", () => ({ map: stoneHD("copeHD", ["#e6dccd", "#ddd3c3", "#ece4d6", "#d6cbba"], "#aea293") }));
    box(b, stoneT, -16.3, 13, -26.3, 16.3, 13.7, 0.3, 2); // parapet cap
    ceil(b, lam("leadRoof", () => ({ color: "#6f7480" })), -16, 16, -26, 0, 13.65);
    box(b, stoneT, -16.2, 0, 0, 16.2, 0.6, 0.18, 2); // plinth course
    box(b, stoneT, -16.2, 5.9, 0, 16.2, 6.15, 0.2, 2); // string course
    // windows (two rows) and the cart gate
    const dark = M.dark(), trim = M.trim();
    for (const y of [7.0, 10.2]) for (let x = -13.5; x <= 13.6; x += 3) {
      box(b, dark, x - 0.55, y, 0.0, x + 0.55, y + 1.9, 0.06);
      box(b, trim, x - 0.7, y - 0.16, 0, x + 0.7, y, 0.2);
      box(b, trim, x - 0.65, y + 1.9, 0, x + 0.65, y + 2.08, 0.12);
    }
    const doorM = lam("gateWood", () => ({ map: beamHD() }));
    box(b, doorM, -12.4, 0, 0, -7.6, 4.6, 0.12);
    box(b, stoneT, -12.8, 4.6, 0, -7.2, 5.0, 0.25);
    // the big brewery chimney and smoke
    const chim = lam("chimney", () => ({ map: rep(brick(), 2, 8) }));
    b.add(new THREE.CylinderGeometry(0.9, 1.3, 24, 14, 1, true), chim, new THREE.Matrix4().makeTranslation(-9, 12, -18));
    b.add(new THREE.CylinderGeometry(1.1, 1.05, 1.2, 14), lam("soot", () => ({ color: "#4a3442" })), new THREE.Matrix4().makeTranslation(-9, 24.4, -18));
    for (let k = 0; k < 7; k++) {
      const mat = new THREE.MeshLambertMaterial({ map: ctex("smoke", 256, 256, (g) => {
        const p = new Pen(g);
        for (const [x, y, r, c] of [[90, 150, 60, "#8f8d96"], [150, 120, 70, "#a3a1aa"], [170, 165, 55, "#8f8d96"], [120, 100, 50, "#b4b2ba"]] as const) p.ell(x, y, r, r * 0.85, c, 0);
      }), transparent: true, depthWrite: false });
      const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat); m.layers.set(NOINK);
      this.smoke.push({ m, mat, k: k / 7 }); R.add(m);
    }
    // barrels stacked by the gate
    for (const [x, z, l] of [[-13.2, 1.0, 0], [-12.4, 1.6, 0], [-6.6, 1.1, 0], [-6.0, 1.9, 1], [12.5, 1.2, 0]] as const) barrel(b, x, 0, z, 1, !!l);
    // houses: the rookery, fronts on the street, a back row for the aerial
    setSight(sightLines());
    const rnd = (i: number, s: number) => hh(i, s);
    for (const sx of [-1, 1]) {
      let z = 1.2, i = 0;
      while (z < 126) {
        const w = [6, 7, 8][Math.floor(rnd(i, sx + 3) * 3)], h = [8.4, 9.8, 11.2][Math.floor(rnd(i, sx + 5) * 3)];
        const cz = z + w / 2;
        if (!(sx < 0 && Math.abs(cz - FLAT_HOUSE[2]) < 4.5)) house(b, sx * (STREET_W + 4), cz, sx < 0 ? Math.PI / 2 : -Math.PI / 2, w, 8, h, Math.floor(rnd(i, sx + 7) * 8));
        z += sx < 0 && z < FLAT_HOUSE[2] - 4 && z + w + 0.2 > FLAT_HOUSE[2] - 3.6 ? FLAT_HOUSE[2] + 3.6 - z : w + 0.2;
        i++;
      }
      for (let zz = 4, k = 0; zz < 130; k++) {
        const w = 7 + rnd(k, sx + 9) * 3, h = 9 + rnd(k, sx + 11) * 4;
        house(b, sx * 21, zz + w / 2, sx < 0 ? Math.PI / 2 : -Math.PI / 2, w, 9, h, Math.floor(rnd(k, sx + 13) * 8));
        zz += w + 0.5;
      }
    }
    for (let x = -18; x < 18; x += 8.5) house(b, x + 4, 132, Math.PI, 8, 8, 10, Math.floor(hh(x, 2) * 8));
    // laundry lines across the street
    const rope = lam("rope", () => ({ color: "#d8cdb5" }));
    const cloth = ["#f3efe6", "#a9c3e0", "#d98a7a", "#e8d9a8", "#f3efe6"].map((c) => lam("cloth" + c, () => ({ color: c, side: THREE.DoubleSide })));
    for (const [z, y] of [[33.5, 7.2], [58, 6.4], [83, 7.0], [101, 6.6]] as const) {
      box(b, rope, -STREET_W, y - 0.015, z - 0.015, STREET_W, y + 0.015, z + 0.015);
      for (let k = 0; k < 5; k++) {
        const x = -3.3 + k * 1.55 + hh(z, k) * 0.3, cw = 0.55 + hh(k, z) * 0.35, ch = 0.6 + hh(k + 3, z) * 0.5;
        b.add(quad(V(x - cw / 2, y - ch, z), V(x + cw / 2, y - ch, z), V(x + cw / 2, y, z), V(x - cw / 2, y, z)), cloth[(k + Math.round(z)) % 5]);
      }
    }
    // cellar opening + railings (the beer pours into it)
    floor(b, lam("cellarDark", () => ({ color: "#1c1820" })), CELLAR[0] - 0.55, CELLAR[0] + 0.5, CELLAR[2] - 0.9, CELLAR[2] + 0.9, 0.125, 1);
    for (let k = 0; k <= 6; k++) box(b, ironMat, CELLAR[0] - 0.62, 0.12, CELLAR[2] - 0.95 + k * 0.32, CELLAR[0] - 0.56, 1.05, CELLAR[2] - 0.89 + k * 0.32);
    box(b, ironMat, CELLAR[0] - 0.64, 1.0, CELLAR[2] - 0.95, CELLAR[0] - 0.54, 1.08, CELLAR[2] + 0.95);
    b.build(R);
    setSight([]);
    // the house that is knocked flat: its own group, pivot at its street-side base
    const fb = new Batch();
    house(fb, -4, 0, Math.PI / 2, 7, 8, 9.8, 3, 0);
    fb.build(this.flatHouse);
    this.flatHouse.position.set(FLAT_HOUSE[0] + 4, 0, FLAT_HOUSE[2]);
    R.add(this.flatHouse);
    // loose bricks in the hole
    const bg = new THREE.BoxGeometry(0.6, 0.3, 0.4);
    const cols = HOLE.x1 - HOLE.x0, nc = Math.round(cols / 0.6), nr = Math.round(HOLE.y1 / 0.3);
    for (let r0 = 0; r0 < nr; r0++) for (let c0 = 0; c0 < nc + 1; c0++) {
      const x = HOLE.x0 + (c0 + (r0 % 2 ? 0 : 0.5)) * 0.6 - 0.3, y = 0.15 + r0 * 0.3;
      if (x < HOLE.x0 - 0.05 || x > HOLE.x1 + 0.05) continue;
      const i = this.brickData.length, vy = 1 + 4 * hh(i, 2) * (y / HOLE.y1);
      const vz = 5 + 8 * hh(i, 1) * (1 - 0.5 * y / HOLE.y1);
      const tl = (vy + Math.sqrt(vy * vy + 2 * 9.8 * Math.max(0, y - 0.15))) / 9.8;
      this.brickData.push({ x, y, vx: x * 0.55 + (hh(i, 3) - 0.5) * 3, vy, vz, w: (hh(i, 4) - 0.5) * 14, tl });
    }
    this.bricks = new THREE.InstancedMesh(bg, lam("looseBrickI", () => ({ color: "#ffffff" })), this.brickData.length);
    const bc = ["#a8503a", "#9c4a36", "#b25840", "#94452f"].map((c) => new THREE.Color(c));
    this.brickData.forEach((_, i) => this.bricks.setColorAt(i, bc[i % 4]));
    this.bricks.castShadow = true; this.bricks.receiveShadow = true; this.bricks.frustumCulled = false;
    R.add(this.bricks);
    // sign board over the hole (unlit painted face)
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 3.15), new THREE.MeshBasicMaterial({ map: horseshoeTex(), color: 0xe8e8e8 }));
    sign.position.set(0, 8.6, 0.16); sign.layers.set(NOINK); R.add(sign);
    const sb = new THREE.Mesh(new THREE.BoxGeometry(4.4, 3.35, 0.14), M.wood()); sb.position.set(0, 8.6, 0.07); sb.castShadow = true; R.add(sb);
    // the wave: a heightfield rebuilt every frame
    this.waveGeo = new THREE.BufferGeometry();
    const NXW = 28, NZW = 110;
    this.waveGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(NXW * NZW * 3), 3));
    this.waveGeo.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(NXW * NZW * 2), 2));
    const idx: number[] = [];
    for (let j = 0; j < NZW - 1; j++) for (let i = 0; i < NXW - 1; i++) {
      const a = j * NXW + i, c = a + 1, d = a + NXW, e = d + 1;
      idx.push(a, d, c, c, d, e);
    }
    this.waveGeo.setIndex(idx);
    const wt = waveTex(); wt.wrapT = THREE.ClampToEdgeWrapping;
    const wm = twoTone(new THREE.MeshLambertMaterial({ map: wt, side: THREE.DoubleSide }), 0.6);
    this.wave = new THREE.Mesh(this.waveGeo, wm);
    this.wave.receiveShadow = true; this.wave.castShadow = false; this.wave.frustumCulled = false;
    R.add(this.wave);
    // the pour down the cellar steps: a sloping sheet
    this.cellarPour = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), porterMat);
    this.cellarPour.visible = false; R.add(this.cellarPour);
    // the suitcase (shot 15)
    const leather = lam("leather", () => ({ color: "#8a4b2a" })), strap = lam("strap", () => ({ color: "#3a2418" })), brass = lam("brass", () => ({ color: "#d9b45a" }));
    const sc = new Batch();
    box(sc, leather, -0.55, 0, -0.27, 0.55, 0.5, 0.27);
    for (const x of [-0.3, 0.3]) { box(sc, strap, x - 0.05, -0.005, -0.285, x + 0.05, 0.515, 0.285); box(sc, brass, x - 0.07, 0.36, 0.28, x + 0.07, 0.46, 0.3); }
    box(sc, strap, -0.12, 0.5, -0.04, 0.12, 0.56, 0.04);
    sc.build(this.suitcase);
    // shirt sleeves and socks poking out of the lid seam
    const sleeve = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.05, 0.16), lam("cloth#f3efe6", () => ({ color: "#f3efe6", side: THREE.DoubleSide })));
    sleeve.position.set(-0.44, 0.32, 0.3); sleeve.rotation.z = -0.3; this.suitcase.add(sleeve);
    const sock = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.05, 0.12), lam("cloth#d98a7a", () => ({ color: "#d98a7a", side: THREE.DoubleSide })));
    sock.position.set(0.47, 0.33, 0.29); sock.rotation.z = 0.4; this.suitcase.add(sock);
    this.suitcase.traverse((o) => { o.castShadow = true; o.receiveShadow = true; });
    this.suitcase.position.set(...SUITCASE);
    R.add(this.suitcase);
  }

  // ============ brewery hall ============
  private buildHall() {
    const R = this.root, b = new Batch(), shell = new Batch();
    const x0 = IX - 18, x1 = IX + 18, z0 = -14, z1 = 15, H = 11;
    floor(b, M.planks(), x0, x1, z0, z1, 0, 3);
    const bw = M.brickW();
    wallX(shell, bw, z0, z1, 0, H, x0, 1); wallX(shell, bw, z0, z1, 0, H, x1, -1);
    wallZ(shell, bw, x0, x1, 0, H, z1, -1);
    ceil(shell, M.wood(), x0, x1, z0, z1, H, 3);
    // roof trusses
    for (let x = x0 + 3; x < x1; x += 6) box(shell, M.wood(), x - 0.18, H - 0.6, z0, x + 0.18, H, z1, 2);
    // high windows (bright panes) on the side walls
    const pane = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 1.5, 1.25) });
    for (let z = z0 + 3; z < z1 - 2; z += 5) for (const [x, d] of [[x0 + 0.02, 1], [x1 - 0.02, -1]] as const) {
      const g = new THREE.PlaneGeometry(1.4, 2.6); g.rotateY(d * Math.PI / 2);
      const m = new THREE.Mesh(g, pane); m.position.set(x, 7.4, z); m.layers.set(NOINK); R.add(m);
      box(b, M.trim(), x - 0.06 * d, 6.0, z - 0.85, x + 0.14 * d, 6.12, z + 0.85);
    }
    // back wall: intact, or with the hole the beer made (+ rubble)
    const ib = new Batch(), hb = new Batch();
    wallZ(ib, bw, x0, x1, 0, H, z0, 1);
    wallZ(hb, bw, x0, IX - 2.6, 0, H, z0, 1); wallZ(hb, bw, IX + 2.6, x1, 0, H, z0, 1); wallZ(hb, bw, IX - 2.6, IX + 2.6, 4.6, H, z0, 1);
    box(hb, M.brickW(), IX - 2.6, 0, z0 - 0.5, IX - 2.4, 4.6, z0); box(hb, M.brickW(), IX + 2.4, 0, z0 - 0.5, IX + 2.6, 4.6, z0);
    box(hb, M.brickW(), IX - 2.6, 4.4, z0 - 0.5, IX + 2.6, 4.6, z0);
    for (let k = 0; k < 26; k++) {
      const x = IX + (hh(k, 1) - 0.5) * 7, z = z0 + 0.3 + hh(k, 2) * 2.4, s = 0.25 + 0.2 * hh(k, 3);
      hb.add(new THREE.BoxGeometry(0.58 * s * 2, 0.28 * s * 2, 0.4 * s * 2).rotateY(hh(k, 4) * 3).rotateX((hh(k, 5) - 0.5) * 0.8).translate(x, 0.12 + 0.1 * hh(k, 6), z), lam("looseBrick", () => ({ color: "#b4593b" })));
    }
    ib.build(this.wallIntact, false); hb.build(this.wallHoled, false);
    R.add(this.wallIntact, this.wallHoled);
    // the outside seen through the hole: the street wall of houses opposite (simple painted facade)
    const outside = lam("outsideFac", () => ({ map: facadeHD("outsideFac", 24, 10, { wall: "#d8a95f", shutter: "#2f6a43", door: true }) }));
    wallZ(b, outside, IX - 12, IX + 12, 0, 10, z0 - 9, 1, 24);
    floor(b, M.cobble(), IX - 14, IX + 14, z0 - 10, z0, -0.01, 4);
    // plinths, ladder, desk, barrels, pipes
    for (const v of VATS) b.add(new THREE.CylinderGeometry(v.r + 0.25, v.r + 0.35, PLINTH, 40).translate(v.c[0], PLINTH / 2, v.c[2]), M.stone());
    const wd = M.wood();
    for (const s of [-0.28, 0.28]) b.add(new THREE.BoxGeometry(0.08, 7.6, 0.08).rotateX(0.18).translate(LADDER[0] + s, 3.6, LADDER[2] + 0.66), wd);
    for (let k = 0; k < 16; k++) { const y = 0.35 + k * 0.45; b.add(new THREE.BoxGeometry(0.62, 0.05, 0.06).translate(LADDER[0], y, LADDER[2] + 1.33 - 0.18 * y), wd); }
    // clerk's standing desk: legs, sloped top, paper, ink pot
    const [dx, , dz] = DESK;
    for (const [a, c] of [[-0.62, -0.25], [0.62, -0.25], [-0.62, 0.3], [0.62, 0.3]]) box(b, wd, dx + a - 0.04, 0, dz + c + 0.45, dx + a + 0.04, 1.0, dz + c + 0.53);
    b.add(new THREE.BoxGeometry(1.45, 0.06, 0.75).rotateX(0.22).translate(dx, 1.08, dz + 0.55), wd);
    box(b, wd, dx - 0.72, 0.62, dz + 0.2, dx + 0.72, 0.98, dz + 0.9);
    const paper = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.55).rotateX(-Math.PI / 2 + 0.22).translate(dx - 0.05, 1.125, dz + 0.55), lam("paper", () => ({ color: "#f6f0e0" })));
    paper.receiveShadow = true; R.add(paper);
    b.add(new THREE.CylinderGeometry(0.05, 0.06, 0.08, 12).translate(dx + 0.45, 1.16, dz + 0.42), lam("inkpot", () => ({ color: "#1e2230" })));
    for (const [x, z, l] of [[IX + 13, 9, 0], [IX + 13.8, 9.8, 0], [IX + 12.2, 10.4, 1], [IX - 14, 10, 0], [IX - 13.2, 10.8, 0], [IX + 14.5, -11, 0], [IX - 15, -10.5, 1]] as const) barrel(b, x, 0, z, 1, !!l);
    for (const v of VATS) {
      box(b, ironMat, v.c[0] - 0.07, 0, v.c[2] - v.r - 0.9, v.c[0] + 0.07, H - 0.6, v.c[2] - v.r - 0.76);
    }
    b.build(R);
    shell.build(R, false);
    // vats
    VATS.forEach((v, i) => this.vats.push(new VatRig(R, v.c, v.r, v.h, i)));
    // the hoop that popped (lying on the floor after shot 4) is VatRig's; in "after" mode everything settles
    this.hoopOnFloor = new THREE.Mesh(new THREE.TorusGeometry(VAT_R * 1.12, 0.075, 6, 56).rotateX(Math.PI / 2), ironMat);
    this.hoopOnFloor.visible = false; R.add(this.hoopOnFloor);
    // aftermath: rubble heap of staves where the workers are pulled out, foam puddles
    const ab = new Batch();
    for (let k = 0; k < 22; k++) {
      const g = new THREE.BoxGeometry(0.62, 0.12 + 0.05 * hh(k, 1), 2.2 + hh(k, 2) * 2.4);
      g.rotateX((hh(k, 3) - 0.5) * 0.9).rotateZ((hh(k, 4) - 0.5) * 1.2).rotateY(hh(k, 5) * 3.1);
      g.translate(RUBBLE[0] + (hh(k, 6) - 0.5) * 2.6, 0.15 + 0.7 * hh(k, 7) * (1 - Math.abs(hh(k, 6) - 0.5)), RUBBLE[2] - 0.6 + (hh(k, 8) - 0.5) * 2.0);
      ab.add(g, k % 2 ? M.stave() : M.staveD());
    }
    ab.build(this.afterGroup);
    R.add(this.afterGroup);
    // the hall flood: a disc of porter spreading from the vat
    this.hallFlood = new THREE.Mesh(new THREE.CircleGeometry(1, 64).rotateX(-Math.PI / 2), poolMat);
    this.hallFlood.receiveShadow = true; this.hallFlood.visible = false; R.add(this.hallFlood);
  }

  // ============ the wake room ============
  private buildWake() {
    const R = this.root, b = new Batch(), sh = new Batch();
    const x0 = WX - 3.5, x1 = WX + 3.5, z0 = -3, z1 = 3, H = 3.3;
    floor(b, M.planks(), x0, x1, z0, z1 + 4, 0, 2.5);
    const wp = lam("wallpaper", () => ({ map: wallpaperTex() }));
    wallZ(sh, wp, x0, x1, 0, H, z0, 1, 1.6);
    wallX(sh, wp, z0, z1, 0, H, x0, 1, 1.6);
    // right wall with the door opening (door at z -1.1 .. -0.1)
    wallX(sh, wp, z0, DOOR[2] - 0.5, 0, H, x1, -1, 1.6);
    wallX(sh, wp, DOOR[2] + 0.5, z1, 0, H, x1, -1, 1.6);
    wallX(sh, wp, DOOR[2] - 0.5, DOOR[2] + 0.5, 2.2, H, x1, -1, 1.6);
    ceil(sh, lam("plaster", () => ({ color: "#e8dcc4" })), x0, x1, z0, z1, H, 2);
    const wd = M.wood();
    box(b, wd, x0, 0, z0, x1, 0.35, z0 + 0.04); // skirting
    box(b, wd, x1 - 0.12, 0, DOOR[2] - 0.6, x1 + 0.05, 2.3, DOOR[2] - 0.5); box(b, wd, x1 - 0.12, 0, DOOR[2] + 0.5, x1 + 0.05, 2.3, DOOR[2] + 0.6);
    box(b, wd, x1 - 0.12, 2.2, DOOR[2] - 0.6, x1 + 0.05, 2.32, DOOR[2] + 0.6);
    // the open door leaf and a lit passage behind
    b.add(new THREE.BoxGeometry(0.06, 2.15, 1.0).translate(0, 1.08, 0.5).rotateY(-1.1).translate(x1 + 0.02, 0, DOOR[2] + 0.5), wd);
    const glow = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 2.4).rotateY(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.3, 1.05, 0.75) }));
    glow.position.set(x1 + 1.6, 1.2, DOOR[2]); glow.layers.set(NOINK); R.add(glow);
    // table with a white cloth, two candles, a small picture on the wall, chairs
    box(b, lam("cloth#f3efe6", () => ({ color: "#f3efe6", side: THREE.DoubleSide })), WX - 1.0, 0.72, -1.9, WX + 1.0, 0.8, -1.0);
    box(b, lam("cloth#f3efe6", () => ({ color: "#f3efe6", side: THREE.DoubleSide })), WX - 1.02, 0.35, -1.92, WX + 1.02, 0.8, -1.88);
    for (const [a, c] of [[-0.9, -1.85], [0.9, -1.85], [-0.9, -1.05], [0.9, -1.05]]) box(b, wd, WX + a - 0.04, 0, c - 0.04, WX + a + 0.04, 0.72, c + 0.04);
    const pic = new THREE.Mesh(new THREE.PlaneGeometry(0.55, 0.7), lam("wakePic", () => ({ map: pictureTex() })));
    pic.position.set(WX, 1.85, z0 + 0.02); R.add(pic);
    const wax = lam("wax", () => ({ color: "#f4ecd6" })), flame = new THREE.MeshBasicMaterial({ color: new THREE.Color(3.2, 2.2, 0.9) });
    for (const x of [-0.5, 0.5]) {
      b.add(new THREE.CylinderGeometry(0.04, 0.045, 0.32, 10).translate(WX + x, 0.96, -1.45), wax);
      b.add(new THREE.CylinderGeometry(0.07, 0.09, 0.03, 12).translate(WX + x, 0.815, -1.45), lam("brass", () => ({ color: "#d9b45a" })));
      const fl = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.09, 10).translate(WX + x, 1.17, -1.45), flame); fl.layers.set(NOINK); R.add(fl);
    }
    for (const [x, z] of [[-2.4, -1.4], [2.2, -2.2]]) {
      box(b, wd, WX + x - 0.25, 0.45, z - 0.25, WX + x + 0.25, 0.5, z + 0.25);
      box(b, wd, WX + x - 0.25, 0.5, z - 0.27, WX + x + 0.25, 1.05, z - 0.22);
      for (const [a, c] of [[-0.2, -0.2], [0.2, -0.2], [-0.2, 0.2], [0.2, 0.2]]) box(b, wd, WX + x + a - 0.03, 0, z + c - 0.03, WX + x + a + 0.03, 0.45, z + c + 0.03);
    }
    b.build(R); sh.build(R, false);
    this.wakeFlood = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2).translate(-0.5, 0, 0), porterMat);
    this.wakeFlood.receiveShadow = true; this.wakeFlood.visible = false; R.add(this.wakeFlood);
  }

  // ============ the courtroom ============
  private buildCourt() {
    const R = this.root, b = new Batch(), sh = new Batch();
    const x0 = -7, x1 = 7, z0 = CZ - 6, z1 = CZ + 7, H = 6.5;
    floor(b, M.planks(), x0, x1, z0, z1, 0, 3);
    const pan = lam("woodPanel", () => ({ map: panelTex() })), up = lam("courtPlaster", () => ({ color: "#e6d6b6" }));
    wallZ(sh, pan, x0, x1, 0, 2.6, z0, 1, 2); wallZ(sh, up, x0, x1, 2.6, H, z0, 1, 2);
    wallX(sh, pan, z0, z1, 0, 2.6, x0, 1, 2); wallX(sh, up, z0, z1, 2.6, H, x0, 1, 2);
    wallX(sh, pan, z0, z1, 0, 2.6, x1, -1, 2); wallX(sh, up, z0, z1, 2.6, H, x1, -1, 2);
    ceil(sh, lam("plaster", () => ({ color: "#e8dcc4" })), x0, x1, z0, z1, H, 2);
    const wd = M.wood();
    // judge's bench: platform + front panel
    box(b, wd, -3.2, 0, CZ - 5.9, 3.2, 1.0, CZ - 3.6, 2);
    box(b, pan, -3.0, 1.0, CZ - 3.75, 3.0, 2.15, CZ - 3.55, 2);
    box(b, wd, -3.1, 2.15, CZ - 3.9, 3.1, 2.25, CZ - 3.45, 2);
    // high-backed chair behind the judge
    box(b, lam("redLeather", () => ({ color: "#7a1f2a" })), -0.55, 1.0, CZ - 5.6, 0.55, 3.6, CZ - 5.35);
    const em = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.5), new THREE.MeshBasicMaterial({ map: emblemTex(), transparent: true, alphaTest: 0.5, color: 0xdddddd }));
    em.position.set(0, 4.6, z0 + 0.03); em.layers.set(NOINK); R.add(em);
    // benches for the public
    for (const z of [CZ + 1.2, CZ + 3.0]) for (const s of [-1, 1]) {
      box(b, wd, s * 0.8, 0.45, z - 0.25, s * 5.5, 0.52, z + 0.25);
      box(b, wd, s * 0.8, 0.52, z + 0.2, s * 5.5, 1.0, z + 0.26);
    }
    // windows: tall bright panes high on the left wall
    const pane = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.5, 1.5, 1.4) });
    for (const z of [CZ - 3, CZ + 1, CZ + 5]) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 2.4).rotateY(Math.PI / 2), pane); m.position.set(x0 + 0.02, 4.0, z); m.layers.set(NOINK); R.add(m);
    }
    b.build(R); sh.build(R, false);
  }

  /** camera-relative sun, frozen per shot */
  private shotSun(id: number, s: ShotDef, L: LightPreset) {
    let v = this.sunCache.get(id);
    if (v) return v;
    let fx = 0, fz = 0;
    for (let f = s.a; f < s.b; f += 3) {
      const c = camAt(id, f), x = c.look[0] - c.pos[0], z = c.look[2] - c.pos[2], n = Math.hypot(x, z) || 1;
      fx += x / n; fz += z / n;
    }
    const n = Math.hypot(fx, fz) || 1; fx /= n; fz /= n;
    const az = THREE.MathUtils.degToRad(s.sunAz ?? L.az), el = THREE.MathUtils.degToRad(s.sunEl ?? L.el);
    const hx = fx * Math.cos(az) - fz * Math.sin(az), hz = fz * Math.cos(az) + fx * Math.sin(az);
    v = new THREE.Vector3(hx * Math.cos(el), Math.sin(el), hz * Math.cos(el)).normalize();
    this.sunCache.set(id, v);
    return v;
  }
  private actor(i: number) { while (this.actors.length <= i) this.actors.push(new Actor(this.root)); return this.actors[i]; }
  private fx(i: number) { while (this.fxs.length <= i) this.fxs.push(new Fx(this.root)); return this.fxs[i]; }

  update(id: number, f: number, cam: THREE.PerspectiveCamera, scene: THREE.Scene) {
    const t = f / FPS, s = SHOTS[id - 1], tau = s.tau(t), L = LIGHTS[s.light];
    // ---- camera ----
    const c = camAt(id, f);
    cam.position.set(...c.pos); cam.up.set(0, 1, 0); cam.lookAt(...c.look); cam.rotateZ(c.roll);
    cam.fov = c.fov; cam.near = 0.1; cam.far = 1500; cam.updateProjectionMatrix(); cam.updateMatrixWorld();
    const focus = V(...c.look), dist = cam.position.distanceTo(focus);
    cam.layers.enable(NOINK);
    // ---- light rig ----
    const K = LOOK[s.light], sunDir = this.shotSun(id, s, L);
    this.hemi.color.set(L.sky); this.hemi.groundColor.set(L.ground); this.hemi.intensity = L.hemiI;
    this.sun.color.set(L.sunCol); this.sun.intensity = L.sunI;
    let Rr = THREE.MathUtils.clamp(dist * 1.15 + 7, 12, 70);
    if (s.light === "golden") Rr = Math.max(Rr, 24);
    this.sun.position.copy(focus).addScaledVector(sunDir, 220); this.sun.target.position.copy(focus);
    const sc = this.sun.shadow.camera;
    sc.left = -Rr; sc.right = Rr; sc.top = Rr; sc.bottom = -Rr; sc.near = 20; sc.far = 480; sc.updateProjectionMatrix();
    this.sun.shadow.bias = L.bias; this.sun.shadow.normalBias = L.normalBias * (Rr / 12);
    TONE.uLitCol.value.set(...L.lit); TONE.uShadeCol.value.set(...L.shade); TONE.uShadeLift.value.set(...L.lift);
    TONE.uLambert.value = L.lambert; TONE.uSideK.value = L.sideK; TONE.uTerm.value = L.term; TONE.uBounce.value.set(...K.bounce); TONE.uSat.value = K.sat;
    CHAR.uCharTint.value.set(...L.charTint); CHAR.uCharShade.value = L.charShade; CHAR.uGrad.value = L.charGrad;
    CHAR.uBodyGrad.value = L.bodyGrad; CHAR.uSideTint.value.set(...L.sideTint);
    // ---- sky, fog, sun disc, clouds ----
    const su = this.skyMat.uniforms;
    K.sky.c.forEach((h, i) => untone(h, su["c" + i].value));
    const e = K.sky.e.map((deg) => THREE.MathUtils.degToRad(deg));
    su.e.value.set(e[1], e[2], e[3], e[4]);
    this.sky.position.copy(cam.position);
    untone(L.fog, this.fog.color);
    const indoor = s.set !== "street";
    this.fog.near = indoor ? 60 : L.fogNear; this.fog.far = indoor ? 400 : L.fogFar;
    scene.fog = this.fog; scene.background = null;
    this.sunDisc.visible = s.light === "golden" && !indoor;
    if (this.sunDisc.visible) {
      this.sunDisc.position.copy(cam.position).addScaledVector(sunDir, 900);
      this.sunDisc.scale.setScalar(2 * 900 * Math.tan(THREE.MathUtils.degToRad(1.7)));
    }
    for (let i = 0; i < this.clouds.length; i++) {
      const m = this.clouds[i];
      m.lookAt(cam.position.x, m.position.y, cam.position.z);
      (m.material as THREE.MeshBasicMaterial).map = this.cloudMaps[s.light][i % 4];
    }
    for (const sm of this.smoke) {
      const u = (t * 0.11 + sm.k) % 1, sz = 3 + u * 9;
      sm.m.position.set(-9 - u * 16, 25 + u * 12 + u * u * 4, -18 + u * 3);
      sm.m.scale.set(sz, sz, 1); sm.m.quaternion.copy(cam.quaternion);
      sm.mat.opacity = 0.85 * (1 - u) ** 1.2;
    }
    // ---- set poses ----
    this.poseStreet(id, tau, t);
    this.poseHall(s.vat ?? "intact", t, id);
    this.poseWake(id, t);
    this.suitcase.scale.set(1, id === 15 && t > W(194) ? 1 + 0.035 * Math.abs(Math.sin(t * 7)) : 1, 1);

    // ---- cast + effects ----
    const right = V(0, 0, 0).setFromMatrixColumn(cam.matrixWorld, 0);
    const st = stage(id, t, tau, { pos: cam.position, right, sun: sunDir });
    this.frustum.setFromProjectionMatrix(this.m4.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse));
    let ai = 0;
    const used: Actor[] = [];
    for (const p of st.places) {
      const sc2 = p.scale ?? 1;
      if (!this.frustum.intersectsSphere(this.sph.set(this.v.set(p.x, p.y + 1.1 * sc2, p.z), 3.5))) continue;
      const a = this.actor(ai++);
      const [w, h, k] = p.size ?? [300, 500, 0.5];
      a.r = this.pool.req(p.key, w, h, k, p.draw);
      a.mesh.visible = true;
      a.mesh.position.set(p.x, p.y, p.z);
      a.mesh.rotation.set(0, p.yaw ?? Math.atan2(cam.position.x - p.x, cam.position.z - p.z), p.roll ?? 0);
      a.mesh.scale.set(p.mirror ? -sc2 : sc2, sc2, sc2);
      a.mesh.castShadow = L.actorShadow;
      used.push(a);
    }
    for (let i = ai; i < this.actors.length; i++) this.actors[i].mesh.visible = false;
    let fi = 0;
    const fused: Fx[] = [];
    for (const p of st.fx) {
      if (!this.frustum.intersectsSphere(this.sph.set(this.v.set(p.x, p.y, p.z), Math.max(p.w, p.h)))) continue;
      const fx = this.fx(fi++);
      fx.r = this.pool.req(p.key, p.cw, p.ch, 1, p.draw);
      fx.use(!!p.soft);
      fx.mesh.visible = true;
      fx.mesh.position.set(p.x, p.y, p.z);
      if (p.flat) fx.mesh.rotation.set(-Math.PI / 2, 0, p.rot ?? 0);
      else { fx.mesh.quaternion.copy(cam.quaternion); fx.mesh.rotateZ(p.rot ?? 0); }
      fx.mesh.scale.set(p.w, p.h, 1);
      fused.push(fx);
    }
    for (let i = fi; i < this.fxs.length; i++) this.fxs[i].mesh.visible = false;
    this.pool.flush();
    for (const a of used) a.bind();
    for (const e2 of fused) e2.bind();
    return focus;
  }

  // ---- street: bricks, wave, the flattened house, the cellar pour ----
  private poseStreet(id: number, tau: number, t: number) {
    const sw = tau - T_WALL;
    const q = new THREE.Quaternion(), e = new THREE.Euler(), one = V(1, 1, 1);
    this.brickData.forEach((d, i) => {
      let x = d.x, y = d.y, z = -0.2, rx = 0, ry = 0;
      if (sw > 0) {
        const s = Math.min(sw, d.tl), slide = Math.max(0, sw - d.tl), fr = (1 - Math.exp(-slide * 3)) / 3;
        x += d.vx * (s + 0.35 * fr); z += d.vz * (s + 0.35 * fr); y = Math.max(0.15, d.y + d.vy * s - 4.9 * s * s);
        rx = d.w * s; ry = d.w * 0.6 * s;
      }
      this.bricks.setMatrixAt(i, this.m4.compose(this.v.set(x, y, z), q.setFromEuler(e.set(rx, ry, 0)), one));
    });
    this.bricks.instanceMatrix.needsUpdate = true;
    // house knocked flat: the facade leans in and the whole thing slumps (pivot at the street side base)
    const k = smooth((tau - T_FLAT) / 0.55);
    this.flatHouse.scale.set(1, 1 - 0.82 * k, 1);
    this.flatHouse.rotation.z = -0.22 * Math.sin(k * Math.PI) - 0.06 * k;
    // the wave
    const zf = waveZ(tau);
    this.wave.visible = zf > 0;
    if (zf > 0) this.poseWave(zf, waveH(tau), tau);
    // cellar: a sheet of porter sliding over the kerb into the opening once the front has passed
    const pour = tau - (T_WALL + (CELLAR[2] - 1) / 7);
    this.cellarPour.visible = pour > 0 && id === 10;
    if (this.cellarPour.visible) {
      this.cellarPour.position.set(CELLAR[0], 0.35, CELLAR[2]);
      this.cellarPour.rotation.set(-Math.PI / 2, 0.9, 0);
      this.cellarPour.scale.set(1.1, 1.7, 1);
    }
  }

  private poseWave(zf: number, Hp: number, tau: number) {
    const NXW = 28, NZW = 110, len = Math.min(zf + 6, 70);
    const pos = this.waveGeo.attributes.position as THREE.BufferAttribute, uv = this.waveGeo.attributes.uv as THREE.BufferAttribute;
    for (let j = 0; j < NZW; j++) {
      const u = j / (NZW - 1), d = len * u * u; // rows denser near the front; d = metres behind the front
      for (let i = 0; i < NXW; i++) {
        const xu = i / (NXW - 1), x = -STREET_W + 0.02 + (2 * STREET_W - 0.04) * xu, ex = Math.abs(2 * xu - 1);
        const Hx = Hp * (1 + 0.1 * Math.sin(x * 1.25 + tau * 2.2) + 0.13 * ex * ex);
        // front: a rounded rise over ~2.4 m; body: falls away behind the crest
        const front = Math.sin((Math.PI / 2) * clamp01(d / 2.4)) ** 0.8, body = 0.36 + 0.64 * Math.exp(-Math.max(0, d - 2.4) / 4);
        const rip = (0.1 * Math.sin(d * 1.3 - tau * 6 + x * 0.9) + 0.07 * Math.sin(d * 2.7 + tau * 4.3 - x * 1.7)) * clamp01(d / 2);
        const y = Math.max(0.03, Hx * front * body + rip);
        // curling lip: the upper front leans forward over its own foot
        const lip = 1.1 * smooth((y / Math.max(0.1, Hx) - 0.55) / 0.45) * Math.exp(-d / 1.6);
        const z = zf - d + lip + 0.15 * Math.sin(x * 1.4 + tau * 3) * Math.exp(-d / 3);
        pos.setXYZ(j * NXW + i, x, y, Math.max(z, -8));
        uv.setXY(j * NXW + i, x / 4 + 0.05 * Math.sin(d + tau), Math.min(0.999, d / 14));
      }
    }
    pos.needsUpdate = true; uv.needsUpdate = true;
    this.waveGeo.computeVertexNormals();
  }

  // ---- hall: the vats per mode, the flood, the wall ----
  private poseHall(mode: VatMode, t: number, id: number) {
    const after = mode === "after";
    this.vats.forEach((v, i) => {
      const st: VatState = { burst: -1, pop: [], snap: null, after };
      if (mode === "live") {
        const tb = [T_EX, T_CRACK, T_CRACK + 0.5, T_CRACK + 0.9][i];
        st.burst = t >= tb ? t - tb : -1;
        if (i === 0) st.pop.push({ k: 2, u: (t - T_POP) / (T_CRASH - T_POP) });
      } else if (mode === "lesson" && i === 0) {
        st.pop.push({ k: 3, u: (t - T_LOSE) / 0.55 });
        st.snap = { k: 4, u: t - T_SNAP2 };
      }
      if (i === 0 && mode === "live" && t >= T_CRASH && st.burst < 0) st.pop[0].u = 1;
      v.pose(st);
    });
    this.hoopOnFloor.visible = false;
    // flood disc
    const s = mode === "live" ? t - T_EX : -1;
    this.hallFlood.visible = after || s > 0;
    if (this.hallFlood.visible) {
      const r = after ? 26 : Math.min(26, VAT_R + 9 * s), y = after ? 0.035 : 0.06 + 0.25 * Math.exp(-s * 0.8);
      this.hallFlood.position.set(VAT[0], y, VAT[2]); this.hallFlood.scale.set(r, 1, r);
    }
    this.afterGroup.visible = after;
    this.wallHoled.visible = after;
    this.wallIntact.visible = !after;
    void id;
  }

  // ---- wake room: the porter comes in under/through the door ----
  private poseWake(id: number, t: number) {
    const s = id === 11 ? t - (T_POUR + 0.25) : -1;
    this.wakeFlood.visible = s > 0;
    if (s > 0) {
      const w = Math.min(7, 0.4 + 3.2 * s), y = Math.min(0.28, 0.03 + 0.09 * s);
      this.wakeFlood.position.set(DOOR[0], y, 0);
      this.wakeFlood.scale.set(w, 1, 6);
    }
  }
}

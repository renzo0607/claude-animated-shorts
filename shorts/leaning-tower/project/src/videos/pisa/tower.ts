// The bell tower of Pisa as a stack of floors (ground floor, six open galleries, the bell chamber). Each floor is
// its own group, chained on top of the one below through a pivot at the floor's top centre, so the stack can:
//   - grow floor by floor (scale.y of the growing floor, the ones above hidden),
//   - lean (rotation of the base pivot toward +x, about the ground contact point on the low side),
//   - bend like a banana: the later floors are built TALLER ON THE SHORT SIDE (their geometry is sheared so the top
//     plane tips back toward vertical), so every floor above sits a little straighter than the one below.
// Materials are two-tone (shade.ts) like the rest of the world; arches are alpha-cut bands, so the world ink pass
// draws their outlines from the depth jumps.
import * as THREE from "three";
import { Batch, lam, V } from "./build";
import { ctex } from "./paint";

export const R_T = 7.6;                        // outer radius of the galleries (m)
export const H_G = 11;                         // ground floor height
export const H_L = 6.9;                        // gallery height
export const H_B = 5.6;                        // bell chamber height
export const NFLOORS = 8;                      // ground + 6 galleries + bell chamber
export const floorH = (i: number) => (i === 0 ? H_G : i === NFLOORS - 1 ? H_B : H_L);
/** correction of floor i relative to the one below (rad): floors 4.. were built taller on the short side */
export const KINK = [0, 0, 0, 0.03, 0.035, 0.04, 0.04, 0.035];

const TAU = Math.PI * 2;
// ---------------- painted marble ----------------
const marble = (g: CanvasRenderingContext2D, W: number, H: number, r: () => number, base = "#f1eadb") => {
  g.fillStyle = base; g.fillRect(0, 0, W, H);
  for (let y = 0; y < H; y += 48) { // ashlar courses with faint grey banding
    g.fillStyle = (y / 48) % 5 === 2 ? "rgba(120,125,140,0.10)" : (y / 48) % 2 ? "rgba(255,255,255,0.08)" : "rgba(170,150,120,0.06)";
    g.fillRect(0, y, W, 48);
    g.fillStyle = "rgba(120,105,90,0.22)"; g.fillRect(0, y, W, 2);
    for (let x = (y / 48) % 2 ? 0 : 60; x < W; x += 120 + Math.floor(r() * 30)) { g.fillStyle = "rgba(120,105,90,0.16)"; g.fillRect(x, y, 2, 48); }
  }
  for (let i = 0; i < (W * H) / 9000; i++) { // soft grime and veins
    const x = r() * W, y = r() * H, rr = 20 + r() * 70;
    const gr = g.createRadialGradient(x, y, 0, x, y, rr);
    gr.addColorStop(0, r() < 0.7 ? "rgba(150,130,100,0.10)" : "rgba(255,255,255,0.12)"); gr.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = gr; g.fillRect(x - rr, y - rr, 2 * rr, 2 * rr);
  }
  g.strokeStyle = "rgba(140,140,150,0.18)"; g.lineWidth = 1.2;
  for (let i = 0; i < (W * H) / 40000; i++) { let x = r() * W, y = r() * H; g.beginPath(); g.moveTo(x, y); for (let k = 0; k < 5; k++) { x += (r() - 0.3) * 40; y += (r() - 0.5) * 20; g.lineTo(x, y); } g.stroke(); }
};
/** ground floor wall: 15 tall blind arches between pilasters, a door, round lozenges in the spandrels */
const groundTex = () => ctex("pisaGround", 2048, 512, (g, r) => {
  marble(g, 2048, 512, r);
  const n = 15, w = 2048 / n;
  for (let i = 0; i < n; i++) {
    const cx = (i + 0.5) * w, top = 70, rr = w * 0.36, base = 500;
    g.fillStyle = "rgba(205,190,165,0.55)"; g.beginPath(); g.moveTo(cx - rr, base); g.lineTo(cx - rr, top + rr); g.arc(cx, top + rr, rr, Math.PI, 0); g.lineTo(cx + rr, base); g.fill();
    g.strokeStyle = "rgba(60,50,55,0.55)"; g.lineWidth = 4; g.stroke();
    g.strokeStyle = "rgba(255,255,255,0.35)"; g.lineWidth = 3; g.beginPath(); g.arc(cx, top + rr, rr + 6, Math.PI, 0); g.stroke();
    g.fillStyle = "rgba(80,90,110,0.35)"; g.beginPath(); g.arc(i * w, 60, 14, 0, TAU); g.fill(); // lozenge between arches
    if (i === 0) { // the door
      g.fillStyle = "#5b3b2a"; g.beginPath(); g.moveTo(cx - 30, base); g.lineTo(cx - 30, 330); g.arc(cx, 330, 30, Math.PI, 0); g.lineTo(cx + 30, base); g.fill();
      g.strokeStyle = "rgba(30,20,25,0.8)"; g.lineWidth = 5; g.stroke();
    }
  }
  g.fillStyle = "rgba(80,70,60,0.25)"; g.fillRect(0, 490, 2048, 22); // plinth shade
});
/** inner gallery wall: shaded marble with dark arched doorways */
const innerTex = () => ctex("pisaInner", 1024, 256, (g, r) => {
  marble(g, 1024, 256, r, "#d9cdb8");
  const n = 12, w = 1024 / n;
  for (let i = 0; i < n; i++) {
    const cx = (i + 0.5) * w;
    if (i % 3 === 0) { g.fillStyle = "#3a2c33"; g.beginPath(); g.moveTo(cx - 14, 256); g.lineTo(cx - 14, 150); g.arc(cx, 150, 14, Math.PI, 0); g.lineTo(cx + 14, 256); g.fill(); }
    else { g.fillStyle = "rgba(90,80,90,0.25)"; g.fillRect(cx - 8, 120, 16, 40); }
  }
});
/** arch band: n arches whose openings are cut out (alpha), painted voussoirs + a grey/white striped frieze */
const archTex = (n: number) => ctex("pisaArch" + n, 2048, 128, (g, r) => {
  marble(g, 2048, 128, r);
  g.fillStyle = "rgba(110,120,140,0.22)"; g.fillRect(0, 0, 2048, 14);
  g.fillStyle = "rgba(60,50,55,0.5)"; g.fillRect(0, 13, 2048, 2);
  const w = 2048 / n;
  for (let i = 0; i < n; i++) {
    const cx = (i + 0.5) * w, rr = w * 0.4, cy = 128 - 34;
    for (let k = 0; k < 9; k++) { // voussoirs, alternating light / grey
      const a0 = Math.PI + (k * Math.PI) / 9, a1 = a0 + Math.PI / 9;
      g.fillStyle = k % 2 ? "rgba(120,125,140,0.28)" : "rgba(255,255,255,0.2)";
      g.beginPath(); g.arc(cx, cy, rr + 12, a0, a1); g.arc(cx, cy, rr, a1, a0, true); g.fill();
    }
    g.save(); g.globalCompositeOperation = "destination-out";
    g.beginPath(); g.moveTo(cx - rr, 128); g.lineTo(cx - rr, cy); g.arc(cx, cy, rr, Math.PI, 0); g.lineTo(cx + rr, 128); g.fill();
    g.restore();
    g.strokeStyle = "rgba(50,40,45,0.6)"; g.lineWidth = 3; g.beginPath(); g.arc(cx, cy, rr, Math.PI, 0); g.stroke();
  }
});

let M: Record<string, THREE.Material> | null = null;
const mats = () => {
  if (M) return M;
  const ground = lam("pisaGroundM", () => ({ map: groundTex() }));
  const inner = lam("pisaInnerM", () => ({ map: innerTex() }));
  const arch30 = lam("pisaArch30", () => ({ map: archTex(30), alphaTest: 0.5, side: THREE.DoubleSide }));
  const arch12 = lam("pisaArch12", () => ({ map: archTex(12), alphaTest: 0.5, side: THREE.DoubleSide }));
  const col = lam("pisaCol", () => ({ color: "#f3ecdd" }));
  const ledge = lam("pisaLedge", () => ({ color: "#e8dfcc" }));
  const floorM = lam("pisaFloorM", () => ({ color: "#cfc3ad" }));
  const bronze = lam("pisaBronze", () => ({ color: "#8a6a3c" }));
  const found = lam("pisaFound", () => ({ color: "#b9ab92" }));
  return (M = { ground, inner, arch30, arch12, col, ledge, floorM, bronze, found });
};

/** an open-ended cylinder band from y0 to y1 with its texture wrapped once around (u = angle) */
const band = (r: number, y0: number, y1: number, seg = 72) => new THREE.CylinderGeometry(r, r, y1 - y0, seg, 1, true).translate(0, (y0 + y1) / 2, 0);
const ring = (r0: number, r1: number, y0: number, y1: number, seg = 72) => {
  const g = new THREE.CylinderGeometry(r1, r1, y1 - y0, seg, 1, false).translate(0, (y0 + y1) / 2, 0);
  void r0; return g;
};

/** one floor in its own local frame (base centre at the origin), sheared taller on +x by kink (rad) */
const buildFloor = (i: number, kink: number, detail: number) => {
  const m = mats(), b = new Batch(), h = floorH(i);
  const seg = detail ? 48 : 72, cseg = detail ? 6 : 10;
  if (i === 0) {
    b.add(band(R_T, 0, h - 0.9, seg), m.ground);
    b.add(ring(0, R_T + 0.35, -0.6, 0.35, seg), m.ledge);                  // plinth
    for (let k = 0; k < 15; k++) { // engaged half columns between the blind arches
      const a = (k / 15) * TAU;
      b.add(new THREE.CylinderGeometry(0.32, 0.36, h - 1.3, cseg).translate(0, (h - 1.3) / 2 + 0.35, 0), m.col,
        new THREE.Matrix4().makeTranslation(Math.cos(a) * (R_T + 0.05), 0, Math.sin(a) * (R_T + 0.05)));
    }
    b.add(ring(0, R_T + 0.45, h - 0.9, h, seg), m.ledge);                    // cornice + gallery floor ledge
  } else if (i < NFLOORS - 1) {
    const ri = R_T * 0.78;
    b.add(band(ri, 0, h, seg), m.inner);
    b.add(ring(0, R_T + 0.1, 0, 0.35, seg), m.floorM);
    const n = 30;
    for (let k = 0; k < n; k++) {
      const a = (k / n) * TAU + Math.PI / n, x = Math.cos(a) * (R_T - 0.15), z = Math.sin(a) * (R_T - 0.15);
      b.add(new THREE.CylinderGeometry(0.2, 0.22, h - 2.05, cseg).translate(0, 0.35 + (h - 2.05) / 2, 0), m.col, new THREE.Matrix4().makeTranslation(x, 0, z));
      b.add(new THREE.BoxGeometry(0.5, 0.22, 0.5).translate(0, h - 1.82, 0), m.col, new THREE.Matrix4().makeRotationY(-a).setPosition(x, 0, z)); // capital
    }
    b.add(band(R_T, h - 1.7, h - 0.45, seg), m.arch30);
    b.add(ring(0, R_T + 0.4, h - 0.45, h, seg), m.ledge);
  } else { // bell chamber: smaller drum, 12 arches, bells inside
    const rb = R_T * 0.68;
    b.add(band(rb * 0.75, 0, h - 0.4, seg), m.inner);
    b.add(ring(0, R_T + 0.1, 0, 0.35, seg), m.floorM);
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * TAU + Math.PI / 12;
      b.add(new THREE.CylinderGeometry(0.26, 0.28, h - 2.1, cseg).translate(0, 0.35 + (h - 2.1) / 2, 0), m.col, new THREE.Matrix4().makeTranslation(Math.cos(a) * rb, 0, Math.sin(a) * rb));
    }
    b.add(band(rb, h - 1.8, h - 0.4, seg), m.arch12);
    b.add(ring(0, rb + 0.35, h - 0.4, h, seg), m.ledge);
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * TAU + 0.3, bell = new THREE.SphereGeometry(0.7, 14, 10, 0, TAU, 0, Math.PI * 0.62);
      b.add(bell, m.bronze, new THREE.Matrix4().makeTranslation(Math.cos(a) * rb * 0.88, h - 1.6, Math.sin(a) * rb * 0.88));
    }
  }
  const grp = new THREE.Group();
  b.build(grp);
  if (kink) {
    const t = Math.tan(kink);
    grp.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      const p = mesh.geometry.attributes.position as THREE.BufferAttribute;
      for (let k = 0; k < p.count; k++) { const x = p.getX(k), y = p.getY(k); p.setY(k, y + Math.max(0, y) * (x * t) / h); }
      p.needsUpdate = true; mesh.geometry.computeBoundingSphere();
    });
  }
  return grp;
};

export type TowerState = {
  floors: number;      // built floors (2.5 = two whole floors and the third half way)
  lean: number;        // base lean toward +x (rad)
  kinks: boolean;      // later floors corrected (banana)
  topple?: number;     // extra lean for the "would have fallen" beat (rad)
  sink?: number;       // the whole tower lower by this (m)
  pop?: number;        // squash of the newest floor as it lands (0 .. 1)
};

export class TowerRig {
  root = new THREE.Group();     // placed in the world (position = base centre)
  readonly base = new THREE.Group(); // pivot on the low (+x) edge of the base (children lean with the tower)
  private floors: THREE.Group[] = [];
  private floorsK: THREE.Group[] = [];
  private pivots: THREE.Group[] = [];
  readonly n: number;
  constructor(n = NFLOORS, detail = 0) {
    this.n = n;
    this.root.add(this.base);
    this.base.position.set(R_T, 0, 0);
    let parent: THREE.Object3D = this.base, off = -R_T;
    for (let i = 0; i < n; i++) {
      const pv = new THREE.Group();
      pv.position.set(off, i === 0 ? 0 : floorH(i - 1), 0);
      off = 0;
      parent.add(pv);
      const f = buildFloor(i, 0, detail), fk = KINK[i] ? buildFloor(i, KINK[i], detail) : f;
      pv.add(f); if (fk !== f) pv.add(fk);
      this.pivots.push(pv); this.floors.push(f); this.floorsK.push(fk);
      parent = pv;
    }
  }
  /** world point at height y on the tower axis (for cameras and effects); approximate (ignores the floor kinks) */
  set(s: TowerState) {
    this.root.position.y = -(s.sink ?? 0);
    this.base.rotation.z = -(s.lean + (s.topple ?? 0));
    const full = Math.floor(s.floors), frac = s.floors - full;
    for (let i = 0; i < this.n; i++) {
      const pv = this.pivots[i], vis = i < full || (i === full && frac > 0.001);
      pv.visible = vis;
      const k = s.kinks && KINK[i] ? KINK[i] : 0;
      // the pivot sits on the top plane of the floor below; that plane is tipped back by the lower floor's kink
      pv.rotation.z = i > 0 && s.kinks ? (KINK[i - 1] || 0) : 0;
      const same = this.floors[i] === this.floorsK[i];
      this.floors[i].visible = same || !k;
      this.floorsK[i].visible = same || !!k;
      const g = k ? this.floorsK[i] : this.floors[i];
      const grow = i === full ? frac : 1;
      const pop = i === full - 1 && s.pop ? s.pop : 0;
      g.scale.set(1 + 0.06 * pop, Math.max(0.001, grow) * (1 - 0.1 * pop), 1 + 0.06 * pop);
      if (i < this.n - 1) this.pivots[i + 1].position.y = floorH(i) * Math.max(0.001, grow) * (1 - 0.1 * pop);
    }
  }
  /** world position of the top centre of floor i (after set + updateMatrixWorld) */
  topOf(i: number, out = new THREE.Vector3()) {
    const pv = this.pivots[Math.min(i, this.n - 1)];
    pv.updateWorldMatrix(true, false);
    return out.set(0, floorH(i), 0).applyMatrix4(pv.matrixWorld);
  }
}

/** wooden scaffolding ring around the lower floors (child of a tower root; leans with it) */
export const scaffold = (h: number, r = R_T + 1.6) => {
  const b = new Batch(), wood = lam("scafWood", () => ({ color: "#a8754a" })), plank = lam("scafPlank", () => ({ color: "#c79a62" }));
  const n = 20;
  for (let k = 0; k < n; k++) {
    const a = (k / n) * TAU;
    b.add(new THREE.CylinderGeometry(0.09, 0.11, h, 6).translate(0, h / 2, 0), wood, new THREE.Matrix4().makeTranslation(Math.cos(a) * r, 0, Math.sin(a) * r));
    for (let y = 2.4; y < h; y += 2.4) {
      const a2 = ((k + 1) / n) * TAU, p0 = V(Math.cos(a) * r, y, Math.sin(a) * r), p1 = V(Math.cos(a2) * r, y, Math.sin(a2) * r);
      const len = p0.distanceTo(p1), mid = p0.clone().add(p1).multiplyScalar(0.5);
      b.add(new THREE.BoxGeometry(len + 0.2, 0.12, 0.12), wood, new THREE.Matrix4().makeRotationY(-Math.atan2(p1.z - p0.z, p1.x - p0.x)).setPosition(mid));
      if ((y / 2.4) % 2 === 1) b.add(new THREE.BoxGeometry(len, 0.08, 1.1), plank, new THREE.Matrix4().makeRotationY(-Math.atan2(p1.z - p0.z, p1.x - p0.x)).setPosition(mid.x * 0.97, y + 0.08, mid.z * 0.97));
    }
  }
  const g = new THREE.Group();
  b.build(g);
  return g;
};

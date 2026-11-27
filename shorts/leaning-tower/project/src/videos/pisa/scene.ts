// The Field of Miracles and the town around it (static, merged batches): marble paths, the cathedral with its dome,
// the round baptistery, the crenellated city wall, rows of ochre / terracotta houses, cypresses and umbrella pines,
// far hills. Anything that would stand in front of a camera is left out by the sight-line test (build.ts).
import * as THREE from "three";
import { Batch, lam, V, boxGeo, quad, tri, house, prop, setSight, Ray } from "./build";
import { ctex, rng, stoneHD, roofHD } from "./paint";

const TAU = Math.PI * 2;
/** white marble with grey bands and rows of blind arches / small loggias (cathedral and baptistery walls) */
const duomoTex = (key: string, w: number, h: number, rows: number) => ctex(key, 1024, 512, (g, r) => {
  g.fillStyle = "#efe7d6"; g.fillRect(0, 0, 1024, 512);
  for (let y = 0; y < 512; y += 24) { g.fillStyle = (y / 24) % 2 ? "rgba(110,118,135,0.16)" : "rgba(255,255,255,0.06)"; g.fillRect(0, y, 1024, 12); }
  const rowH = 512 / rows;
  for (let k = 0; k < rows; k++) {
    const n = k === 0 ? 8 : 16, aw = 1024 / n, y0 = k * rowH;
    g.fillStyle = "rgba(60,50,55,0.55)"; g.fillRect(0, y0 + rowH - 6, 1024, 6);
    for (let i = 0; i < n; i++) {
      const cx = (i + 0.5) * aw, rr = aw * 0.32, top = y0 + rowH * 0.22 + rr;
      g.fillStyle = k === 0 ? "rgba(190,175,150,0.6)" : "rgba(70,60,70,0.55)";
      g.beginPath(); g.moveTo(cx - rr, y0 + rowH - 8); g.lineTo(cx - rr, top); g.arc(cx, top, rr, Math.PI, 0); g.lineTo(cx + rr, y0 + rowH - 8); g.fill();
      g.strokeStyle = "rgba(50,40,45,0.6)"; g.lineWidth = 3; g.stroke();
      g.fillStyle = "rgba(255,255,255,0.5)"; g.fillRect(i * aw - 3, y0 + 10, 6, rowH - 18);
    }
  }
  for (let i = 0; i < 40; i++) { const x = r() * 1024, y = r() * 512, rr = 20 + r() * 50; const gr = g.createRadialGradient(x, y, 0, x, y, rr); gr.addColorStop(0, "rgba(150,130,100,0.1)"); gr.addColorStop(1, "rgba(0,0,0,0)"); g.fillStyle = gr; g.fillRect(x - rr, y - rr, 2 * rr, 2 * rr); }
  void w; void h;
});
const wallTex = () => ctex("cityWall", 1024, 256, (g, r) => {
  g.fillStyle = "#c98f5a"; g.fillRect(0, 0, 1024, 256);
  for (let y = 0; y < 256; y += 16) for (let x = (y / 16) % 2 ? -20 : 0; x < 1024; x += 40) {
    g.fillStyle = `rgba(${150 + r() * 40},${90 + r() * 30},${55 + r() * 20},0.55)`; g.fillRect(x + 1, y + 1, 38, 14);
  }
  g.fillStyle = "rgba(60,40,30,0.2)"; g.fillRect(0, 230, 1024, 26);
});

export const buildPisa = (root: THREE.Object3D, rays: Ray[]) => {
  setSight(rays);
  const b = new Batch(), r = rng(23), pick = <T,>(a: T[]) => a[Math.floor(r() * a.length) % a.length];
  // ---- marble paths: a ring round the tower and a walk across the lawn (where the tourists stand) ----
  const path = lam("pathHD", () => ({ map: stoneHD("copeHD") }));
  const ringG = new THREE.RingGeometry(9.2, 13.5, 64, 1); ringG.rotateX(-Math.PI / 2);
  b.add(ringG, path, new THREE.Matrix4().makeTranslation(0, 0.02, 0));
  b.add(quad(V(-160, 0.02, 24), V(140, 0.02, 24), V(140, 0.02, 18), V(-160, 0.02, 18), 75, 1.5), path);
  b.add(quad(V(-160, 0.02, 82), V(140, 0.02, 82), V(140, 0.02, 74), V(-160, 0.02, 74), 75, 2), path);
  b.add(quad(V(-3, 0.021, 18), V(3, 0.021, 18), V(3, 0.021, 13), V(-3, 0.021, 13), 1.5, 1.25), path);
  // ---- cathedral: nave + aisles + transept, lead roofs, elliptical dome at the crossing ----
  const marbleW = lam("duomoW", () => ({ map: duomoTex("duomoW", 70, 24, 3) }));
  const marbleL = lam("duomoL", () => ({ map: duomoTex("duomoL", 30, 14, 2) }));
  const lead = lam("leadRoof", () => ({ map: roofHD("#8f97a8", true), side: THREE.DoubleSide }));
  const box = (x0: number, x1: number, y1: number, z0: number, z1: number, m: THREE.Material, ux = 1, uy = 1) => {
    b.add(quad(V(x0, 0, z1), V(x1, 0, z1), V(x1, y1, z1), V(x0, y1, z1), ux, uy), m);
    b.add(quad(V(x1, 0, z0), V(x0, 0, z0), V(x0, y1, z0), V(x1, y1, z0), ux, uy), m);
    b.add(quad(V(x0, 0, z0), V(x0, 0, z1), V(x0, y1, z1), V(x0, y1, z0), (z1 - z0) / (x1 - x0) * ux, uy), m);
    b.add(quad(V(x1, 0, z1), V(x1, 0, z0), V(x1, y1, z0), V(x1, y1, z1), (z1 - z0) / (x1 - x0) * ux, uy), m);
  };
  const gableX = (x0: number, x1: number, y: number, z0: number, z1: number, rise: number, m: THREE.Material, wall: THREE.Material) => {
    const zc = (z0 + z1) / 2, o = 0.6;
    b.add(quad(V(x0 - o, y - 0.3, z1 + o), V(x1 + o, y - 0.3, z1 + o), V(x1 + o, y + rise, zc), V(x0 - o, y + rise, zc), (x1 - x0) / 4, 2), m);
    b.add(quad(V(x1 + o, y - 0.3, z0 - o), V(x0 - o, y - 0.3, z0 - o), V(x0 - o, y + rise, zc), V(x1 + o, y + rise, zc), (x1 - x0) / 4, 2), m);
    b.add(tri(V(x0, y, z0), V(x0, y, z1), V(x0, y + rise, zc)), wall);
    b.add(tri(V(x1, y, z1), V(x1, y, z0), V(x1, y + rise, zc)), wall);
  };
  const gableZ = (z0: number, z1: number, y: number, x0: number, x1: number, rise: number, m: THREE.Material, wall: THREE.Material) => {
    const xc = (x0 + x1) / 2, o = 0.6;
    b.add(quad(V(x1 + o, y - 0.3, z0 - o), V(x1 + o, y - 0.3, z1 + o), V(xc, y + rise, z1 + o), V(xc, y + rise, z0 - o), (z1 - z0) / 4, 2), m);
    b.add(quad(V(x0 - o, y - 0.3, z1 + o), V(x0 - o, y - 0.3, z0 - o), V(xc, y + rise, z0 - o), V(xc, y + rise, z1 + o), (z1 - z0) / 4, 2), m);
    b.add(tri(V(x0, y, z1), V(x1, y, z1), V(xc, y + rise, z1)), wall);
    b.add(tri(V(x1, y, z0), V(x0, y, z0), V(xc, y + rise, z0)), wall);
  };
  // nave along x (x -112 .. -42), aisles each side, transept across at x -66
  box(-112, -42, 24, -50, -36, marbleW, 3, 1); gableX(-112, -42, 24, -50, -36, 5, lead, marbleW);
  for (const [z0, z1] of [[-58, -50], [-36, -28]]) { box(-112, -42, 14, z0, z1, marbleL, 3, 1); gableX(-112, -42, 14, z0, z1, 2.4, lead, marbleL); }
  box(-74, -58, 22, -72, -14, marbleW, 1, 1); gableZ(-72, -14, 22, -74, -58, 4.5, lead, marbleW);
  const drum = new THREE.CylinderGeometry(7, 7, 6, 32, 1, true).translate(0, 3, 0);
  b.add(drum, marbleL, new THREE.Matrix4().makeTranslation(-66, 24, -43));
  const dome = new THREE.SphereGeometry(7.3, 32, 14, 0, TAU, 0, Math.PI / 2); dome.scale(1, 1.15, 1);
  b.add(dome, lead, new THREE.Matrix4().makeTranslation(-66, 30, -43));
  // ---- baptistery: round drum, gallery band, dome ----
  const bap = new THREE.CylinderGeometry(17, 17, 22, 48, 1, true).translate(0, 11, 0);
  b.add(bap, lam("bapW", () => ({ map: duomoTex("bapW", 100, 22, 3) })), new THREE.Matrix4().makeTranslation(-165, 0, -43));
  const bdome = new THREE.SphereGeometry(17.5, 40, 16, 0, TAU, 0, Math.PI / 2); bdome.scale(1, 1.1, 1);
  b.add(bdome, lam("bapRoof", () => ({ color: "#c46f4e" })), new THREE.Matrix4().makeTranslation(-165, 22, -43));
  b.add(new THREE.CylinderGeometry(3, 3, 5, 20).translate(0, 2.5, 0), marbleL, new THREE.Matrix4().makeTranslation(-165, 41, -43));
  // ---- city wall behind (z -125) and along the east side ----
  const wall = lam("cityWallM", () => ({ map: wallTex() }));
  const W0 = -260, W1 = 160, WZ = -125, WH = 11;
  b.add(quad(V(W0, 0, WZ), V(W1, 0, WZ), V(W1, WH, WZ), V(W0, WH, WZ), 20, 1), wall);
  b.add(quad(V(W1, 0, WZ - 2), V(W0, 0, WZ - 2), V(W0, WH, WZ - 2), V(W1, WH, WZ - 2), 20, 1), wall);
  b.add(quad(V(W0, WH, WZ), V(W1, WH, WZ), V(W1, WH, WZ - 2), V(W0, WH, WZ - 2), 20, 0.1), wall);
  for (let x = W0; x < W1; x += 3.2) b.add(boxGeo(V(x, WH, WZ - 2), V(x + 1.6, WH + 1.4, WZ)), wall);
  for (const x of [-200, -120, -40, 40, 120]) {
    b.add(boxGeo(V(x - 4, 0, WZ - 4), V(x + 4, WH + 6, WZ + 3), 2), wall);
    for (let k = -4; k < 4; k += 2) b.add(boxGeo(V(x + k, WH + 6, WZ + 2), V(x + k + 1, WH + 7.4, WZ + 3)), wall);
  }
  // ---- the town: houses facing the lawn on the south (+z) and east (+x) ----
  for (const zf of [135, 150, 166, 184]) {
    let x = -200 + r() * 6;
    while (x < 150) {
      const w = pick([7, 9, 11]), h = pick([8.4, 9.8, 11.2, 12.6]);
      if (r() > 0.12) house(b, x + w / 2, zf + r() * 2, Math.PI, w, 9, h, Math.floor(r() * 8));
      x += w + 0.3 + (r() < 0.2 ? 3 : 0);
    }
  }
  for (const xf of [120, 135, 152]) {
    let z = -110 + r() * 6;
    while (z < 110) {
      const w = pick([7, 9, 11]), h = pick([8.4, 9.8, 11.2]);
      if (r() > 0.15) house(b, xf + r() * 2, z + w / 2, -Math.PI / 2, w, 9, h, Math.floor(r() * 8));
      z += w + 0.3 + (r() < 0.2 ? 3 : 0);
    }
  }
  // ---- trees: cypresses along the paths, umbrella pines near the wall and the town ----
  for (let x = -150; x <= 130; x += 14) if (Math.abs(x) > 20) prop(b, {}, "tree_cone", x + r() * 3, 0, 28 + r() * 2, 11 + r() * 3);
  for (let x = -170; x <= 130; x += 16) if (Math.abs(x - 4) > 26) prop(b, {}, "tree_cone", x + r() * 3, 0, 88 + r() * 2, 11 + r() * 3);
  for (let i = 0; i < 26; i++) prop(b, {}, "tree_fat", -240 + r() * 390, 0, -112 + r() * 10, 9 + r() * 4, r() * 6);
  for (let i = 0; i < 20; i++) prop(b, {}, pick(["tree_fat", "tree_oak", "tree_cone"]), 90 + r() * 22, 0, -100 + r() * 180, 8 + r() * 5, r() * 6);
  for (let i = 0; i < 40; i++) { const a = r() * TAU, d = 300 + r() * 150; prop(b, {}, pick(["tree_cone", "tree_fat", "tree_oak"]), Math.cos(a) * d, 0, Math.sin(a) * d, 12 + r() * 6, r() * 6); }
  // ---- hills ----
  const hill = new THREE.SphereGeometry(1, 28, 14, 0, TAU, 0, Math.PI / 2);
  const hm = [lam("hillA", () => ({ color: "#7fb05a" })), lam("hillB", () => ({ color: "#6fa452" })), lam("hillC", () => ({ color: "#93bf68" }))];
  ([[-380, -420, 220, 70, 140], [120, -480, 260, 90, 150], [480, -300, 200, 60, 130], [-560, 80, 200, 50, 160], [560, 160, 180, 46, 130],
    [-200, 520, 260, 60, 140], [260, 560, 240, 64, 150]] as const).forEach(([x, z, sx, sy, sz], i) =>
    b.add(hill, hm[i % 3], new THREE.Matrix4().compose(V(x, -2, z), new THREE.Quaternion(), V(sx, sy, sz))));
  b.build(root);
  setSight([]);
};

/** the 1173 building site dressing: two Pisan banners, a stone pile, timber (shown in the medieval shots) */
export const buildSite = (root: THREE.Object3D) => {
  const b = new Batch();
  prop(b, {}, "banner-red", -12, 0, 16, 4.2, 0.3);
  prop(b, {}, "banner-red", 13, 0, 15, 4.2, -0.3);
  const stone = lam("siteStone", () => ({ map: stoneHD("copeHD") })), wood = lam("siteWood", () => ({ color: "#a8754a" }));
  for (let i = 0; i < 6; i++) b.add(boxGeo(V(-14 + (i % 3) * 1.3, Math.floor(i / 3) * 0.7, 8 + (i % 2) * 0.3), V(-12.9 + (i % 3) * 1.3, 0.7 + Math.floor(i / 3) * 0.7, 9.2 + (i % 2) * 0.3), 1), stone);
  for (let i = 0; i < 5; i++) b.add(new THREE.CylinderGeometry(0.16, 0.16, 5, 8).rotateZ(Math.PI / 2).translate(0, 0.16 + i * 0.3, 0), wood, new THREE.Matrix4().makeTranslation(12.5, 0, 9 + (i % 3) * 0.35));
  b.build(root);
};
/** overgrowth after a century of war: bushes and tall grass hugging the stump */
export const buildWeeds = (root: THREE.Object3D) => {
  const b = new Batch(), r = rng(5);
  for (let i = 0; i < 30; i++) { const a = r() * TAU, d = 8.4 + r() * 4.5; prop(b, {}, i % 3 ? "plant_bush" : "plant_bushLarge", Math.cos(a) * d, 0, Math.sin(a) * d, 0.9 + r() * 1.3, r() * 6); }
  for (let i = 0; i < 6; i++) { const a = r() * TAU, d = 16 + r() * 6; prop(b, {}, "tree_oak", Math.cos(a) * d, 0, Math.sin(a) * d - 6, 5 + r() * 2, r() * 6); }
  b.build(root);
};

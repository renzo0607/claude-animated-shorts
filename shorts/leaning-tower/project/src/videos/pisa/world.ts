// The whole short as one three.js scene: sky, sun, clouds, lawn, the Field of Miracles (scene.ts), the leaning tower
// (tower.ts) with its scaffold, the 1990 barrier, the underground cut-away diorama with the tower stub, the old
// mattress, and the cast. update(id, f, camera) poses everything for shot `id` at frame f (pure function of id + f).
import * as THREE from "three";
import { Batch, boxGeo, V, lam, Kit, Ray, setSight } from "./build";
import { ctex, grassHD, cloudHD, rep, stoneHD } from "./paint";
import { Pen, fxNoEntry } from "./toon";
import { LIGHTS, LOOK, LightPreset } from "./lights";
import { TONE, CHAR, untone } from "./shade";
import { NOINK } from "./ink";
import { Pool, Actor, Fx, stage } from "./cast";
import { FPS, SHOTS, CUT, MAT, STUB_Z, camAt, towerAt, scaffoldOn, ShotDef, V3, smooth, clamp01, mattressAt } from "./story";
import { TowerRig, scaffold, R_T, H_G } from "./tower";
import { buildPisa, buildSite, buildWeeds } from "./scene";

export const loadKit = () => Promise.resolve({} as Kit);

const discTex = () => ctex("sunDisc", 128, 128, (g) => {
  const gr = g.createRadialGradient(64, 64, 58, 64, 64, 64); gr.addColorStop(0, "rgba(255,255,255,1)"); gr.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
});
const haloTex = () => ctex("sunHalo", 256, 256, (g) => {
  const im = g.createImageData(256, 256);
  for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) {
    const u = Math.hypot(x - 127.5, y - 127.5) / 128;
    const a = (0.55 * Math.exp(-((u / 0.25) ** 2)) + 0.35 * Math.exp(-((u / 0.6) ** 2))) * (1 - Math.min(1, Math.max(0, (u - 0.8) / 0.2)));
    const i = (y * 256 + x) * 4; im.data[i] = im.data[i + 1] = im.data[i + 2] = 255; im.data[i + 3] = Math.round(255 * Math.min(1, a));
  }
  g.putImageData(im, 0, 0);
});
/** the underground section: grass lip, topsoil, silty sand, then wet blue-grey clay with shells and water beads */
const sectionTex = () => ctex("section", 2048, 1024, (g, r) => {
  const H = 1024, m = H / 30; // 30 m tall
  const layer = (y0: number, y1: number, c0: string, c1: string) => { const gr = g.createLinearGradient(0, y0 * m, 0, y1 * m); gr.addColorStop(0, c0); gr.addColorStop(1, c1); g.fillStyle = gr; g.fillRect(0, y0 * m, 2048, (y1 - y0) * m + 1); };
  layer(0, 0.5, "#6fae4c", "#5d9a40");
  layer(0.5, 2.2, "#8a6446", "#7a573c");
  layer(2.2, 4.0, "#c9a66b", "#b8945b");
  layer(4.0, 30, "#8f9196", "#6c6e78");
  const wavy = (y: number, col: string) => { g.strokeStyle = col; g.lineWidth = 5; g.beginPath(); for (let x = 0; x <= 2048; x += 32) g.lineTo(x, y * m + 6 * Math.sin(x / 90 + y)); g.stroke(); };
  wavy(0.5, "rgba(50,35,30,0.6)"); wavy(2.2, "rgba(60,40,30,0.55)"); wavy(4.0, "rgba(40,45,70,0.6)");
  for (let i = 0; i < 600; i++) { // pebbles in the soil, shells and water beads in the clay
    const x = r() * 2048, yy = r() * 30;
    if (yy < 4) { g.fillStyle = yy < 2.2 ? "rgba(60,40,30,0.35)" : "rgba(150,120,70,0.5)"; g.beginPath(); g.ellipse(x, yy * m, 4 + r() * 5, 3 + r() * 3, r() * 3, 0, 7); g.fill(); }
    else if (r() < 0.12) { g.fillStyle = "rgba(235,228,210,0.8)"; g.beginPath(); g.ellipse(x, yy * m, 4, 2.5, r() * 3, 0, 7); g.fill(); }
    else { g.fillStyle = "rgba(170,215,245,0.55)"; g.beginPath(); g.arc(x, yy * m, 2 + r() * 3, 0, 7); g.fill(); }
  }
  g.fillStyle = "rgba(60,55,50,0.10)"; for (let y = 4.4; y < 30; y += 1.3) g.fillRect(0, y * m, 2048, 3);
});
const tapeTex = () => ctex("tape", 256, 32, (g) => {
  for (let x = -32; x < 256; x += 64) { g.fillStyle = "#d8322f"; g.beginPath(); g.moveTo(x, 32); g.lineTo(x + 32, 0); g.lineTo(x + 64, 0); g.lineTo(x + 32, 32); g.fill(); }
  g.fillStyle = "#f6f2ea"; g.globalCompositeOperation = "destination-over"; g.fillRect(0, 0, 256, 32);
});
const tickingTex = () => ctex("ticking", 512, 512, (g, r) => {
  g.fillStyle = "#efe6d0"; g.fillRect(0, 0, 512, 512);
  for (let x = 0; x < 512; x += 32) { g.fillStyle = "#6d86b2"; g.fillRect(x + 4, 0, 9, 512); g.fillStyle = "rgba(109,134,178,0.5)"; g.fillRect(x + 18, 0, 3, 512); }
  for (let i = 0; i < 9; i++) { const x = 60 + (i % 3) * 190, y = 70 + Math.floor(i / 3) * 180; g.fillStyle = "#5a6f96"; g.beginPath(); g.arc(x, y, 9, 0, 7); g.fill(); g.strokeStyle = "rgba(60,50,60,0.35)"; g.lineWidth = 2; g.beginPath(); g.arc(x, y, 22, 0, 7); g.stroke(); }
  for (let i = 0; i < 6; i++) { const x = r() * 512, y = r() * 512, rr = 30 + r() * 60; const gr = g.createRadialGradient(x, y, 0, x, y, rr); gr.addColorStop(0, "rgba(170,140,80,0.22)"); gr.addColorStop(1, "rgba(0,0,0,0)"); g.fillStyle = gr; g.fillRect(x - rr, y - rr, 2 * rr, 2 * rr); }
});

/** every lens position of the film looking at its subject (houses / trees in the way are left out) */
const sightLines = (): Ray[] => {
  const out: Ray[] = [];
  for (const s of SHOTS) for (let f = s.a - 8; f < s.b + 8; f += 3) {
    const c = camAt(s.id, Math.max(0, f)), o = V(...c.pos), look = V(...c.look);
    const fw = look.clone().sub(o), len = Math.max(fw.length(), 40);
    fw.normalize();
    const rt = fw.clone().cross(V(0, 1, 0)).normalize(), up = rt.clone().cross(fw);
    const ty = Math.tan((c.fov * Math.PI) / 360), tx = ty * (9 / 16);
    for (const [sx, sy] of [[0, 0], [-0.7, 0], [0.7, 0], [0, 0.7], [0, -0.5], [-0.7, 0.7], [0.7, 0.7]])
      out.push({ o, d: fw.clone().addScaledVector(rt, sx * tx).addScaledVector(up, sy * ty), len, core: sx === 0 && sy === 0 });
  }
  return out;
};

const MW = 2.0, MD = 1.5, MH = 0.3; // mattress size (m)

export class World {
  root = new THREE.Group();
  private pool = new Pool();
  private actors: Actor[] = [];
  private fxs: Fx[] = [];
  private sun: THREE.DirectionalLight; private hemi: THREE.HemisphereLight;
  private sky: THREE.Mesh; private skyMat: THREE.ShaderMaterial;
  private fog = new THREE.Fog("#bccbec", 60, 600);
  private sunDisc: THREE.Sprite; private sunHalo: THREE.Sprite;
  private sunCache = new Map<number, THREE.Vector3>();
  private cloudMaps: Record<"day" | "golden", THREE.Texture[]>;
  private clouds: THREE.Mesh[] = [];
  private tower = new TowerRig();
  private stub = new TowerRig(3, 1);
  private scaf: THREE.Group; private stubScaf: THREE.Group;
  private site = new THREE.Group(); private weeds = new THREE.Group(); private barrier = new THREE.Group();
  private dirt: THREE.Mesh; private footing: THREE.Mesh; private clayM: THREE.MeshLambertMaterial;
  private mattress: THREE.Mesh; private mBase: Float32Array;
  private frustum = new THREE.Frustum();
  private m4 = new THREE.Matrix4(); private v = new THREE.Vector3(); private sph = new THREE.Sphere();

  constructor(_kit: Kit) {
    const R = this.root;
    // ---- sky + light ----
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
    this.sunDisc = new THREE.Sprite(new THREE.SpriteMaterial({ map: discTex(), color: new THREE.Color(6.0, 4.4, 2.4), fog: false, depthWrite: false }));
    this.sunHalo = new THREE.Sprite(new THREE.SpriteMaterial({ map: haloTex(), color: new THREE.Color(1, 1, 1), fog: false, depthWrite: false, transparent: true, blending: THREE.AdditiveBlending }));
    this.sunDisc.renderOrder = -0.5; this.sunHalo.renderOrder = 5;
    for (const m of [this.sunDisc, this.sunHalo]) { m.frustumCulled = false; m.layers.set(NOINK); R.add(m); }
    this.hemi = new THREE.HemisphereLight("#cfe6ff", "#6c5c8c", 1.1);
    this.sun = new THREE.DirectionalLight("#fff0d6", 2.6);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    R.add(this.hemi, this.sun, this.sun.target);
    this.cloudMaps = { day: [0, 1, 2, 3].map((k) => cloudHD(k, LOOK.day.cloud)), golden: [0, 1, 2, 3].map((k) => cloudHD(k, LOOK.golden.cloud)) };
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2 + 0.3, d = 620 + (i % 3) * 60;
      const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: this.cloudMaps.day[i % 4], color: new THREE.Color(1.1, 1.1, 1.1), transparent: true, depthWrite: false, fog: false }));
      const w = 130 + (i % 4) * 30;
      m.position.set(Math.cos(a) * d, 130 + (i % 4) * 40, Math.sin(a) * d); m.scale.set(w, w / 2, 1);
      m.layers.set(NOINK);
      this.clouds.push(m); R.add(m);
    }
    // ---- lawn ----
    const b = new Batch();
    const grass = lam("grassHD", () => ({ map: grassHD(), color: "#b4c091" }));
    const lawn = new THREE.PlaneGeometry(1400, 1400, 1, 1); lawn.rotateX(-Math.PI / 2);
    const uv = lawn.attributes.uv as THREE.BufferAttribute; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 350, uv.getY(i) * 350);
    b.add(lawn, grass);
    b.build(R);
    const rays = sightLines();
    buildPisa(R, rays);
    setSight(rays); buildSite(this.site); buildWeeds(this.weeds); setSight([]);
    R.add(this.site, this.weeds);
    // ---- the tower, its scaffold ----
    R.add(this.tower.root);
    this.scaf = scaffold(26); this.tower.base.add(this.scaf); this.scaf.position.x = -R_T;
    // ---- 1990 barrier: posts and striped tape round the tower, a no-entry sign, the spoil heap ----
    const bb = new Batch(), post = lam("post", () => ({ color: "#e9e4da" })), tapeM = lam("tapeM", () => ({ map: tapeTex(), side: THREE.DoubleSide }));
    const NP = 28, RB = 16;
    for (let k = 0; k < NP; k++) {
      const a = (k / NP) * Math.PI * 2, a2 = ((k + 1) / NP) * Math.PI * 2, p0 = V(Math.cos(a) * RB, 0, Math.sin(a) * RB), p1 = V(Math.cos(a2) * RB, 0, Math.sin(a2) * RB);
      bb.add(new THREE.CylinderGeometry(0.06, 0.07, 1.15, 8).translate(0, 0.575, 0), post, new THREE.Matrix4().makeTranslation(p0.x, 0, p0.z));
      const len = p0.distanceTo(p1), mid = p0.clone().add(p1).multiplyScalar(0.5), yaw = -Math.atan2(p1.z - p0.z, p1.x - p0.x);
      const tg = new THREE.PlaneGeometry(len, 0.12); const tuv = tg.attributes.uv as THREE.BufferAttribute; for (let i = 0; i < tuv.count; i++) tuv.setX(i, tuv.getX(i) * len * 1.5);
      bb.add(tg, tapeM, new THREE.Matrix4().makeRotationY(yaw).setPosition(mid.x, 1.0, mid.z));
    }
    bb.build(this.barrier);
    const sign = new THREE.Mesh(new THREE.CircleGeometry(0.42, 32), new THREE.MeshBasicMaterial({ map: ctex("noEntry", 400, 400, (g) => fxNoEntry(new Pen(g))), color: 0xe6e6e6 }));
    sign.position.set(2.2, 1.55, RB + 0.07); sign.layers.set(NOINK);
    const sp = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.55, 0.08), post); sp.position.set(2.2, 0.78, RB);
    this.barrier.add(sign, sp);
    this.dirt = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), lam("dirtM", () => ({ color: "#8a6242" })));
    this.dirt.position.set(-12.2, 0, 7.5); this.dirt.castShadow = true; this.dirt.receiveShadow = true;
    this.barrier.add(this.dirt);
    R.add(this.barrier);
    // ---- the cut-away diorama (far off at CUT): section face, lawn lip, footing, stub tower ----
    const D = new THREE.Group(); D.position.set(...CUT); R.add(D);
    this.clayM = lam("sectionM", () => ({ map: sectionTex() })) as THREE.MeshLambertMaterial;
    const face = new THREE.PlaneGeometry(120, 30); face.translate(0, -15, 0);
    const fm = new THREE.Mesh(face, this.clayM); fm.receiveShadow = true; D.add(fm);
    const top = new THREE.Mesh(new THREE.PlaneGeometry(120, 60).rotateX(-Math.PI / 2).translate(0, 0.01, -30), lam("grassHD2", () => ({ map: rep(grassHD(), 30, 15) })));
    top.receiveShadow = true; D.add(top);
    this.stub.root.position.set(0, 0, STUB_Z); D.add(this.stub.root);
    this.stubScaf = scaffold(26); this.stub.base.add(this.stubScaf); this.stubScaf.position.x = -R_T;
    // footing: painted stone slab just in front of the section face, 3 m deep under the stub, leaning with it
    this.footing = new THREE.Mesh(new THREE.PlaneGeometry(2 * R_T + 1.4, 3).translate(-R_T, -1.5, 0), lam("footM", () => ({ map: rep(stoneHD("copeHD"), 4, 1) })));
    this.footing.position.set(0, 0, -STUB_Z + 0.04); this.stub.base.add(this.footing);
    // ---- the mattress (deformed every frame) ----
    const mg = new THREE.BoxGeometry(MW, MH, MD, 30, 3, 22); mg.translate(0, MH / 2, 0);
    this.mBase = (mg.attributes.position.array as Float32Array).slice();
    this.mattress = new THREE.Mesh(mg, lam("tickingM", () => ({ map: tickingTex() })));
    this.mattress.position.set(...MAT); this.mattress.rotation.y = 0.2; this.mattress.castShadow = true; this.mattress.receiveShadow = true;
    R.add(this.mattress);
    const pil = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 10), lam("pillow", () => ({ color: "#f3efe6" })));
    pil.scale.set(0.3, 0.14, 0.55); pil.position.set(-0.72, MH + 0.05, 0); this.mattress.add(pil);
    void H_G;
    this.root.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh && !m.layers.isEnabled(NOINK)) { m.castShadow = m.castShadow || m.parent === this.site; } });
  }

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

  private poseMattress(f: number) {
    const st = mattressAt(f), p = this.mattress.geometry.attributes.position as THREE.BufferAttribute, a = p.array as Float32Array;
    for (let i = 0; i < p.count; i++) {
      const x = this.mBase[i * 3], y = this.mBase[i * 3 + 1], z = this.mBase[i * 3 + 2];
      const dx = x - st.cx, w = Math.exp(-(dx * dx) / (2 * 0.28 * 0.28) - (z * z) / (2 * 0.45 * 0.45)) + 0.25 * Math.exp(-(dx * dx) / 0.9);
      a[i * 3 + 1] = y - (y / MH) * st.depth * w;
    }
    p.needsUpdate = true; this.mattress.geometry.computeVertexNormals();
  }

  update(id: number, f: number, cam: THREE.PerspectiveCamera, scene: THREE.Scene) {
    const t = f / FPS, s = SHOTS[id - 1], L = LIGHTS[s.light];
    const c = camAt(id, f);
    cam.position.set(...c.pos); cam.up.set(0, 1, 0); cam.lookAt(...c.look); cam.rotateZ(c.roll);
    cam.fov = c.fov; cam.near = 0.2; cam.far = 1500; cam.updateProjectionMatrix(); cam.updateMatrixWorld();
    const focus = V(...c.look), dist = cam.position.distanceTo(focus);
    cam.layers.enable(NOINK);
    // ---- light rig ----
    const K = LOOK[s.light], sunDir = this.shotSun(id, s, L);
    this.hemi.color.set(L.sky); this.hemi.groundColor.set(L.ground); this.hemi.intensity = L.hemiI;
    this.sun.color.set(L.sunCol); this.sun.intensity = L.sunI;
    let Rr = THREE.MathUtils.clamp(dist * 1.1 + 10, 14, 110);
    if (s.light === "golden") Rr = Math.max(Rr, 30);
    this.sun.position.copy(focus).addScaledVector(sunDir, 260); this.sun.target.position.copy(focus);
    const sc = this.sun.shadow.camera;
    sc.left = -Rr; sc.right = Rr; sc.top = Rr; sc.bottom = -Rr; sc.near = 20; sc.far = 560; sc.updateProjectionMatrix();
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
    untone(L.fog, this.fog.color); this.fog.near = L.fogNear; this.fog.far = L.fogFar;
    scene.fog = this.fog; scene.background = null;
    const showSun = s.light === "golden";
    this.sunDisc.visible = this.sunHalo.visible = showSun;
    if (showSun) {
      this.sunDisc.position.copy(cam.position).addScaledVector(sunDir, 900);
      this.sunDisc.scale.setScalar(2 * 900 * Math.tan(THREE.MathUtils.degToRad(1.7)));
      this.sunHalo.position.copy(this.sunDisc.position); this.sunHalo.scale.setScalar(2 * 900 * Math.tan(THREE.MathUtils.degToRad(24)));
      (this.sunHalo.material as THREE.SpriteMaterial).color.set(L.sunDisc).multiplyScalar(1.3);
    }
    for (let i = 0; i < this.clouds.length; i++) {
      const m = this.clouds[i];
      m.lookAt(cam.position.x, m.position.y, cam.position.z);
      (m.material as THREE.MeshBasicMaterial).map = this.cloudMaps[s.light][i % 4];
    }
    // ---- story props ----
    const ts = towerAt(id, f);
    this.tower.set(ts);
    this.stub.set({ ...ts, floors: Math.min(ts.floors, 2.5) });
    this.scaf.visible = scaffoldOn(id) && ts.floors < 3; this.stubScaf.visible = this.scaf.visible;
    const sh = Math.min(1, (11 * Math.min(ts.floors, 1) + 6.9 * Math.max(0, ts.floors - 1) + 2.4) / 26);
    this.scaf.scale.y = sh; this.stubScaf.scale.y = sh;
    this.site.visible = s.era === "1173" || s.era === "1272";
    this.weeds.visible = id === 8;
    this.barrier.visible = s.era === "1990";
    const dig = id === 15 ? smooth((f - 1712) / 80) : id === 16 ? 1 : 0;
    this.dirt.scale.set(0.6 + 1.0 * dig, 0.35 + 0.6 * dig, 0.6 + 0.9 * dig);
    const firm = id === 13 ? smooth((f - 1470) / 50) : 0;
    this.clayM.color.setRGB(1 - 0.08 * firm, 1 - 0.1 * firm, 1 - 0.2 * firm);
    this.mattress.visible = id === 12;
    if (id === 12) this.poseMattress(f);
    // ---- cast + effects ----
    const right = V(0, 0, 0).setFromMatrixColumn(cam.matrixWorld, 0);
    const st = stage(id, f, { pos: cam.position, right, sun: sunDir });
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
      const e2 = this.fx(fi++);
      e2.r = this.pool.req(p.key, p.cw, p.ch, 1, p.draw);
      e2.use(!!p.soft);
      e2.mesh.visible = true;
      e2.mesh.position.set(p.x, p.y, p.z);
      if (p.flat) e2.mesh.rotation.set(-Math.PI / 2, 0, p.rot ?? 0);
      else { e2.mesh.quaternion.copy(cam.quaternion); e2.mesh.rotateZ(p.rot ?? 0); }
      e2.mesh.scale.set(p.w, p.h, 1);
      fused.push(e2);
    }
    for (let i = fi; i < this.fxs.length; i++) this.fxs[i].mesh.visible = false;
    this.pool.flush();
    for (const a of used) a.bind();
    for (const e3 of fused) e3.bind();
    void clamp01; void t;
    return focus;
  }
}
export type { V3 };

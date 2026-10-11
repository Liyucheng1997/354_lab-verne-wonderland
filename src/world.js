// ─────────────────────────────────────────────────────────────
//  地形、水岸、步道、植被、路灯、长椅、花坛、游客人群
// ─────────────────────────────────────────────────────────────
import * as THREE from 'three';
import * as U from './util.js';
import { makeFbm, rng } from './materials.js';

const { V } = U;
export const WATER = -1.0;
const smooth = (e0, e1, x) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };

const nA = makeFbm(901, 4, 5), nB = makeFbm(907, 3, 4), nC = makeFbm(911, 8, 3);
const n2 = (f, x, z, s) => f(((x * s) % 1 + 1) % 1, ((z * s) % 1 + 1) % 1);

export function shoreZ(x) { return 82 + 10 * Math.sin(x * 0.02) + 6 * Math.sin(x * 0.051 + 1); }

// 广场超椭圆归一化半径
export function plazaR(x, z) { const a = Math.abs(x) / 34, b = Math.abs(z) / 26; return Math.pow(a ** 3 + b ** 3, 1 / 3); }

/**
 * 《八十天环游地球》环园铁路的控制点（闭合）。
 * 北线从正门前经过，东线绕过机器长廊，南线沿海滨长廊内侧，西线绕过旋转木马。
 */
export function railRoute() {
  const P = [];
  for (const [x, z] of [[-100, -68], [-60, -75], [0, -76], [60, -74], [112, -70], [138, -50], [148, -5], [144, 40]]) P.push(V(x, 0, z));
  for (let x = 125; x >= -100; x -= 25) P.push(V(x, 0, shoreZ(x) - 20));
  for (const [x, z] of [[-118, 40], [-121, 0], [-116, -40]]) P.push(V(x, 0, z));
  return P;
}
let _railSamples = null;
export function railSamples() {
  if (!_railSamples) {
    const c = new THREE.CatmullRomCurve3(railRoute(), true, 'centripetal');
    _railSamples = c.getSpacedPoints(240);
  }
  return _railSamples;
}

function segDist(px, pz, a, b) {
  const dx = b.x - a.x, dz = b.z - a.z;
  const t = Math.max(0, Math.min(1, ((px - a.x) * dx + (pz - a.z) * dz) / (dx * dx + dz * dz)));
  return Math.hypot(px - (a.x + dx * t), pz - (a.z + dz * t));
}

export class World {
  constructor(layout) {
    this.layout = layout; // { flats:[{x,z,r}], paths:[[V,V,...]] }
  }
  pathDist(x, z) {
    let d = 1e9;
    for (const p of this.layout.paths) for (let i = 0; i < p.length - 1; i++) d = Math.min(d, segDist(x, z, p[i], p[i + 1]));
    return d;
  }
  railDist(x, z) {
    const s = railSamples();
    let d = 1e9;
    for (let i = 0; i < s.length - 1; i++) {
      const a = s[i];
      if (Math.abs(a.x - x) > 30 || Math.abs(a.z - z) > 30) continue;
      d = Math.min(d, segDist(x, z, a, s[i + 1]));
    }
    return d;
  }
  // 地形高度（不含铺装凸起）
  heightAt(x, z) {
    let h = (n2(nA, x, z, 0.004) - 0.5) * 3.0;
    const r = Math.hypot(x, z * 0.95);
    const hills = smooth(200, 460, r) * (22 + 70 * n2(nB, x + 500, z + 500, 0.0016));
    h += hills;
    const d = z - shoreZ(x);
    const sea = smooth(-6, 26, d);
    h = h * (1 - sea) + -10 * sea;
    let flat = 0;
    for (const f of this.layout.flats) { const dd = Math.hypot(x - f.x, z - f.z); flat = Math.max(flat, 1 - smooth(f.r, f.r + 14, dd)); }
    const pd = this.pathDist(x, z);
    flat = Math.max(flat, 1 - smooth(4, 12, pd));
    flat = Math.max(flat, 1 - smooth(5, 16, this.railDist(x, z)));
    if (plazaR(x, z) < 1.45) flat = 1;
    else flat = Math.max(flat, 1 - smooth(1.45, 1.9, plazaR(x, z)));
    if (d > -2) flat *= 1 - smooth(-2, 6, d); // 海岸边不强行压平
    h = h * (1 - flat) + 0 * flat;
    return h;
  }
  // 铺装权重（广场 & 步道）
  pavingAt(x, z) {
    const pr = plazaR(x, z);
    let w = 0;
    if (pr > 0.62 && pr < 1.3) w = 1 - smooth(1.22, 1.3, pr) - (1 - smooth(0.62, 0.68, pr));
    const rc = Math.hypot(x, z); if (rc < 13) w = Math.max(w, 1 - smooth(12, 13, rc));
    const pd = this.pathDist(x, z);
    w = Math.max(w, 1 - smooth(2.8, 3.4, pd));
    for (const f of this.layout.paved || []) { const dd = Math.hypot(x - f.x, z - f.z); w = Math.max(w, 1 - smooth(f.r - 0.6, f.r, dd)); }
    return Math.max(0, Math.min(1, w));
  }

  buildTerrain(M) {
    const SIZE = 1400, SEG = 350;
    const geo = new THREE.PlaneGeometry(SIZE, SIZE, SEG, SEG);
    geo.rotateX(-Math.PI / 2);
    const pa = geo.attributes.position;
    const splat = new Float32Array(pa.count * 4);
    const tint = new Float32Array(pa.count * 3);
    for (let i = 0; i < pa.count; i++) {
      const x = pa.getX(i), z = pa.getZ(i);
      const h = this.heightAt(x, z);
      pa.setY(i, h);
    }
    geo.computeVertexNormals();
    const nrm = geo.attributes.normal;
    for (let i = 0; i < pa.count; i++) {
      const x = pa.getX(i), z = pa.getZ(i), h = pa.getY(i);
      const slope = 1 - nrm.getY(i);
      let pave = this.pavingAt(x, z);
      let rock = smooth(0.12, 0.3, slope) + smooth(40, 70, h) * 0.6;
      let sand = 1 - smooth(WATER + 0.15, WATER + 0.85, h);
      const dsh = z - shoreZ(x);
      if (dsh > -16) sand = Math.max(sand, smooth(-16, -6, dsh) * (1 - pave));
      rock = Math.min(1, rock) * (1 - pave);
      sand = Math.min(1, sand) * (1 - pave) * (1 - rock);
      const grass = Math.max(0, 1 - pave - rock - sand);
      splat.set([grass, sand, rock, pave], i * 4);
      const v = n2(nC, x, z, 0.01);
      tint.set([0.9 + v * 0.2, 0.92 + v * 0.16, 0.85 + v * 0.2], i * 3);
    }
    geo.setAttribute('splat', new THREE.BufferAttribute(splat, 4));
    geo.setAttribute('tint', new THREE.BufferAttribute(tint, 3));
    const T = M._textures;
    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.92, metalness: 0 });
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.tGrass = { value: T.grass.map };
      sh.uniforms.tSand = { value: T.sand.map };
      sh.uniforms.tRock = { value: T.rock.map };
      sh.uniforms.tPave = { value: T.cobbles.map };
      sh.uniforms.tDirt = { value: T.dirt.map };
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nattribute vec4 splat;\nattribute vec3 tint;\nvarying vec4 vSplat;\nvarying vec3 vTint;\nvarying vec2 vW;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSplat = splat; vTint = tint; vW = (modelMatrix * vec4(position,1.0)).xz;');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform sampler2D tGrass, tSand, tRock, tPave, tDirt;\nvarying vec4 vSplat;\nvarying vec3 vTint;\nvarying vec2 vW;')
        .replace('#include <map_fragment>', `
          vec2 uvA = vW * 0.11; vec2 uvB = vW * 0.023;
          vec3 g = mix(texture2D(tGrass, uvA).rgb, texture2D(tGrass, uvB).rgb, 0.45);
          float dn = texture2D(tDirt, vW * 0.006).g;
          g = mix(g, texture2D(tDirt, uvA).rgb * 0.8, smoothstep(0.5, 0.62, dn) * 0.35);
          vec3 s = mix(texture2D(tSand, uvA).rgb, texture2D(tSand, uvB).rgb, 0.4);
          vec3 r = mix(texture2D(tRock, vW * 0.05).rgb, texture2D(tRock, uvB).rgb, 0.4);
          vec3 p = texture2D(tPave, vW * 0.32).rgb;
          vec4 w = vSplat / max(0.001, dot(vSplat, vec4(1.0)));
          diffuseColor.rgb *= (g * w.x + s * w.y + r * w.z + p * w.w) * vTint * 1.15;
        `)
        .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.78, vSplat.w);');
    };
    const terrain = new THREE.Mesh(geo, mat);
    terrain.receiveShadow = true;
    terrain.name = 'terrain';
    return terrain;
  }

  // ---------- 植被 ----------
  buildTrees(M, count = 340, seed = 5) {
    const g = new THREE.Group();
    const r = rng(seed);
    let placed = 0, tries = 0;
    while (placed < count && tries < count * 30) {
      tries++;
      const a = r() * Math.PI * 2, d = 55 + Math.pow(r(), 0.8) * 330;
      const x = Math.cos(a) * d, z = Math.sin(a) * d;
      const h = this.heightAt(x, z);
      if (h < WATER + 1.2 || h > 45) continue;
      if (this.pathDist(x, z) < 7.5) continue;
      if (this.railDist(x, z) < 8) continue;
      if (plazaR(x, z) < 1.55) continue;
      let bad = false;
      for (const f of this.layout.flats) if (Math.hypot(x - f.x, z - f.z) < f.r + 5) { bad = true; break; }
      if (bad) continue;
      const kind = h > 12 || r() < 0.3 ? 1 : 0;
      const t = U.tree(M, Math.floor(r() * 1e6), kind);
      t.position.set(x, h - 0.2, z);
      t.rotation.y = r() * 6.28; t.scale.setScalar(0.8 + r() * 0.6);
      g.add(t); placed++;
    }
    // 广场内的修剪球形树（种在花盆中）
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * Math.PI * 2 + 0.1;
      const x = Math.cos(a) * 34 * 0.5, z = Math.sin(a) * 26 * 0.5;
      const t = U.tree(M, 77 + k, 2); t.position.set(x, 0, z); t.scale.setScalar(0.9); g.add(t);
    }
    return U.mergeStatic(g);
  }

  // ---------- 路灯、长椅、花坛 ----------
  buildFurniture(M) {
    const g = new THREE.Group();
    this.lampSpots = [];
    const addLamp = (l) => { g.add(l); this.lampSpots.push(l.position.clone()); };
    // 广场外环与内环的路灯
    for (let k = 0; k < 28; k++) {
      const a = (k / 28) * Math.PI * 2;
      const c = Math.cos(a), s = Math.sin(a);
      const k3 = 1 / Math.pow(Math.abs(c) ** 3 + Math.abs(s) ** 3, 1 / 3);
      const x = c * 34 * k3 * 1.27, z = s * 26 * k3 * 1.27;
      if (Math.abs(z) < 7 && x > 0) continue; // 让出登象塔
      const l = U.lampPost(M, { h: 4.4, arms: 2 }); l.position.set(x, 0, z); addLamp(l);
    }
    // 步道路灯
    for (const p of this.layout.paths) {
      for (let i = 0; i < p.length - 1; i++) {
        const a = p[i], b = p[i + 1];
        const len = a.distanceTo(b);
        const n = Math.floor(len / 16);
        const dir = b.clone().sub(a).normalize();
        const side = V(-dir.z, 0, dir.x);
        for (let k = 1; k <= n; k++) {
          const q = a.clone().lerp(b, k / (n + 1)).addScaledVector(side, (k % 2 ? 1 : -1) * 3.6);
          const l = U.lampPost(M, { h: 3.8, arms: 1 }); l.position.set(q.x, this.heightAt(q.x, q.z), q.z); addLamp(l);
          if (k % 2 === 0) { const bn = bench(M); bn.position.copy(q).addScaledVector(side, 0.0).setY(this.heightAt(q.x, q.z)); bn.position.addScaledVector(dir, 2.5); bn.rotation.y = Math.atan2(side.x, side.z) + Math.PI; g.add(bn); }
        }
      }
    }
    // 广场长椅（面向内）
    for (let k = 0; k < 20; k++) {
      const a = (k / 20) * Math.PI * 2 + 0.16;
      const c = Math.cos(a), s = Math.sin(a);
      const k3 = 1 / Math.pow(Math.abs(c) ** 3 + Math.abs(s) ** 3, 1 / 3);
      const x = c * 34 * k3 * 0.6, z = s * 26 * k3 * 0.6;
      const b = bench(M); b.position.set(x, 0, z); b.rotation.y = Math.atan2(-x, -z); g.add(b);
    }
    return U.mergeStatic(g);
  }

  // 夜间路灯在地面投下的暖色光池（加色贴花）
  buildLightPools(extra = []) {
    const cv = document.createElement('canvas'); cv.width = cv.height = 128;
    const cx = cv.getContext('2d');
    const gr = cx.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, 'rgba(255,190,110,1)'); gr.addColorStop(0.35, 'rgba(255,160,80,0.45)'); gr.addColorStop(1, 'rgba(255,140,60,0)');
    cx.fillStyle = gr; cx.fillRect(0, 0, 128, 128);
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, fog: false });
    const geo = new THREE.PlaneGeometry(1, 1); geo.rotateX(-Math.PI / 2);
    const spots = [...this.lampSpots, ...extra];
    const im = new THREE.InstancedMesh(geo, mat, spots.length);
    const d = new THREE.Object3D();
    spots.forEach((p, i) => { d.position.set(p.x, (p.y || 0) + 0.06, p.z); d.scale.setScalar(p.r || 11); d.updateMatrix(); im.setMatrixAt(i, d.matrix); });
    im.renderOrder = 2; im.frustumCulled = false;
    return im;
  }

  buildFlowers(M) {
    const r = rng(77);
    const cols = [0xc8324a, 0xf2c14e, 0xf7f0e0, 0x8e5bbf, 0xe8702a, 0xd96aa0];
    const N = 3200;
    const geo = new THREE.IcosahedronGeometry(0.13, 0);
    const im = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ roughness: 0.8 }), N);
    const leaf = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.22, 0), new THREE.MeshStandardMaterial({ color: 0x3f6a2c, roughness: 0.9, flatShading: true }), N);
    const d = new THREE.Object3D(); const c = new THREE.Color();
    let i = 0;
    // 内环花坛：位于草环中
    while (i < N) {
      const a = r() * Math.PI * 2;
      const rr = 0.36 + r() * 0.22;
      const cc = Math.cos(a), ss = Math.sin(a);
      const k3 = 1 / Math.pow(Math.abs(cc) ** 3 + Math.abs(ss) ** 3, 1 / 3);
      const x = cc * 34 * k3 * rr, z = ss * 26 * k3 * rr;
      if (Math.hypot(x, z) < 13.5) continue;
      // 花坛呈扇形分块
      const sector = Math.floor((a / (Math.PI * 2)) * 12);
      if (((a / (Math.PI * 2)) * 12) % 1 < 0.12) continue;
      d.position.set(x, 0.12 + r() * 0.1, z); d.rotation.set(r() * 3, r() * 3, 0); d.scale.setScalar(0.7 + r() * 0.7); d.updateMatrix();
      im.setMatrixAt(i, d.matrix); c.setHex(cols[(sector + (r() < 0.2 ? 1 : 0)) % cols.length]); im.setColorAt(i, c);
      d.position.y = 0.05; d.scale.setScalar(0.9 + r() * 0.6); d.updateMatrix(); leaf.setMatrixAt(i, d.matrix);
      i++;
    }
    im.castShadow = false; im.receiveShadow = true; leaf.receiveShadow = true;
    const g = new THREE.Group(); g.add(im, leaf);
    // 花坛石边
    for (const rr of [0.35, 0.59]) {
      const pts = [];
      for (let k = 0; k <= 96; k++) { const a = (k / 96) * Math.PI * 2; const cc = Math.cos(a), ss = Math.sin(a); const k3 = 1 / Math.pow(Math.abs(cc) ** 3 + Math.abs(ss) ** 3, 1 / 3); pts.push(V(cc * 34 * k3 * rr, 0.12, ss * 26 * k3 * rr)); }
      g.add(U.tube(pts, 0.16, M.stone, true, 200, 6));
    }
    return g;
  }
}

function bench(M) {
  const g = new THREE.Group();
  for (const x of [-0.75, 0.75]) {
    g.add(U.box(0.08, 0.45, 0.5, M.paintBlack, x, 0.22, 0));
    g.add(U.box(0.08, 0.5, 0.06, M.paintBlack, x, 0.7, -0.25).rotateX(-0.2));
    g.add(U.torus(0.12, 0.02, M.paintBlack, x, 0.55, 0.25, 4, 10, Math.PI));
  }
  for (let k = 0; k < 4; k++) g.add(U.box(1.8, 0.04, 0.1, M.woodDark, 0, 0.46, -0.18 + k * 0.12));
  for (let k = 0; k < 3; k++) g.add(U.box(1.8, 0.1, 0.03, M.woodDark, 0, 0.6 + k * 0.13, -0.27 - k * 0.025));
  return g;
}

// ---------- 漫步游客 ----------
export class Crowd {
  constructor(world, count = 40, seed = 3) {
    this.group = new THREE.Group();
    this.people = [];
    const r = rng(seed);
    const routes = [];
    // 广场环线（走在铺装环内侧）
    const ring = [];
    for (let k = 0; k <= 64; k++) { const a = (k / 64) * Math.PI * 2; const c = Math.cos(a), s = Math.sin(a); const k3 = 1 / Math.pow(Math.abs(c) ** 3 + Math.abs(s) ** 3, 1 / 3); ring.push(V(c * 34 * k3 * 1.18, 0, s * 26 * k3 * 1.18)); }
    routes.push({ pts: ring, loop: true });
    for (const p of world.layout.paths) routes.push({ pts: p, loop: false });
    for (let i = 0; i < count; i++) {
      const p = U.person(9000 + i, { child: r() < 0.15 });
      // 合并躯干（保留四肢动画）
      p.userData.legs.forEach((l) => (l.userData.dynamic = true));
      p.userData.arms.forEach((a) => (a.userData.dynamic = true));
      U.mergeStatic(p);
      for (const l of p.userData.legs) U.mergeStatic(l);
      for (const a of p.userData.arms) U.mergeStatic(a);
      const route = routes[i < count * 0.4 ? 0 : 1 + Math.floor(r() * (routes.length - 1))];
      const curve = new THREE.CatmullRomCurve3(route.pts, route.loop, 'centripetal');
      const len = curve.getLength();
      this.people.push({ p, curve, len, s: r() * len, dir: r() < 0.5 ? 1 : -1, speed: 1.0 + r() * 0.5, lane: (r() - 0.5) * 3.2, loop: route.loop });
      this.group.add(p);
    }
    this.world = world;
  }
  update(t, dt) {
    for (const w of this.people) {
      w.s += w.dir * w.speed * dt;
      if (!w.loop) { if (w.s > w.len - 1) { w.s = w.len - 1; w.dir = -1; } if (w.s < 1) { w.s = 1; w.dir = 1; } }
      const u = ((w.s % w.len) + w.len) % w.len / w.len;
      const pt = w.curve.getPointAt(u), tg = w.curve.getTangentAt(u);
      const side = V(-tg.z, 0, tg.x);
      const x = pt.x + side.x * w.lane, z = pt.z + side.z * w.lane;
      w.p.position.set(x, this.world.heightAt(x, z), z);
      w.p.rotation.y = Math.atan2(tg.x * w.dir, tg.z * w.dir);
      U.animatePerson(w.p, t, w.speed);
    }
  }
}

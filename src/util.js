// ─────────────────────────────────────────────────────────────
//  建模工具箱：管件、齿轮、栏杆、桁架、灯具、游客……
// ─────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { rng } from './materials.js';

const _up = new THREE.Vector3(0, 1, 0);
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
export { V };

export function mesh(geo, mat, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = true; m.receiveShadow = true;
  return m;
}

export function box(w, h, d, mat, x = 0, y = 0, z = 0) { return mesh(new THREE.BoxGeometry(w, h, d), mat, x, y, z); }
export function cyl(rt, rb, h, mat, x = 0, y = 0, z = 0, seg = 24, open = false) { return mesh(new THREE.CylinderGeometry(rt, rb, h, seg, 1, open), mat, x, y, z); }
export function sphere(r, mat, x = 0, y = 0, z = 0, ws = 24, hs = 16) { return mesh(new THREE.SphereGeometry(r, ws, hs), mat, x, y, z); }
export function torus(r, tube, mat, x = 0, y = 0, z = 0, rs = 12, ts = 48, arc = Math.PI * 2) { return mesh(new THREE.TorusGeometry(r, tube, rs, ts, arc), mat, x, y, z); }

/** 两点之间的圆柱（杆、管、支撑） */
export function rod(a, b, r, mat, seg = 10, rEnd = null) {
  const dir = new THREE.Vector3().subVectors(b, a);
  const len = dir.length();
  const g = new THREE.CylinderGeometry(rEnd ?? r, r, len, seg, 1);
  const m = mesh(g, mat);
  m.position.copy(a).addScaledVector(dir, 0.5);
  m.quaternion.setFromUnitVectors(_up, dir.normalize());
  return m;
}

/** 让已存在的 rod 网格重新对准两点（用于活塞等动画部件） */
export function aimRod(m, a, b) {
  const dir = new THREE.Vector3().subVectors(b, a);
  const len = dir.length();
  m.position.copy(a).addScaledVector(dir, 0.5);
  m.quaternion.setFromUnitVectors(_up, dir.normalize());
  m.scale.set(1, len / (m.userData.baseLen || len), 1);
  return m;
}

/** 车床旋转体：profile = [[r, y], ...] */
export function lathe(profile, mat, seg = 48, phiStart = 0, phiLen = Math.PI * 2) {
  const pts = profile.map(([r, y]) => new THREE.Vector2(Math.max(r, 0.0001), y));
  return mesh(new THREE.LatheGeometry(pts, seg, phiStart, phiLen), mat);
}

/** 沿路径的圆管 */
export function tube(points, r, mat, closed = false, seg = 64, radial = 8, tension = 0.5) {
  const curve = new THREE.CatmullRomCurve3(points, closed, 'catmullrom', tension);
  return mesh(new THREE.TubeGeometry(curve, seg, r, radial, closed), mat);
}

/** 齿轮：可选辐条 */
export function gear({ radius = 1, teeth = 16, depth = 0.15, thickness = 0.2, hole = 0.15, spokes = 5, rim = 0.18 } = {}, mat) {
  const s = new THREE.Shape();
  const n = teeth * 4;
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 2;
    const ph = i % 4;
    const r = ph === 1 || ph === 2 ? radius + depth : radius;
    const x = Math.cos(a) * r, y = Math.sin(a) * r;
    if (i === 0) s.moveTo(x, y); else s.lineTo(x, y);
  }
  if (spokes > 0) {
    const inner = radius - rim;
    const hub = Math.max(hole * 2.2, radius * 0.22);
    for (let k = 0; k < spokes; k++) {
      const a0 = (k / spokes) * Math.PI * 2, a1 = ((k + 1) / spokes) * Math.PI * 2;
      const sw = Math.min(0.5 / spokes * Math.PI, 0.35);
      const h = new THREE.Path();
      const steps = 10;
      for (let j = 0; j <= steps; j++) { const a = a0 + sw + (a1 - a0 - 2 * sw) * (j / steps); const p = [Math.cos(a) * inner, Math.sin(a) * inner]; if (j === 0) h.moveTo(...p); else h.lineTo(...p); }
      for (let j = steps; j >= 0; j--) { const a = a0 + sw * 1.6 + (a1 - a0 - 3.2 * sw) * (j / steps); h.lineTo(Math.cos(a) * hub, Math.sin(a) * hub); }
      s.holes.push(h);
    }
  }
  const hp = new THREE.Path(); hp.absarc(0, 0, hole, 0, Math.PI * 2, true); s.holes.push(hp);
  const g = new THREE.ExtrudeGeometry(s, { depth: thickness, bevelEnabled: true, bevelSize: thickness * 0.12, bevelThickness: thickness * 0.12, bevelSegments: 1, curveSegments: 4 });
  g.translate(0, 0, -thickness / 2);
  return mesh(g, mat);
}

/** 环形铆钉（InstancedMesh）；沿 XZ 平面的圆周 */
export function rivetRing(radius, count, size, mat, y = 0) {
  const g = new THREE.SphereGeometry(size, 6, 4, 0, Math.PI * 2, 0, Math.PI / 2);
  const im = new THREE.InstancedMesh(g, mat, count);
  const d = new THREE.Object3D();
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2;
    d.position.set(Math.cos(a) * radius, y, Math.sin(a) * radius);
    d.lookAt(Math.cos(a) * radius * 2, y, Math.sin(a) * radius * 2);
    d.rotateX(Math.PI / 2);
    d.updateMatrix();
    im.setMatrixAt(i, d.matrix);
  }
  im.castShadow = true;
  return im;
}

/** 沿任意点集放置的铆钉（法线方向朝外） */
export function rivetsAt(points, normals, size, mat) {
  const g = new THREE.SphereGeometry(size, 6, 4, 0, Math.PI * 2, 0, Math.PI / 2);
  const im = new THREE.InstancedMesh(g, mat, points.length);
  const q = new THREE.Quaternion(), s = new THREE.Vector3(1, 1, 1), m4 = new THREE.Matrix4();
  points.forEach((p, i) => { q.setFromUnitVectors(_up, normals[i].clone().normalize()); m4.compose(p, q, s); im.setMatrixAt(i, m4); });
  return im;
}

/** 栏杆：points 为折线（世界局部坐标），含扶手、中横杆、立柱、栏杆柱 */
export function railing(points, { height = 1.05, postEvery = 1.6, baluster = 0.14, mat, postMat, closed = false, rail = 0.035, ornate = false } = {}) {
  const g = new THREE.Group();
  const pts = closed ? [...points, points[0]] : points;
  const pm = postMat || mat;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    const up = V(0, height, 0);
    g.add(rod(a.clone().add(up), b.clone().add(up), rail, mat, 8));
    g.add(rod(a.clone().add(V(0, height * 0.5, 0)), b.clone().add(V(0, height * 0.5, 0)), rail * 0.6, mat, 6));
    g.add(rod(a.clone().add(V(0, 0.08, 0)), b.clone().add(V(0, 0.08, 0)), rail * 0.6, mat, 6));
    const len = a.distanceTo(b);
    const nPost = Math.max(1, Math.round(len / postEvery));
    for (let k = 0; k <= nPost; k++) {
      if (k === nPost && i < pts.length - 2) continue;
      const p = a.clone().lerp(b, k / nPost);
      g.add(rod(p, p.clone().add(V(0, height + 0.04, 0)), rail * 1.4, pm, 8));
      if (ornate) g.add(sphere(rail * 2.4, pm, p.x, p.y + height + 0.06, p.z, 8, 6));
    }
    if (baluster > 0) {
      const nb = Math.max(1, Math.round(len / baluster));
      for (let k = 1; k < nb; k++) {
        const p = a.clone().lerp(b, k / nb);
        g.add(rod(p.clone().add(V(0, 0.08, 0)), p.clone().add(V(0, height, 0)), rail * 0.35, mat, 5));
      }
    }
  }
  return g;
}

/** 圆形栏杆 */
export function ringRailing(radius, y, opts = {}, segments = 48, arcStart = 0, arc = Math.PI * 2) {
  const pts = [];
  const closed = Math.abs(arc - Math.PI * 2) < 1e-4;
  const n = closed ? segments : segments + 1;
  for (let i = 0; i < n; i++) { const a = arcStart + (i / segments) * arc; pts.push(V(Math.cos(a) * radius, y, Math.sin(a) * radius)); }
  return railing(pts, { ...opts, closed });
}

/** 平面桁架梁：两根弦杆 + 斜腹杆（a→b 方向，宽度方向由 side 指定） */
export function truss(a, b, width, mat, { side = V(0, 1, 0), r = 0.06, bays = null, threeD = false } = {}) {
  const g = new THREE.Group();
  const dir = new THREE.Vector3().subVectors(b, a);
  const len = dir.length();
  const n = bays || Math.max(2, Math.round(len / width));
  const off = side.clone().normalize().multiplyScalar(width / 2);
  const a1 = a.clone().add(off), a2 = a.clone().sub(off), b1 = b.clone().add(off), b2 = b.clone().sub(off);
  g.add(rod(a1, b1, r, mat, 8)); g.add(rod(a2, b2, r, mat, 8));
  let side2 = null;
  if (threeD) {
    side2 = new THREE.Vector3().crossVectors(dir, side).normalize().multiplyScalar(width / 2);
  }
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const p1 = a1.clone().lerp(b1, t), p2 = a2.clone().lerp(b2, t);
    g.add(rod(p1, p2, r * 0.6, mat, 6));
    if (i < n) {
      const q1 = a1.clone().lerp(b1, (i + 1) / n), q2 = a2.clone().lerp(b2, (i + 1) / n);
      g.add(rod(i % 2 ? p1 : p2, i % 2 ? q2 : q1, r * 0.55, mat, 6));
    }
  }
  if (threeD) {
    const c1 = a.clone().add(side2), c2 = b.clone().add(side2);
    g.add(rod(c1, c2, r, mat, 8));
    for (let i = 0; i <= n; i++) {
      const t = i / n; const pc = c1.clone().lerp(c2, t);
      g.add(rod(pc, a1.clone().lerp(b1, t), r * 0.5, mat, 6));
      g.add(rod(pc, a2.clone().lerp(b2, t), r * 0.5, mat, 6));
    }
  }
  return g;
}

/** 维多利亚风格灯笼（发光玻璃 + 铁框 + 顶帽） */
export function lantern(M, s = 1) {
  const g = new THREE.Group();
  const frame = M.paintBlack;
  g.add(cyl(0.12 * s, 0.16 * s, 0.06 * s, frame, 0, 0, 0, 8));
  const glass = cyl(0.16 * s, 0.11 * s, 0.42 * s, M.glowWarm, 0, 0.25 * s, 0, 6);
  glass.castShadow = false;
  g.add(glass);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
    g.add(rod(V(Math.cos(a) * 0.115 * s, 0.03 * s, Math.sin(a) * 0.115 * s), V(Math.cos(a) * 0.165 * s, 0.47 * s, Math.sin(a) * 0.165 * s), 0.012 * s, frame, 4));
  }
  g.add(cyl(0.04 * s, 0.24 * s, 0.14 * s, frame, 0, 0.53 * s, 0, 6));
  g.add(cyl(0.02 * s, 0.05 * s, 0.1 * s, frame, 0, 0.64 * s, 0, 6));
  g.add(sphere(0.035 * s, M.brass, 0, 0.71 * s, 0, 8, 6));
  return g;
}

/** 铸铁路灯（双臂/单臂） */
export function lampPost(M, { h = 4.2, arms = 2, s = 1 } = {}) {
  const g = new THREE.Group();
  const iron = M.paintBlack;
  // 基座 + 凹槽柱身
  g.add(lathe([[0.3, 0], [0.3, 0.1], [0.24, 0.16], [0.22, 0.45], [0.16, 0.52], [0.12, 0.62], [0.09, 0.66]].map(([r, y]) => [r * s, y * s]), iron, 12));
  const shaft = cyl(0.055 * s, 0.075 * s, h - 0.66 * s, iron, 0, (0.66 * s + h) / 2, 0, 10);
  g.add(shaft);
  g.add(torus(0.08 * s, 0.025 * s, M.brass, 0, h * 0.55, 0, 6, 16)).rotation;
  g.children[g.children.length - 1].rotation.x = Math.PI / 2;
  g.add(sphere(0.09 * s, iron, 0, h, 0, 10, 8));
  if (arms === 1 || arms === 0) {
    const l = lantern(M, s); l.position.set(0, h + 0.05, 0); g.add(l);
  } else {
    for (let i = 0; i < arms; i++) {
      const a = (i / arms) * Math.PI * 2;
      const cx = Math.cos(a), cz = Math.sin(a);
      const arm = tube([V(0, h - 0.1, 0), V(cx * 0.35 * s, h + 0.1, cz * 0.35 * s), V(cx * 0.6 * s, h + 0.02, cz * 0.6 * s), V(cx * 0.62 * s, h - 0.15, cz * 0.62 * s)], 0.025 * s, iron, false, 16, 6);
      g.add(arm);
      // 卷曲装饰
      g.add(torus(0.08 * s, 0.012 * s, iron, cx * 0.25 * s, h - 0.12, cz * 0.25 * s, 4, 12, Math.PI * 1.5));
      g.children[g.children.length - 1].rotation.y = -a;
      const l = lantern(M, s * 0.9);
      l.position.set(cx * 0.62 * s, h - 0.8 * s, cz * 0.62 * s);
      l.scale.y = 1;
      g.add(l);
    }
    const top = lantern(M, s * 0.7); top.position.set(0, h + 0.08, 0); g.add(top);
  }
  return g;
}

const SKIN = [0xf1c9a5, 0xd9a47c, 0xa8724f, 0x7a4b31, 0xe8b996];
const CLOTH = [0x7a1f1f, 0x1f3a5f, 0x2f4f2f, 0x6b5a3a, 0x3d2b4f, 0xc9b28a, 0x8a3f20, 0x2b2b2b, 0xe0d6c0, 0x5a6e7a, 0xb04a3a, 0x40607a];
const _matCache = new Map();
function cmat(hex, rough = 0.85) {
  const k = hex + ':' + rough;
  if (!_matCache.has(k)) _matCache.set(k, new THREE.MeshStandardMaterial({ color: hex, roughness: rough }));
  return _matCache.get(k);
}

/** 游客小人（约 1.75m），可选 19 世纪服饰：礼帽、长裙、阳伞 */
export function person(seed = 1, { child = false } = {}) {
  const r = rng(seed * 7919 + 13);
  const pick = (arr) => arr[Math.floor(r() * arr.length)];
  const g = new THREE.Group();
  const sc = child ? 0.62 : 0.92 + r() * 0.14;
  const skin = cmat(pick(SKIN), 0.7);
  const top = cmat(pick(CLOTH)), bottom = cmat(pick(CLOTH)), shoe = cmat(0x1a1410, 0.6);
  const dress = r() < 0.4 && !child;
  const legs = new THREE.Group(); g.add(legs);
  const L = [], A = [];
  if (dress) {
    const skirt = lathe([[0.0, 0.05], [0.32, 0.05], [0.28, 0.3], [0.2, 0.7], [0.15, 0.95], [0.0, 0.97]], bottom, 14);
    g.add(skirt);
  } else {
    for (const sx of [-0.09, 0.09]) {
      const leg = new THREE.Group(); leg.position.set(sx, 0.9, 0);
      leg.add(cyl(0.065, 0.055, 0.84, bottom, 0, -0.44, 0, 8));
      leg.add(box(0.1, 0.06, 0.22, shoe, 0, -0.87, 0.04));
      legs.add(leg); L.push(leg);
    }
  }
  const torso = lathe([[0.0, 0.88], [0.17, 0.9], [0.19, 1.15], [0.2, 1.38], [0.12, 1.46], [0.0, 1.47]], top, 12);
  g.add(torso);
  for (const sx of [-1, 1]) {
    const arm = new THREE.Group(); arm.position.set(sx * 0.22, 1.4, 0);
    const a = cyl(0.045, 0.04, 0.6, top, 0, -0.3, 0, 6); arm.add(a);
    arm.add(sphere(0.045, skin, 0, -0.62, 0, 6, 5));
    arm.rotation.z = sx * 0.1;
    g.add(arm); A.push(arm);
  }
  g.add(cyl(0.05, 0.05, 0.08, skin, 0, 1.5, 0, 6));
  const head = sphere(0.11, skin, 0, 1.63, 0, 12, 10); head.scale.set(1, 1.12, 1); g.add(head);
  const hr = r();
  if (hr < 0.3 && !dress) { // 礼帽
    const hat = cmat(0x161616, 0.5);
    g.add(cyl(0.17, 0.17, 0.015, hat, 0, 1.74, 0, 14));
    g.add(cyl(0.1, 0.105, 0.2, hat, 0, 1.84, 0, 12));
  } else if (hr < 0.55) { // 草帽 / 女式软帽
    const hat = cmat(dress ? pick(CLOTH) : 0xd8c38a, 0.9);
    g.add(cyl(0.2, 0.2, 0.012, hat, 0, 1.73, 0, 16));
    g.add(cyl(0.1, 0.12, 0.08, hat, 0, 1.77, 0, 12));
  } else {
    const hair = cmat([0x2a1a10, 0x5a3a20, 0x8a6a40, 0x1a1a1a, 0xb09070][Math.floor(r() * 5)], 0.9);
    const h = sphere(0.118, hair, 0, 1.66, -0.015, 12, 8, ); h.scale.set(1, 0.9, 1); g.add(h);
  }
  if (dress && r() < 0.5) { // 阳伞
    const um = cmat(pick([0xf0e8d8, 0xd9a0a0, 0xa0b8d9]), 0.9);
    const umb = new THREE.Group();
    umb.add(rod(V(0, 0, 0), V(0, 0.9, 0), 0.01, cmat(0x3a2a1a), 4));
    const can = new THREE.Mesh(new THREE.ConeGeometry(0.45, 0.2, 10, 1, true), um); can.position.y = 0.95; can.material.side = THREE.DoubleSide; umb.add(can);
    umb.position.set(0.24, 1.0, 0.05); umb.rotation.z = -0.15;
    g.add(umb);
  }
  g.scale.setScalar(sc);
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = false; } });
  g.userData.legs = L; g.userData.arms = A; g.userData.phase = r() * 10;
  return g;
}

/** 让小人做行走动画 */
export function animatePerson(p, t, speed = 1) {
  const ph = p.userData.phase + t * 6 * speed;
  const s = Math.sin(ph) * 0.45 * Math.min(speed, 1);
  const L = p.userData.legs, A = p.userData.arms;
  if (L.length) { L[0].rotation.x = s; L[1].rotation.x = -s; }
  if (A.length) { A[0].rotation.x = -s * 0.8; A[1].rotation.x = s * 0.8; }
}

/** 树（三种：圆冠阔叶 / 尖塔松 / 修剪球形） */
export function tree(M, seed = 1, kind = 0) {
  const r = rng(seed * 131 + 7);
  const g = new THREE.Group();
  const h = 4 + r() * 4;
  const leaves = [M.foliage, M.foliage2, M.foliage3][Math.floor(r() * 3)];
  if (kind === 1) {
    g.add(cyl(0.12, 0.25, h * 0.4, M.bark, 0, h * 0.2, 0, 7));
    for (let i = 0; i < 4; i++) {
      const c = new THREE.Mesh(new THREE.ConeGeometry(h * (0.32 - i * 0.06), h * 0.42, 9), M.foliage3);
      c.position.y = h * (0.35 + i * 0.18); c.rotation.y = r() * 3; c.castShadow = true; g.add(c);
    }
  } else if (kind === 2) {
    g.add(cyl(0.1, 0.14, 1.6, M.bark, 0, 0.8, 0, 6));
    const s = sphere(1.3, M.foliage2, 0, 2.4, 0, 10, 8); g.add(s);
    g.add(cyl(0.7, 0.6, 0.6, M.terracotta || M.brick, 0, 0.3, 0, 12));
  } else {
    // 枝干
    const trunk = tube([V(0, 0, 0), V(r() * 0.3 - 0.15, h * 0.35, r() * 0.3 - 0.15), V(r() * 0.4 - 0.2, h * 0.6, 0)], 0.22, M.bark, false, 8, 6);
    g.add(trunk);
    const n = 5 + Math.floor(r() * 4);
    for (let i = 0; i < n; i++) {
      const rr = 1.2 + r() * 1.3;
      const geo = new THREE.IcosahedronGeometry(rr, 1);
      const pos = geo.attributes.position;
      for (let k = 0; k < pos.count; k++) { const f = 0.85 + r() * 0.3; pos.setXYZ(k, pos.getX(k) * f, pos.getY(k) * f, pos.getZ(k) * f); }
      geo.computeVertexNormals();
      const s = mesh(geo, leaves, (r() - 0.5) * 2.6, h * 0.62 + r() * h * 0.35, (r() - 0.5) * 2.6);
      g.add(s);
    }
  }
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return g;
}

/** 文字标牌（Canvas 文字贴图） */
export function signTexture(text, { w = 1024, h = 256, bg = '#1b2a2c', fg = '#e8c675', font = 'bold 120px "Playfair Display", "Times New Roman", serif', border = '#c9a24a', sub = null } = {}) {
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const cx = cv.getContext('2d');
  cx.fillStyle = bg; cx.fillRect(0, 0, w, h);
  cx.strokeStyle = border; cx.lineWidth = h * 0.04; cx.strokeRect(h * 0.06, h * 0.06, w - h * 0.12, h - h * 0.12);
  cx.lineWidth = h * 0.012; cx.strokeRect(h * 0.12, h * 0.12, w - h * 0.24, h - h * 0.24);
  cx.fillStyle = fg; cx.textAlign = 'center'; cx.textBaseline = 'middle';
  cx.font = font;
  cx.fillText(text, w / 2, sub ? h * 0.42 : h / 2);
  if (sub) { cx.font = `italic ${Math.round(h * 0.16)}px "Times New Roman", serif`; cx.fillText(sub, w / 2, h * 0.74); }
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}

export function signBoard(text, width, height, opts = {}) {
  const t = signTexture(text, opts);
  const m = new THREE.MeshStandardMaterial({ map: t, roughness: 0.5, metalness: 0.2 });
  return mesh(new THREE.BoxGeometry(width, height, 0.08), [opts.edge || new THREE.MeshStandardMaterial({ color: 0x3a2a18 }), opts.edge || new THREE.MeshStandardMaterial({ color: 0x3a2a18 }), opts.edge || new THREE.MeshStandardMaterial({ color: 0x3a2a18 }), opts.edge || new THREE.MeshStandardMaterial({ color: 0x3a2a18 }), m, m]);
}

/**
 * 合并静态子树：按材质合并几何以减少 draw call。
 * 带 userData.dynamic 的对象（及其子孙）以及 InstancedMesh 不会被合并。
 */
export function mergeStatic(root) {
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const buckets = new Map();
  const remove = [];
  const visit = (o, dynamic) => {
    const dyn = dynamic || o.userData.dynamic;
    if (!dyn && o.isMesh && !o.isInstancedMesh && !Array.isArray(o.material) && !o.userData.keep) {
      let g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
      for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
      if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
      g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld));
      const key = o.material.uuid + (o.castShadow ? 's' : '');
      if (!buckets.has(key)) buckets.set(key, { mat: o.material, geos: [], cast: o.castShadow });
      buckets.get(key).geos.push(g);
      remove.push(o);
    }
    for (const c of o.children) visit(c, dyn);
  };
  for (const c of root.children) visit(c, false);
  for (const o of remove) o.parent && o.parent.remove(o);
  // 清理空的 Group
  const prune = (o) => { for (const c of [...o.children]) { prune(c); if (c.type === 'Group' && c.children.length === 0 && !c.userData.dynamic) o.remove(c); } };
  prune(root);
  for (const { mat, geos, cast } of buckets.values()) {
    const merged = mergeGeometries(geos, false);
    if (!merged) continue;
    const m = new THREE.Mesh(merged, mat); m.castShadow = cast; m.receiveShadow = true;
    root.add(m);
  }
  return root;
}

/** 对一个 group 内所有 mesh 设置阴影 */
export function shadows(obj, cast = true, receive = true) {
  obj.traverse((o) => { if (o.isMesh) { o.castShadow = cast; o.receiveShadow = receive; } });
  return obj;
}

/** 烟雾/蒸汽粒子系统（简单 billboard 精灵） */
export function makeSteam(count = 30, { color = 0xf2efe8, size = 1.5, rise = 3, spread = 0.6, life = 3, opacity = 0.5 } = {}) {
  const cv = document.createElement('canvas'); cv.width = cv.height = 64;
  const cx = cv.getContext('2d');
  const grd = cx.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(0.4, 'rgba(255,255,255,0.55)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
  cx.fillStyle = grd; cx.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(cv);
  const g = new THREE.Group();
  const parts = [];
  for (let i = 0; i < count; i++) {
    const m = new THREE.SpriteMaterial({ map: tex, color, transparent: true, opacity: 0, depthWrite: false });
    const s = new THREE.Sprite(m);
    s.userData = { t: (i / count) * life, seed: Math.random() * 100, dx: (Math.random() - 0.5) * spread, dz: (Math.random() - 0.5) * spread };
    g.add(s); parts.push(s);
  }
  g.userData.dynamic = true;
  g.userData.update = (dt, intensity = 1, wind = V(0.4, 0, 0.1)) => {
    for (const s of parts) {
      s.userData.t += dt;
      if (s.userData.t > life) { s.userData.t = 0; s.userData.dx = (Math.random() - 0.5) * spread; s.userData.dz = (Math.random() - 0.5) * spread; }
      const k = s.userData.t / life;
      s.position.set(s.userData.dx * (1 + k * 3) + wind.x * k * life, k * rise, s.userData.dz * (1 + k * 3) + wind.z * k * life);
      const sc = size * (0.4 + k * 1.8);
      s.scale.set(sc, sc, sc);
      s.material.opacity = Math.sin(k * Math.PI) * opacity * intensity;
    }
  };
  return g;
}

/** 绕局部 Y 轴均匀复制 */
export function radial(count, fn) {
  const g = new THREE.Group();
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2;
    const o = fn(i, a);
    if (o) g.add(o);
  }
  return g;
}

/** 平滑插值 */
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (e0, e1, x) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };

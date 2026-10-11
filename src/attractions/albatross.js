// ─────────────────────────────────────────────────────────────
//  信天翁号 · Robur le Conquérant (1886)
//  罗布尔的“比空气重”飞行器：30 m 快剪船体、15 根桅杆各顶一对反转升力螺旋桨，
//  艏艉各一副双叶推进桨。船体长轴沿 +X（船艏朝 +X），右舷 = +Z，左舷 = −Z。
//  原点 = 模型包围盒中心（飞行物）。
// ─────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import * as U from '../util.js';

const { V } = U;
const TAU = Math.PI * 2;
const ss = U.smoothstep;
const lerp = U.lerp;

// ═════════════════ 局部几何工具 ═════════════════

/** 统一三角形朝向：toward(centroid) 给出期望法线方向；为 null 时按有符号体积（闭合体外向） */
function orient(geo, toward) {
  const p = geo.attributes.position, idx = geo.index.array;
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  const e1 = new THREE.Vector3(), e2 = new THREE.Vector3(), cen = new THREE.Vector3();
  let s = 0;
  for (let k = 0; k < idx.length; k += 3) {
    a.fromBufferAttribute(p, idx[k]); b.fromBufferAttribute(p, idx[k + 1]); c.fromBufferAttribute(p, idx[k + 2]);
    if (toward) {
      cen.copy(a).add(b).add(c).multiplyScalar(1 / 3);
      e1.subVectors(b, a); e2.subVectors(c, a); e1.cross(e2);
      s += e1.dot(toward(cen));
    } else {
      e1.copy(b).cross(c); s += a.dot(e1);
    }
  }
  if (s < 0) { for (let k = 0; k < idx.length; k += 3) { const t = idx[k + 1]; idx[k + 1] = idx[k + 2]; idx[k + 2] = t; } }
  geo.index.needsUpdate = true;
  return geo;
}

/** 参数网格曲面：fn(i,j) → [x,y,z]，uvFn(i,j,p) → [u,v] */
function gridGeo(nu, nv, fn, uvFn, toward) {
  const pos = [], uv = [], idx = [];
  for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) {
    const p = fn(i, j); pos.push(p[0], p[1], p[2]);
    const t = uvFn ? uvFn(i, j, p) : [i / (nu - 1), j / (nv - 1)]; uv.push(t[0], t[1]);
  }
  for (let i = 0; i < nu - 1; i++) for (let j = 0; j < nv - 1; j++) {
    const a = i * nv + j, b = (i + 1) * nv + j, c = (i + 1) * nv + j + 1, d = i * nv + j + 1;
    idx.push(a, b, d, b, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  orient(g, toward);
  g.computeVertexNormals();
  return g;
}

/** 截面放样（闭合体，两端封口） rings: Vector3[][] */
function loft(rings, uScale = 1, vScale = 1) {
  const ns = rings.length, nk = rings[0].length, row = nk + 1;
  const pos = [], uv = [], idx = [];
  for (let i = 0; i < ns; i++) for (let k = 0; k <= nk; k++) {
    const p = rings[i][k % nk]; pos.push(p.x, p.y, p.z); uv.push((i / (ns - 1)) * uScale, (k / nk) * vScale);
  }
  for (let i = 0; i < ns - 1; i++) for (let k = 0; k < nk; k++) {
    const a = i * row + k, b = (i + 1) * row + k, c = (i + 1) * row + k + 1, d = i * row + k + 1;
    idx.push(a, b, d, b, c, d);
  }
  for (const [ri, end] of [[0, false], [ns - 1, true]]) {
    const cen = new THREE.Vector3(); rings[ri].forEach((p) => cen.add(p)); cen.multiplyScalar(1 / nk);
    const ci = pos.length / 3; pos.push(cen.x, cen.y, cen.z); uv.push((ri / (ns - 1)) * uScale, 0.5 * vScale);
    for (let k = 0; k < nk; k++) { const a = ri * row + k, b = ri * row + k + 1; if (end) idx.push(ci, b, a); else idx.push(ci, a, b); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  orient(g, null);
  g.computeVertexNormals();
  return g;
}

/**
 * 螺旋桨叶（沿 +X 展向、弦向 Z、厚度 Y；绕 Y 轴旋转）。
 * sign = +1 表示 rotation.y 递增方向旋转（前缘在 −Z）。根部为圆柄，渐变为带弯度的翼型，桨尖后掠圆润。
 */
function bladeGeo({ R = 1.35, r0 = 0.08, chord = 0.32, thick = 0.045, pitch = 0.42, twist = 0.24, sign = 1, sweep = 0.1, ns = 18, nk = 14, rootR = 0.03 } = {}) {
  const rings = [];
  for (let i = 0; i <= ns; i++) {
    const t = i / ns;
    const r = r0 + (R - r0) * t;
    const b = ss(0.02, 0.2, t);
    const tip = t > 0.8 ? Math.sqrt(Math.max(0.003, 1 - ((t - 0.8) / 0.2) ** 2)) : 1;
    const c = chord * (0.5 + 0.5 * Math.sin(Math.PI * (0.12 + 0.68 * t))) * tip;
    const th = Math.min(thick * (1 - 0.55 * t) * (0.35 + 0.65 * tip), c * 0.45);
    const ang = -sign * (pitch - twist * t) * b;
    const sw = sign * sweep * R * t * t;
    const ring = [];
    for (let k = 0; k < nk; k++) {
      const a = (k / nk) * TAU, ca = Math.cos(a), sa = Math.sin(a);
      const zA = 0.5 * c * ca, yA = 0.5 * th * sa + 0.05 * c * (1 - ca * ca);
      const zR = rootR * ca, yR = rootR * sa;
      const z0 = zR + (zA - zR) * b, y0 = yR + (yA - yR) * b;
      const z = z0 * Math.cos(ang) - y0 * Math.sin(ang) + sw * b;
      const y = z0 * Math.sin(ang) + y0 * Math.cos(ang);
      ring.push(new THREE.Vector3(r, y, z));
    }
    rings.push(ring);
  }
  return loft(rings, 1.6, 0.6);
}

/** n 叶桨：复制叶片绕 Y 轴 */
function rotorBlades(opts, n = 2) {
  const base = bladeGeo(opts);
  const gs = [];
  for (let i = 0; i < n; i++) { const g = base.clone(); g.rotateY((i / n) * TAU); gs.push(g); }
  return mergeGeometries(gs, false);
}

function latheGeo(profile, seg = 24) {
  return new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(Math.max(r, 0.0001), y)), seg);
}

/** 竖直墙带：pts2 = [[x,z],...]，从 y0 到 y1；toward 决定朝向 */
function wallStrip(pts2, y0, y1, toward, uScale = 1) {
  const n = pts2.length;
  let acc = 0; const us = [0];
  for (let i = 1; i < n; i++) { acc += Math.hypot(pts2[i][0] - pts2[i - 1][0], pts2[i][1] - pts2[i - 1][1]); us.push(acc); }
  return gridGeo(n, 2, (i, j) => [pts2[i][0], j ? y1 : y0, pts2[i][1]], (i, j) => [us[i] / uScale, j ? (y1 - y0) / uScale : 0], toward);
}

function rodSeg(a, b, r, mat, seg = 6) { return U.rod(a, b, r, mat, seg); }
/** 添加子物体并返回子物体（Object3D.add 返回的是父级） */
function put(parent, o) { parent.add(o); return o; }

// ═════════════════ 船体型线 ═════════════════
const HL = 15; // 半船长
const sheer = (x) => (x > 0 ? 0.45 * (x / HL) ** 2 : 0.25 * (x / HL) ** 2);
const G = (x) => 0.4 + sheer(x); // 舷缘（船舷顶）高度
const B = (x) => { // 舷缘处半宽
  const u = Math.min(1, Math.abs(x) / HL);
  return x > 0 ? 2.0 * Math.pow(Math.max(0, 1 - u ** 2.5), 0.8) : 2.0 * Math.pow(Math.max(0, 1 - u ** 5), 0.5);
};
const D = (x) => { // 舷缘到龙骨的深度
  const u = Math.min(1, Math.abs(x) / HL);
  return x > 0 ? 2.4 * Math.pow(Math.max(0, 1 - u ** 4), 1.2) : 2.4 * Math.pow(Math.max(0, 1 - u ** 4), 1.5);
};
const NX = (x) => (x > 0 ? 2.8 - 1.1 * ss(3, 15, x) : 2.8 - 0.5 * ss(-6, -15, x)); // 截面超椭圆指数（艏部更尖 V 形）
const hullZ = (x, w) => { const n = NX(x); return B(x) * Math.pow(Math.max(0, 1 - Math.pow(Math.min(1, w), n)), 1 / n); };
const hullPt = (x, w, side) => [x, G(x) - D(x) * w, side * hullZ(x, w)];
const deckDrop = (x) => Math.min(0.4, 0.75 * D(x));
const deckY = (x) => G(x) - deckDrop(x);
const deckHalf = (x) => { const d = D(x); if (d < 1e-4) return 0; return Math.max(0, hullZ(x, deckDrop(x) / d) - 0.05); };
const outward = (c) => new THREE.Vector3(0, c.y - (G(c.x) - D(c.x) * 0.5), c.z);

function hullNormal(x, w, side) {
  const e = 0.01;
  const wc = Math.min(1 - e, Math.max(e, w));
  const p0 = hullPt(x - e, wc, side), p1 = hullPt(x + e, wc, side);
  const q0 = hullPt(x, wc - e, side), q1 = hullPt(x, wc + e, side);
  const tx = new THREE.Vector3(p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]);
  const tw = new THREE.Vector3(q1[0] - q0[0], q1[1] - q0[1], q1[2] - q0[2]);
  const n = tx.cross(tw).normalize();
  const P = hullPt(x, w, side);
  if (n.dot(outward(new THREE.Vector3(...P))) < 0) n.negate();
  return n;
}

/** 沿船壳的线（w 可随 x 变化），向外偏移 off */
function hullLine(wFn, side, x0, x1, n, off = 0.008) {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const x = lerp(x0, x1, i / n), w = wFn(x);
    const P = new THREE.Vector3(...hullPt(x, w, side));
    pts.push(P.addScaledVector(hullNormal(x, w, side), off));
  }
  return pts;
}

// ═════════════════ 主模块 ═════════════════
export function createAlbatross(M, ctx) {
  const group = new THREE.Group();
  group.name = 'Albatross';
  const ship = new THREE.Group(); // 承载全部内容，做漂浮晃动
  group.add(ship);
  const add = (o) => { ship.add(o); return o; };

  // ———————————————— 船体 ————————————————
  const NS = 170;
  const xs = []; for (let i = 0; i < NS; i++) { const t = i / (NS - 1); xs.push(-HL * Math.cos(Math.PI * t) * 0.9995); }
  const BOOT = 0.62; // 水线漆分界（深度比例）
  const hullUV = (i, j, p) => [p[0] / 4, p[1] / 2];
  // 左右舷深蓝漆面
  for (const side of [-1, 1]) {
    const nv = 14;
    const g = gridGeo(NS, nv, (i, j) => hullPt(xs[i], (BOOT * j) / (nv - 1), side), hullUV, outward);
    add(new THREE.Mesh(g, M.paintNavy));
  }
  // 船底红漆（跨龙骨连续，法线平滑）
  {
    const half = 16, list = [];
    for (let j = 0; j < half; j++) list.push([BOOT + (1 - BOOT) * Math.sin((Math.PI / 2) * (j / (half - 1))), -1]);
    for (let j = half - 2; j >= 0; j--) list.push([BOOT + (1 - BOOT) * Math.sin((Math.PI / 2) * (j / (half - 1))), 1]);
    const g = gridGeo(NS, list.length, (i, j) => hullPt(xs[i], list[j][0], list[j][1]), hullUV, outward);
    add(new THREE.Mesh(g, M.paintRed));
  }
  // 舷墙内侧（奶油色）
  for (const side of [-1, 1]) {
    const g = gridGeo(NS, 5, (i, j) => {
      const x = xs[i], d = D(x); const w = d > 1e-4 ? (deckDrop(x) / d) * (j / 4) : 0;
      const p = hullPt(x, w, side); p[2] -= side * Math.min(0.05, Math.abs(p[2])); return p;
    }, hullUV, () => new THREE.Vector3(0, 0, -side));
    add(new THREE.Mesh(g, M.paintCream));
  }
  // 甲板（柚木条，纹理沿船长方向）
  {
    const g = gridGeo(NS, 11, (i, j) => { const x = xs[i]; return [x, deckY(x), lerp(-1, 1, j / 10) * deckHalf(x)]; },
      (i, j, p) => [p[0] / 6, p[2] / 3], () => new THREE.Vector3(0, 1, 0));
    add(new THREE.Mesh(g, M.deck));
  }
  // 舷缘扶手木（闭合环）
  {
    const pts = [];
    const nn = 60;
    for (let i = 0; i <= nn; i++) { const x = -14.92 + (29.84 * (1 - Math.cos((Math.PI * i) / nn))) / 2; pts.push(V(x, G(x) + 0.025, -Math.max(0.0, B(x) - 0.025))); }
    for (let i = nn; i >= 0; i--) { const x = -14.92 + (29.84 * (1 - Math.cos((Math.PI * i) / nn))) / 2; pts.push(V(x, G(x) + 0.025, Math.max(0.0, B(x) - 0.025))); }
    pts.pop(); pts.shift();
    const curve = new THREE.CatmullRomCurve3(pts, true, 'centripetal');
    add(U.mesh(new THREE.TubeGeometry(curve, 420, 0.07, 8, true), M.woodDark));
  }
  // 金色舷沿饰线、黄铜甲板线、水线黄铜带
  for (const side of [-1, 1]) {
    add(U.tube(hullLine((x) => Math.min(0.5, 0.15 / Math.max(D(x), 0.01)), side, -14.7, 14.85, 120, 0.004), 0.024, M.gold, false, 260, 6));
    add(U.tube(hullLine((x) => Math.min(0.5, 0.43 / Math.max(D(x), 0.01)), side, -14.3, 14.5, 110, 0.004), 0.02, M.brass, false, 180, 5));
    add(U.tube(hullLine(() => BOOT, side, -14.85, 14.92, 130, 0.004), 0.026, M.brass, false, 200, 6));
  }
  // 龙骨 + 艏柱 + 艉柱 黄铜包边
  {
    const pts = []; for (let i = 0; i <= 120; i++) { const x = -14.96 + (29.92 * i) / 120; pts.push(V(x, G(x) - D(x), 0)); }
    add(U.tube(pts, 0.05, M.brass, false, 220, 8));
    // 立体龙骨条（中段略深）
    const kpts = []; for (let i = 0; i <= 40; i++) { const x = lerp(-11, 10, i / 40); const k = Math.sin(Math.PI * (i / 40)) ** 0.6; kpts.push(V(x, G(x) - D(x) - 0.1 * k, 0)); }
    add(U.tube(kpts, 0.07, M.woodDark, false, 120, 8));
  }
  // 舷窗（黄铜圈 + 暖光玻璃）
  {
    const ringGeo = new THREE.TorusGeometry(0.1, 0.022, 6, 18);
    const glassGeo = new THREE.CircleGeometry(0.085, 18);
    const boltGeo = new THREE.SphereGeometry(0.013, 5, 3);
    const z1 = V(0, 0, 1);
    for (const side of [-1, 1]) {
      for (let x = -13.2; x <= 12.01; x += 1.2) {
        const d = D(x), w = Math.min(0.5, 0.64 / d);
        const P = new THREE.Vector3(...hullPt(x, w, side)), N = hullNormal(x, w, side);
        const q = new THREE.Quaternion().setFromUnitVectors(z1, N);
        const r = new THREE.Mesh(ringGeo, M.brass); r.position.copy(P).addScaledVector(N, 0.006); r.quaternion.copy(q); add(r);
        const gl = new THREE.Mesh(glassGeo, M.glowWindow); gl.position.copy(P).addScaledVector(N, 0.012); gl.quaternion.copy(q); add(gl);
        for (let k = 0; k < 4; k++) {
          const a = (k / 4) * TAU + Math.PI / 4; const o = V(Math.cos(a) * 0.145, Math.sin(a) * 0.145, 0.004).applyQuaternion(q);
          const bt = new THREE.Mesh(boltGeo, M.brass); bt.position.copy(P).add(o); add(bt);
        }
      }
    }
  }

  // ———————————————— 船艏像：镀金信天翁 ————————————————
  {
    const fh = new THREE.Group();
    const dir = V(Math.cos(0.42), Math.sin(0.42), 0);
    const body = U.sphere(1, M.gold, 14.62, 0.53, 0, 20, 14); body.scale.set(0.42, 0.13, 0.14); body.rotation.z = 0.42; fh.add(body);
    const breast = U.sphere(0.13, M.gold, 14.93, 0.66, 0, 16, 12); breast.scale.set(1.1, 1, 1); fh.add(breast);
    const head = U.sphere(0.105, M.gold, 15.1, 0.76, 0, 16, 12); head.scale.set(1.25, 0.95, 0.9); fh.add(head);
    // 钩状长喙
    const beak = U.rod(V(15.18, 0.75, 0), V(15.47, 0.69, 0), 0.04, M.gold, 10, 0.016); fh.add(beak);
    fh.add(U.sphere(0.026, M.gold, 15.48, 0.675, 0, 10, 8));
    for (const s of [-1, 1]) fh.add(U.sphere(0.02, M.eye, 15.17, 0.79, s * 0.085, 8, 6));
    void dir;
    // 后掠双翼：贴合船艏两侧的立体翼板 + 羽纹
    for (const side of [-1, 1]) {
      const rings = [];
      const nW = 26;
      const wingW = (t) => 0.27 * Math.pow(Math.sin(Math.PI * (0.06 + 0.94 * t)), 0.55) * (1 - 0.15 * t);
      const xAt = (t) => lerp(14.4, 11.6, t);
      const wAt = (t, x) => Math.min(0.8, lerp(0.3, 0.5, t) / Math.max(D(x), 0.05)); // 舷缘下恒定深度
      const frames = [];
      for (let i = 0; i <= nW; i++) {
        const t = i / nW, x = xAt(t), w = wAt(t, x);
        const P = new THREE.Vector3(...hullPt(x, w, side)), N = hullNormal(x, w, side);
        const q0 = hullPt(x, Math.max(0, w - 0.02), side), q1 = hullPt(x, w + 0.02, side);
        const Uv = V(q0[0] - q1[0], q0[1] - q1[1], q0[2] - q1[2]).normalize();
        const C = P.clone().addScaledVector(N, 0.035);
        frames.push({ C, N, Uv, wd: wingW(t) });
        const ring = [];
        for (let k = 0; k < 12; k++) {
          const a = (k / 12) * TAU;
          ring.push(C.clone().addScaledVector(Uv, Math.cos(a) * wingW(t) * 0.5).addScaledVector(N, Math.sin(a) * 0.028));
        }
        rings.push(ring);
      }
      fh.add(U.mesh(loft(rings), M.gold));
      // 羽纹（初级飞羽线）
      for (const f of [-0.3, -0.1, 0.1, 0.3]) {
        const pts = [];
        for (let i = 4; i <= nW; i++) { const F = frames[i]; pts.push(F.C.clone().addScaledVector(F.Uv, f * F.wd).addScaledVector(F.N, 0.03)); }
        fh.add(U.tube(pts, 0.008, M.gold, false, 40, 4));
      }
      // 翼根连到胸部
      fh.add(U.rod(V(14.75, 0.6, 0), frames[0].C, 0.06, M.gold, 10, 0.08));
    }
    add(fh);
  }

  // ———————————————— 甲板栏杆（左右舷）————————————————
  for (const side of [-1, 1]) {
    const pts = [];
    const n = 20;
    for (let i = 0; i <= n; i++) {
      const x = -14.1 + (27.9 * (1 - Math.cos((Math.PI * i) / n))) / 2;
      pts.push(V(x, G(x) + 0.06, side * (B(x) - 0.03)));
    }
    add(U.railing(pts, { height: 0.78, postEvery: 1.4, baluster: 0.16, mat: M.paintBlack, postMat: M.brass, rail: 0.025, ornate: true }));
    add(U.tube(pts.map((p) => p.clone().add(V(0, 0.81, 0))), 0.034, M.woodDark, false, 160, 6));
  }

  // ———————————————— 甲板室（客舱 / 机舱）————————————————
  const DH = { x0: -9.6, x1: 6.6, hw: 1.15, h: 2.2, yb: -0.05 };
  const DHc = (DH.x0 + DH.x1) / 2, DHL = DH.x1 - DH.x0;
  const roofTop = (z) => DH.yb + DH.h + 0.08 + 0.12 * (1 - (z / 1.32) ** 2);
  {
    const dh = new THREE.Group();
    // 底座
    dh.add(U.box(DHL + 0.12, 0.2, DH.hw * 2 + 0.12, M.woodDark, DHc, DH.yb + 0.1, 0));
    // 墙体（分段以保持木纹比例）
    const nb = 11, bw = DHL / nb;
    for (let i = 0; i < nb; i++) dh.add(U.box(bw, DH.h, DH.hw * 2, M.wood, DH.x0 + bw * (i + 0.5), DH.yb + DH.h / 2, 0));
    // 檐口
    dh.add(U.box(DHL + 0.14, 0.12, DH.hw * 2 + 0.14, M.woodDark, DHc, DH.yb + DH.h - 0.04, 0));
    dh.add(U.box(DHL + 0.08, 0.05, DH.hw * 2 + 0.08, M.brass, DHc, DH.yb + DH.h - 0.13, 0));
    // 拱窗
    const ww = 0.6, hRect = 0.6, yWin = 0.95;
    const winShape = new THREE.Shape();
    winShape.moveTo(-ww / 2, 0); winShape.lineTo(ww / 2, 0); winShape.lineTo(ww / 2, hRect);
    winShape.absarc(0, hRect, ww / 2, 0, Math.PI, false); winShape.lineTo(-ww / 2, 0);
    const paneGeo = new THREE.ShapeGeometry(winShape, 12);
    for (const side of [-1, 1]) {
      const zf = side * DH.hw;
      for (let k = 0; k < nb; k++) {
        const xc = DH.x0 + bw * (k + 0.5);
        const pane = new THREE.Mesh(paneGeo, M.glowWindow); pane.position.set(xc, yWin, zf + side * 0.004); if (side < 0) pane.rotation.y = Math.PI; dh.add(pane);
        const zo = zf + side * 0.022;
        for (const sx of [-1, 1]) dh.add(U.box(0.045, hRect, 0.045, M.brass, xc + sx * (ww / 2 + 0.022), yWin + hRect / 2, zo));
        const arch = U.torus(ww / 2 + 0.022, 0.024, M.brass, xc, yWin + hRect, zo, 6, 18, Math.PI); dh.add(arch);
        dh.add(U.box(0.012, hRect + ww / 2, 0.012, M.brass, xc, yWin + (hRect + ww / 2) / 2, zf + side * 0.01));
        dh.add(U.box(ww, 0.012, 0.012, M.brass, xc, yWin + hRect * 0.62, zf + side * 0.01));
        dh.add(U.box(ww + 0.16, 0.05, 0.1, M.woodDark, xc, yWin - 0.03, zf + side * 0.04));
        dh.add(U.box(0.07, 0.09, 0.05, M.gold, xc, yWin + hRect + ww / 2 + 0.05, zf + side * 0.03));
        // 窗下凸起镶板
        dh.add(U.box(ww + 0.04, 0.5, 0.03, M.woodDark, xc, 0.42, zf + side * 0.015));
        dh.add(U.box(ww - 0.1, 0.36, 0.02, M.wood, xc, 0.42, zf + side * 0.035));
        // 壁柱
        if (k > 0) dh.add(U.box(0.09, DH.h - 0.3, 0.05, M.woodDark, DH.x0 + bw * k, DH.yb + 0.2 + (DH.h - 0.3) / 2, zf + side * 0.025));
      }
      // 腰线黄铜扶手
      dh.add(U.rod(V(DH.x0 + 0.05, 0.85, zf + side * 0.06), V(DH.x1 - 0.05, 0.85, zf + side * 0.06), 0.018, M.brass, 8));
    }
    // 端墙：门、门楣铭牌、壁灯
    for (const end of [-1, 1]) {
      const xe = end > 0 ? DH.x1 : DH.x0;
      const xo = xe + end * 0.03;
      dh.add(U.box(0.05, 1.7, 0.78, M.woodDark, xo, 0.15 + 0.85, 0));
      for (const yy of [0.55, 1.05]) dh.add(U.box(0.02, 0.38, 0.6, M.wood, xo + end * 0.03, 0.15 + yy, 0));
      const dwin = new THREE.Mesh(new THREE.CircleGeometry(0.13, 16), M.glowWindow); dwin.position.set(xo + end * 0.045, 1.5, 0); dwin.rotation.y = end * Math.PI / 2; dh.add(dwin);
      const dring = U.torus(0.14, 0.02, M.brass, xo + end * 0.05, 1.5, 0, 6, 18); dring.rotation.y = Math.PI / 2; dh.add(dring);
      dh.add(U.sphere(0.035, M.brass, xo + end * 0.07, 0.95, 0.28, 8, 6));
      for (const sz of [-1, 1]) dh.add(U.box(0.06, 1.78, 0.06, M.brass, xo + end * 0.02, 0.15 + 0.89, sz * 0.42));
      dh.add(U.box(0.07, 0.07, 0.94, M.brass, xo + end * 0.02, 1.86, 0));
      // 台阶
      dh.add(U.box(0.35, 0.12, 0.9, M.woodDark, xe + end * 0.2, deckY(xe + end * 0.2) + 0.06, 0));
      // 壁灯
      for (const sz of [-1, 1]) {
        const l = U.lantern(M, 0.55); l.position.set(xe + end * 0.16, 1.3, sz * 0.7); dh.add(l);
        dh.add(U.rod(V(xe, 1.62, sz * 0.7), V(xe + end * 0.16, 1.68, sz * 0.7), 0.012, M.paintBlack, 4));
      }
    }
    // 弧形顶篷（帆布包覆）
    {
      const sh = new THREE.Shape();
      const hwR = DH.hw + 0.17;
      sh.moveTo(-hwR, 0);
      for (let i = 0; i <= 24; i++) { const z = lerp(-hwR, hwR, i / 24); sh.lineTo(z, 0.08 + 0.12 * (1 - (z / 1.32) ** 2)); }
      sh.lineTo(hwR, 0); sh.lineTo(-hwR, 0);
      const rg = new THREE.ExtrudeGeometry(sh, { depth: DHL + 0.34, bevelEnabled: true, bevelSize: 0.02, bevelThickness: 0.02, bevelSegments: 2, curveSegments: 8 });
      rg.rotateY(Math.PI / 2); rg.translate(DH.x0 - 0.17, DH.yb + DH.h, 0);
      dh.add(U.mesh(rg, M.canvas));
      for (const s of [-1, 1]) dh.add(U.rod(V(DH.x0 - 0.18, DH.yb + DH.h + 0.04, s * (hwR + 0.01)), V(DH.x1 + 0.18, DH.yb + DH.h + 0.04, s * (hwR + 0.01)), 0.03, M.brass, 8));
      for (const xe of [DH.x0 - 0.19, DH.x1 + 0.19]) dh.add(U.rod(V(xe, DH.yb + DH.h + 0.04, -hwR), V(xe, DH.yb + DH.h + 0.04, hwR), 0.03, M.brass, 8));
    }
    // 顶篷栏杆
    {
      const yR = roofTop(1.2) - 0.02, xa = DH.x0 + 0.05, xb = DH.x1 - 0.05;
      const pts = [V(xa, yR, -1.2), V(xb, yR, -1.2), V(xb, yR, 1.2), V(xa, yR, 1.2)];
      dh.add(U.railing(pts, { height: 0.55, postEvery: 1.5, baluster: 0.3, mat: M.brass, postMat: M.brass, rail: 0.018, closed: true }));
    }
    // 屋顶天窗（双坡玻璃）
    {
      const sx0 = DHc - 3.0, sx1 = DHc + 3.0, sy = roofTop(0) - 0.02;
      dh.add(U.box(sx1 - sx0, 0.32, 1.0, M.woodDark, DHc, sy + 0.16, 0));
      for (const s of [-1, 1]) {
        const p = U.box(sx1 - sx0 - 0.06, 0.02, 0.56, M.glowWindow, DHc, sy + 0.32 + 0.12, s * 0.24); p.rotation.x = s * 0.45; dh.add(p);
        for (let i = 0; i <= 12; i++) {
          const x = lerp(sx0 + 0.03, sx1 - 0.03, i / 12);
          dh.add(U.rod(V(x, sy + 0.33, s * 0.5), V(x, sy + 0.57, 0), 0.012, M.brass, 4));
        }
        dh.add(U.rod(V(sx0, sy + 0.33, s * 0.5), V(sx1, sy + 0.33, s * 0.5), 0.02, M.brass, 6));
      }
      dh.add(U.rod(V(sx0 - 0.02, sy + 0.58, 0), V(sx1 + 0.02, sy + 0.58, 0), 0.03, M.brass, 8));
      for (const xe of [sx0, sx1]) dh.add(U.sphere(0.05, M.gold, xe, sy + 0.62, 0, 10, 8));
    }
    // 通风筒
    const cowl = (x, y, z, rotY, s = 1) => {
      const c = new THREE.Group();
      c.add(U.tube([V(0, 0, 0), V(0, 0.45 * s, 0), V(0, 0.68 * s, 0.07 * s), V(0, 0.76 * s, 0.22 * s)], 0.07 * s, M.paintCream, false, 16, 10));
      const bellP = [[0.07, 0], [0.085, 0.04], [0.12, 0.1], [0.16, 0.15], [0.17, 0.17]].map(([r, yy]) => [r * s, yy * s]);
      const bell = U.mesh(latheGeo(bellP, 18), M.paintCream);
      const inner = U.mesh(latheGeo(bellP.map(([r, yy]) => [r * 0.92, yy]).reverse(), 18), M.paintRed);
      const bg = new THREE.Group(); bg.add(bell, inner);
      bg.position.set(0, 0.76 * s, 0.22 * s); bg.quaternion.setFromUnitVectors(V(0, 1, 0), V(0, 0.35, 1).normalize());
      c.add(bg);
      c.add(U.torus(0.08 * s, 0.015 * s, M.brass, 0, 0.02, 0, 6, 16)); c.children[c.children.length - 1].rotation.x = Math.PI / 2;
      c.position.set(x, y, z); c.rotation.y = rotY;
      return c;
    };
    dh.add(cowl(DH.x0 + 1.0, roofTop(0.7), 0.7, -Math.PI / 2, 1.1));
    dh.add(cowl(DH.x1 - 1.0, roofTop(-0.7), -0.7, Math.PI / 2, 1.1));
    add(dh);
    // 铭牌
    for (const end of [-1, 1]) {
      const sb = U.signBoard('ALBATROSS', 1.5, 0.26, { bg: '#151d2c', fg: '#e8c675', border: '#c9a24a', edge: M.gold });
      sb.position.set((end > 0 ? DH.x1 : DH.x0) + end * 0.09, 2.0, 0); sb.rotation.y = end * Math.PI / 2; ship.add(sb);
    }
    // 甲板通风筒
    add(cowl(-11.6, deckY(-11.6), 0.75, -Math.PI / 2 + 0.3, 1));
    add(cowl(-11.6, deckY(-11.6), -0.75, -Math.PI / 2 - 0.3, 1));
    add(cowl(7.55, deckY(7.55), 0.55, Math.PI / 2, 0.9));
    add(cowl(7.55, deckY(7.55), -0.55, Math.PI / 2, 0.9));
  }

  // ———————————————— 驾驶室（艏部，圆头玻璃罩）————————————————
  {
    const ph = new THREE.Group();
    const y0 = 0.1, xr = 8.6, xc = 10.15, rr = 0.85;
    const outline = [];
    outline.push([xr + 0.06, -rr]);
    for (let i = 1; i <= 6; i++) outline.push([lerp(xr + 0.06, xc, i / 6), -rr]);
    for (let i = 1; i < 20; i++) { const a = -Math.PI / 2 + (Math.PI * i) / 20; outline.push([xc + rr * Math.cos(a), rr * Math.sin(a)]); }
    for (let i = 0; i <= 6; i++) outline.push([lerp(xc, xr + 0.06, i / 6), rr]);
    const outT = (c) => V(Math.max(0, c.x - xc), 0, c.z);
    const inT = (c) => outT(c).negate();
    ph.add(U.mesh(wallStrip(outline, y0, y0 + 1.0, outT, 1.2), M.wood));
    ph.add(U.mesh(wallStrip(outline.map(([x, z]) => [x - (x > xc ? 0.05 * (x - xc) / rr : 0), z * (1 - 0.05 / rr)]), y0, y0 + 1.0, inT, 1.2), M.woodDark));
    ph.add(U.mesh(wallStrip(outline, y0 + 1.0, y0 + 1.87, outT, 1.2), M.glass));
    const o3 = (y, s = 1) => outline.map(([x, z]) => V(x > xc ? xc + (x - xc) * s : x, y, z * s));
    ph.add(U.tube(o3(y0 + 1.0, 1.02), 0.04, M.brass, false, 90, 6));
    ph.add(U.tube(o3(y0 + 1.87, 1.01), 0.03, M.brass, false, 90, 6));
    ph.add(U.tube(o3(y0 + 0.08, 1.015), 0.03, M.brass, false, 90, 6));
    for (let i = 0; i < outline.length; i += 3) {
      const [x, z] = outline[i];
      ph.add(U.rod(V(x, y0 + 1.0, z), V(x, y0 + 1.87, z), 0.018, M.brass, 6));
    }
    // 后壁 + 门
    ph.add(U.box(0.08, 1.95, rr * 2 + 0.02, M.wood, xr, y0 + 0.975, 0));
    ph.add(U.box(0.04, 1.6, 0.66, M.woodDark, xr - 0.05, y0 + 0.82, 0));
    const pw = new THREE.Mesh(new THREE.CircleGeometry(0.12, 16), M.glowWindow); pw.position.set(xr - 0.075, y0 + 1.25, 0); pw.rotation.y = -Math.PI / 2; ph.add(pw);
    const pr = U.torus(0.13, 0.02, M.brass, xr - 0.08, y0 + 1.25, 0, 6, 18); pr.rotation.y = Math.PI / 2; ph.add(pr);
    ph.add(U.sphere(0.03, M.brass, xr - 0.09, y0 + 0.8, 0.24, 8, 6));
    for (const s of [-1, 1]) ph.add(U.box(0.1, 1.97, 0.1, M.woodDark, xr, y0 + 0.985, s * rr));
    // 屋顶 + 穹顶 + 探照灯
    {
      const sh = new THREE.Shape();
      const ro = 0.12;
      sh.moveTo(xr - ro, -(rr + ro)); sh.lineTo(xc, -(rr + ro)); sh.absarc(xc, 0, rr + ro, -Math.PI / 2, Math.PI / 2, false); sh.lineTo(xr - ro, rr + ro); sh.lineTo(xr - ro, -(rr + ro));
      const rg = new THREE.ExtrudeGeometry(sh, { depth: 0.08, bevelEnabled: true, bevelSize: 0.02, bevelThickness: 0.02, bevelSegments: 2, curveSegments: 20 });
      rg.rotateX(Math.PI / 2); rg.translate(0, y0 + 1.95, 0);
      ph.add(U.mesh(rg, M.woodDark));
      const domeY = y0 + 1.97;
      const dome = U.lathe([[0.62, 0], [0.62, 0.06], [0.56, 0.1], [0.5, 0.22], [0.4, 0.34], [0.26, 0.42], [0.1, 0.46], [0, 0.47]], M.patina, 32);
      dome.position.set(9.85, domeY, 0); ph.add(dome);
      const dr = U.torus(0.62, 0.025, M.brass, 9.85, domeY + 0.06, 0, 6, 40); dr.rotation.x = Math.PI / 2; ph.add(dr);
      // 探照灯
      ph.add(U.cyl(0.05, 0.08, 0.14, M.brass, 9.85, domeY + 0.52, 0, 12));
      for (const s of [-1, 1]) ph.add(U.box(0.03, 0.3, 0.03, M.brass, 9.85, domeY + 0.68, s * 0.2));
      const lampBody = U.lathe([[0.0, -0.22], [0.12, -0.2], [0.15, -0.1], [0.17, 0.12], [0.18, 0.18], [0.16, 0.2]], M.brass, 24);
      lampBody.rotation.z = -Math.PI / 2; lampBody.position.set(9.85, domeY + 0.76, 0); ph.add(lampBody);
      const lens = new THREE.Mesh(new THREE.CircleGeometry(0.155, 24), M.glowBeacon); lens.rotation.y = Math.PI / 2; lens.position.set(9.85 + 0.205, domeY + 0.76, 0); ph.add(lens);
      const lensRing = U.torus(0.165, 0.018, M.brass, 9.85 + 0.21, domeY + 0.76, 0, 6, 24); lensRing.rotation.y = Math.PI / 2; ph.add(lensRing);
      ph.add(U.sphere(0.04, M.gold, 9.85, domeY + 0.98, 0, 10, 8));
      ph.add(U.rod(V(9.85, domeY + 0.94, 0), V(9.85, domeY + 1.25, 0), 0.008, M.brass, 4));
    }
    // 舷灯
    for (const s of [-1, 1]) {
      ph.add(U.box(0.24, 0.24, 0.12, M.brass, 9.1, y0 + 2.18, s * (rr + 0.1)));
      const lg = U.box(0.18, 0.18, 0.02, s < 0 ? M.glowRed : M.glowCyan, 9.1, y0 + 2.18, s * (rr + 0.165)); lg.castShadow = false; ph.add(lg);
      ph.add(U.cyl(0.03, 0.09, 0.06, M.brass, 9.1, y0 + 2.33, s * (rr + 0.1), 8));
    }
    // 舵轮 + 罗经柜
    {
      const wx = 10.3, wy = y0 + 1.32;
      const ring = U.torus(0.33, 0.022, M.brass, wx, wy, 0, 8, 40); ring.rotation.y = Math.PI / 2; ph.add(ring);
      const ring2 = U.torus(0.12, 0.018, M.brass, wx, wy, 0, 6, 20); ring2.rotation.y = Math.PI / 2; ph.add(ring2);
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * TAU, ca = Math.cos(a), sa = Math.sin(a);
        ph.add(U.rod(V(wx, wy, 0), V(wx, wy + sa * 0.33, ca * 0.33), 0.014, M.woodDark, 5));
        ph.add(U.rod(V(wx, wy + sa * 0.34, ca * 0.34), V(wx, wy + sa * 0.45, ca * 0.45), 0.02, M.woodDark, 6, 0.014));
      }
      put(ph, U.cyl(0.05, 0.05, 0.12, M.brass, wx + 0.06, wy, 0, 12)).rotation.z = Math.PI / 2;
      put(ph, U.lathe([[0.16, 0], [0.16, 0.05], [0.1, 0.1], [0.08, 0.6], [0.11, 0.9], [0.14, 1.0], [0.0, 1.02]], M.woodDark, 16)).position.set(wx + 0.2, y0, 0);
      put(ph, U.lathe([[0.17, 0], [0.12, 0.08], [0.1, 0.7], [0.18, 0.78], [0.2, 0.95], [0.18, 1.05], [0.0, 1.06]], M.brass, 20)).position.set(10.75, y0, 0);
      ph.add(U.sphere(0.15, M.glass, 10.75, y0 + 1.08, 0, 16, 10));
    }
    add(ph);
  }

  // ———————————————— 前甲板：绞盘、系缆桩、绳卷 ————————————————
  {
    const cx = 12.15, cy = deckY(cx);
    add(U.lathe([[0.3, 0], [0.3, 0.05], [0.22, 0.1], [0.17, 0.2], [0.15, 0.36], [0.2, 0.46], [0.27, 0.5], [0.27, 0.58], [0.14, 0.62], [0.05, 0.66], [0, 0.67]], M.woodDark, 20)).position.set(cx, cy, 0);
    for (const yy of [0.05, 0.48, 0.58]) { const t = U.torus(yy > 0.3 ? 0.27 : 0.3, 0.018, M.brass, cx, cy + yy, 0, 6, 28); t.rotation.x = Math.PI / 2; add(t); }
    for (let k = 0; k < 8; k++) { const a = (k / 8) * TAU; add(U.box(0.05, 0.2, 0.04, M.brass, cx + Math.cos(a) * 0.17, cy + 0.27, Math.sin(a) * 0.17)).rotation.y = -a; }
    for (const [bx, bz] of [[11.3, 0.55], [11.3, -0.55], [-12.4, 0.5], [-12.4, -0.5]]) {
      for (const dx of [-0.13, 0.13]) {
        add(U.lathe([[0.075, 0], [0.075, 0.25], [0.09, 0.27], [0.09, 0.3], [0, 0.31]], M.brass, 14)).position.set(bx + dx, deckY(bx), bz);
      }
      add(U.box(0.5, 0.05, 0.18, M.woodDark, bx, deckY(bx) + 0.025, bz));
    }
    const coil = (x, z, r0 = 0.24) => { for (let k = 0; k < 4; k++) { const t = U.torus(r0 - k * 0.035, 0.025, M.rope, x, deckY(x) + 0.03 + k * 0.035, z, 6, 22); t.rotation.x = Math.PI / 2; add(t); } };
    coil(12.8, -0.75); coil(11.9, 0.85, 0.2); coil(-12.0, -1.2 * 0.6); coil(-4.2, 1.55, 0.18); coil(2.0, -1.55, 0.18);
  }

  // ———————————————— 桅杆与反转升力旋翼 ————————————————
  const SIDE_X = [], SIDE_N = 6;
  for (let k = 0; k < SIDE_N; k++) SIDE_X.push(-10.5 + k * 3.6);
  const CENTER_X = [-8.7, DHc, 5.7];
  const RS = 1.35, RC = 2.2, SC = RC / RS;
  const masts = []; // {x, z, base, up, dn, s, center}
  for (const x of SIDE_X) for (const side of [-1, 1]) {
    const zm = side * Math.min(1.5, deckHalf(x) - 0.22);
    masts.push({ x, z: zm, base: deckY(x), up: 6.1, dn: 5.5, s: 1, center: false });
  }
  for (const x of CENTER_X) masts.push({ x, z: 0, base: roofTop(0) - 0.02, up: 8.9, dn: 8.1, s: SC, center: true });

  {
    const mg = new THREE.Group();
    for (const m of masts) {
      const s = m.s, top = m.up + 0.32 * s;
      // 底座法兰
      put(mg, U.lathe([[0.2, 0], [0.2, 0.035], [0.14, 0.07], [0.105, 0.14], [0.09, 0.24]].map(([r, y]) => [r * Math.sqrt(s), y]), M.brass, 18)).position.set(m.x, m.base, m.z);
      // 桅杆（铸铁色，渐细）
      mg.add(U.cyl(0.05 * s, 0.085 * Math.sqrt(s), top - m.base - 0.1, M.ironPlain, m.x, (top + m.base + 0.1) / 2, m.z, 14));
      // 黄铜箍
      const nBands = m.center ? 5 : 4;
      for (let k = 1; k <= nBands; k++) {
        const y = lerp(m.base + 0.4, m.dn - 0.75 * s, k / nBands);
        const t = U.torus(0.085 * Math.sqrt(s) * (1 - 0.25 * (k / nBands)), 0.016, M.brass, m.x, y, m.z, 6, 16); t.rotation.x = Math.PI / 2; mg.add(t);
      }
      // 拉索箍 + 小撑杆
      const ya = m.dn - 0.6 * s;
      mg.add(U.cyl(0.085 * s, 0.085 * s, 0.1, M.brass, m.x, ya, m.z, 14));
      // 齿轮箱（上下旋翼之间）
      const ym = (m.up + m.dn) / 2;
      put(mg, U.lathe([[0, -0.13], [0.07, -0.13], [0.12, -0.1], [0.13, -0.04], [0.13, 0.04], [0.12, 0.1], [0.07, 0.13], [0, 0.13]].map(([r, y]) => [r * s, y * s]), M.brass, 20)).position.set(m.x, ym, m.z);
      const gb = U.torus(0.135 * s, 0.014 * s, M.copper, m.x, ym, m.z, 6, 20); gb.rotation.x = Math.PI / 2; mg.add(gb);
      // 顶端尖饰
      mg.add(U.sphere(0.05 * s, M.gold, m.x, top, m.z, 12, 8));
      mg.add(U.rod(V(m.x, top, m.z), V(m.x, top + 0.2 * s, m.z), 0.012 * s, M.gold, 6, 0.002));
      m.ya = ya; m.top = top;
    }
    // ——— 索具 ———
    const wire = M.paintBlack, wr = 0.011;
    const turnbuckle = (p) => { mg.add(U.cyl(0.02, 0.02, 0.12, M.brass, p.x, p.y + 0.06, p.z, 6)); };
    const sideRow = (side) => masts.filter((m) => !m.center && Math.sign(m.z) === side).sort((a, b) => a.x - b.x);
    for (const side of [-1, 1]) {
      const row = sideRow(side);
      row.forEach((m, i) => {
        const A = V(m.x, m.ya, m.z);
        for (const dx of [-0.75, 0.75]) {
          const gx = m.x + dx; const Pg = V(gx, G(gx) + 0.03, side * (B(gx) - 0.04));
          mg.add(rodSeg(A, Pg, wr, wire, 4)); turnbuckle(Pg);
        }
        if (i < row.length - 1) { const n = row[i + 1]; mg.add(rodSeg(A, V(n.x, n.ya, n.z), wr, wire, 4)); }
      });
      // 两端斜拉到艏艉
      const f = row[row.length - 1], a = row[0];
      const pb = V(13.2, G(13.2) + 0.03, side * (B(13.2) - 0.04)), ps = V(-13.7, G(-13.7) + 0.03, side * (B(-13.7) - 0.04));
      mg.add(rodSeg(V(f.x, f.ya, f.z), pb, wr, wire, 4)); turnbuckle(pb);
      mg.add(rodSeg(V(a.x, a.ya, a.z), ps, wr, wire, 4)); turnbuckle(ps);
    }
    const cen = masts.filter((m) => m.center).sort((a, b) => a.x - b.x);
    cen.forEach((m, i) => {
      const A = V(m.x, m.ya, 0);
      for (const dx of [-0.8, 0.8]) for (const sz of [-1, 1]) { const P = V(m.x + dx, roofTop(1.1), sz * 1.1); mg.add(rodSeg(A, P, wr, wire, 4)); turnbuckle(P); }
      if (i < cen.length - 1) mg.add(rodSeg(A, V(cen[i + 1].x, cen[i + 1].ya, 0), wr, wire, 4));
    });
    // 前支索 → 驾驶室顶后缘；后支索分叉到艉甲板（避开旋翼与推进轴）
    const fs = cen[cen.length - 1], bs = cen[0];
    const pfs = V(8.5, 2.17, 0); mg.add(rodSeg(V(fs.x, fs.ya, 0), pfs, wr * 1.2, wire, 4)); mg.add(U.sphere(0.035, M.brass, pfs.x, pfs.y, pfs.z, 8, 6));
    for (const sz of [-1, 1]) { const P = V(-14.0, deckY(-14.0) + 0.04, sz * 0.6); mg.add(rodSeg(V(bs.x, bs.ya, 0), P, wr * 1.2, wire, 4)); turnbuckle(P); }
    add(mg);
  }

  // 旋翼（实例化：上层正转 / 下层反转）
  const rotorParams = { R: RS, r0: 0.07, chord: 0.34, thick: 0.045, pitch: 0.42, twist: 0.24, sweep: 0.1, rootR: 0.028 };
  const bladesUpGeo = rotorBlades({ ...rotorParams, sign: 1 }, 2);
  const bladesDnGeo = rotorBlades({ ...rotorParams, sign: -1 }, 2);
  const hubProfile = [[0, -0.1], [0.07, -0.1], [0.1, -0.075], [0.112, -0.03], [0.112, 0.02], [0.1, 0.05], [0.075, 0.09], [0.045, 0.15], [0.018, 0.2], [0, 0.21]];
  const hubUpGeo = mergeGeometries([latheGeo(hubProfile, 20), new THREE.TorusGeometry(0.105, 0.012, 6, 20).rotateX(Math.PI / 2).translate(0, -0.02, 0)], false);
  const hubDnGeo = hubUpGeo.clone().rotateX(Math.PI);
  const nM = masts.length;
  const imBU = new THREE.InstancedMesh(bladesUpGeo, M.wood, nM);
  const imBD = new THREE.InstancedMesh(bladesDnGeo, M.wood, nM);
  const imHU = new THREE.InstancedMesh(hubUpGeo, M.brass, nM);
  const imHD = new THREE.InstancedMesh(hubDnGeo, M.brass, nM);
  for (const im of [imBU, imBD, imHU, imHD]) { im.castShadow = true; im.receiveShadow = true; im.userData.dynamic = true; im.frustumCulled = false; add(im); }
  const _m4 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _yA = V(0, 1, 0);
  const phases = masts.map((m, i) => (i * 2.39996) % TAU);
  const setRotors = (t) => {
    const w = 7.5;
    masts.forEach((m, i) => {
      const ws = m.center ? w * 0.8 : w;
      _s.setScalar(m.s);
      _p.set(m.x, m.up, m.z); _q.setFromAxisAngle(_yA, t * ws + phases[i]); _m4.compose(_p, _q, _s);
      imBU.setMatrixAt(i, _m4); imHU.setMatrixAt(i, _m4);
      _p.set(m.x, m.dn, m.z); _q.setFromAxisAngle(_yA, -t * ws - phases[i] * 0.7); _m4.compose(_p, _q, _s);
      imBD.setMatrixAt(i, _m4); imHD.setMatrixAt(i, _m4);
    });
    imBU.instanceMatrix.needsUpdate = true; imBD.instanceMatrix.needsUpdate = true; imHU.instanceMatrix.needsUpdate = true; imHD.instanceMatrix.needsUpdate = true;
  };
  setRotors(0);

  // ———————————————— 艏艉推进桨 ————————————————
  const props = [];
  const propBlades = rotorBlades({ R: 1.75, r0: 0.12, chord: 0.62, thick: 0.08, pitch: 0.55, twist: 0.3, sweep: 0.1, rootR: 0.05, sign: 1 }, 2);
  propBlades.rotateZ(Math.PI / 2); // 展向 → +Y，旋转轴 → X
  const spinnerP = [[0, -0.28], [0.15, -0.28], [0.21, -0.2], [0.22, -0.02], [0.2, 0.14], [0.15, 0.28], [0.08, 0.4], [0.02, 0.47], [0, 0.48]];
  for (const end of [1, -1]) {
    const xPed = end > 0 ? 13.35 : -13.0;
    const yA = deckY(xPed) + 1.0;
    const xHub = end * 16.9, xBr = end * 16.25;
    const tipX = end * 14.95, tipY = G(tipX) - 0.04;
    // 支座
    add(U.lathe([[0.26, 0], [0.26, 0.06], [0.18, 0.1], [0.12, 0.2], [0.09, 0.6], [0.1, 0.8], [0.14, 0.86], [0.14, 0.9]], M.paintBlack, 18)).position.set(xPed, deckY(xPed), 0);
    for (const sz of [-1, 1]) add(U.rod(V(xPed, yA - 0.35, 0), V(xPed - end * 0.25, deckY(xPed) + 0.02, sz * 0.4), 0.025, M.paintBlack, 6));
    add(U.cyl(0.16, 0.16, 0.42, M.brass, xPed, yA, 0, 18)).rotation.z = Math.PI / 2;
    for (const dx of [-0.21, 0.21]) { const t = U.torus(0.16, 0.02, M.brass, xPed + dx, yA, 0, 6, 20); t.rotation.y = Math.PI / 2; add(t); }
    // 传动轴
    add(U.rod(V(xPed, yA, 0), V(xHub, yA, 0), 0.05, M.steel, 12));
    // 外轴承 + 三脚支撑
    add(U.cyl(0.11, 0.11, 0.3, M.brass, xBr, yA, 0, 16)).rotation.z = Math.PI / 2;
    add(U.rod(V(tipX, tipY, 0), V(xBr, yA - 0.1, 0), 0.04, M.brass, 8));
    const gx = end * 14.2;
    for (const sz of [-1, 1]) add(U.rod(V(gx, G(gx) + 0.03, sz * (B(gx) - 0.05)), V(xBr, yA, sz * 0.08), 0.03, M.brass, 8));
    // 旋转部分
    const pg = new THREE.Group(); pg.position.set(xHub, yA, 0); pg.userData.dynamic = true;
    const bl = new THREE.Mesh(propBlades, M.wood); bl.castShadow = true; pg.add(bl);
    const sp = new THREE.Mesh(latheGeo(spinnerP, 24).rotateZ(-end * Math.PI / 2), M.brass); sp.castShadow = true; pg.add(sp);
    const collar = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.025, 6, 24).rotateY(Math.PI / 2).translate(-end * 0.2, 0, 0), M.copper); pg.add(collar);
    add(pg); props.push({ g: pg, dir: end });
  }

  // ———————————————— 旗帜：罗布尔的黑底金日旗 + 三面三角长旗 ————————————————
  const flagTex = (() => {
    const cv = document.createElement('canvas'); cv.width = 256; cv.height = 160;
    const g = cv.getContext('2d');
    if (g && g.fillRect) {
      g.fillStyle = '#121214'; g.fillRect(0, 0, 256, 160);
      g.fillStyle = '#d9ad4a';
      if (g.beginPath) {
        g.beginPath();
        for (let i = 0; i < 48; i++) { const a = (i / 48) * TAU, r = i % 2 ? 26 : 50; const x = 128 + Math.cos(a) * r, y = 80 + Math.sin(a) * r; if (i === 0) g.moveTo(x, y); else g.lineTo(x, y); }
        g.closePath(); g.fill();
        g.beginPath(); g.arc(128, 80, 24, 0, TAU); g.fillStyle = '#f0c860'; g.fill();
        g.fillStyle = '#d9ad4a';
        for (const [sx, sy] of [[30, 26], [226, 26], [30, 134], [226, 134], [62, 80], [194, 80]]) {
          g.beginPath();
          for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i / 10) * TAU, r = i % 2 ? 4 : 10; const x = sx + Math.cos(a) * r, y = sy + Math.sin(a) * r; if (i === 0) g.moveTo(x, y); else g.lineTo(x, y); }
          g.closePath(); g.fill();
        }
      }
    }
    const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
  })();
  const flagMat = new THREE.MeshStandardMaterial({ map: flagTex, side: THREE.DoubleSide, roughness: 0.85 });
  const pennantMat = new THREE.MeshStandardMaterial({ color: 0x9a1d18, side: THREE.DoubleSide, roughness: 0.8 });
  const flags = [];
  const makeFlag = (w, h, taper, mat, segX = 18, segY = 6) => {
    const g = new THREE.PlaneGeometry(w, h, segX, segY);
    g.translate(-w / 2, -h / 2, 0);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) { const d = -p.getX(i) / w; p.setY(i, -h / 2 + (p.getY(i) + h / 2) * (1 - taper * d)); }
    const base = Float32Array.from(p.array);
    const m = new THREE.Mesh(g, mat); m.castShadow = true; m.userData.dynamic = true;
    return { m, base, w };
  };
  {
    // 艉旗杆
    const fx = -13.55, fz = 0.42, fy0 = deckY(fx);
    add(U.lathe([[0.09, 0], [0.09, 0.05], [0.05, 0.1], [0.04, 0.2]], M.brass, 12)).position.set(fx, fy0, fz);
    add(U.cyl(0.022, 0.035, 4.4, M.woodDark, fx, fy0 + 2.2, fz, 10));
    add(U.sphere(0.06, M.gold, fx, fy0 + 4.44, fz, 12, 8));
    const F = makeFlag(1.7, 1.06, 0.0, flagMat); F.m.position.set(fx - 0.03, fy0 + 4.33, fz); F.amp = 0.13; F.ph = 0; add(F.m); flags.push(F);
    add(U.rod(V(fx, fy0 + 4.33, fz), V(fx, fy0 + 3.27, fz), 0.006, M.rope, 4));
    // 艉灯
    const sl = U.lantern(M, 0.6); sl.position.set(-14.2, G(-14.2) + 0.86, 0); add(sl);
    add(U.box(0.3, 0.04, 0.3, M.brass, -14.2, G(-14.2) + 0.84, 0));
    add(U.rod(V(-14.2, G(-14.2) + 0.06, 0.0), V(-14.2, G(-14.2) + 0.84, 0), 0.025, M.brass, 8));
    // 中央桅顶三角长旗
    for (const m of masts.filter((mm) => mm.center)) {
      const sy = m.top + 0.2 * m.s;
      add(U.rod(V(m.x, sy, 0), V(m.x, sy + 0.75, 0), 0.016, M.brass, 6));
      add(U.sphere(0.035, M.gold, m.x, sy + 0.77, 0, 10, 8));
      const P = makeFlag(2.6, 0.36, 0.94, pennantMat, 22, 2); P.m.position.set(m.x - 0.02, sy + 0.72, 0); P.amp = 0.16; P.ph = m.x; add(P.m); flags.push(P);
    }
  }

  // ———————————————— 船员 ————————————————
  const crew = (seed, x, y, z, ry) => {
    let p = null;
    for (let s = seed; s < seed + 60; s++) { const c = U.person(s); if (c.userData.legs.length === 2) { p = c; break; } }
    p = p || U.person(seed);
    p.position.set(x, y, z); p.rotation.y = ry; add(p); return p;
  };
  crew(11, 9.78, deckY(9.78), 0, Math.PI / 2); // 舵手
  crew(23, 12.6, deckY(12.6), 0.5, Math.PI / 2 - 0.3); // 艏部瞭望
  crew(37, -5.4, roofTop(0.5) - 0.01, 0.5, Math.PI * 0.15); // 罗布尔站在舱顶
  crew(52, -5.15, deckY(-5.15), 1.66, Math.PI / 2 + 0.2); // 右舷甲板
  crew(71, -12.3, deckY(-12.3), 0.0, -Math.PI / 2 + 0.25); // 艉部
  crew(88, 1.2, deckY(1.2), -1.66, Math.PI * 0.5 - 0.1); // 左舷甲板

  // ———————————————— 夜灯 ————————————————
  const l1 = new THREE.PointLight(0xffb868, 0, 22, 2); l1.position.set(DHc, 3.3, 0); add(l1); ctx.addNightLight(l1, 28);
  const l2 = new THREE.PointLight(0xfff0c8, 0, 22, 2); l2.position.set(11.0, 3.2, 0); add(l2); ctx.addNightLight(l2, 22);

  // ———————————————— 合并 + 居中 ————————————————
  U.mergeStatic(ship);
  ship.updateMatrixWorld(true);
  const bb = new THREE.Box3().setFromObject(ship);
  const c = bb.getCenter(new THREE.Vector3());
  const baseY = -c.y, baseX = -c.x;
  ship.position.set(baseX, baseY, 0);
  // 乘坐视角：站在甲板舱与驾驶室之间，越过船首俯瞰
  const rideAnchor = new THREE.Object3D(); rideAnchor.position.set(4.6, DH.yb + DH.h + 2.3, 1.0); ship.add(rideAnchor);
  const rideLook = new THREE.Object3D(); rideLook.position.set(70, DH.yb + DH.h - 26, 0); ship.add(rideLook);

  // 旗帜飘动
  const waveFlag = (F, t) => {
    const p = F.m.geometry.attributes.position, b = F.base;
    for (let i = 0; i < p.count; i++) {
      const bx = b[i * 3], by = b[i * 3 + 1];
      const d = Math.max(0, -bx / F.w);
      const z = Math.sin(d * 7.5 - t * 7 + F.ph) * F.amp * Math.pow(d, 0.8) + Math.sin(d * 13 - t * 11 + by * 3) * 0.025 * d;
      p.setXYZ(i, bx + Math.sin(t * 3 + d * 4) * 0.02 * d, by - 0.06 * d * d, z);
    }
    p.needsUpdate = true;
    F.m.geometry.computeVertexNormals();
  };

  return {
    group,
    focus: { pos: [21, 9, 27], target: [0.5, -0.5, 0] },
    footprint: 18,
    rideAnchor, rideLook,
    update(t, dt, env) {
      setRotors(t);
      for (const pr of props) pr.g.rotation.x = pr.dir * t * 6.5;
      for (const F of flags) waveFlag(F, t);
      ship.position.y = baseY + Math.sin(t * 0.62) * 0.18 + Math.sin(t * 1.37) * 0.04;
      ship.rotation.z = Math.sin(t * 0.41) * 0.018;
      ship.rotation.x = Math.sin(t * 0.57 + 1.1) * 0.012;
    },
  };
}

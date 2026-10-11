// ─────────────────────────────────────────────────────────────
//  Le Carrousel des Mondes Marins · 海洋世界旋转木马（南特机械岛）
//  三层：Les Abysses（深渊）/ Le fond des mers（海底）/ La surface（海面）
//  铆接铁柱 + 黄铜齿轮组驱动，每层反向旋转；机械海洋生物坐骑上下起伏
// ─────────────────────────────────────────────────────────────
import * as THREE from 'three';
import * as U from '../util.js';
import { rng, withRepeat } from '../materials.js';

const { V } = U;
const TAU = Math.PI * 2;
const UP = new THREE.Vector3(0, 1, 0);

// 关键高度
const PLINTH_TOP = 0.95;
const L1_Y = PLINTH_TOP;      // 第一层转盘底
const DECK2_TOP = 6.75;       // 第二层楼板顶
const DECK3_TOP = 12.55;      // 第三层楼板顶
const DECK_T = 0.55;          // 楼板厚
const EAVE_Y = 16.8;          // 顶棚檐口
const PLAT_T = 0.3;           // 转盘厚度
const PLAT_IN = 1.45;         // 转盘内半径

// ---------- 小工具 ----------
const dyn = (o) => { o.userData.dynamic = true; return o; };
function place(o, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) { o.position.set(x, y, z); o.rotation.set(rx, ry, rz); return o; }

const RIVET_GEO = new THREE.SphereGeometry(1, 5, 2, 0, TAU, 0, Math.PI / 2);
/** 单颗铆钉（普通网格，便于 mergeStatic 合并） */
function rivet(parent, p, n, size, mat) {
  const m = new THREE.Mesh(RIVET_GEO, mat);
  m.position.copy(p);
  m.quaternion.setFromUnitVectors(UP, n.clone().normalize());
  m.scale.setScalar(size);
  m.castShadow = true; m.receiveShadow = true;
  parent.add(m);
  return m;
}
/** 沿 Z 轴物体的椭圆铆钉环 */
function rivetRingZ(parent, rx, ry, z, n, size, mat, a0 = 0, a1 = TAU) {
  n = Math.max(4, Math.round(n * 0.65));
  const full = Math.abs(a1 - a0 - TAU) < 1e-6;
  const cnt = full ? n : n + 1;
  for (let i = 0; i < cnt; i++) {
    const a = a0 + (a1 - a0) * (i / n);
    rivet(parent, V(Math.cos(a) * rx, Math.sin(a) * ry, z), V(Math.cos(a) / rx, Math.sin(a) / ry, 0), size, mat);
  }
}
/** 沿 Y 轴的水平铆钉环 */
function rivetRingY(parent, r, y, n, size, mat) {
  n = Math.max(4, Math.round(n * 0.7));
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU;
    rivet(parent, V(Math.cos(a) * r, y, Math.sin(a) * r), V(Math.cos(a), 0, Math.sin(a)), size, mat);
  }
}
/** 车床体沿 +Z 轴（profile: [[r, z]]），sx/sy 为横向/竖向缩放 */
function bodyZ(profile, mat, seg = 32, sx = 1, sy = 1, phiStart = 0, phiLen = TAU) {
  const m = U.lathe(profile, mat, seg, phiStart, phiLen);
  m.rotation.x = Math.PI / 2;
  m.scale.set(sx, 1, sy);
  return m;
}
/** 椭圆箍带（沿 Z 轴物体） */
function bandZ(rx, ry, z, tube, mat, seg = 28) {
  const m = U.torus(rx, tube, mat, 0, 0, z, 4, seg);
  m.scale.set(1, ry / rx, 1);
  return m;
}
/** 渐细圆管：r0 → r1 */
function taperTube(points, r0, r1, mat, seg = 48, radial = 8, closedEnd = true) {
  const curve = new THREE.CatmullRomCurve3(points);
  const geo = new THREE.TubeGeometry(curve, seg, 1, radial, false);
  const pos = geo.attributes.position;
  const P = new THREE.Vector3(), v = new THREE.Vector3();
  for (let i = 0; i <= seg; i++) {
    curve.getPointAt(i / seg, P);
    const r = r0 + (r1 - r0) * (i / seg);
    for (let j = 0; j <= radial; j++) {
      const k = i * (radial + 1) + j;
      v.fromBufferAttribute(pos, k).sub(P).multiplyScalar(r).add(P);
      pos.setXYZ(k, v.x, v.y, v.z);
    }
  }
  geo.computeVertexNormals();
  const m = U.mesh(geo, mat);
  m.userData.curve = curve; m.userData.frames = { N: geo.normals, B: geo.binormals, T: geo.tangents };
  const g = new THREE.Group(); g.add(m);
  if (closedEnd) {
    g.add(U.sphere(r0 * 0.98, mat, ...points[0].toArray(), 8, 6));
    g.add(U.sphere(Math.max(r1, 0.004), mat, ...points[points.length - 1].toArray(), 6, 4));
  }
  g.userData.tubeMesh = m;
  return g;
}
/** 扇形鳍：shape 在 XY 平面，返回带厚度的几何 */
function shapeGeo(pts, depth = 0.04, bevel = 0.015) {
  const s = new THREE.Shape();
  pts.forEach(([x, y], i) => (i ? s.lineTo(x, y) : s.moveTo(x, y)));
  const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: bevel > 0, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 1, curveSegments: 6 });
  g.translate(0, 0, -depth / 2);
  return g;
}
/** 扇面鳍（带黄铜鳍条）：位于 XY 平面，根部在原点，自角度 a0 起展开 spread 弧度 */
function fanFin(M, { len = 0.8, spread = 1.0, rays = 6, mat, rayMat, thick = 0.035, a0 = -0.5, notch = 0.15 } = {}) {
  const g = new THREE.Group();
  const pts = [[0, 0]];
  const n = 18;
  for (let i = 0; i <= n; i++) {
    const a = a0 + spread * (i / n);
    const wav = 1 - notch * Math.pow(Math.sin((i / n) * Math.PI * rays * 0.5), 2);
    pts.push([Math.cos(a) * len * wav, Math.sin(a) * len * wav]);
  }
  g.add(U.mesh(shapeGeo(pts, thick, 0.01), mat || M.copper));
  for (let i = 0; i <= rays; i++) {
    const a = a0 + spread * (i / rays);
    const e = V(Math.cos(a) * len * 0.97, Math.sin(a) * len * 0.97, 0);
    for (const s of [1]) g.add(U.rod(V(0, 0, s * thick * 0.6), e.clone().setZ(s * thick * 0.6), 0.014, rayMat || M.brass, 4));
  }
  return g;
}
// 游客服饰调色板：把 U.person 的随机材质映射到共享材质，便于合并、减少 draw call
let PAL = null;
const SKIN_HEX = [0xf1c9a5, 0xd9a47c, 0xa8724f, 0x7a4b31, 0xe8b996];
function setPalette(M, R) {
  PAL = {
    skinL: R.skinL, skinD: R.skinD,
    list: [[0x1b2a44, M.paintNavy], [0x8e1c18, M.paintRed], [0x1f5c5e, M.paintTeal], [0x141414, M.paintBlack], [0x6b4a30, M.leather], [0xc9b28a, R.khaki]],
    creamDS: R.creamDS,
  };
}
const hexDist = (a, b) => { const d = (s) => [(a >> s & 255) - (b >> s & 255)]; return d(16) ** 2 + d(8) ** 2 + d(0) ** 2; };
function person2(seed, opts) {
  const p = U.person(seed, opts);
  p.traverse((o) => {
    if (!o.isMesh || !PAL) return;
    const hx = o.material.color.getHex();
    if (SKIN_HEX.includes(hx)) { o.material = PAL.skinL; return; }
    if (o.geometry.type === 'ConeGeometry') { o.material = PAL.creamDS; return; }
    let best = PAL.list[0][1], bd = Infinity;
    for (const [h, m] of PAL.list) { const d = hexDist(hx, h); if (d < bd) { bd = d; best = m; } }
    o.material = best;
  });
  return p;
}
/** 骑乘坐姿的小人（静态，可合并） */
function rider(seed, { child = false, arms = -0.9 } = {}) {
  const p = person2(seed, { child });
  for (const l of p.userData.legs) l.rotation.x = -1.35;
  for (const a of p.userData.arms) a.rotation.x = arms;
  return p;
}
/** 让站姿小人在坐垫高度 y 处坐下：返回定位用组 */
function seatRider(parent, seed, x, y, z, ry = 0, opts) {
  const p = rider(seed, opts);
  const sc = p.scale.y;
  p.position.set(x, y - 0.9 * sc + 0.05, z - 0.0);
  p.rotation.y = ry;
  parent.add(p);
  return p;
}
/** 皮革马鞍 + 黄铜扶手 */
function saddle(M, parent, x, y, z, w = 0.42, l = 0.6) {
  const s = U.sphere(1, M.leather, x, y, z, 12, 6);
  s.scale.set(w * 0.5, 0.11, l * 0.5); parent.add(s);
  const pad = U.lathe([[0, 0], [w * 0.55, 0], [w * 0.6, 0.03], [w * 0.55, 0.06], [0, 0.06]], M.brass, 12);
  pad.position.set(x, y - 0.08, z); pad.scale.set(1, 1, l / w); parent.add(pad);
  // 前扶手（弧形黄铜管）
  const bar = U.torus(w * 0.42, 0.022, M.brass, x, y + 0.22, z + l * 0.45, 4, 12, Math.PI);
  parent.add(bar);
  parent.add(U.rod(V(x - w * 0.42, y, z + l * 0.45), V(x - w * 0.42, y + 0.22, z + l * 0.45), 0.022, M.brass, 6));
  parent.add(U.rod(V(x + w * 0.42, y, z + l * 0.45), V(x + w * 0.42, y + 0.22, z + l * 0.45), 0.022, M.brass, 6));
  parent.add(U.sphere(0.04, M.brass, x - w * 0.42, y + 0.22, z + l * 0.45, 6, 4));
  parent.add(U.sphere(0.04, M.brass, x + w * 0.42, y + 0.22, z + l * 0.45, 6, 4));
  // 后靠（卷边）
  const back = U.torus(w * 0.4, 0.05, M.leather, x, y + 0.06, z - l * 0.45, 4, 10, Math.PI);
  parent.add(back);
  return s;
}
/** 轻量铸铁栏杆：环形扶手 + 方截面栏杆柱 + 黄铜立柱球 + C 形卷涡（三角形开销远低于 U.ringRailing） */
function lightRailing(M, r, y, { h = 1.0, a0 = 0, arc = TAU, post = 2.2, bal = 0.19 } = {}) {
  const g = new THREE.Group();
  const full = Math.abs(arc - TAU) < 1e-6;
  const seg = Math.max(8, Math.round((arc * r) / 0.8));
  for (const [yy, tube, mat] of [[h, 0.035, M.ironPlain], [h + 0.045, 0.016, M.brass], [h * 0.55, 0.018, M.ironPlain], [0.1, 0.022, M.ironPlain]]) {
    const t = U.torus(r, tube, mat, 0, y + yy, 0, 4, seg, arc); t.rotation.set(Math.PI / 2, 0, a0); g.add(t);
  }
  const L = arc * r;
  const nb = Math.round(L / bal), np = Math.max(1, Math.round(L / post));
  const balGeo = new THREE.CylinderGeometry(0.016, 0.016, h - 0.1, 3, 1, true);
  for (let i = full ? 0 : 1; i < nb; i++) {
    const a = a0 + (arc * i) / nb;
    const m = new THREE.Mesh(balGeo, M.ironPlain); m.position.set(Math.cos(a) * r, y + 0.1 + (h - 0.1) / 2, Math.sin(a) * r); m.rotation.y = -a; m.castShadow = true; g.add(m);
  }
  for (let i = 0; i <= (full ? np - 1 : np); i++) {
    const a = a0 + (arc * i) / np, c = Math.cos(a), s = Math.sin(a);
    g.add(U.cyl(0.035, 0.045, h + 0.05, M.ironPlain, c * r, y + (h + 0.05) / 2, s * r, 6));
    g.add(U.sphere(0.06, M.brass, c * r, y + h + 0.1, s * r, 5, 3));
    if (i < np) {
      const am = a0 + (arc * (i + 0.5)) / np;
      const sc = U.torus(0.15, 0.014, M.brass, 0, 0, 0, 3, 8, Math.PI * 1.5);
      sc.position.set(Math.cos(am) * r, y + h * 0.55 - 0.16, Math.sin(am) * r); sc.rotation.set(0, Math.PI / 2 - am, i % 2 ? 0 : Math.PI); g.add(sc);
    }
  }
  return g;
}
/** 液压立柱底座：返回 { root, bob }，bob 为上下起伏的动态组 */
function pistonMount(M, h) {
  const root = new THREE.Group();
  root.add(U.lathe([[0.45, 0], [0.45, 0.06], [0.38, 0.1], [0.3, 0.16], [0.2, 0.22], [0.17, 0.3], [0.0, 0.3]], M.brass, 16));
  rivetRingY(root, 0.42, 0.07, 12, 0.018, M.brass);
  root.add(U.cyl(0.13, 0.15, h * 0.55, M.ironPlain, 0, 0.3 + h * 0.275, 0, 16));
  const collar = U.torus(0.15, 0.025, M.brass, 0, 0.3 + h * 0.55, 0, 6, 20);
  collar.rotation.x = Math.PI / 2; root.add(collar);
  const bob = dyn(new THREE.Group());
  bob.position.y = h;
  bob.add(U.cyl(0.075, 0.075, h * 0.6, M.steel, 0, -h * 0.3, 0, 12));
  root.add(bob);
  return { root, bob };
}

// ═════════════════════════════════════════════════════════════
//  机械海洋生物
// ═════════════════════════════════════════════════════════════

/** 椭球表面一点及法线（半轴 a,b,c） */
function ellPoint(a, b, c, x, z, lift = 0) {
  const k = 1 - (x / a) ** 2 - (z / c) ** 2;
  const y = b * Math.sqrt(Math.max(k, 0));
  const n = V(x / (a * a), y / (b * b), z / (c * c)).normalize();
  return { p: V(x, y, z).addScaledVector(n, lift), n };
}

// ---------- 巨蟹 ----------
function makeCrab(M, { seed = 1, shellMat, scale = 1, riderSeed = null } = {}) {
  const sm = shellMat || M.copper;
  const h = 1.25;
  const { root, bob } = pistonMount(M, h);
  const body = new THREE.Group(); bob.add(body);
  const A = 1.25, B = 0.45, C = 0.95;
  // 甲壳 + 腹甲
  const cara = U.sphere(1, sm, 0, 0, 0, 32, 14); cara.scale.set(A, B, C); body.add(cara);
  const belly = U.sphere(1, M.ironPlain, 0, -0.03, 0, 24, 8); belly.scale.set(A * 0.94, 0.26, C * 0.92); body.add(belly);
  // 甲壳上的横向铆接加强筋
  for (const z of [-0.55, -0.18, 0.2, 0.56]) {
    const pts = [], nrm = [];
    const ax = A * Math.sqrt(1 - (z / C) ** 2) * 0.97;
    for (let i = 0; i <= 16; i++) {
      const x = -ax + (2 * ax * i) / 16;
      const e = ellPoint(A, B, C, x, z, 0.01);
      pts.push(e.p); nrm.push(e.n);
    }
    body.add(U.tube(pts, 0.022, M.brass, false, 18, 4));
    for (let i = 2; i < 16; i += 3) for (const dz of [-0.06, 0.06]) {
      const e = ellPoint(A, B, C, pts[i].x, z + dz, 0.0);
      rivet(body, e.p, e.n, 0.018, M.brass);
    }
  }
  // 纵向脊
  {
    const pts = [];
    for (let i = 0; i <= 12; i++) { const z = -C * 0.92 + (1.84 * C * i) / 12; pts.push(ellPoint(A, B, C, 0, z, 0.015).p); }
    body.add(U.tube(pts, 0.035, M.brass, false, 18, 4));
  }
  // 边缘环 + 铆钉 + 前缘尖刺
  {
    const pts = [];
    for (let i = 0; i < 48; i++) { const a = (i / 48) * TAU; pts.push(V(Math.cos(a) * A, 0.0, Math.sin(a) * C)); }
    body.add(U.tube(pts, 0.05, M.brass, true, 56, 5));
    for (let i = 0; i < 28; i++) {
      const a = (i / 28) * TAU;
      rivet(body, V(Math.cos(a) * A * 1.02, 0.03, Math.sin(a) * C * 1.02), V(Math.cos(a), 1.2, Math.sin(a)), 0.02, M.brass);
    }
    for (let k = -3; k <= 3; k++) {
      if (k === 0) continue;
      const a = Math.PI / 2 + k * 0.19;
      const sp = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.24, 8), sm);
      sp.position.set(Math.cos(a) * A * 1.0, 0.02, Math.sin(a) * C * 1.0);
      sp.quaternion.setFromUnitVectors(UP, V(Math.cos(a) * 1.3, 0.25, Math.sin(a)).normalize());
      body.add(sp);
    }
  }
  // 眼柄
  for (const s of [-1, 1]) {
    body.add(U.rod(V(s * 0.22, 0.3, 0.78), V(s * 0.3, 0.68, 0.92), 0.035, M.steel, 8));
    body.add(U.torus(0.04, 0.014, M.brass, s * 0.26, 0.48, 0.85, 5, 12));
    body.add(U.sphere(0.1, M.glowRed, s * 0.31, 0.74, 0.93, 14, 10));
    const bz = U.torus(0.095, 0.02, M.brass, s * 0.31, 0.74, 0.93, 6, 18); bz.rotation.x = Math.PI / 2; body.add(bz);
  }
  // 口器
  for (let i = -2; i <= 2; i++) body.add(place(U.box(0.09, 0.2, 0.05, M.ironPlain), i * 0.1, -0.12, C * 0.93, 0.3, 0, i * 0.12));
  // 腿：每侧 4 条，整侧为一个摆动组
  const legSides = [];
  for (const s of [-1, 1]) {
    const side = new THREE.Group(); side.position.set(s * 0.85, -0.05, 0); body.add(side); legSides.push(side);
    const angs = [-0.75, -0.3, 0.12, 0.5];
    angs.forEach((ang, i) => {
      const hip = V(0, 0, -0.45 + i * 0.3);
      const d = V(s * Math.cos(ang), 0, Math.sin(ang));
      const knee = hip.clone().addScaledVector(d, 0.85).add(V(0, 0.62, 0));
      const ankle = hip.clone().addScaledVector(d, 1.55).add(V(0, 0.05, 0));
      const foot = hip.clone().addScaledVector(d, 1.8).add(V(0, -1.0, 0));
      side.add(U.sphere(0.12, M.brass, hip.x, hip.y, hip.z, 6, 4));
      side.add(U.rod(hip, knee, 0.085, sm, 8, 0.07));
      side.add(U.rod(hip.clone().lerp(knee, 0.2), hip.clone().lerp(knee, 0.8), 0.098, M.ironPlain, 8, 0.084));
      side.add(U.sphere(0.1, M.brass, knee.x, knee.y, knee.z, 6, 4));
      side.add(U.rod(knee, ankle, 0.068, sm, 8, 0.055));
      side.add(U.sphere(0.075, M.brass, ankle.x, ankle.y, ankle.z, 6, 4));
      side.add(U.rod(ankle, foot, 0.055, sm, 8, 0.012));
      for (const t of [0.5]) {
        const c = knee.clone().lerp(ankle, t);
        const tr = U.torus(0.072, 0.014, M.brass, c.x, c.y, c.z, 3, 10);
        tr.quaternion.setFromUnitVectors(V(0, 0, 1), ankle.clone().sub(knee).normalize()); side.add(tr);
      }
    });
  }
  // 螯：上臂 + 前臂 + 钳（活动指为动态）
  const fingers = [];
  for (const s of [-1, 1]) {
    const sh = V(s * 0.72, 0.0, 0.62), el = V(s * 1.25, 0.32, 1.25), wr = V(s * 1.0, 0.5, 1.85);
    body.add(U.sphere(0.14, M.brass, sh.x, sh.y, sh.z, 8, 6));
    body.add(U.rod(sh, el, 0.12, sm, 12, 0.1));
    body.add(U.sphere(0.13, M.brass, el.x, el.y, el.z, 8, 6));
    body.add(U.rod(el, wr, 0.12, sm, 12, 0.14));
    for (const t of [0.3, 0.7]) { const c = el.clone().lerp(wr, t); const tr = U.torus(0.135, 0.018, M.brass, c.x, c.y, c.z, 3, 12); tr.quaternion.setFromUnitVectors(V(0, 0, 1), wr.clone().sub(el).normalize()); body.add(tr); }
    const claw = new THREE.Group(); claw.position.copy(wr); claw.rotation.y = -s * 0.25; body.add(claw);
    const palm = U.sphere(1, sm, 0, 0, 0.32, 18, 12); palm.scale.set(0.24, 0.3, 0.46); claw.add(palm);
    claw.add(bandZ(0.24, 0.3, 0.2, 0.02, M.brass));
    rivetRingZ(claw, 0.245, 0.3, 0.12, 14, 0.016, M.brass);
    // 固定指（下）
    const fixedF = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.72, 10), sm);
    fixedF.rotation.x = Math.PI / 2 + 0.12; fixedF.position.set(0, -0.12, 1.0); fixedF.scale.set(1, 1, 0.7); claw.add(fixedF);
    for (let k = 0; k < 4; k++) { const tth = new THREE.Mesh(new THREE.ConeGeometry(0.025, 0.07, 5), sm); tth.position.set(0, -0.06, 0.78 + k * 0.12); claw.add(tth); }
    // 活动指（上）
    const mv = dyn(new THREE.Group()); mv.position.set(0, 0.12, 0.68); claw.add(mv);
    const mf = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.66, 10), sm); mf.rotation.x = Math.PI / 2 - 0.12; mf.position.set(0, 0, 0.32); mf.scale.set(1, 1, 0.7); mv.add(mf);
    mv.add(U.sphere(0.07, M.brass, 0, 0, 0, 10, 8));
    for (let k = 0; k < 4; k++) { const tth = new THREE.Mesh(new THREE.ConeGeometry(0.022, 0.06, 5), sm); tth.rotation.x = Math.PI; tth.position.set(0, -0.06, 0.12 + k * 0.11); mv.add(tth); }
    U.mergeStatic(mv);
    fingers.push(mv);
  }
  // 鞍座 + 骑手
  saddle(M, body, 0, B + 0.05, -0.1);
  if (riderSeed != null) seatRider(body, riderSeed, 0, B + 0.12, -0.18);
  U.mergeStatic(bob);
  root.scale.setScalar(scale);
  const ph = seed * 1.7;
  return {
    group: root,
    update(t) {
      bob.position.y = h + Math.sin(t * 1.3 + ph) * 0.16;
      bob.rotation.z = Math.sin(t * 0.9 + ph) * 0.04;
      const o = 0.2 + 0.2 * Math.sin(t * 1.8 + ph);
      fingers[0].rotation.x = -o; fingers[1].rotation.x = -(0.2 + 0.2 * Math.sin(t * 1.8 + ph + 1.3));
    },
  };
}

// ---------- 灯笼鱼（深海鮟鱇） ----------
function makeLanternfish(M, R, { seed = 2, riderSeed = null, scale = 1 } = {}) {
  const h = 1.65;
  const { root, bob } = pistonMount(M, h);
  const body = new THREE.Group(); bob.add(body);
  const SX = 0.82;
  const prof = [[0.0, -1.55], [0.14, -1.45], [0.3, -1.15], [0.5, -0.65], [0.66, -0.1], [0.76, 0.4], [0.8, 0.78], [0.74, 1.08], [0.56, 1.3], [0.3, 1.43], [0.0, 1.47]];
  const rAt = (z) => { for (let i = 0; i < prof.length - 1; i++) { const [r0, z0] = prof[i], [r1, z1] = prof[i + 1]; if (z >= z0 && z <= z1) return r0 + (r1 - r0) * ((z - z0) / (z1 - z0)); } return 0; };
  body.add(bodyZ(prof, R.fishIron, 32, SX, 1));
  // 黄铜箍带 + 铆钉
  for (const z of [-1.0, -0.45, 0.15, 0.7]) {
    const r = rAt(z) * 1.005;
    body.add(bandZ(r * SX, r, z, 0.03, M.brass));
    rivetRingZ(body, r * SX * 1.02, r * 1.02, z + 0.07, 24, 0.017, M.brass);
  }
  // 侧线发光器（光斑）
  for (const s of [-1, 1]) for (let i = 0; i < 8; i++) {
    const z = -1.1 + i * 0.28; const r = rAt(z);
    const a = s > 0 ? -0.35 : Math.PI + 0.35;
    const p = V(Math.cos(a) * r * SX, Math.sin(a) * r, z);
    body.add(U.sphere(0.035, M.glowCyan, p.x, p.y, p.z, 6, 4));
    const ring = U.torus(0.04, 0.008, M.brass, p.x, p.y, p.z, 3, 8); ring.lookAt(p.x * 2, p.y * 2, p.z); body.add(ring);
  }
  // 大眼
  for (const s of [-1, 1]) {
    const ex = s * 0.5, ey = 0.3, ez = 0.92;
    body.add(U.sphere(0.2, M.glassDark, ex, ey, ez, 14, 10));
    const bz = U.torus(0.2, 0.035, M.brass, ex, ey, ez, 5, 20); bz.lookAt(ex * 3, ey, ez + 0.3); body.add(bz);
    for (let k = 0; k < 10; k++) { const a = (k / 10) * TAU; const d = V(Math.cos(a) * 0.235, Math.sin(a) * 0.235, 0).applyQuaternion(bz.quaternion); rivet(body, V(ex, ey, ez).add(d), V(s, 0, 0.2), 0.016, M.brass); }
    body.add(U.sphere(0.06, M.glowCyan, ex + s * 0.15, ey + 0.02, ez + 0.05, 10, 8));
  }
  // 上颚牙
  for (let i = 0; i < 9; i++) {
    const a = Math.PI + 0.25 + (i / 8) * (Math.PI - 0.5);
    const tth = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.22 + (i % 2) * 0.08, 6), M.ivory);
    tth.position.set(Math.cos(a) * 0.42, -0.12 + Math.sin(a) * 0.05, 1.12 + Math.sin(a) * 0.0 - Math.abs(Math.cos(a)) * 0.15);
    tth.rotation.x = Math.PI; body.add(tth);
  }
  // 口腔暗部
  const throat = U.sphere(1, M.glassDark, 0, -0.15, 1.0, 12, 8); throat.scale.set(0.42, 0.18, 0.35); body.add(throat);
  // 下颚（动态开合）
  const jaw = dyn(new THREE.Group()); jaw.position.set(0, -0.12, 0.55); body.add(jaw);
  jaw.add(bodyZ([[0.6, 0], [0.64, 0.25], [0.56, 0.55], [0.36, 0.82], [0.0, 0.95]], R.fishIronDS, 24, SX * 0.92, 0.55, -Math.PI / 2, Math.PI));
  for (let i = 0; i < 9; i++) {
    const a = 0.25 + (i / 8) * (Math.PI - 0.5);
    const zz = 0.55 + Math.sin(a) * 0.28;
    const tth = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.24 + (i % 2) * 0.08, 6), M.ivory);
    tth.position.set(-Math.cos(a) * 0.4, 0.06, zz); jaw.add(tth);
  }
  U.mergeStatic(jaw);
  // 背鳍、胸鳍、尾鳍
  const dorsal = fanFin(M, { len: 0.75, spread: 1.4, rays: 7, a0: 0.9, mat: M.copper });
  dorsal.rotation.y = Math.PI / 2; dorsal.position.set(0, 0.42, -0.7); body.add(dorsal);
  const pecs = [];
  for (const s of [-1, 1]) {
    const pf = new THREE.Group(); pf.position.set(s * 0.6, -0.15, 0.25); pf.rotation.z = s * 0.15; body.add(pf);
    const f = fanFin(M, { len: 0.6, spread: 1.0, rays: 6, a0: -0.5, mat: M.copper });
    f.rotation.set(Math.PI / 2, 0, -Math.PI / 2 + s * 0.4); pf.add(f);
    pecs.push(pf);
  }
  const tail = dyn(new THREE.Group()); tail.position.set(0, 0, -1.45); body.add(tail);
  {
    const f = fanFin(M, { len: 0.95, spread: 1.6, rays: 9, a0: -0.8, mat: M.copper, notch: 0.25 });
    f.rotation.y = Math.PI / 2; tail.add(f);
    tail.add(U.sphere(0.1, M.brass, 0, 0, 0, 10, 8));
    U.mergeStatic(tail);
  }
  // 诱饵杆 + 发光灯泡（灯笼鱼的标志）
  const lure = dyn(new THREE.Group()); lure.position.set(0, 0.72, 0.85); body.add(lure);
  {
    const pts = [V(0, 0, 0), V(0, 0.45, 0.05), V(0, 0.8, 0.35), V(0, 0.88, 0.8), V(0, 0.7, 1.12)];
    lure.add(taperTube(pts, 0.045, 0.022, M.brass, 40, 8));
    const c = new THREE.CatmullRomCurve3(pts);
    for (const t of [0.2, 0.4, 0.6, 0.8]) { const p = c.getPointAt(t); lure.add(U.sphere(0.045, M.brass, p.x, p.y, p.z, 8, 6)); }
    const tip = V(0, 0.55, 1.18);
    lure.add(U.sphere(0.15, M.glowCyan, tip.x, tip.y, tip.z, 14, 10));
    for (let k = 0; k < 4; k++) { const cg = U.torus(0.165, 0.012, M.brass, tip.x, tip.y, tip.z, 4, 20); cg.rotation.y = (k / 4) * Math.PI; lure.add(cg); }
    lure.add(U.cyl(0.05, 0.08, 0.06, M.brass, tip.x, tip.y + 0.17, tip.z, 10));
    lure.add(U.cyl(0.07, 0.05, 0.05, M.brass, tip.x, tip.y - 0.17, tip.z, 10));
  }
  U.mergeStatic(lure);
  saddle(M, body, 0, 0.84, 0.05);
  if (riderSeed != null) seatRider(body, riderSeed, 0, 0.9, -0.02);
  U.mergeStatic(bob);
  root.scale.setScalar(scale);
  const ph = seed * 2.1;
  return {
    group: root,
    update(t) {
      bob.position.y = h + Math.sin(t * 1.1 + ph) * 0.22;
      bob.rotation.x = Math.sin(t * 1.1 + ph + 0.8) * 0.06;
      tail.rotation.y = Math.sin(t * 2.2 + ph) * 0.35;
      jaw.rotation.x = 0.12 + 0.12 * Math.sin(t * 0.8 + ph);
      lure.rotation.x = Math.sin(t * 1.6 + ph) * 0.08;
    },
  };
}

// ---------- 大王乌贼 ----------
function makeSquid(M, R, { seed = 3, riders = [], scale = 1 } = {}) {
  const h = 1.95;
  const { root, bob } = pistonMount(M, h);
  const body = new THREE.Group(); bob.add(body);
  const prof = [[0.0, -2.3], [0.14, -2.18], [0.36, -1.75], [0.58, -1.1], [0.7, -0.4], [0.7, 0.2], [0.63, 0.42], [0.6, 0.47]];
  const rAt = (z) => { for (let i = 0; i < prof.length - 1; i++) { const [r0, z0] = prof[i], [r1, z1] = prof[i + 1]; if (z >= z0 && z <= z1) return r0 + (r1 - r0) * ((z - z0) / (z1 - z0)); } return 0.6; };
  body.add(bodyZ(prof, R.squid, 32));
  // 纵向铆接肋
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * TAU + 0.31;
    const pts = [];
    for (let i = 0; i <= 14; i++) { const z = -2.1 + (2.45 * i) / 14; const r = rAt(z) * 1.012; pts.push(V(Math.cos(a) * r, Math.sin(a) * r, z)); }
    body.add(U.tube(pts, 0.02, M.brass, false, 28, 4));
    for (let i = 1; i < 14; i += 3) for (const da of [-0.09, 0.09]) {
      const z = -2.1 + (2.45 * i) / 14; const r = rAt(z);
      rivet(body, V(Math.cos(a + da) * r, Math.sin(a + da) * r, z), V(Math.cos(a + da), Math.sin(a + da), 0), 0.016, M.brass);
    }
  }
  for (const z of [-1.5, -0.6, 0.3]) body.add(bandZ(rAt(z) * 1.01, rAt(z) * 1.01, z, 0.028, M.brass));
  // 尾鳍（菱形）
  {
    const g = shapeGeo([[0, -2.4], [0.5, -2.2], [1.0, -1.72], [0.75, -1.5], [0.3, -1.2], [-0.3, -1.2], [-0.75, -1.5], [-1.0, -1.72], [-0.5, -2.2]], 0.05, 0.015);
    g.rotateX(Math.PI / 2);
    body.add(U.mesh(g, R.squid));
    for (const s of [-1, 1]) for (let i = 0; i < 5; i++) body.add(U.rod(V(0, 0.03, -1.3 - i * 0.2), V(s * (0.55 + i * 0.1 - (i > 2 ? (i - 2) * 0.25 : 0)), 0.03, -1.55 - i * 0.15), 0.012, M.brass, 4));
  }
  // 颈环 + 头 + 眼
  body.add(bandZ(0.63, 0.63, 0.47, 0.05, M.brass));
  rivetRingZ(body, 0.66, 0.66, 0.47, 24, 0.02, M.brass);
  const head = U.sphere(1, R.squid, 0, 0, 0.78, 24, 14); head.scale.set(0.56, 0.5, 0.55); body.add(head);
  for (const s of [-1, 1]) {
    const ex = s * 0.47, ey = 0.08, ez = 0.8;
    body.add(U.sphere(0.2, M.glassDark, ex, ey, ez, 14, 10));
    const bz = U.torus(0.2, 0.035, M.brass, ex, ey, ez, 5, 20); bz.lookAt(ex * 4, ey, ez); body.add(bz);
  }
  body.add(bandZ(0.36, 0.36, 1.12, 0.04, M.brass));
  // 腕：两组交错摆动 + 一对长触腕
  const armGroups = [];
  const buildArm = (grp, pts, r0, r1, inward, club = false) => {
    const t = taperTube(pts, r0, r1, R.squid, 26, 6);
    grp.add(t);
    const curve = t.userData.tubeMesh.userData.curve;
    const n = club ? 13 : 9;
    for (let i = 2; i < n; i++) {
      const u = club ? 0.55 + 0.43 * (i / n) : 0.1 + 0.85 * (i / n);
      const P = curve.getPointAt(u), T = curve.getTangentAt(u);
      const inw = inward.clone().addScaledVector(T, -T.dot(inward)).normalize();
      const side = new THREE.Vector3().crossVectors(T, inw).normalize();
      const rr = r0 + (r1 - r0) * u;
      for (const sd of [-0.45, 0.45]) {
        const d = inw.clone().multiplyScalar(Math.cos(sd)).addScaledVector(side, Math.sin(sd)).normalize();
        const sk = U.mesh(new THREE.CylinderGeometry(rr * 0.42 * (club ? 1.3 : 1), rr * 0.36 * (club ? 1.3 : 1), 0.03, 6, 1, true), M.ivory);
        sk.position.copy(P).addScaledVector(d, rr * 0.92); sk.quaternion.setFromUnitVectors(UP, d); grp.add(sk);
      }
    }
    const P0 = curve.getPointAt(0.06), T0 = curve.getTangentAt(0.06);
    void P0; void T0;
    if (club) { const P = curve.getPointAt(0.85); const cl = U.sphere(1, R.squid, P.x, P.y, P.z, 14, 10); cl.scale.set(0.11, 0.11, 0.11); grp.add(cl); }
  };
  for (let gi = 0; gi < 2; gi++) {
    const grp = dyn(new THREE.Group()); grp.position.set(0, 0, 1.1); body.add(grp); armGroups.push(grp);
    for (let k = gi; k < 8; k += 2) {
      const a = (k / 8) * TAU + Math.PI / 8;
      const c = Math.cos(a), s = Math.sin(a) * 0.72;
      const curl = 0.6 + 0.25 * Math.sin(k * 1.7);
      const pts = [V(c * 0.28, s * 0.28, 0), V(c * 0.55, s * 0.5, 0.55), V(c * 0.95, s * 0.85 - 0.1, 1.15), V(c * (1.25 + curl * 0.2), s * 1.05 - 0.3, 1.55), V(c * (1.45 + curl * 0.1), s * 0.9 - 0.62, 1.38), V(c * 1.3, s * 0.7 - 0.62, 1.12)];
      buildArm(grp, pts, 0.12, 0.018, V(-c, -s, 0));
    }
    U.mergeStatic(grp);
  }
  const tent = dyn(new THREE.Group()); tent.position.set(0, 0, 1.1); body.add(tent);
  for (const s of [-1, 1]) {
    const pts = [V(s * 0.12, 0.15, 0), V(s * 0.35, 0.6, 0.55), V(s * 0.55, 1.3, 1.0), V(s * 0.75, 1.85, 1.15), V(s * 0.98, 2.05, 0.8), V(s * 1.0, 1.85, 0.5)];
    buildArm(tent, pts, 0.07, 0.02, V(-s, -0.3, 0.6), true);
  }
  U.mergeStatic(tent);
  armGroups.push(tent);
  // 双人鞍座
  const zr = [-0.15, -0.85];
  zr.forEach((z, i) => {
    const y = rAt(z) + 0.04;
    saddle(M, body, 0, y, z, 0.42, 0.55);
    if (riders[i] != null) seatRider(body, riders[i], 0, y + 0.07, z - 0.06);
  });
  U.mergeStatic(bob);
  root.scale.setScalar(scale);
  const ph = seed * 1.3;
  return {
    group: root,
    update(t) {
      bob.position.y = h + Math.sin(t * 0.9 + ph) * 0.2;
      bob.rotation.x = Math.sin(t * 0.9 + ph - 0.6) * 0.05;
      armGroups[0].rotation.x = Math.sin(t * 1.4 + ph) * 0.07;
      armGroups[0].rotation.y = Math.sin(t * 1.1 + ph) * 0.05;
      armGroups[1].rotation.x = Math.sin(t * 1.4 + ph + 2) * 0.07;
      armGroups[1].rotation.y = -Math.sin(t * 1.1 + ph + 1) * 0.05;
      armGroups[2].rotation.x = Math.sin(t * 0.8 + ph) * 0.1;
      armGroups[2].rotation.z = Math.sin(t * 0.6 + ph) * 0.08;
    },
  };
}

// ---------- 鹦鹉螺（对数螺线壳） ----------
function makeNautilusShell(M, R, { seed = 4, riderSeed = null, scale = 1 } = {}) {
  const h = 1.72;
  const { root, bob } = pistonMount(M, h);
  const body = new THREE.Group(); bob.add(body);
  const b = 0.18, R0 = 0.95, TH1 = 3.5 * Math.PI, TH0 = TH1 - 3.6 * Math.PI, LAT = 0.95;
  const rc = (th) => R0 * Math.exp(b * (th - TH1));
  const rho = (th) => 0.6 * rc(th);
  const surf = (th, psi, off = 1) => {
    const r = rc(th), p = rho(th) * off;
    const er = V(0, Math.sin(th), Math.cos(th));
    return V(0, Math.sin(th) * r, Math.cos(th) * r).addScaledVector(er, p * Math.cos(psi)).add(V(LAT * p * Math.sin(psi), 0, 0));
  };
  // 参数曲面网格构造器
  const sheet = (n, m, fn, uvScale = [1, 1]) => {
    const pos = [], uv = [], idx = [];
    for (let i = 0; i <= n; i++) for (let j = 0; j <= m; j++) { const p = fn(i / n, j / m); pos.push(p.x, p.y, p.z); uv.push((i / n) * uvScale[0], (j / m) * uvScale[1]); }
    for (let i = 0; i < n; i++) for (let j = 0; j < m; j++) {
      const a = i * (m + 1) + j, bb = (i + 1) * (m + 1) + j, c = bb + 1, d = a + 1;
      idx.push(a, d, bb, bb, d, c);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx); g.computeVertexNormals();
    return g;
  };
  // 壳体
  body.add(U.mesh(sheet(96, 18, (u, v) => surf(TH0 + (TH1 - TH0) * u, v * TAU), [6, 1]), M.ivory));
  // 虎斑条纹（沿 ψ 方向的锯齿色带，越靠近壳口越淡出）
  const stripeTh = [];
  for (let th = TH0 + 0.5; th < TH1 - 2.2; th += 0.44) stripeTh.push(th);
  for (const th0 of stripeTh) {
    const w = 0.06 + 0.04 * Math.sin(th0 * 3.1);
    body.add(U.mesh(sheet(2, 16, (u, v) => {
      const psi = -1.75 + 3.5 * v;
      const th = th0 + 0.09 * Math.sin(psi * 3 + th0) + 0.12 * psi * psi * 0.25 + (u - 0.5) * w * (1 - Math.abs(psi) / 2.2);
      return surf(th, psi, 1.012);
    }), R.nautStripe));
  }
  // 黄铜隔板肋 + 铆钉
  for (let th = TH1 - 0.15; th > TH1 - 2.3 * Math.PI; th -= Math.PI / 3) {
    const pts = [];
    for (let k = 0; k < 28; k++) pts.push(surf(th, (k / 28) * TAU, 1.02));
    body.add(U.tube(pts, Math.max(0.012, rho(th) * 0.05), M.brass, true, 28, 4));
    for (let k = 0; k < 12; k++) {
      const psi = -1.9 + (3.8 * k) / 11;
      const p = surf(th + 0.06, psi, 1.0), q = surf(th + 0.06, psi, 1.5);
      rivet(body, p, q.sub(p), Math.max(0.01, rho(th) * 0.035), M.brass);
    }
  }
  // 壳口：黄铜唇环 + 暗腔 + 头罩 + 眼 + 触手
  {
    const pts = [];
    for (let k = 0; k < 32; k++) pts.push(surf(TH1, (k / 32) * TAU, 1.03));
    body.add(U.tube(pts, 0.045, M.brass, true, 40, 5));
    const C = V(0, -R0, 0), P = rho(TH1);
    const cave = new THREE.Mesh(new THREE.CircleGeometry(1, 24), M.glassDark);
    cave.scale.set(LAT * P * 0.98, P * 0.98, 1); cave.position.set(C.x, C.y, C.z - 0.03); body.add(cave);
    const hood = U.sphere(1, R.nautHood, 0, C.y + P * 0.45, 0.12, 28, 16); hood.scale.set(LAT * P * 0.9, P * 0.5, 0.42); body.add(hood);
    for (let k = 0; k < 7; k++) { const a = -0.9 + (k / 6) * 1.8; rivet(body, V(Math.sin(a) * LAT * P * 0.86, C.y + P * 0.45 + Math.cos(a) * P * 0.2, 0.38), V(Math.sin(a), 0.6, 1), 0.016, M.brass); }
    for (const s of [-1, 1]) {
      const ex = s * LAT * P * 0.82, ey = C.y + P * 0.1, ez = 0.12;
      body.add(U.sphere(0.12, M.glassDark, ex, ey, ez, 16, 12));
      const bz = U.torus(0.12, 0.025, M.brass, ex, ey, ez, 6, 22); bz.lookAt(ex * 3, ey, ez + 0.4); body.add(bz);
    }
    const r = rng(seed * 97);
    for (let k = 0; k < 10; k++) {
      const a = Math.PI * 0.15 + (k / 9) * Math.PI * 0.7; // 下半圈
      const x0 = Math.cos(a) * LAT * P * 0.75, y0 = C.y - Math.sin(a) * P * 0.55 + 0.1;
      const len = 0.6 + r() * 0.45, dx = Math.cos(a) * 0.35;
      const pts2 = [V(x0, y0, 0.05), V(x0 + dx * 0.4, y0 - 0.05, 0.05 + len * 0.45), V(x0 + dx, y0 - 0.25 - r() * 0.15, len * 0.85), V(x0 + dx * 1.1, y0 - 0.12 + r() * 0.1, len)];
      body.add(taperTube(pts2, 0.045, 0.01, R.nautHood, 12, 5));
    }
  }
  // 顶部鞍座
  const topY = rc(2.5 * Math.PI) + rho(2.5 * Math.PI);
  saddle(M, body, 0, topY + 0.04, 0.0, 0.4, 0.55);
  if (riderSeed != null) seatRider(body, riderSeed, 0, topY + 0.1, -0.06);
  U.mergeStatic(bob);
  root.scale.setScalar(scale);
  const ph = seed * 0.9;
  return {
    group: root,
    update(t) {
      bob.position.y = h + Math.sin(t * 1.0 + ph) * 0.2;
      bob.rotation.x = Math.sin(t * 1.0 + ph + 1.2) * 0.07;
    },
  };
}

// ---------- 蝠鲼（扇动双翼） ----------
function makeManta(M, R, { seed = 5, riders = [], scale = 1 } = {}) {
  const h = 2.0;
  const { root, bob } = pistonMount(M, h);
  const body = new THREE.Group(); bob.add(body);
  const top = U.sphere(1, R.mantaTop, 0, 0, 0, 28, 14); top.scale.set(0.62, 0.26, 1.05); body.add(top);
  const belly = U.sphere(1, M.paintCream, 0, -0.04, 0, 32, 12); belly.scale.set(0.6, 0.17, 1.0); body.add(belly);
  // 背部铆接板纹
  for (const z of [-0.6, -0.25, 0.1, 0.45]) {
    const pts = [];
    const ax = 0.62 * Math.sqrt(1 - (z / 1.05) ** 2) * 0.96;
    for (let i = 0; i <= 12; i++) pts.push(ellPoint(0.62, 0.26, 1.05, -ax + (2 * ax * i) / 12, z, 0.008).p);
    body.add(U.tube(pts, 0.016, M.brass, false, 14, 4));
    for (let i = 1; i < 12; i += 2) { const e = ellPoint(0.62, 0.26, 1.05, pts[i].x, z + 0.05); rivet(body, e.p, e.n, 0.014, M.brass); }
  }
  // 头鳍（卷曲角）+ 眼
  for (const s of [-1, 1]) {
    const cf = U.torus(0.17, 0.05, R.mantaTop, s * 0.36, -0.02, 1.0, 8, 18, Math.PI * 1.25);
    cf.rotation.set(0, Math.PI / 2, s > 0 ? 0.3 : 0.3); body.add(cf);
    body.add(U.sphere(0.1, M.glassDark, s * 0.52, 0.04, 0.8, 12, 10));
    const bz = U.torus(0.1, 0.02, M.brass, s * 0.52, 0.04, 0.8, 5, 18); bz.lookAt(s * 3, 0.04, 1.2); body.add(bz);
  }
  // 尾鞭 + 小背鳍
  body.add(taperTube([V(0, 0, -0.95), V(0, 0.02, -1.6), V(0, 0.08, -2.2), V(0, 0.18, -2.75)], 0.07, 0.012, R.mantaTop, 30, 6));
  const df = new THREE.Mesh(shapeGeo([[0, 0], [0.32, 0.0], [0.05, 0.22]], 0.03, 0.01), R.mantaTop);
  df.rotation.y = Math.PI / 2; df.position.set(0, 0.12, -0.85); body.add(df);
  // 双翼（左右分别建模，动态扇动）
  const wings = [];
  const lead = (t) => 0.85 * (1 - t) ** 1.4 - 0.25 * t + 0.25 * Math.sin(t * Math.PI);
  const trail = (t) => -0.85 * (1 - t) - 0.25 * t + 0.22 * Math.sin(t * Math.PI) + 0.12 * Math.sin(t * Math.PI * 2);
  for (const s of [-1, 1]) {
    const w = dyn(new THREE.Group()); w.position.set(s * 0.52, 0, 0); body.add(w);
    const pts = [];
    const N = 24;
    for (let i = 0; i <= N; i++) { const t = i / N; pts.push([s * 2.0 * t, lead(t)]); }
    for (let i = N - 1; i >= 1; i--) { const t = i / N; pts.push([s * 2.0 * t, trail(t)]); }
    pts.push([0, trail(0)]);
    // shape 的 y → +z（翼面水平，前缘朝前）
    const gTop = shapeGeo(pts, 0.09, 0.03); gTop.rotateX(Math.PI / 2);
    w.add(U.mesh(gTop, R.mantaTop));
    // 黄铜翼肋 + 铆钉
    for (let k = 0; k < 5; k++) {
      const t = 0.2 + k * 0.17;
      const mid = (lead(t) + trail(t)) / 2;
      const a = V(0, 0.065, 0.45 - k * 0.15), e = V(s * 2.0 * t, 0.065, mid);
      w.add(U.rod(a, e, 0.016, M.brass, 5));
      for (let q = 1; q < 6; q += 2) { const p = a.clone().lerp(e, q / 6); rivet(w, p.add(V(0, 0.012, 0)), UP, 0.014, M.brass); }
    }
    // 前缘黄铜包边
    const lp = []; for (let i = 0; i <= 12; i++) { const t = i / 12; lp.push(V(s * 2.0 * t * 0.99, 0.0, lead(t) * 0.99)); }
    w.add(U.tube(lp, 0.03, M.brass, false, 24, 4));
    w.add(U.sphere(0.09, M.brass, 0, 0, 0, 10, 8));
    U.mergeStatic(w);
    wings.push(w);
  }
  // 双人鞍座
  [0.25, -0.4].forEach((z, i) => {
    saddle(M, body, 0, 0.27, z, 0.4, 0.5);
    if (riders[i] != null) seatRider(body, riders[i], 0, 0.33, z - 0.05);
  });
  U.mergeStatic(bob);
  root.scale.setScalar(scale);
  const ph = seed * 1.1;
  return {
    group: root,
    update(t) {
      const f = Math.sin(t * 1.6 + ph);
      bob.position.y = h + Math.sin(t * 1.6 + ph - 1.2) * 0.22;
      bob.rotation.x = Math.sin(t * 1.6 + ph - 0.4) * 0.06;
      wings[0].rotation.z = -f * 0.34; wings[1].rotation.z = f * 0.34;
    },
  };
}

// ---------- 海龟 ----------
function makeTurtle(M, R, { seed = 6, riderSeed = null, scale = 1 } = {}) {
  const h = 1.55;
  const { root, bob } = pistonMount(M, h);
  const body = new THREE.Group(); bob.add(body);
  const A = 1.05, B = 0.52, C = 1.3;
  const shell = U.mesh(new THREE.SphereGeometry(1, 32, 10, 0, TAU, 0, Math.PI / 2), M.patina); shell.scale.set(A, B, C); body.add(shell);
  const plast = U.sphere(1, M.paintCream, 0, 0.0, 0, 28, 10); plast.scale.set(A * 0.92, 0.17, C * 0.92); body.add(plast);
  // 盾片：中央 5 + 两侧各 4（六角铜板 + 黄铜框 + 铆钉）
  const scutes = [];
  for (let i = 0; i < 5; i++) scutes.push([0, -0.9 + i * 0.45, 0.24]);
  for (const s of [-1, 1]) for (let i = 0; i < 4; i++) scutes.push([s * 0.56, -0.7 + i * 0.46, 0.22]);
  const rx90 = new THREE.Quaternion().setFromAxisAngle(V(1, 0, 0), Math.PI / 2);
  for (const [x, z, r] of scutes) {
    const e = ellPoint(A, B, C, x, z, 0.0);
    const q = new THREE.Quaternion().setFromUnitVectors(UP, e.n);
    const plate = U.cyl(r * 0.9, r, 0.05, M.copper, 0, 0, 0, 6);
    plate.position.copy(e.p).addScaledVector(e.n, 0.012); plate.quaternion.copy(q); body.add(plate);
    const fr = U.torus(r, 0.022, M.brass, 0, 0, 0, 4, 6);
    fr.position.copy(e.p).addScaledVector(e.n, 0.035);
    fr.quaternion.copy(q).multiply(rx90); body.add(fr);
    for (let k = 0; k < 6; k += 2) { const a = (k / 6) * TAU; const d = V(Math.cos(a) * r * 0.62, 0, Math.sin(a) * r * 0.62).applyQuaternion(q); rivet(body, e.p.clone().add(d).addScaledVector(e.n, 0.035), e.n, 0.016, M.brass); }
  }
  // 缘盾（扇贝边）+ 黄铜边
  {
    const pts = [];
    for (let i = 0; i < 48; i++) { const a = (i / 48) * TAU; pts.push(V(Math.cos(a) * A * 1.01, 0.02, Math.sin(a) * C * 1.01)); }
    body.add(U.tube(pts, 0.045, M.brass, true, 56, 5));
    for (let i = 0; i < 26; i++) {
      const a = (i / 26) * TAU;
      if (Math.sin(a) > 0.93) continue; // 头部开口
      const m = U.sphere(1, M.patina, Math.cos(a) * A * 1.04, 0.0, Math.sin(a) * C * 1.04, 6, 4);
      m.scale.set(0.16, 0.05, 0.16); m.rotation.y = -a; body.add(m);
    }
  }
  // 头颈
  body.add(U.rod(V(0, 0.02, 1.05), V(0, 0.1, 1.5), 0.17, R.turtleSkin, 14, 0.2));
  for (const t of [0.3, 0.65]) body.add(place(bandZ(0.2, 0.19, 0, 0.02, M.brass, 18), 0, 0.02 + 0.08 * t, 1.05 + 0.45 * t, -0.17));
  const head = U.sphere(1, R.turtleSkin, 0, 0.14, 1.72, 24, 16); head.scale.set(0.26, 0.22, 0.34); body.add(head);
  const beak = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.2, 10), M.brass); beak.rotation.x = Math.PI / 2 + 0.4; beak.position.set(0, 0.06, 2.02); beak.scale.set(1, 1, 0.6); body.add(beak);
  for (const s of [-1, 1]) {
    body.add(U.sphere(0.07, M.glassDark, s * 0.2, 0.2, 1.84, 12, 10));
    const bz = U.torus(0.07, 0.015, M.brass, s * 0.2, 0.2, 1.84, 5, 16); bz.lookAt(s * 3, 0.3, 2.4); body.add(bz);
  }
  // 鳍状肢（shape 的 y → +z 前缘）
  const flipper = (s, len, wid) => {
    const g = new THREE.Group();
    const pts = [];
    for (let i = 0; i <= 14; i++) { const t = i / 14; pts.push([s * len * t, wid * Math.sin(Math.PI * Math.pow(t, 0.8)) * (1 - t * 0.3) + 0.0001 * i]); }
    for (let i = 13; i >= 1; i--) { const t = i / 14; pts.push([s * len * t, -wid * 0.35 * Math.sin(Math.PI * t)]); }
    const geo = shapeGeo(pts, 0.07, 0.025); geo.rotateX(Math.PI / 2);
    g.add(U.mesh(geo, R.turtleSkin));
    for (let k = 1; k < 5; k++) g.add(U.cyl(0.05, 0.06, 0.03, M.brass, s * len * (k / 5), 0.05, wid * 0.2, 6));
    g.add(U.rod(V(0, 0.05, 0), V(s * len * 0.9, 0.05, wid * 0.1), 0.014, M.brass, 5));
    return g;
  };
  const fronts = [];
  for (const s of [-1, 1]) {
    const f = dyn(new THREE.Group()); f.position.set(s * 0.82, -0.03, 0.75); body.add(f);
    const fl = flipper(s, 1.3, 0.42); fl.rotation.y = s * 0.45; f.add(fl);
    f.add(U.sphere(0.13, M.brass, 0, 0, 0, 10, 8));
    U.mergeStatic(f); fronts.push(f);
    const b2 = flipper(s, 0.6, 0.25); b2.position.set(s * 0.7, -0.03, -0.95); b2.rotation.y = s * 1.1; body.add(b2);
  }
  body.add(place(new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.3, 8), R.turtleSkin), 0, -0.02, -1.38, -Math.PI / 2));
  saddle(M, body, 0, B + 0.05, -0.05, 0.42, 0.6);
  if (riderSeed != null) seatRider(body, riderSeed, 0, B + 0.12, -0.12);
  U.mergeStatic(bob);
  root.scale.setScalar(scale);
  const ph = seed * 0.77;
  return {
    group: root,
    update(t) {
      const f = Math.sin(t * 1.2 + ph);
      bob.position.y = h + Math.sin(t * 1.2 + ph - 1) * 0.18;
      bob.rotation.z = Math.sin(t * 0.7 + ph) * 0.04;
      fronts[0].rotation.set(0, -f * 0.35, -f * 0.25);
      fronts[1].rotation.set(0, f * 0.35, f * 0.25);
    },
  };
}

// ---------- 河豚（呼吸鼓胀） ----------
function makePuffer(M, R, { seed = 7, riderSeed = null, scale = 1 } = {}) {
  const h = 1.55;
  const { root, bob } = pistonMount(M, h);
  const body = new THREE.Group(); bob.add(body);
  const puff = dyn(new THREE.Group()); body.add(puff);
  const RB = 0.92;
  const ball = U.sphere(RB, R.puffer, 0, 0, 0, 28, 18); ball.scale.set(1, 0.95, 1.08); puff.add(ball);
  const bellyM = U.mesh(new THREE.SphereGeometry(RB * 1.004, 28, 6, 0, TAU, Math.PI * 0.62, Math.PI * 0.38), M.paintCream); bellyM.scale.set(1, 0.95, 1.08); puff.add(bellyM);
  // 纬向 + 经向黄铜带
  for (const lat of [-0.35, 0.0, 0.38]) {
    const y = Math.sin(lat) * RB * 0.95, r = Math.cos(lat) * RB;
    const t = U.torus(r * 1.005, 0.018, M.brass, 0, y, 0, 4, 40); t.rotation.x = Math.PI / 2; t.scale.set(1, 1.08, 1); puff.add(t);
  }
  for (let k = 0; k < 4; k++) { const t = U.torus(RB * 1.005, 0.016, M.brass, 0, 0, 0, 4, 28, Math.PI); t.rotation.set(0, (k / 4) * Math.PI, 0); t.scale.set(1, 0.95, 1.08); puff.add(t); }
  // 尖刺（斐波那契球面分布，避开脸与鞍座）
  const N = 90, ga = Math.PI * (3 - Math.sqrt(5));
  const spikeGeo = new THREE.ConeGeometry(0.042, 0.26, 5);
  const baseGeo = new THREE.CylinderGeometry(0.05, 0.06, 0.03, 5, 1, true);
  for (let i = 0; i < N; i++) {
    const y = 1 - (i / (N - 1)) * 2, r = Math.sqrt(1 - y * y), th = i * ga;
    const n = V(Math.cos(th) * r, y, Math.sin(th) * r);
    if (n.z > 0.72 || n.y > 0.8) continue;
    const p = V(n.x * RB, n.y * RB * 0.95, n.z * RB * 1.08);
    const sp = new THREE.Mesh(spikeGeo, M.steel); sp.position.copy(p).addScaledVector(n, 0.1); sp.quaternion.setFromUnitVectors(UP, n); puff.add(sp);
    const bs = new THREE.Mesh(baseGeo, M.brass); bs.position.copy(p); bs.quaternion.setFromUnitVectors(UP, n); puff.add(bs);
  }
  U.mergeStatic(puff);
  // 脸：大眼 + 嘟嘴
  for (const s of [-1, 1]) {
    const ex = s * 0.42, ey = 0.22, ez = 0.85;
    body.add(U.sphere(0.2, M.glassDark, ex, ey, ez, 14, 10));
    const bz = U.torus(0.2, 0.04, M.brass, ex, ey, ez, 5, 20); bz.lookAt(ex * 2.2, ey + 0.2, ez + 1.2); body.add(bz);
  }
  body.add(U.torus(0.13, 0.06, M.copper, 0, -0.18, 1.02, 10, 24));
  body.add(place(U.cyl(0.11, 0.11, 0.05, M.glassDark, 0, 0, 0, 12), 0, -0.18, 1.02, Math.PI / 2));
  // 尾鳍 + 胸鳍
  const tail = dyn(new THREE.Group()); tail.position.set(0, 0.05, -1.0); body.add(tail);
  { const f = fanFin(M, { len: 0.75, spread: 1.4, rays: 8, a0: -0.7, mat: R.puffer, notch: 0.2 }); f.rotation.y = Math.PI / 2; tail.add(f); tail.add(U.sphere(0.1, M.brass, 0, 0, 0, 10, 8)); }
  U.mergeStatic(tail);
  const pecs = [];
  for (const s of [-1, 1]) {
    const pf = new THREE.Group(); pf.position.set(s * 0.88, -0.05, 0.2); body.add(pf);
    const f = fanFin(M, { len: 0.42, spread: 1.0, rays: 5, a0: -0.5, mat: R.puffer }); f.rotation.set(0, s > 0 ? 0.6 : Math.PI - 0.6, 0); pf.add(f);
    pecs.push(pf);
  }
  saddle(M, body, 0, RB * 0.93, -0.1, 0.42, 0.55);
  if (riderSeed != null) seatRider(body, riderSeed, 0, RB * 0.93 + 0.07, -0.16);
  U.mergeStatic(bob);
  root.scale.setScalar(scale);
  const ph = seed * 1.9;
  return {
    group: root,
    update(t) {
      bob.position.y = h + Math.sin(t * 1.4 + ph) * 0.2;
      puff.scale.setScalar(1 + 0.06 * Math.max(0, Math.sin(t * 0.7 + ph)) ** 2);
      tail.rotation.y = Math.sin(t * 3 + ph) * 0.4;
    },
  };
}

// ═════════════════════════════════════════════════════════════
//  小船 / 贝壳长椅 / 海底布景
// ═════════════════════════════════════════════════════════════

/** 参数曲面网格：fn(u,v) → Vector3；flip 反转朝向 */
function gridGeo(n, m, fn, uvScale = [1, 1], flip = false) {
  const pos = [], uv = [], idx = [];
  for (let i = 0; i <= n; i++) for (let j = 0; j <= m; j++) { const p = fn(i / n, j / m); pos.push(p.x, p.y, p.z); uv.push((i / n) * uvScale[0], (j / m) * uvScale[1]); }
  for (let i = 0; i < n; i++) for (let j = 0; j < m; j++) {
    const a = i * (m + 1) + j, b = (i + 1) * (m + 1) + j, c = b + 1, d = a + 1;
    if (flip) idx.push(a, b, d, b, c, d); else idx.push(a, d, b, b, d, c);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}

// ---------- 维多利亚游船（带条纹遮篷） ----------
function makeBoat(M, R, { seed = 8, riders = [], hullMat, awning, scale = 1 } = {}) {
  const root = new THREE.Group();
  const bob = dyn(new THREE.Group()); bob.position.y = 0.28; root.add(bob);
  const L = 3.6, W = 0.78, D = 0.7;
  const halfW = (t) => (t > 0 ? W * Math.pow(Math.max(0, 1 - t * t), 0.55) : W * (1 - 0.5 * t * t));
  const yTop = (t) => D + 0.2 * t * t + (t > 0 ? 0.12 * t ** 4 : 0);
  const yKeel = (t) => 0.05 * t * t * (t > 0 ? 3 : 1);
  const hullPt = (t, phi, inset = 0) => {
    const w = Math.max(0, halfW(t) - inset), sp = Math.sin(phi);
    const x = w * Math.sign(sp) * Math.pow(Math.abs(sp), 0.7);
    const y = yKeel(t) + inset + (yTop(t) - yKeel(t) - inset) * (1 - Math.pow(Math.abs(Math.cos(phi)), 0.8));
    return V(x, y, (t * L) / 2);
  };
  const n = 20, m = 12;
  const fn = (inset) => (u, v) => hullPt(-1 + 2 * u, -Math.PI / 2 + Math.PI * v, inset);
  bob.add(U.mesh(gridGeo(n, m, fn(0), [1, 1]), hullMat || M.paintNavy));
  bob.add(U.mesh(gridGeo(n, m, fn(0.035), [3, 2], true), M.wood));
  // 艉板
  {
    const s = new THREE.Shape();
    for (let j = 0; j <= m; j++) { const p = hullPt(-1, -Math.PI / 2 + (Math.PI * j) / m); j ? s.lineTo(p.x, p.y) : s.moveTo(p.x, p.y); }
    const tr = U.mesh(new THREE.ShapeGeometry(s), M.woodDark); tr.position.z = -L / 2 - 0.005; tr.rotation.y = Math.PI; bob.add(tr);
    const tr2 = U.mesh(new THREE.ShapeGeometry(s), M.woodDark); tr2.position.z = -L / 2 + 0.03; bob.add(tr2);
    bob.add(U.box(0.6, 0.18, 0.02, M.gold, 0, yTop(-1) - 0.2, -L / 2 - 0.02));
  }
  // 舷缘（深色木 + 金色腰线）
  for (const s of [-1, 1]) {
    const top = [], stripe = [];
    for (let i = 0; i <= 14; i++) { const t = -1 + (2 * i) / 14; top.push(hullPt(t, (s * Math.PI) / 2).add(V(0, 0.015, 0))); const p = hullPt(t, s * Math.PI * 0.42); stripe.push(p.add(V(s * 0.012, 0, 0))); }
    bob.add(U.tube(top, 0.04, M.woodDark, false, 32, 4));
    bob.add(U.tube(stripe, 0.018, M.gold, false, 32, 4));
  }
  bob.add(U.tube([hullPt(1, 0).add(V(0, 0, 0.03)), hullPt(0.985, 0).lerp(V(0, yTop(1), L / 2), 0.5).add(V(0, 0, 0.07)), V(0, yTop(1) + 0.02, L / 2 + 0.04)], 0.035, M.gold, false, 16, 6)); // 艏柱包铜
  // 船首卷涡饰
  bob.add(place(U.torus(0.12, 0.025, M.gold, 0, 0, 0, 6, 18, Math.PI * 1.6), 0, yTop(1) + 0.08, L / 2 + 0.02, 0, Math.PI / 2, 0));
  bob.add(U.sphere(0.05, M.gold, 0, yTop(1) + 0.2, L / 2 - 0.02, 10, 8));
  // 座板 + 坐垫 + 地板
  for (const t of [-0.55, 0.0, 0.5]) {
    const z = (t * L) / 2, w = halfW(t) * 2 * 0.93, y = D * 0.62 + yKeel(t);
    bob.add(U.box(w, 0.05, 0.3, M.wood, 0, y, z));
    if (t <= 0) bob.add(U.box(w * 0.85, 0.07, 0.26, M.leather, 0, y + 0.06, z));
  }
  bob.add(U.box(0.6, 0.03, L * 0.7, M.wood, 0, 0.14, -0.1));
  // 桨架 + 桨
  for (const s of [-1, 1]) {
    const p = hullPt(0.12, (s * Math.PI) / 2);
    bob.add(U.cyl(0.02, 0.02, 0.12, M.gold, p.x, p.y + 0.08, p.z, 6));
    bob.add(U.torus(0.04, 0.012, M.gold, p.x, p.y + 0.15, p.z, 4, 10));
    const a = V(-s * 0.35, p.y + 0.3, p.z - 0.4), b = V(s * 1.6, 0.05, p.z + 0.5);
    bob.add(U.rod(a, b, 0.025, M.wood, 6));
    const bl = U.box(0.09, 0.02, 0.48, M.woodDark, 0, 0, 0); bl.position.copy(b).add(V(s * 0.05, -0.02, 0.15)); bl.lookAt(b.clone().add(b.clone().sub(a))); bob.add(bl);
  }
  // 遮篷：四根黄铜杆 + 条纹拱顶 + 流苏
  const aw = awning || M.stripeRed;
  const posts = [[-0.55, -0.85], [0.55, -0.85], [-0.55, 0.65], [0.55, 0.65]];
  for (const [x, z] of posts) { const y0 = D * 0.62 + 0.02; bob.add(U.cyl(0.02, 0.02, 1.55, M.gold, x, y0 + 0.78, z, 8)); bob.add(U.sphere(0.035, M.gold, x, y0 + 1.56, z, 8, 6)); }
  {
    const g = new THREE.CylinderGeometry(0.66, 0.66, 1.75, 20, 1, true, -Math.PI / 2, Math.PI);
    g.rotateX(-Math.PI / 2); g.scale(1, 0.42, 1);
    bob.add(U.mesh(g, aw, 0, D * 0.62 + 1.58, -0.1));
    for (const s of [-1, 1]) {
      bob.add(U.rod(V(s * 0.66, D * 0.62 + 1.58, -0.98), V(s * 0.66, D * 0.62 + 1.58, 0.78), 0.02, M.gold, 6));
      for (let k = 0; k < 8; k++) bob.add(U.sphere(0.035, M.gold, s * 0.67, D * 0.62 + 1.5, -0.92 + k * 0.24, 5, 3));
    }
    for (const z of [-0.975, 0.775]) { const arc = U.torus(0.66, 0.018, M.gold, 0, 0, 0, 5, 20, Math.PI); arc.scale.set(1, 0.42, 1); arc.position.set(0, D * 0.62 + 1.58, z); bob.add(arc); }
  }
  // 船首灯 + 船尾小旗
  bob.add(U.cyl(0.015, 0.015, 0.9, M.gold, 0, yTop(-1) + 0.45, -L / 2 + 0.15, 6));
  { const fl = U.mesh(shapeGeo([[0, 0], [0, 0.28], [-0.45, 0.14]], 0.01, 0), aw, 0, yTop(-1) + 0.6, -L / 2 + 0.15); fl.rotation.y = Math.PI / 2; bob.add(fl); }
  riders.forEach((rs, i) => { if (rs != null) { const z = i === 0 ? 0.0 : (-0.55 * L) / 2; seatRider(bob, rs, 0, D * 0.62 + 0.1 + yKeel(i ? -0.55 : 0), z - 0.05); } });
  U.mergeStatic(bob);
  root.scale.setScalar(scale);
  const ph = seed * 1.37;
  return {
    group: root,
    update(t) {
      bob.position.y = 0.28 + Math.sin(t * 1.1 + ph) * 0.12;
      bob.rotation.z = Math.sin(t * 0.9 + ph) * 0.07;
      bob.rotation.x = Math.sin(t * 1.1 + ph + 1.4) * 0.05;
    },
  };
}

// ---------- 扇贝长椅 ----------
function makeShellBench(M, R, { riders = [] } = {}) {
  const g = new THREE.Group();
  // 扇贝靠背：带放射棱的碟面
  const RAD = 1.25, RIBS = 13;
  const sh = gridGeo(26, 52, (u, v) => {
    const a = -1.3 + 2.6 * v, rr = RAD * u * (1 + 0.03 * Math.cos(v * RIBS * TAU));
    const rib = 0.07 * Math.pow(Math.abs(Math.cos(v * RIBS * Math.PI)), 1.5) * u;
    return V(Math.sin(a) * rr, Math.cos(a) * rr, -0.22 * u * u - rib);
  });
  const shell = U.mesh(sh, R.shellDS); shell.position.set(0, 0.55, -0.32); shell.rotation.x = -0.18; g.add(shell);
  const rimPts = []; for (let k = 0; k <= 40; k++) { const v = k / 40, a = -1.3 + 2.6 * v, rr = RAD * (1 + 0.03 * Math.cos(v * RIBS * TAU)); rimPts.push(V(Math.sin(a) * rr, Math.cos(a) * rr, -0.22 - 0.07 * Math.pow(Math.abs(Math.cos(v * RIBS * Math.PI)), 1.5))); }
  const rim = U.tube(rimPts, 0.03, M.gold, false, 120, 6); rim.position.copy(shell.position); rim.rotation.copy(shell.rotation); g.add(rim);
  g.add(U.sphere(0.12, M.gold, 0, 0.55, -0.3, 12, 8));
  // 座面 + 黄铜框 + 卷腿
  g.add(U.box(1.9, 0.12, 0.6, M.leather, 0, 0.5, 0.02));
  g.add(U.box(2.0, 0.06, 0.66, M.brass, 0, 0.42, 0.02));
  for (const x of [-0.85, 0.85]) for (const z of [-0.2, 0.25]) {
    g.add(U.tube([V(x, 0.4, z), V(x * 1.05, 0.22, z + Math.sign(z) * 0.05), V(x * 1.12, 0.05, z + Math.sign(z) * 0.1)], 0.035, M.brass, false, 12, 6));
    g.add(place(U.torus(0.06, 0.018, M.brass, 0, 0, 0, 5, 12, Math.PI * 1.5), x * 1.12, 0.07, z + Math.sign(z) * 0.1, 0, Math.PI / 2, 0));
  }
  // 两侧珊瑚扶手
  for (const s of [-1, 1]) g.add(U.tube([V(s * 0.98, 0.45, 0.25), V(s * 1.05, 0.72, 0.2), V(s * 1.0, 0.82, -0.05), V(s * 0.95, 0.9, -0.3)], 0.045, R.coral, false, 16, 6));
  riders.forEach((rs, i) => { if (rs != null) { const p = person2(rs, { child: i === 1 }); for (const l of p.userData.legs) l.rotation.x = -1.45; for (const a of p.userData.arms) a.rotation.x = -0.3; p.position.set(i ? 0.45 : -0.45, 0.56 - 0.9 * p.scale.y, 0.05); g.add(p); } });
  return g;
}

// ---------- 海底布景：岩石 / 珊瑚 / 海藻 / 海星 ----------
function rockLump(M, r, seed, mat) {
  const rnd = rng(seed);
  const geo = new THREE.IcosahedronGeometry(r, 1);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const v = V(p.getX(i), p.getY(i), p.getZ(i));
    const k = 0.75 + 0.35 * Math.sin(v.x * 3.1 + seed) * Math.cos(v.z * 2.7 + seed * 0.3) * 0.5 + rnd() * 0.12;
    v.multiplyScalar(k); if (v.y < 0) v.y *= 0.3;
    p.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();
  return U.mesh(geo, mat || M.rock);
}
function coral(R, seed, size = 1) {
  const g = new THREE.Group(), rnd = rng(seed);
  const grow = (p, dir, len, r, depth) => {
    const e = p.clone().addScaledVector(dir, len);
    g.add(U.rod(p, e, r, R.coral, 5, r * 0.75));
    if (depth === 0) { g.add(U.sphere(r * 1.1, R.coral, e.x, e.y, e.z, 5, 3)); return; }
    const k = 2 + (rnd() < 0.25 ? 1 : 0);
    for (let i = 0; i < k; i++) {
      const nd = dir.clone().add(V(rnd() - 0.5, rnd() * 0.3, rnd() - 0.5).multiplyScalar(1.1)).normalize();
      grow(e, nd, len * 0.72, r * 0.72, depth - 1);
    }
  };
  grow(V(0, 0, 0), V(0, 1, 0), 0.5 * size, 0.07 * size, 3);
  return g;
}
function seaFan(R, h = 1.2) {
  const g = new THREE.Group();
  const pts = [[0, 0]]; for (let i = 0; i <= 16; i++) { const a = 0.35 + (i / 16) * (Math.PI - 0.7); pts.push([Math.cos(a) * h * 0.7, Math.sin(a) * h * (0.85 + 0.15 * Math.sin(i * 1.7))]); }
  g.add(U.mesh(shapeGeo(pts, 0.015, 0), R.seaFan));
  for (let i = 0; i <= 8; i++) { const a = 0.35 + (i / 8) * (Math.PI - 0.7); g.add(U.rod(V(0, 0, 0.012), V(Math.cos(a) * h * 0.65, Math.sin(a) * h * 0.82, 0.012), 0.012, R.coral, 4)); }
  return g;
}
function kelp(R, seed, h = 2.2) {
  const rnd = rng(seed), g = new THREE.Group();
  for (let k = 0; k < 2; k++) {
    const pts = []; const ox = (rnd() - 0.5) * 0.3, oz = (rnd() - 0.5) * 0.3, hh = h * (0.7 + rnd() * 0.4);
    for (let i = 0; i <= 6; i++) { const t = i / 6; pts.push(V(ox + Math.sin(t * 5 + k) * 0.18 * t, t * hh, oz + Math.cos(t * 4 + k) * 0.12 * t)); }
    g.add(taperTube(pts, 0.045, 0.012, R.kelp, 16, 4, false));
    for (let i = 1; i < 6; i += 1) { const p = pts[i]; const leaf = U.sphere(1, R.kelp, p.x + 0.08, p.y, p.z, 5, 3); leaf.scale.set(0.16, 0.05, 0.07); leaf.rotation.z = 0.6 * (i % 2 ? 1 : -1); g.add(leaf); }
  }
  return g;
}
function starfish(M, R, s = 0.35) {
  const pts = []; for (let i = 0; i < 10; i++) { const a = (i / 10) * TAU + Math.PI / 2, r = i % 2 ? s * 0.4 : s; pts.push([Math.cos(a) * r, Math.sin(a) * r]); }
  const g = shapeGeo(pts, 0.05, 0.02); g.rotateX(-Math.PI / 2);
  return U.mesh(g, R.starfish);
}
/** 理论化的海浪布景板（剧场式），位于 XY 平面，底边在 y=0 */
function waveFlat(M, R, w = 1.6, h = 0.9) {
  const g = new THREE.Group();
  const P = [[0, 0], [w, 0], [w, 0.2 * h], [0.75 * w, 0.45 * h], [0.55 * w, 0.85 * h], [0.4 * w, h], [0.26 * w, 0.95 * h], [0.2 * w, 0.8 * h], [0.24 * w, 0.7 * h], [0.12 * w, 0.55 * h], [0, 0.35 * h]];
  g.add(U.mesh(shapeGeo(P.map(([x, y]) => [x - w / 2, y]), 0.06, 0.02), R.sea));
  const crest = [V(0.75 * w - w / 2, 0.47 * h, 0), V(0.55 * w - w / 2, 0.87 * h, 0), V(0.4 * w - w / 2, 1.02 * h, 0), V(0.26 * w - w / 2, 0.97 * h, 0), V(0.21 * w - w / 2, 0.8 * h, 0), V(0.25 * w - w / 2, 0.71 * h, 0)];
  g.add(U.tube(crest, 0.045, M.paintWhite, false, 12, 3));
  for (let i = 0; i < 3; i++) g.add(U.sphere(0.045 + (i % 2) * 0.015, M.paintWhite, (0.32 + i * 0.12) * w - w / 2, (0.55 + 0.07 * Math.sin(i * 2)) * h, 0.04, 5, 3));
  return g;
}

// ═════════════════════════════════════════════════════════════
//  主体结构 + 组装
// ═════════════════════════════════════════════════════════════
/** 运动方向朝向：旋转方向 s=+1/-1 时，位于角 a 处的物体面向切向 */
const faceDir = (a, s) => (s > 0 ? Math.PI - a : -a);

export function createCarousel(M, ctx) {
  const MSM = (o) => new THREE.MeshStandardMaterial(o);
  const ds = (m) => { const c = m.clone(); c.side = THREE.DoubleSide; return c; };
  const R = {
    stone: withRepeat(M.stone, 30, 1.5),
    cobbles: withRepeat(M.cobbles, 10, 10),
    deckRing: withRepeat(M.deck, 7, 7),
    sandRing: withRepeat(M.sand, 5, 5),
    ironCol: withRepeat(M.iron, 3, 16),
    fishIron: withRepeat(M.iron, 6, 3),
    canopy: withRepeat(M.stripeRed, 2, 1),
    valance: withRepeat(M.stripeRed, 8, 1),
    mantaTop: withRepeat(M.hull, 1, 1),
    squid: MSM({ color: 0x8a2e22, roughness: 0.35, metalness: 0.55 }),
    crabRed: MSM({ color: 0xa4381f, roughness: 0.32, metalness: 0.6 }),
    nautStripe: MSM({ color: 0x7a3a1c, roughness: 0.45, metalness: 0.1 }),
    nautHood: MSM({ color: 0x8a5a3a, roughness: 0.4, metalness: 0.5 }),
    turtleSkin: MSM({ color: 0x6f7a52, roughness: 0.5, metalness: 0.35 }),
    puffer: MSM({ color: 0xc09a48, roughness: 0.35, metalness: 0.7 }),
    shellDS: MSM({ color: 0xf0d8c8, roughness: 0.35, metalness: 0.1, side: THREE.DoubleSide }),
    coral: MSM({ color: 0xd8643e, roughness: 0.6 }),
    seaFan: MSM({ color: 0xa83a5a, roughness: 0.7, side: THREE.DoubleSide }),
    kelp: MSM({ color: 0x4a6b2a, roughness: 0.6 }),
    starfish: MSM({ color: 0xd06a2a, roughness: 0.6 }),
    sea: MSM({ color: 0x2d6f86, roughness: 0.25, metalness: 0.25 }),
    redDS: ds(M.paintRed), creamDS: ds(M.paintCream), navyDS: ds(M.paintNavy),
  };
  R.fishIronDS = ds(R.fishIron);
  R.skinL = MSM({ color: 0xe6bb94, roughness: 0.7 }); R.skinD = MSM({ color: 0x8d5a3b, roughness: 0.7 }); R.khaki = MSM({ color: 0xc9b28a, roughness: 0.85 });
  setPalette(M, R);

  const group = new THREE.Group(); group.name = 'Carrousel des Mondes Marins';
  const stat = new THREE.Group(); group.add(stat);
  const updaters = [];
  const bulbPts = [];

  // ───────── 1. 石砌基座 + 台阶 + 入口 ─────────
  stat.add(U.lathe([[0, 0], [11.75, 0], [11.75, 0.27], [11.72, 0.3], [11.2, 0.3], [11.2, 0.57], [11.17, 0.6], [10.65, 0.6], [10.65, 0.92], [10.6, PLINTH_TOP], [0, PLINTH_TOP]], R.stone, 128));
  for (const [r, y] of [[11.74, 0.29], [11.19, 0.59], [10.64, 0.935]]) { const t = U.torus(r, 0.03, M.brass, 0, y, 0, 3, 110); t.rotation.x = Math.PI / 2; stat.add(t); }
  { const g = new THREE.RingGeometry(9.4, 10.62, 128, 2); g.rotateX(-Math.PI / 2); stat.add(U.mesh(g, R.cobbles, 0, PLINTH_TOP + 0.004, 0)); }
  for (let i = 0; i < 20; i++) { // 立面铜质玫瑰饰
    const a = (i / 20) * TAU + 0.05;
    const ro = U.lathe([[0.0, 0], [0.12, 0], [0.1, 0.03], [0.05, 0.05], [0, 0.07]], M.brass, 12);
    ro.position.set(Math.cos(a) * 10.66, 0.77, Math.sin(a) * 10.66); ro.rotation.set(0, Math.PI / 2 - a, 0); ro.rotateX(Math.PI / 2); stat.add(ro);
  }
  // 入口拱门（四向），+Z 主入口挂牌
  const gates = [0, 1, 2, 3].map((k) => Math.PI / 2 + (k * Math.PI) / 2);
  const GATE_HALF = 0.13;
  gates.forEach((a, k) => {
    const g = new THREE.Group();
    for (const s of [-1, 1]) {
      const x = s * 1.3;
      g.add(place(U.lathe([[0.3, 0], [0.3, 0.15], [0.24, 0.22], [0.22, 1.9], [0.28, 2.0], [0.3, 2.12], [0, 2.12]], R.stone, 16), x, 0, 0));
      g.add(U.cyl(0.08, 0.1, 0.12, M.paintBlack, x, 2.18, 0, 8));
      const l = U.lantern(M, 1.1); l.position.set(x, 2.24, 0); g.add(l);
    }
    const arch = U.torus(1.3, 0.05, M.ironPlain, 0, 2.95, 0, 4, 24, Math.PI); g.add(arch);
    const arch2 = U.torus(1.12, 0.03, M.brass, 0, 2.95, 0, 4, 24, Math.PI); g.add(arch2);
    for (let i = 1; i < 8; i++) { const b = (i / 8) * Math.PI; g.add(U.rod(V(Math.cos(b) * 1.12, 2.95 + Math.sin(b) * 1.12, 0), V(Math.cos(b) * 1.3, 2.95 + Math.sin(b) * 1.3, 0), 0.02, M.ironPlain, 5)); }
    for (const s of [-1, 1]) {
      g.add(U.rod(V(s * 1.3, 2.12, 0), V(s * 1.3, 2.95, 0), 0.05, M.ironPlain, 8));
      g.add(place(U.torus(0.22, 0.025, M.ironPlain, 0, 0, 0, 5, 16, Math.PI * 1.6), s * 0.85, 2.55, 0, 0, 0, s > 0 ? 0 : Math.PI));
    }
    g.add(U.sphere(0.12, M.gold, 0, 4.3, 0, 12, 8));
    if (k === 0) {
      const sb = U.signBoard('LE CARROUSEL DES MONDES MARINS', 2.3, 0.55, { sub: '20 000 lieues sous les mers', bg: '#14363a' });
      sb.position.set(0, 3.55, 0.04); g.add(sb);
    } else {
      const med = U.cyl(0.38, 0.38, 0.06, M.ornament, 0, 3.55, 0, 24); med.rotation.x = Math.PI / 2; g.add(med);
      const mr = U.torus(0.38, 0.04, M.gold, 0, 3.55, 0, 6, 28); g.add(mr);
    }
    g.position.set(Math.cos(a) * 11.4, 0, Math.sin(a) * 11.4);
    g.rotation.y = Math.PI / 2 - a;
    stat.add(g);
  });
  // 基座外圈栏杆（入口处断开）
  for (let k = 0; k < 4; k++) {
    const a0 = gates[k] + GATE_HALF, a1 = gates[(k + 1) % 4] + (k === 3 ? TAU : 0) - GATE_HALF;
    stat.add(lightRailing(M, 10.45, PLINTH_TOP, { h: 0.95, a0, arc: a1 - a0, post: 2.0 }));
  }
  // 路灯
  for (let k = 0; k < 4; k++) {
    const a = ((k + 0.5) / 4) * TAU;
    const lp = U.lampPost(M, { h: 4.2, arms: 2 }); lp.position.set(Math.cos(a) * 12.5, 0, Math.sin(a) * 12.5); lp.rotation.y = -a; stat.add(lp);
  }

  // ───────── 2. 中央铆接铁柱 + 黄铜箍 ─────────
  const COL_R = 0.55, COL_TOP = 21.1;
  stat.add(U.lathe([[1.38, PLINTH_TOP], [1.38, PLINTH_TOP + 0.12], [1.2, PLINTH_TOP + 0.18], [1.05, PLINTH_TOP + 0.42], [0.82, PLINTH_TOP + 0.55], [0.66, PLINTH_TOP + 0.8], [0.6, PLINTH_TOP + 0.95]], M.ironPlain, 40));
  rivetRingY(stat, 1.36, PLINTH_TOP + 0.07, 36, 0.03, M.brass);
  stat.add(U.cyl(COL_R, COL_R, COL_TOP - PLINTH_TOP, R.ironCol, 0, (COL_TOP + PLINTH_TOP) / 2, 0, 32));
  for (let y = PLINTH_TOP + 1.2; y < COL_TOP - 0.5; y += 1.35) {
    if (Math.abs(y - DECK2_TOP + DECK_T / 2) < 0.6 || Math.abs(y - DECK3_TOP + DECK_T / 2) < 0.6) continue;
    const t = U.torus(COL_R + 0.02, 0.055, M.brass, 0, y, 0, 4, 24); t.rotation.x = Math.PI / 2; stat.add(t);
    rivetRingY(stat, COL_R + 0.005, y + 0.13, 14, 0.022, M.brass);
  }
  for (let k = 0; k < 4; k++) { // 竖向铆钉列
    const a = (k / 4) * TAU + TAU / 8;
    for (let y = PLINTH_TOP + 1.0; y < COL_TOP; y += 0.8) rivet(stat, V(Math.cos(a) * COL_R, y, Math.sin(a) * COL_R), V(Math.cos(a), 0, Math.sin(a)), 0.024, M.brass);
  }

  // ───────── 3. 楼板（第二、三层）─────────
  const deck = (yTop) => {
    const yb = yTop - DECK_T;
    stat.add(U.lathe([[0.58, yb], [10.8, yb], [10.8, yTop], [0.58, yTop], [0.58, yb]], M.ironPlain, 96));
    { const g = new THREE.RingGeometry(0.58, 10.8, 128, 3); g.rotateX(-Math.PI / 2); stat.add(U.mesh(g, R.deckRing, 0, yTop + 0.004, 0)); }
    // 立面彩绘描金面板
    const NP = 104;
    for (let i = 0; i < NP; i++) {
      const a = (i / NP) * TAU;
      const p = U.box(TAU * 10.82 / NP - 0.03, DECK_T - 0.12, 0.03, i % 2 ? M.ornamentRed : M.ornament);
      p.position.set(Math.cos(a) * 10.82, yTop - DECK_T / 2, Math.sin(a) * 10.82); p.rotation.y = Math.PI / 2 - a; stat.add(p);
      if (i % 2 === 0) { bulbPts.push(V(Math.cos(a) * 10.86, yb - 0.1, Math.sin(a) * 10.86)); stat.add(U.cyl(0.035, 0.045, 0.06, M.brass, Math.cos(a) * 10.86, yb - 0.03, Math.sin(a) * 10.86, 6)); }
    }
    for (const y of [yTop - 0.03, yb + 0.03]) { const t = U.torus(10.85, 0.045, M.brass, 0, y, 0, 3, 90); t.rotation.x = Math.PI / 2; stat.add(t); }
    // 底面放射工字梁 + 环梁
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * TAU;
      const b = U.box(9.6, 0.34, 0.1, M.ironPlain); b.position.set(Math.cos(a) * 5.75, yb - 0.17, Math.sin(a) * 5.75); b.rotation.y = -a; stat.add(b);
      const f = U.box(9.6, 0.04, 0.24, M.ironPlain); f.position.set(Math.cos(a) * 5.75, yb - 0.34, Math.sin(a) * 5.75); f.rotation.y = -a; stat.add(f);
    }
    for (const r of [4.2, 8.6]) { const t = U.torus(r, 0.13, M.ironPlain, 0, yb - 0.17, 0, 3, 60); t.rotation.x = Math.PI / 2; stat.add(t); }
    // 立柱与楼板交接的伞形铜托架
    stat.add(U.lathe([[COL_R + 0.02, yb - 1.4], [COL_R + 0.12, yb - 1.25], [COL_R + 0.12, yb - 1.1], [COL_R + 0.3, yb - 0.6], [COL_R + 0.75, yb - 0.15], [1.45, yb]], M.brass, 32));
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * TAU + TAU / 24, c = Math.cos(a), s = Math.sin(a);
      stat.add(U.tube([V(c * 0.62, yb - 2.3, s * 0.62), V(c * 1.0, yb - 1.4, s * 1.0), V(c * 2.2, yb - 0.55, s * 2.2), V(c * 3.6, yb - 0.25, s * 3.6)], 0.045, M.ironPlain, false, 12, 4));
      stat.add(place(U.torus(0.2, 0.025, M.brass, 0, 0, 0, 3, 10, Math.PI * 1.7), c * 1.5, yb - 0.75, s * 1.5, 0, -a, 0));
    }
    stat.add(U.lathe([[COL_R + 0.01, yTop], [1.0, yTop + 0.02], [0.95, yTop + 0.12], [0.7, yTop + 0.2], [COL_R + 0.01, yTop + 0.35]], M.brass, 32));
    // 外缘栏杆 + C 形卷涡
    stat.add(lightRailing(M, 10.62, yTop, { h: 1.05, post: 2.2 }));
  };
  deck(DECK2_TOP); deck(DECK3_TOP);

  // ───────── 4. 外圈铸铁柱（柱础、凹槽柱身、叶饰柱头、卷涡托架）─────────
  const leafGeo = new THREE.SphereGeometry(1, 5, 3);
  const perimCol = (a, y0, y1, withLantern) => {
    const g = new THREE.Group();
    const H = y1 - y0;
    g.add(U.lathe([[0.34, 0], [0.34, 0.12], [0.28, 0.18], [0.22, 0.3], [0.19, 0.4]], M.ironPlain, 10));
    g.add(U.cyl(0.16, 0.19, H - 1.0, M.ironPlain, 0, 0.4 + (H - 1.0) / 2, 0, 12));
    for (let k = 0; k < 6; k++) { const b = (k / 6) * TAU; g.add(U.rod(V(Math.cos(b) * 0.185, 0.5, Math.sin(b) * 0.185), V(Math.cos(b) * 0.158, H - 0.7, Math.sin(b) * 0.158), 0.016, M.ironPlain, 3)); }
    for (const y of [H - 0.62]) { const t = U.torus(0.19, 0.028, M.brass, 0, y, 0, 3, 12); t.rotation.x = Math.PI / 2; g.add(t); }
    // 柱头：钟形 + 叶饰 + 顶板
    g.add(U.lathe([[0.16, H - 0.6], [0.2, H - 0.45], [0.28, H - 0.28], [0.36, H - 0.16], [0.36, H - 0.12]], M.ironPlain, 10));
    for (let k = 0; k < 4; k++) {
      const b = (k / 4) * TAU;
      const lf = new THREE.Mesh(leafGeo, M.gold); lf.position.set(Math.cos(b) * 0.25, H - 0.33, Math.sin(b) * 0.25);
      lf.scale.set(0.06, 0.16, 0.035); lf.rotation.set(0, -b + Math.PI / 2, 0); lf.rotateX(-0.45); g.add(lf);
      if (k % 2 === 0) { const v = U.torus(0.05, 0.014, M.gold, Math.cos(b) * 0.33, H - 0.18, Math.sin(b) * 0.33, 3, 6, Math.PI * 1.5); v.rotation.y = -b + Math.PI / 2; g.add(v); }
    }
    g.add(U.box(0.8, 0.12, 0.8, M.ironPlain, 0, H - 0.06, 0));
    // 卷涡托架（沿切向两侧支撑檐口）
    for (const s of [-1, 1]) {
      g.add(U.tube([V(0, H - 1.2, 0.0), V(0.0, H - 0.75, s * 0.35), V(0, H - 0.25, s * 0.95), V(0, H - 0.04, s * 1.3)], 0.03, M.ironPlain, false, 8, 3));
    }
    if (withLantern) {
      g.add(U.tube([V(0.15, H - 1.4, 0), V(0.45, H - 1.35, 0), V(0.6, H - 1.5, 0)], 0.02, M.paintBlack, false, 10, 5));
      const l = U.lantern(M, 0.75); l.position.set(0.6, H - 2.05, 0); g.add(l);
      g.add(U.rod(V(0.6, H - 1.5, 0), V(0.6, H - 1.55, 0), 0.01, M.paintBlack, 4));
    }
    g.position.set(Math.cos(a) * 10.15, y0, Math.sin(a) * 10.15);
    g.rotation.y = -a;
    stat.add(g);
  };
  const NCOL = 10;
  for (let i = 0; i < NCOL; i++) {
    const a = ((i + 0.5) / NCOL) * TAU;
    perimCol(a, PLINTH_TOP, DECK2_TOP - DECK_T, i % 3 === 0);
    perimCol(a, DECK2_TOP, DECK3_TOP - DECK_T, i % 3 === 1);
    perimCol(a, DECK3_TOP, EAVE_Y - 0.25, false);
  }

  // ───────── 5. 顶棚：檐口、垂幔、条纹伞顶、肋、皇冠、穹顶、风向标 ─────────
  stat.add(U.lathe([[9.9, EAVE_Y - 0.28], [10.9, EAVE_Y - 0.28], [10.9, EAVE_Y + 0.05], [9.9, EAVE_Y + 0.05], [9.9, EAVE_Y - 0.28]], M.ironPlain, 128));
  { const t = U.torus(10.92, 0.05, M.gold, 0, EAVE_Y + 0.04, 0, 4, 110); t.rotation.x = Math.PI / 2; stat.add(t); }
  const VAL_TOP = EAVE_Y - 0.28, VAL_BOT = VAL_TOP - 0.7;
  stat.add(U.mesh(new THREE.CylinderGeometry(10.93, 10.93, VAL_TOP - VAL_BOT, 160, 1, true), R.valance, 0, (VAL_TOP + VAL_BOT) / 2, 0));
  { const t = U.torus(10.95, 0.035, M.gold, 0, VAL_BOT, 0, 4, 110); t.rotation.x = Math.PI / 2; stat.add(t); }
  const NSC = 80, scGeo = new THREE.CircleGeometry(0.43, 10, Math.PI, Math.PI);
  for (let i = 0; i < NSC; i++) {
    const a = (i / NSC) * TAU;
    const sc = new THREE.Mesh(scGeo, i % 2 ? R.creamDS : R.redDS); sc.position.set(Math.cos(a) * 10.93, VAL_BOT, Math.sin(a) * 10.93); sc.rotation.y = Math.PI / 2 - a; stat.add(sc);
    stat.add(U.sphere(0.05, M.gold, Math.cos(a) * 10.95, VAL_BOT - 0.47, Math.sin(a) * 10.95, 5, 3));
    stat.add(U.cyl(0.012, 0.03, 0.12, M.gold, Math.cos(a) * 10.95, VAL_BOT - 0.56, Math.sin(a) * 10.95, 5));
    const b = a + Math.PI / NSC;
    bulbPts.push(V(Math.cos(b) * 11.0, VAL_BOT - 0.08, Math.sin(b) * 11.0));
  }
  const canProf = [[10.95, EAVE_Y + 0.05], [10.3, EAVE_Y + 0.45], [8.6, EAVE_Y + 1.15], [6.4, EAVE_Y + 1.95], [4.2, EAVE_Y + 2.65], [2.4, EAVE_Y + 3.15], [1.5, EAVE_Y + 3.35]];
  stat.add(U.lathe(canProf, R.canopy, 144));
  const canY = (r) => { for (let i = 0; i < canProf.length - 1; i++) { const [r0, y0] = canProf[i], [r1, y1] = canProf[i + 1]; if (r <= r0 && r >= r1) return y0 + (y1 - y0) * ((r - r0) / (r1 - r0)); } return EAVE_Y + 3.35; };
  for (let k = 0; k < 24; k++) {
    const a = (k / 24) * TAU, c = Math.cos(a), s = Math.sin(a);
    const pts = canProf.map(([r, y]) => V(c * r * 1.003, y + 0.05, s * r * 1.003));
    stat.add(U.tube(pts, 0.035, M.brass, false, 16, 3));
    for (const r of [9.6, 8.0, 6.4, 4.8, 3.2]) { bulbPts.push(V(c * r, canY(r) + 0.13, s * r)); }
  }
  // 皇冠
  const CR = EAVE_Y + 3.3;
  stat.add(U.lathe([[1.62, CR], [1.72, CR + 0.1], [1.56, CR + 0.2], [1.5, CR + 1.1], [1.66, CR + 1.2], [1.74, CR + 1.32], [1.4, CR + 1.36]], M.ironPlain, 48));
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * TAU;
    const p = U.box(0.7, 0.78, 0.04, i % 2 ? M.ornamentRed : M.ornament); p.position.set(Math.cos(a) * 1.52, CR + 0.65, Math.sin(a) * 1.52); p.rotation.y = Math.PI / 2 - a; stat.add(p);
    const fin = U.lathe([[0.07, 0], [0.09, 0.05], [0.035, 0.16], [0.06, 0.26], [0.0, 0.48]], M.gold, 10); fin.position.set(Math.cos(a + 0.26) * 1.68, CR + 1.34, Math.sin(a + 0.26) * 1.68); stat.add(fin);
    bulbPts.push(V(Math.cos(a + 0.26) * 1.72, CR + 0.15, Math.sin(a + 0.26) * 1.72));
  }
  for (const y of [CR + 0.24, CR + 1.08]) { const t = U.torus(1.54, 0.04, M.gold, 0, y, 0, 4, 48); t.rotation.x = Math.PI / 2; stat.add(t); }
  const DOME = CR + 1.36;
  stat.add(U.lathe([[1.42, DOME], [1.38, DOME + 0.25], [1.15, DOME + 0.65], [0.78, DOME + 0.95], [0.36, DOME + 1.12], [0.1, DOME + 1.17]], M.patina, 48));
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * TAU;
    stat.add(U.tube([[1.43, DOME], [1.39, DOME + 0.25], [1.16, DOME + 0.65], [0.79, DOME + 0.95], [0.37, DOME + 1.12]].map(([r, y]) => V(Math.cos(a) * r, y + 0.02, Math.sin(a) * r)), 0.03, M.gold, false, 20, 5));
  }
  stat.add(U.lathe([[0.16, DOME + 1.12], [0.2, DOME + 1.25], [0.08, DOME + 1.45], [0.06, DOME + 1.9], [0.14, DOME + 2.0], [0.04, DOME + 2.12], [0.03, DOME + 2.5]], M.brass, 16));
  stat.add(U.sphere(0.2, M.gold, 0, DOME + 1.62, 0, 16, 12));
  // 风向标：鹦鹉螺号潜艇剪影（动态）
  const vane = dyn(new THREE.Group()); vane.position.set(0, DOME + 2.5, 0); group.add(vane);
  {
    const sub = bodyZ([[0, -0.75], [0.07, -0.65], [0.12, -0.35], [0.13, 0.2], [0.1, 0.5], [0.04, 0.68], [0, 0.72]], M.brass, 16);
    sub.position.y = 0.08; vane.add(sub);
    vane.add(U.box(0.05, 0.12, 0.3, M.brass, 0, 0.25, 0.0));
    const tail = U.mesh(shapeGeo([[0, 0], [0.32, 0.22], [0.32, -0.22]], 0.02, 0), M.gold, 0, 0.08, -0.72); tail.rotation.y = Math.PI / 2; vane.add(tail);
    vane.add(U.rod(V(0, 0.08, -0.9), V(0, 0.08, 1.05), 0.012, M.brass, 5));
    vane.add(U.sphere(0.04, M.gold, 0, 0, 0, 8, 6));
    U.mergeStatic(vane);
  }
  // 旗帜
  const flags = [];
  for (let k = 0; k < 8; k++) {
    const a = ((k + 0.5) / 8) * TAU, r = 6.4, c = Math.cos(a), s = Math.sin(a);
    const y = canY(r);
    stat.add(U.cyl(0.03, 0.04, 2.4, M.brass, c * r, y + 1.15, s * r, 8));
    stat.add(U.sphere(0.07, M.gold, c * r, y + 2.4, s * r, 10, 8));
    const f = new THREE.Group(); f.position.set(c * r, y + 2.2, s * r); f.rotation.y = 0.6 + Math.sin(k * 2.1) * 0.4; stat.add(f);
    const fl = U.mesh(shapeGeo([[0, 0], [1.5, -0.18], [1.35, -0.25], [1.5, -0.32], [0, -0.55]], 0.015, 0), k % 2 ? R.redDS : R.navyDS);
    f.add(fl);
    flags.push({ f, ph: k * 0.9 });
  }

  // ───────── 6. 三层旋转平台 + 齿轮传动 ─────────
  const platforms = [];
  const platform = (yBase, rOut, topMat) => {
    const p = dyn(new THREE.Group()); p.position.y = yBase; group.add(p);
    p.add(U.lathe([[PLAT_IN, 0], [rOut, 0], [rOut, PLAT_T], [PLAT_IN, PLAT_T], [PLAT_IN, 0]], M.ironPlain, 128));
    if (topMat) { const g = new THREE.RingGeometry(PLAT_IN, rOut, 128, 3); g.rotateX(-Math.PI / 2); p.add(U.mesh(g, topMat, 0, PLAT_T + 0.004, 0)); }
    const n = Math.round((TAU * rOut) / 0.48);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU;
      const b = U.box((TAU * rOut) / n - 0.025, PLAT_T - 0.08, 0.025, i % 2 ? M.ornament : M.ornamentRed);
      b.position.set(Math.cos(a) * (rOut + 0.01), PLAT_T / 2, Math.sin(a) * (rOut + 0.01)); b.rotation.y = Math.PI / 2 - a; p.add(b);
    }
    for (const [r, y] of [[rOut + 0.02, PLAT_T], [rOut + 0.02, 0.02], [PLAT_IN, PLAT_T]]) { const t = U.torus(r, 0.035, M.brass, 0, y, 0, 4, r > 5 ? 110 : 32); t.rotation.x = Math.PI / 2; p.add(t); }
    const ring = U.gear({ radius: 2.0, teeth: 36, depth: 0.1, thickness: 0.16, hole: 1.5, spokes: 0 }, M.brass);
    ring.rotation.x = -Math.PI / 2; ring.position.y = PLAT_T + 0.22; p.add(ring);
    for (let i = 0; i < 12; i++) { const a = (i / 12) * TAU; p.add(U.cyl(0.05, 0.07, 0.16, M.ironPlain, Math.cos(a) * 1.75, PLAT_T + 0.08, Math.sin(a) * 1.75, 8)); }
    rivetRingY(p, 1.75, PLAT_T + 0.31, 24, 0.022, M.ironPlain);
    platforms.push(p);
    return p;
  };
  const pinions = [];
  const drive = (yBase, dir) => {
    for (const a of [0]) {
      const c = Math.cos(a), s = Math.sin(a), rr = 2.55, y = yBase + PLAT_T + 0.22;
      const pin = dyn(new THREE.Group()); pin.position.set(c * rr, y, s * rr); group.add(pin);
      const gm = U.gear({ radius: 0.45, teeth: 13, depth: 0.1, thickness: 0.18, hole: 0.06, spokes: 4, rim: 0.1 }, M.steel); gm.rotation.x = -Math.PI / 2; pin.add(gm);
      pin.add(U.cyl(0.1, 0.1, 0.3, M.steel, 0, 0.05, 0, 10));
      U.mergeStatic(pin);
      pinions.push({ pin, dir, ratio: 2.0 / 0.45 });
      // 支架：竖轴 + 水平悬臂 + 锥齿箱
      stat.add(U.cyl(0.05, 0.05, 1.1, M.steel, c * rr, y + 0.65, s * rr, 10));
      stat.add(U.cyl(0.14, 0.14, 0.22, M.brass, c * rr, y + 1.25, s * rr, 14));
      const arm = U.box(rr - COL_R + 0.1, 0.16, 0.16, M.ironPlain); arm.position.set(c * (COL_R + rr) / 2, y + 1.3, s * (COL_R + rr) / 2); arm.rotation.y = -a; stat.add(arm);
      for (let q = 1; q < 5; q++) { const p = V(c * (COL_R + (rr - COL_R) * q / 5), y + 1.39, s * (COL_R + (rr - COL_R) * q / 5)); rivet(stat, p, UP, 0.025, M.brass); }
      stat.add(U.tube([V(c * (COL_R + 0.02), y + 0.6, s * (COL_R + 0.02)), V(c * 1.1, y + 1.0, s * 1.1), V(c * 1.6, y + 1.22, s * 1.6)], 0.04, M.ironPlain, false, 12, 6));
    }
    // 立柱上的竖直齿轮组（两侧）
    for (const a of [Math.PI / 2]) {
      const holder = new THREE.Group(); holder.position.set(Math.cos(a) * 0.6, yBase + 3.1, Math.sin(a) * 0.6); holder.rotation.y = Math.PI / 2 - a; stat.add(holder);
      holder.add(U.box(2.1, 1.5, 0.06, M.ironPlain, 0.02, 0.1, 0));
      holder.add(U.box(2.2, 0.08, 0.1, M.brass, 0.02, 0.87, 0.02)); holder.add(U.box(2.2, 0.08, 0.1, M.brass, 0.02, -0.67, 0.02));
      for (const x of [-1.0, 1.04]) for (const yy of [-0.55, 0.75]) rivet(holder, V(x, yy, 0.03), V(0, 0, 1), 0.03, M.brass);
      const specs = [{ r: 0.42, n: 14, x: -0.45, y: 0.1, sp: 5 }, { r: 0.26, n: 9, x: 0.27, y: 0.36, sp: 4 }, { r: 0.34, n: 11, x: 0.51, y: -0.29, sp: 4 }];
      const gs = specs.map((sp, i) => {
        const gw = dyn(new THREE.Group());
        const p = new THREE.Vector3(sp.x, sp.y, 0.12).applyEuler(holder.rotation).add(holder.position);
        gw.position.copy(p); gw.rotation.copy(holder.rotation); group.add(gw);
        const gm = U.gear({ radius: sp.r, teeth: sp.n, depth: 0.08, thickness: 0.07, hole: 0.04, spokes: sp.sp, rim: 0.08 }, i === 1 ? M.steel : M.brass);
        const spin = dyn(new THREE.Group()); spin.add(gm); spin.add(U.cyl(0.06, 0.06, 0.12, i === 1 ? M.steel : M.brass, 0, 0, 0.0, 10)); spin.children[1].rotation.x = Math.PI / 2; gw.add(spin);
        U.mergeStatic(spin);
        const axle = U.cyl(0.03, 0.03, 0.14, M.steel, sp.x, sp.y, 0.06, 6); axle.rotation.x = Math.PI / 2; holder.add(axle);
        return { spin, r: sp.r };
      });
      updaters.push((t) => {
        const w = t * 0.6 * dir;
        gs[0].spin.rotation.z = w; gs[1].spin.rotation.z = -w * (gs[0].r / gs[1].r) + 0.17; gs[2].spin.rotation.z = w * (gs[0].r / gs[2].r);
      });
    }
  };

  // —— 第一层 Les Abysses（深渊海床）——
  const SPEED = [0.11, -0.085, 0.065];
  const L1 = platform(L1_Y, 9.6, R.sandRing); drive(L1_Y, 1);
  const L2 = platform(DECK2_TOP, 9.35, R.deckRing); drive(DECK2_TOP, -1);
  const L3 = platform(DECK3_TOP, 9.35, null); drive(DECK3_TOP, 1);
  const creatures = [];
  const put = (plat, obj, a, r, s, yOff = 0) => {
    const g = obj.group || obj;
    g.position.set(Math.cos(a) * r, PLAT_T + yOff, Math.sin(a) * r);
    g.rotation.y = faceDir(a, s);
    plat.add(g);
    if (obj.update) creatures.push(obj);
  };
  const D6 = TAU / 6;
  const D5 = TAU / 5, D4 = TAU / 4;
  put(L1, makeCrab(M, { seed: 1, riderSeed: 11 }), 0, 6.1, 1);
  put(L1, makeLanternfish(M, R, { seed: 2, riderSeed: 12 }), D5, 6.2, 1);
  put(L1, makeSquid(M, R, { seed: 3, riders: [13, 14] }), D5 * 2, 6.0, 1);
  put(L1, makeNautilusShell(M, R, { seed: 4, riderSeed: 15, scale: 1.12 }), D5 * 3, 6.2, 1);
  put(L1, makeShellBench(M, R, { riders: [16, 17] }), D5 * 4, 6.4, 1);
  void D6;
  // 海床布景
  for (let i = 0; i < 5; i++) {
    const a = D5 * i + D5 / 2;
    for (const [r, kind] of [[3.4, 3], [8.4, i % 3]]) {
      const c = Math.cos(a), s = Math.sin(a);
      const cl = new THREE.Group(); cl.position.set(c * r, PLAT_T, s * r); L1.add(cl);
      if (kind === 3) { cl.add(place(rockLump(M, 0.45, i * 5 + 2, M.rock), 0, 0, 0)); cl.add(place(starfish(M, R, 0.26), 0.5, 0.05, 0.3, 0, i, 0)); for (let k = 0; k < 5; k++) cl.add(place(U.cyl(0.02, 0.05, 0.28, R.seaFan, 0, 0, 0, 5), -0.3 + k * 0.08, 0.14, 0.45 + (k % 2) * 0.06, (k - 2) * 0.25, 0, 0)); continue; }
      cl.add(place(rockLump(M, 0.55, i * 7 + r, M.rock), 0.3, 0, -0.2));
      cl.add(place(rockLump(M, 0.32, i * 11 + r, M.rock), -0.45, 0, 0.35));
      if (kind === 0) { cl.add(place(coral(R, i * 5 + 1, 1.3), -0.2, 0.1, -0.2)); cl.add(place(seaFan(R, 1.3), 0.5, 0.2, 0.4, 0, a, 0)); }
      if (kind === 1) { cl.add(place(kelp(R, i * 3 + 2, 2.6), 0.0, 0, 0.2)); cl.add(place(starfish(M, R, 0.3), 0.6, 0.05, 0.5, 0, i, 0)); }
      if (kind === 2) { cl.add(place(coral(R, i * 9 + 4, 1.0), 0.4, 0.1, 0.3)); cl.add(place(kelp(R, i * 13 + 5, 2.0), -0.5, 0, -0.4)); }
      for (let k = 0; k < 5; k++) cl.add(place(U.cyl(0.02, 0.05, 0.28, R.seaFan, 0, 0, 0, 5), -0.1 + k * 0.08, 0.16, 0.55 + (k % 2) * 0.06, (k - 2) * 0.25, 0, 0));
    }
  }
  // 宝箱 + 船锚（凡尔纳：维哥湾沉船宝藏）
  {
    const a = D5 * 3.5 + 0.25, c = Math.cos(a), s = Math.sin(a);
    const chest = new THREE.Group(); chest.position.set(c * 4.6, PLAT_T, s * 4.6); chest.rotation.y = -a; L1.add(chest);
    chest.add(U.box(0.8, 0.45, 0.5, M.woodDark, 0, 0.225, 0));
    const lid = U.mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.8, 12, 1, false, 0, Math.PI), M.woodDark); lid.rotation.set(0, 0, Math.PI / 2); lid.position.set(0, 0.45, 0); chest.add(lid);
    for (const x of [-0.3, 0, 0.3]) chest.add(U.box(0.05, 0.47, 0.52, M.brass, x, 0.225, 0));
    for (let k = 0; k < 9; k++) chest.add(U.cyl(0.05, 0.05, 0.015, M.gold, -0.25 + (k % 3) * 0.25 + 0.05 * Math.sin(k), 0.01 + (k % 2) * 0.015, 0.36 + Math.floor(k / 3) * 0.11, 10));
    const anc = new THREE.Group(); anc.position.set(c * 3.3 - s * 0.9, PLAT_T, s * 3.3 + c * 0.9); anc.rotation.set(0, a, 1.15); L1.add(anc);
    anc.add(U.cyl(0.05, 0.05, 1.6, M.ironPlain, 0, 0.8, 0, 8));
    anc.add(U.torus(0.12, 0.03, M.ironPlain, 0, 1.68, 0, 6, 14));
    anc.add(place(U.torus(0.55, 0.05, M.ironPlain, 0, 0, 0, 6, 20, Math.PI), 0, 0.55, 0, 0, 0, Math.PI));
    anc.add(U.box(0.8, 0.07, 0.07, M.ironPlain, 0, 1.4, 0));
  }

  // —— 第二层 Le fond des mers（海底）——
  put(L2, makeManta(M, R, { seed: 5, riders: [21, 22] }), 0, 5.9, -1);
  put(L2, makeTurtle(M, R, { seed: 6, riderSeed: 23 }), D4, 6.1, -1);
  put(L2, makePuffer(M, R, { seed: 7, riderSeed: 24 }), D4 * 2, 6.2, -1);
  put(L2, makeShellBench(M, R, { riders: [] }), D4 * 3, 6.4, -1);

  for (let i = 0; i < 4; i++) {
    const a = D4 * i + D4 / 2, c = Math.cos(a), s = Math.sin(a);
    const cl = new THREE.Group(); cl.position.set(c * 3.3, PLAT_T, s * 3.3); L2.add(cl);
    cl.add(rockLump(M, 0.4, 40 + i, M.rock));
    cl.add(place(i % 2 ? kelp(R, 60 + i, 2.4) : coral(R, 70 + i, 1.1), 0.2, 0.05, 0.1));
    const c2 = new THREE.Group(); c2.position.set(c * 8.5, PLAT_T, s * 8.5); L2.add(c2);
    c2.add(rockLump(M, 0.35, 50 + i, M.rock));
    c2.add(place(i % 2 ? seaFan(R, 1.1) : kelp(R, 80 + i, 2.0), 0.1, 0.1, 0, 0, a, 0));
  }

  // —— 顶层 La surface（海面）——
  {
    const sea = gridGeo(8, 120, (u, v) => {
      const r = PLAT_IN + (9.35 - PLAT_IN) * u, a = v * TAU;
      const y = PLAT_T + 0.08 + 0.07 * Math.sin(a * 14 + r * 1.3) + 0.05 * Math.sin(r * 3.1 - a * 5);
      return V(Math.cos(a) * r, y, Math.sin(a) * r);
    }, [1, 1], false);
    L3.add(U.mesh(sea, R.sea));
    const NW = 24;
    for (let i = 0; i < NW; i++) {
      const a = (i / NW) * TAU, w = waveFlat(M, R, 1.9, 0.75 + 0.3 * (i % 3) / 2);
      w.position.set(Math.cos(a) * 9.05, PLAT_T, Math.sin(a) * 9.05); w.rotation.y = Math.PI / 2 - a; L3.add(w);
    }
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU + 0.2, w = waveFlat(M, R, 1.5, 0.6);
      w.position.set(Math.cos(a) * 3.0, PLAT_T, Math.sin(a) * 3.0); w.rotation.y = -Math.PI / 2 - a; L3.add(w);
    }
  }
  const boatCfg = [
    { hullMat: M.paintNavy, awning: M.stripeRed, riders: [31, 32] },
    { hullMat: M.paintRed, awning: M.stripeBlue, riders: [33, null] },
    { hullMat: M.paintTeal, awning: M.stripeRed, riders: [34, 35] },
    { hullMat: M.paintCream, awning: M.stripeGreen, riders: [36, null] },
  ];
  boatCfg.forEach((cfg, i) => put(L3, makeBoat(M, R, { seed: 20 + i, ...cfg }), (i / 4) * TAU + Math.PI / 4, 6.1, 1));

  // ───────── 7. 游客 ─────────
  const walkers = [];
  for (let i = 0; i < 3; i++) {
    const p = person2(100 + i, { child: i === 2 });
    const r = 12.9 + (i % 3) * 0.35, sp = (0.9 + (i % 2) * 0.25) * (i % 3 === 2 ? -1 : 1);
    for (const l of p.userData.legs) { l.userData.dynamic = true; U.mergeStatic(l); }
    p.userData.arms = [];
    U.mergeStatic(p); group.add(p); walkers.push({ p, r, sp, a0: (i / 3) * TAU + 0.3 });
  }
  const standers = [
    [0, Math.PI / 2 + 0.25, 13.0, 1, 0], [0, Math.PI / 2 - 0.3, 13.2, 2, 0], [0, Math.PI / 2 - 0.36, 13.0, 3, 1],
    [DECK2_TOP, 0.6, 9.95, 4, 0], [DECK2_TOP, 3.4, 9.95, 5, 0],
    [DECK3_TOP, 1.9, 9.95, 7, 0], [DECK3_TOP, 3.9, 9.95, 8, 1],
  ];
  for (const [y, a, r, sd, child] of standers) {
    const p = person2(200 + sd, { child: !!child });
    p.position.set(Math.cos(a) * r, y, Math.sin(a) * r);
    p.rotation.y = y > 0 ? Math.PI / 2 - a : -Math.PI / 2 - a; // 楼上朝外看，地面朝向转马
    for (const arm of p.userData.arms) arm.rotation.x = y > 0 ? -0.5 : 0;
    stat.add(p);
  }

  // ───────── 8. 灯泡阵列（实例化）+ 夜灯 ─────────
  {
    const bg = new THREE.IcosahedronGeometry(0.07, 0);
    const im = new THREE.InstancedMesh(bg, M.glowWarm, bulbPts.length);
    const m4 = new THREE.Matrix4();
    bulbPts.forEach((p, i) => { m4.makeTranslation(p.x, p.y, p.z); im.setMatrixAt(i, m4); });
    im.castShadow = false; im.userData.dynamic = true;
    group.add(im);
  }
  const warm = new THREE.PointLight(0xffb868, 0, 42, 2); warm.position.set(0, 15.2, 0); group.add(warm);
  ctx.addNightLight(warm, 260);
  const cyan = new THREE.PointLight(0x7fe0ff, 0, 22, 2); cyan.position.set(0, 4.2, 0); group.add(cyan);
  ctx.addNightLight(cyan, 110);

  // ───────── 9. 合并静态几何 ─────────
  U.mergeStatic(stat);
  for (const p of platforms) U.mergeStatic(p);

  return {
    group,
    focus: { pos: [21, 9.5, 23], target: [0, 9.5, 0] },
    footprint: 13,
    update(t, dt, env) {
      platforms.forEach((p, i) => { p.rotation.y = t * SPEED[i]; });
      pinions.forEach((pn, i) => { const lvl = i; pn.pin.rotation.y = -t * SPEED[lvl] * pn.ratio; });
      for (const c of creatures) c.update(t);
      for (const u of updaters) u(t);
      vane.rotation.y = Math.sin(t * 0.07) * 1.2 + 0.4;
      for (const w of walkers) {
        const a = w.a0 + (t * w.sp * 0.6) / w.r;
        w.p.position.set(Math.cos(a) * w.r, 0, Math.sin(a) * w.r);
        w.p.rotation.y = w.sp > 0 ? -a : Math.PI - a;
        U.animatePerson(w.p, t, Math.abs(w.sp));
      }
    },
  };
}

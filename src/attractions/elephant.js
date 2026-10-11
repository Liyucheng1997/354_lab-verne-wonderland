// ─────────────────────────────────────────────────────────────
//  Le Grand Éléphant —— 南特机械大象（12 m 高，郁金香木 + 钢结构）
//  · 两段式腿 + 解析 IK 步态（后左→前左→后右→前右 侧序步）
//  · 14 节木环象鼻，周期性抬鼻喷水
//  · 皮革耳朵扇动、眼睑眨动、液压活塞随关节伸缩
//  · 背上两层观景平台、船舱、驾驶台、游客
//  · 沿广场环形路线行走，并在登象塔停靠
// ─────────────────────────────────────────────────────────────
import * as THREE from 'three';
import * as U from '../util.js';
import { withRepeat } from '../materials.js';

const { V } = U;
const TAU = Math.PI * 2;

// ---------- 身体几何（超椭圆截面放样） ----------
const BL = 6.6; // 身体半长
function section(x) {
  const t = x / BL;
  const e = Math.pow(Math.max(0, 1 - Math.pow(Math.abs(t), 2.6)), 0.5);
  return { cy: 6.55 + 0.32 * t - 0.25 * t * t, hy: 2.85 * e * (1 + 0.06 * t), hz: 2.45 * e * (1 + 0.04 * t) };
}
const SE = 2.6;
const sp = (v) => Math.sign(v) * Math.pow(Math.abs(v), 2 / SE);
function bodySurf(x, phi, out = new THREE.Vector3()) {
  const s = section(x);
  let y = s.hy * sp(Math.sin(phi));
  if (y < 0) y *= 0.86;
  return out.set(x, s.cy + y, s.hz * sp(Math.cos(phi)));
}
function bodyNormal(x, phi) {
  const e = 0.01;
  const p = bodySurf(x, phi), px = bodySurf(x + e, phi), pp = bodySurf(x, phi + e);
  return new THREE.Vector3().crossVectors(px.sub(p), pp.sub(p)).normalize();
}

/** 通用参数曲面放样：f(s,t)→Vector3，s∈[0,1] 沿长度，t∈[0,1] 绕圈 */
function loftGeometry(f, ns, nt, uRep = 1, vRep = 1) {
  const pos = [], uv = [], idx = [];
  const p = new THREE.Vector3();
  for (let i = 0; i <= ns; i++) {
    for (let j = 0; j <= nt; j++) {
      f(i / ns, j / nt, p);
      pos.push(p.x, p.y, p.z);
      uv.push((i / ns) * uRep, (j / nt) * vRep);
    }
  }
  const row = nt + 1;
  for (let i = 0; i < ns; i++) for (let j = 0; j < nt; j++) {
    const a = i * row + j, b = (i + 1) * row + j, c = i * row + j + 1, d = (i + 1) * row + j + 1;
    idx.push(a, b, c, b, d, c);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** 渐细管：沿曲线，半径按 rFn(s) 变化 */
function taperTube(points, rFn, mat, seg = 32, radial = 10) {
  const curve = new THREE.CatmullRomCurve3(points);
  const frames = curve.computeFrenetFrames(seg, false);
  const g = loftGeometry((s, t, out) => {
    const i = Math.round(s * seg);
    const c = curve.getPointAt(s);
    const r = rFn(s);
    const a = -t * TAU;
    out.copy(c).addScaledVector(frames.normals[i], Math.cos(a) * r).addScaledVector(frames.binormals[i], Math.sin(a) * r);
  }, seg, radial, 1, 1);
  return U.mesh(g, mat);
}

/** 液压活塞：缸筒固定在 A 指向 B，活塞杆固定在 B 指向 A */
function makePiston(M, parent, { lh = 1.4, rh = 0.12, lr = 1.3, rr = 0.055 } = {}) {
  const hg = new THREE.CylinderGeometry(rh, rh, lh, 12); hg.translate(0, lh / 2, 0);
  const rg = new THREE.CylinderGeometry(rr, rr, lr, 10); rg.translate(0, lr / 2, 0);
  const housing = U.mesh(hg, M.ironPlain); const rod = U.mesh(rg, M.steel);
  // 缸筒两端的黄铜箍
  const cap = U.cyl(rh * 1.25, rh * 1.25, 0.12, M.brass, 0, lh - 0.06, 0, 12); housing.add(cap);
  const cap2 = U.cyl(rh * 1.35, rh * 1.35, 0.14, M.brass, 0, 0.07, 0, 12); housing.add(cap2);
  const eye = U.sphere(rr * 1.9, M.ironPlain, 0, 0, 0, 10, 8); rod.add(eye);
  housing.userData.dynamic = rod.userData.dynamic = true;
  parent.add(housing, rod);
  const up = V(0, 1, 0), d = V();
  return {
    set(a, b) {
      d.subVectors(b, a).normalize();
      housing.position.copy(a); housing.quaternion.setFromUnitVectors(up, d);
      rod.position.copy(b); rod.quaternion.setFromUnitVectors(up, d.negate());
    },
  };
}

// 圆角窗框 + 发光玻璃
function windowUnit(M, w, h, frameMat) {
  const g = new THREE.Group();
  const t = 0.07;
  g.add(U.box(w + t * 2, t, 0.08, frameMat, 0, h / 2 + t / 2, 0));
  g.add(U.box(w + t * 2, t, 0.08, frameMat, 0, -h / 2 - t / 2, 0));
  g.add(U.box(t, h, 0.08, frameMat, -w / 2 - t / 2, 0, 0));
  g.add(U.box(t, h, 0.08, frameMat, w / 2 + t / 2, 0, 0));
  g.add(U.box(0.025, h, 0.06, frameMat, 0, 0, 0.01));
  g.add(U.box(w, 0.025, 0.06, frameMat, 0, h * 0.18, 0.01));
  const pane = U.box(w, h, 0.03, M.glowWindow, 0, 0, -0.01); pane.castShadow = false; g.add(pane);
  // 拱形楣
  const arch = U.torus(w / 2 + t / 2, t / 2, frameMat, 0, h / 2 + t / 2, 0, 6, 16, Math.PI);
  g.add(arch);
  const archPane = new THREE.Mesh(new THREE.CircleGeometry(w / 2, 16, 0, Math.PI), M.glowWindow); archPane.position.set(0, h / 2 + t / 2, -0.005); g.add(archPane);
  return g;
}

function rotMat(mat, rx, ry, rot) {
  const m = withRepeat(mat, rx, ry);
  for (const k of ['map', 'bumpMap', 'roughnessMap']) if (m[k]) { m[k].center.set(0.5, 0.5); m[k].rotation = rot; }
  return m;
}

// ═════════════════════════════════════════════════════════════
export function createElephant(M, ctx) {
  const group = new THREE.Group();     // 广场局部坐标
  const walker = new THREE.Group();    // 整头大象（沿路线移动）
  const body = new THREE.Group();      // 身体（随步态上下起伏）
  walker.add(body);
  group.add(walker);
  walker.userData.dynamic = true;

  const woodBody = withRepeat(M.wood, 4, 9);
  const woodHead = withRepeat(M.wood, 3, 3);
  const woodLeg = rotMat(M.wood, 2, 1.2, Math.PI / 2);
  const woodRing = withRepeat(M.wood, 1, 0.5);
  const ironBelly = withRepeat(M.iron, 6, 2);

  // ---------- 身体木壳 & 铁腹 ----------
  const xs = (s) => BL * Math.sin((s * 2 - 1) * Math.PI / 2);
  const phiTop0 = -0.55, phiTop1 = Math.PI + 0.55; // 上部木壳角度范围
  const skin = U.mesh(loftGeometry((s, t, o) => bodySurf(xs(s), phiTop0 + (phiTop1 - phiTop0) * t, o), 72, 56, 4, 9), woodBody);
  body.add(skin);
  const belly = U.mesh(loftGeometry((s, t, o) => bodySurf(xs(s), phiTop1 + (TAU - (phiTop1 - phiTop0)) * t, o), 72, 20, 6, 2), ironBelly);
  body.add(belly);

  // 钢肋圈 + 铆钉
  const ribXs = [-5.6, -4.4, -2.9, -1.4, 0.1, 1.6, 3.1, 4.6, 5.7];
  const rivP = [], rivN = [];
  for (const rx of ribXs) {
    const pts = [];
    for (let k = 0; k < 40; k++) {
      const phi = (k / 40) * TAU;
      const n = bodyNormal(rx, phi);
      const p = bodySurf(rx, phi).addScaledVector(n, 0.04);
      pts.push(p);
      if (k % 2 === 0) { rivP.push(p.clone().addScaledVector(n, 0.05)); rivN.push(n); }
    }
    body.add(U.tube(pts, 0.075, M.ironPlain, true, 80, 6));
  }
  // 黄铜纵向腰线
  for (const phi of [0.42, Math.PI - 0.42, -0.38, Math.PI + 0.38]) {
    const pts = [];
    for (let x = -5.9; x <= 5.95; x += 0.5) pts.push(bodySurf(x, phi).addScaledVector(bodyNormal(x, phi), 0.05));
    body.add(U.tube(pts, 0.06, M.brass, false, 60, 6));
  }
  body.add(U.rivetsAt(rivP, rivN, 0.04, M.brass));

  // 侧舷窗（腹中沙龙）
  for (const side of [1, -1]) {
    for (const wx of [-3.6, -2.15, -0.7, 0.75, 2.2]) {
      const phi = side > 0 ? -0.08 : Math.PI + 0.08;
      const p = bodySurf(wx, phi); const n = bodyNormal(wx, phi);
      const w = windowUnit(M, 0.62, 0.62, M.brass);
      w.position.copy(p).addScaledVector(n, 0.02);
      w.lookAt(p.clone().add(n));
      body.add(w);
    }
    // 舱门
    const dp = bodySurf(3.55, side > 0 ? -0.35 : Math.PI + 0.35), dn = bodyNormal(3.55, side > 0 ? -0.35 : Math.PI + 0.35);
    const door = new THREE.Group();
    door.add(U.box(0.95, 1.6, 0.1, M.woodDark, 0, 0, 0));
    door.add(U.box(1.1, 0.08, 0.14, M.brass, 0, 0.82, 0)); door.add(U.box(1.1, 0.08, 0.14, M.brass, 0, -0.82, 0));
    door.add(U.box(0.08, 1.7, 0.14, M.brass, -0.52, 0, 0)); door.add(U.box(0.08, 1.7, 0.14, M.brass, 0.52, 0, 0));
    door.add(U.sphere(0.05, M.brass, 0.32, 0, 0.08, 8, 6));
    door.position.copy(dp).addScaledVector(dn, 0.03); door.lookAt(dp.clone().add(dn)); body.add(door);
  }

  // ---------- 腹下钢底盘 ----------
  const chassis = new THREE.Group();
  for (const z of [-1.05, 1.05]) {
    chassis.add(U.box(9.6, 0.5, 0.14, M.ironPlain, 0, 4.05, z));
    chassis.add(U.box(9.6, 0.08, 0.45, M.ironPlain, 0, 4.3, z));
    chassis.add(U.box(9.6, 0.08, 0.45, M.ironPlain, 0, 3.8, z));
    for (let x = -4.5; x <= 4.6; x += 0.45) chassis.add(U.sphere(0.035, M.brass, x, 4.05, z + Math.sign(z) * 0.08, 6, 4));
  }
  for (const x of [-4.6, -2.3, 0, 2.3, 4.6]) chassis.add(U.box(0.3, 0.4, 2.2, M.ironPlain, x, 4.05, 0));
  // 腹中“发动机舱”：飞轮 + 气缸
  const fly = U.gear({ radius: 0.9, teeth: 28, depth: 0.08, thickness: 0.18, hole: 0.12, spokes: 6 }, M.brass);
  fly.position.set(0.6, 3.75, 0); fly.userData.dynamic = true; chassis.add(fly);
  const fly2 = U.gear({ radius: 0.5, teeth: 16, depth: 0.08, thickness: 0.18, hole: 0.08, spokes: 4 }, M.steel);
  fly2.position.set(-0.85, 3.85, 0.2); fly2.userData.dynamic = true; chassis.add(fly2);
  chassis.add(U.cyl(0.35, 0.35, 1.6, M.copper, -1.9, 3.9, 0, 16).rotateZ(Math.PI / 2));
  for (let i = 0; i < 6; i++) chassis.add(U.torus(0.37, 0.04, M.brass, -2.6 + i * 0.28, 3.9, 0, 6, 20).rotateY(Math.PI / 2));
  body.add(chassis);

  // ---------- 腿（解析 IK） ----------
  const LU = 2.45, LL = 2.25, FOOT = 0.34;
  const HIP_Y = 4.95;
  const legDefs = [
    { name: 'LH', x: -4.05, z: 1.72, phase: 0.0, front: false },
    { name: 'LF', x: 3.9, z: 1.68, phase: 0.25, front: true },
    { name: 'RH', x: -4.05, z: -1.72, phase: 0.5, front: false },
    { name: 'RF', x: 3.9, z: -1.68, phase: 0.75, front: true },
  ];
  const legs = [];
  for (const L of legDefs) {
    const side = Math.sign(L.z);
    const hip = new THREE.Group(); hip.position.set(L.x, HIP_Y, L.z); hip.userData.dynamic = true;
    // 大腿：木板包覆、上粗下细
    const thigh = U.lathe([[0.0, 0.9], [0.78, 0.9], [0.98, 0.45], [1.0, -0.2], [0.94, -1.1], [0.8, -2.0], [0.7, -LU], [0, -LU]], woodLeg, 28);
    hip.add(thigh);
    for (const [y, rr] of [[-0.35, 1.01], [-1.25, 0.95], [-2.15, 0.81]]) hip.add(U.torus(rr, 0.05, M.ironPlain, 0, y, 0, 6, 32).rotateX(Math.PI / 2));
    // 髋部齿轮盘（随腿转动）
    const hg = U.gear({ radius: 0.95, teeth: 30, depth: 0.09, thickness: 0.16, hole: 0.15, spokes: 6, rim: 0.16 }, M.ironPlain);
    hg.position.set(0, 0, side * 1.03); hip.add(hg);
    hip.add(U.cyl(0.32, 0.36, 0.25, M.brass, 0, 0, side * 1.12, 20).rotateX(Math.PI / 2));
    hip.add(U.cyl(0.12, 0.12, 0.2, M.steel, 0, 0, side * 1.27, 12).rotateX(Math.PI / 2));
    const knee = new THREE.Group(); knee.position.set(0, -LU, 0); knee.userData.dynamic = true; hip.add(knee);
    // 膝关节：钢球 + 侧板
    knee.add(U.sphere(0.72, M.ironPlain, 0, 0, 0, 20, 14));
    for (const s2 of [1, -1]) {
      knee.add(U.cyl(0.5, 0.5, 0.12, M.ironPlain, 0, 0, s2 * 0.72, 20).rotateX(Math.PI / 2));
      knee.add(U.cyl(0.18, 0.18, 0.16, M.brass, 0, 0, s2 * 0.8, 12).rotateX(Math.PI / 2));
      knee.add(U.rivetRing(0.38, 10, 0.035, M.brass, 0).rotateX(Math.PI / 2).translateY(s2 * 0.79));
    }
    // 小腿：柱状，下端略粗
    knee.add(U.lathe([[0, -0.1], [0.66, -0.1], [0.7, -0.6], [0.74, -1.4], [0.82, -LL + 0.15], [0, -LL + 0.15]], woodLeg, 28));
    knee.add(U.torus(0.72, 0.055, M.ironPlain, 0, -0.45, 0, 6, 32).rotateX(Math.PI / 2));
    knee.add(U.torus(0.82, 0.06, M.brass, 0, -LL + 0.22, 0, 6, 32).rotateX(Math.PI / 2));
    const ankle = new THREE.Group(); ankle.position.set(0, -LL, 0); ankle.userData.dynamic = true; knee.add(ankle);
    // 脚掌 + 象甲
    ankle.add(U.lathe([[0, 0.2], [0.86, 0.2], [0.98, 0.0], [1.0, -FOOT + 0.08], [0.94, -FOOT], [0, -FOOT]], M.woodDark, 32));
    ankle.add(U.cyl(0.96, 0.96, 0.06, M.ironPlain, 0, -FOOT + 0.03, 0, 32));
    for (let k = 0; k < 5; k++) {
      const a = (k - 2) * 0.38;
      const n = U.sphere(0.2, M.ivory, Math.cos(a) * 0.9, -FOOT + 0.14, Math.sin(a) * 0.9, 10, 8);
      n.scale.set(0.8, 0.8, 1.1); ankle.add(n);
    }
    body.add(hip);
    legs.push({ ...L, side, hip, knee, ankle });
  }

  // 腿部活塞（父级 = body）
  for (const L of legs) {
    L.p1 = makePiston(M, body, { lh: 1.5, rh: 0.13, lr: 1.6, rr: 0.06 });
    L.p2 = makePiston(M, body, { lh: 1.0, rh: 0.09, lr: 1.2, rr: 0.045 });
    L.a1 = V(L.x + (L.front ? -1.25 : 1.25), 6.3, L.z + L.side * 0.35);
  }

  // ---------- 头部 ----------
  const head = new THREE.Group(); head.position.set(6.35, 7.55, 0); head.userData.dynamic = true; body.add(head);
  const hgeo = new THREE.SphereGeometry(1, 64, 48);
  {
    const pa = hgeo.attributes.position; const d = V();
    const bump = (dir, c, w) => Math.exp(-dir.distanceToSquared(c) / w);
    const lobeL = V(0.35, 0.78, 0.5).normalize(), lobeR = V(0.35, 0.78, -0.5).normalize(), snout = V(0.85, -0.45, 0).normalize(), back = V(-1, 0, 0);
    for (let i = 0; i < pa.count; i++) {
      d.fromBufferAttribute(pa, i).normalize();
      let r = 1 + 0.16 * bump(d, lobeL, 0.12) + 0.16 * bump(d, lobeR, 0.12) + 0.22 * bump(d, snout, 0.25) - 0.1 * bump(d, back, 0.4);
      r -= 0.06 * Math.exp(-((d.y - 0.62) ** 2) / 0.01) * Math.exp(-(d.z * d.z) / 0.05); // 额头中缝
      pa.setXYZ(i, d.x * r * 2.15, d.y * r * 2.45, d.z * r * 2.15);
    }
    hgeo.computeVertexNormals();
  }
  const headMesh = U.mesh(hgeo, woodHead); head.add(headMesh);
  // 头部钢箍 & 铆钉
  head.add(U.torus(2.0, 0.07, M.ironPlain, -0.55, 0.15, 0, 6, 64).rotateY(Math.PI / 2));
  head.add(U.torus(1.95, 0.05, M.brass, 0.6, 0.0, 0, 6, 64).rotateY(Math.PI / 2).rotateX(0.0));
  // 嘴 & 下唇
  const lip = U.sphere(0.75, woodHead, 1.15, -1.75, 0, 20, 14); lip.scale.set(1.1, 0.55, 0.9); head.add(lip);
  head.add(U.sphere(0.45, M.leather, 1.35, -1.55, 0, 14, 10).translateX(0.1));
  // 眼睛 + 眼睑
  const lids = [];
  for (const s of [1, -1]) {
    const eg = new THREE.Group(); eg.position.set(1.05, 0.45, s * 1.8); eg.lookAt(V(1.05 + 0.75, 0.45 + 0.05, s * 3.5)); head.add(eg);
    eg.add(U.torus(0.33, 0.09, M.brass, 0, 0, 0.0, 10, 28));
    eg.add(U.sphere(0.3, M.eye, 0, 0, -0.05, 20, 16));
    eg.add(U.sphere(0.08, M.paintWhite, 0.1, 0.1, 0.22, 8, 6));
    const lid = new THREE.Group(); lid.userData.dynamic = true;
    const lm = U.mesh(new THREE.SphereGeometry(0.34, 20, 10, 0, TAU, 0, Math.PI / 2), woodHead); lid.add(lm);
    lid.add(U.torus(0.34, 0.03, M.ironPlain, 0, 0, 0, 6, 24).rotateX(Math.PI / 2));
    eg.add(lid); lids.push(lid);
    // 长睫毛般的铜片
    for (let k = 0; k < 5; k++) { const a = 0.4 + k * 0.55; eg.add(U.rod(V(Math.cos(a) * 0.38, Math.sin(a) * 0.38, 0.05), V(Math.cos(a) * 0.55, Math.sin(a) * 0.55, 0.12), 0.015, M.brass, 4)); }
  }
  // 象牙
  for (const s of [1, -1]) {
    head.add(taperTube([V(1.1, -1.25, s * 0.75), V(1.8, -1.85, s * 0.95), V(2.65, -1.95, s * 1.05), V(3.35, -1.45, s * 1.0)], (u) => 0.2 * (1 - u * 0.85) + 0.02, M.ivory, 24, 10));
    head.add(U.torus(0.24, 0.05, M.brass, 1.25, -1.35, s * 0.78, 6, 16).rotateY(Math.PI / 2).rotateX(0.6));
  }

  // 耳朵：皮革 + 钢骨架
  const earOutline = [[0, 1.45], [0.8, 1.85], [1.75, 1.7], [2.45, 1.0], [2.75, 0.0], [2.55, -1.05], [2.0, -1.85], [1.2, -2.3], [0.5, -2.25], [0.15, -1.55], [0.0, -0.6]];
  const earZ = (x, y) => 0.32 * Math.sin(Math.PI * Math.min(1, x / 2.75)) + 0.06 * Math.sin(y * 3.2) * (x / 2.75);
  const ears = [];
  for (const s of [1, -1]) {
    const ear = new THREE.Group(); ear.position.set(-0.35, 0.35, s * 2.05); ear.userData.dynamic = true;
    const shape = new THREE.Shape(); shape.splineThru = undefined;
    const sp2 = new THREE.SplineCurve(earOutline.map(([x, y]) => new THREE.Vector2(x, y)).concat([new THREE.Vector2(0, 1.45)]));
    const pts2 = sp2.getPoints(80);
    shape.setFromPoints(pts2);
    const eg = new THREE.ShapeGeometry(shape, 40);
    // 细分以便弯曲
    const pa = eg.attributes.position;
    for (let i = 0; i < pa.count; i++) { const x = pa.getX(i), y = pa.getY(i); pa.setXYZ(i, -x, y, s * earZ(x, y)); }
    eg.computeVertexNormals();
    const em = withRepeat(M.leather, 2, 2); em.side = THREE.DoubleSide; em.color.setRGB(1.9, 1.7, 1.5);
    const earMesh = U.mesh(eg, em); ear.add(earMesh);
    // 边框 & 放射骨架
    const rim = pts2.filter((_, i) => i % 2 === 0).map((p) => V(-p.x, p.y, s * (earZ(p.x, p.y) + 0.02)));
    ear.add(U.tube(rim, 0.05, M.ironPlain, true, 120, 6));
    for (let k = 1; k < earOutline.length - 1; k++) {
      const [ox, oy] = earOutline[k];
      const pts = []; for (let q = 0; q <= 6; q++) { const f = q / 6; const x = 0.15 + (ox - 0.15) * f, y = -0.1 + (oy + 0.1) * f; pts.push(V(-x, y, s * (earZ(x, y) + 0.04))); }
      ear.add(U.tube(pts, 0.03, M.ironPlain, false, 12, 5));
    }
    ear.add(U.cyl(0.14, 0.14, 3.2, M.ironPlain, 0, -0.35, 0, 10));
    ear.add(U.sphere(0.2, M.brass, 0, 1.3, 0, 10, 8)); ear.add(U.sphere(0.2, M.brass, 0, -1.95, 0, 10, 8));
    head.add(ear); ears.push({ ear, s });
  }

  // 象鼻：14 节木环
  const trunkRoot = new THREE.Group(); trunkRoot.position.set(1.75, -0.65, 0); trunkRoot.userData.dynamic = true; head.add(trunkRoot);
  const segs = [];
  let parent = trunkRoot;
  const NSEG = 14;
  for (let i = 0; i < NSEG; i++) {
    const len = 0.52 - 0.012 * i;
    const r0 = 0.64 - 0.03 * i, r1 = 0.64 - 0.03 * (i + 1);
    const sg = new THREE.Group(); sg.userData.dynamic = true;
    sg.add(U.cyl(r1 * 0.98, r0, len * 0.84, woodRing, 0, -len * 0.46, 0, 24));
    sg.add(U.cyl(r1 * 0.72, r0 * 0.72, len, M.ironPlain, 0, -len / 2, 0, 12));
    sg.add(U.torus(r0 * 0.99, 0.035, M.brass, 0, -0.02, 0, 6, 24).rotateX(Math.PI / 2));
    // 腹侧小活塞连杆
    sg.add(U.rod(V(-r0 * 0.75, -0.05, 0), V(-r1 * 0.75, -len + 0.03, 0), 0.03, M.steel, 6));
    parent.add(sg);
    if (i > 0) sg.position.y = -(0.52 - 0.012 * (i - 1));
    segs.push(sg); parent = sg;
  }
  const tip = new THREE.Group(); tip.position.y = -(0.52 - 0.012 * (NSEG - 1)); parent.add(tip); tip.userData.dynamic = true;
  tip.add(U.cyl(0.26, 0.23, 0.2, M.brass, 0, -0.1, 0, 16));
  tip.add(U.cyl(0.14, 0.14, 0.05, M.black, 0, -0.21, 0, 12));
  const spray = U.makeSteam(40, { color: 0xcfe8ff, size: 0.9, rise: 7, spread: 1.4, life: 1.6, opacity: 0.55 });
  spray.rotation.z = Math.PI; spray.position.y = -0.25; tip.add(spray);

  // 颈部液压活塞（body → head）
  const neckP = [makePiston(M, body, { lh: 1.4, rh: 0.15, lr: 1.2, rr: 0.07 }), makePiston(M, body, { lh: 1.4, rh: 0.15, lr: 1.2, rr: 0.07 })];
  const neckA = [V(4.3, 8.6, 1.3), V(4.3, 8.6, -1.3)];
  const neckB = [V(-1.4, 1.5, 1.2), V(-1.4, 1.5, -1.2)];

  // 尾巴
  const tailRoot = new THREE.Group(); tailRoot.position.set(-6.45, 7.3, 0); tailRoot.userData.dynamic = true; body.add(tailRoot);
  const tailSegs = []; parent = tailRoot;
  for (let i = 0; i < 7; i++) {
    const sg = new THREE.Group(); sg.userData.dynamic = true;
    if (i > 0) sg.position.y = -0.42;
    sg.add(U.cyl(0.13 - i * 0.012, 0.15 - i * 0.012, 0.4, i % 2 ? M.wood : M.ironPlain, 0, -0.2, 0, 10));
    sg.add(U.torus(0.15 - i * 0.012, 0.025, M.brass, 0, 0, 0, 5, 14).rotateX(Math.PI / 2));
    parent.add(sg); tailSegs.push(sg); parent = sg;
  }
  const tuft = new THREE.Group(); tuft.position.y = -0.42; parent.add(tuft);
  for (let k = 0; k < 14; k++) { const a = (k / 14) * TAU; tuft.add(U.rod(V(0, 0, 0), V(Math.cos(a) * 0.14, -0.55 - (k % 3) * 0.08, Math.sin(a) * 0.14), 0.025, M.rope, 4)); }
  tailRoot.rotation.z = -0.35;

  // ---------- 背部观景平台 ----------
  const deckY = 9.62;
  const deck = new THREE.Group();
  const DX0 = -4.3, DX1 = 3.3, DZ = 2.75;
  const dcx = (DX0 + DX1) / 2, dl = DX1 - DX0;
  deck.add(U.box(dl, 0.22, DZ * 2, withRepeat(M.deck, 2, 1.5), dcx, deckY, 0));
  deck.add(U.box(dl + 0.2, 0.3, 0.16, M.woodDark, dcx, deckY - 0.05, DZ + 0.02));
  deck.add(U.box(dl + 0.2, 0.3, 0.16, M.woodDark, dcx, deckY - 0.05, -DZ - 0.02));
  deck.add(U.box(0.16, 0.3, DZ * 2, M.woodDark, DX0 - 0.02, deckY - 0.05, 0));
  deck.add(U.box(0.16, 0.3, DZ * 2, M.woodDark, DX1 + 0.02, deckY - 0.05, 0));
  // 支撑托架（甲板 → 背部）
  for (const x of [-3.8, -2.2, -0.6, 1.0, 2.6]) for (const z of [-1, 1]) {
    const top = V(x, deckY - 0.12, z * (DZ - 0.25));
    const bot = bodySurf(x, z > 0 ? 0.75 : Math.PI - 0.75);
    deck.add(U.rod(bot, top, 0.08, M.ironPlain, 8));
    deck.add(U.rod(bot, V(x, deckY - 0.12, z * 0.6), 0.06, M.ironPlain, 6));
    deck.add(U.gear({ radius: 0.22, teeth: 10, depth: 0.04, thickness: 0.05, hole: 0.04, spokes: 0 }, M.brass).translateX(top.x).translateY(top.y - 0.2).translateZ(top.z + z * 0.05));
  }
  // 栏杆
  const rp = [V(DX0, deckY + 0.11, -DZ + 0.05), V(DX1, deckY + 0.11, -DZ + 0.05), V(DX1, deckY + 0.11, DZ - 0.05), V(DX0, deckY + 0.11, DZ - 0.05)];
  deck.add(U.railing(rp, { height: 1.05, postEvery: 1.3, baluster: 0.16, mat: M.woodDark, postMat: M.brass, closed: true, rail: 0.04, ornate: true }));

  // 船舱
  const CX0 = -2.9, CX1 = 1.2, CZ = 1.65, CH = 2.2;
  const cabin = new THREE.Group();
  const wallM = withRepeat(M.woodDark, 2, 1);
  const y0 = deckY + 0.11;
  cabin.add(U.box(CX1 - CX0, CH, 0.12, wallM, (CX0 + CX1) / 2, y0 + CH / 2, CZ));
  cabin.add(U.box(CX1 - CX0, CH, 0.12, wallM, (CX0 + CX1) / 2, y0 + CH / 2, -CZ));
  cabin.add(U.box(0.12, CH, CZ * 2, wallM, CX0, y0 + CH / 2, 0));
  cabin.add(U.box(0.12, CH, CZ * 2, wallM, CX1, y0 + CH / 2, 0));
  for (const z of [CZ, -CZ]) for (const wx of [-2.35, -1.35, -0.35, 0.65]) {
    const w = windowUnit(M, 0.62, 0.95, M.brass); w.position.set(wx, y0 + 1.25, z + Math.sign(z) * 0.07); if (z < 0) w.rotation.y = Math.PI; cabin.add(w);
  }
  { const w = windowUnit(M, 0.8, 1.0, M.brass); w.position.set(CX1 + 0.07, y0 + 1.3, 0); w.rotation.y = Math.PI / 2; cabin.add(w); }
  // 门（后侧）
  cabin.add(U.box(0.06, 1.85, 0.9, M.wood, CX0 - 0.08, y0 + 0.93, 0));
  cabin.add(U.sphere(0.05, M.brass, CX0 - 0.13, y0 + 0.95, 0.3, 8, 6));
  // 立柱 & 檐口
  for (const x of [CX0, CX1]) for (const z of [CZ, -CZ]) cabin.add(U.box(0.2, CH + 0.1, 0.2, M.brass, x, y0 + CH / 2, z));
  const roofY = y0 + CH;
  cabin.add(U.box(CX1 - CX0 + 0.5, 0.18, CZ * 2 + 0.5, M.woodDark, (CX0 + CX1) / 2, roofY + 0.09, 0));
  cabin.add(U.box(CX1 - CX0 + 0.6, 0.06, CZ * 2 + 0.6, M.brass, (CX0 + CX1) / 2, roofY + 0.2, 0));
  // 檐下雕花托架
  for (let x = CX0; x <= CX1 + 0.01; x += (CX1 - CX0) / 5) for (const z of [CZ, -CZ]) {
    cabin.add(U.torus(0.16, 0.025, M.brass, x, roofY - 0.16, z + Math.sign(z) * 0.1, 4, 10, Math.PI / 2).rotateY(Math.sign(z) > 0 ? -Math.PI / 2 : Math.PI / 2));
  }
  deck.add(cabin);

  // 屋顶观景台 + 条纹遮篷
  const rtop = roofY + 0.23;
  deck.add(U.railing([V(CX0 - 0.15, rtop, -CZ - 0.15), V(CX1 + 0.15, rtop, -CZ - 0.15), V(CX1 + 0.15, rtop, CZ + 0.15), V(CX0 - 0.15, rtop, CZ + 0.15)], { height: 0.95, postEvery: 1.2, baluster: 0.18, mat: M.brass, closed: true, rail: 0.03, ornate: true }));
  const canopy = new THREE.Group();
  const cw = CX1 - CX0 + 0.1, cd = CZ * 2 + 0.1, ch = 1.75;
  for (const x of [CX0, CX1]) for (const z of [-CZ, CZ]) canopy.add(U.cyl(0.05, 0.06, ch, M.brass, x, rtop + ch / 2, z, 8));
  {
    // 四坡帐篷顶（条纹布）
    const tg = new THREE.ConeGeometry(1, 1, 4, 1, true); tg.rotateY(Math.PI / 4);
    const tent = new THREE.Mesh(tg, withRepeat(M.stripeRed, 3, 1));
    tent.scale.set(cw * 0.74, 1.1, cd * 0.74); tent.position.set((CX0 + CX1) / 2, rtop + ch + 0.55, 0); tent.castShadow = true; canopy.add(tent);
    // 帐篷垂边（锯齿流苏）
    for (const [ax, az, len, rot] of [[0, cd / 2, cw, 0], [0, -cd / 2, cw, 0], [cw / 2, 0, cd, Math.PI / 2], [-cw / 2, 0, cd, Math.PI / 2]]) {
      const n = Math.round(len / 0.3);
      for (let k = 0; k < n; k++) {
        const f = (k + 0.5) / n - 0.5;
        const tri = new THREE.Mesh(new THREE.ConeGeometry(0.15, 0.3, 3, 1), M.paintRed);
        tri.rotation.x = Math.PI; tri.position.set((CX0 + CX1) / 2 + ax + (rot ? 0 : f * len), rtop + ch - 0.12, az + (rot ? f * len : 0)); canopy.add(tri);
      }
    }
    canopy.add(U.cyl(0.03, 0.03, 1.4, M.brass, (CX0 + CX1) / 2, rtop + ch + 1.6, 0, 6));
    canopy.add(U.sphere(0.12, M.gold, (CX0 + CX1) / 2, rtop + ch + 1.1, 0, 10, 8));
  }
  deck.add(canopy);
  // 旗帜
  const flag = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.6, 10, 4), new THREE.MeshStandardMaterial({ color: 0x9c1d1a, roughness: 0.9, side: THREE.DoubleSide }));
  flag.position.set((CX0 + CX1) / 2 - 0.55, rtop + ch + 2.0, 0); flag.userData.dynamic = true; flag.castShadow = true;
  deck.add(flag);
  // 登顶楼梯（后侧）
  const stairA = V(CX0 - 1.05, y0, CZ - 0.2), stairB = V(CX0 - 0.15, rtop, CZ - 0.2);
  for (let k = 1; k <= 9; k++) { const p = stairA.clone().lerp(stairB, k / 10); deck.add(U.box(0.26, 0.06, 0.9, M.woodDark, p.x, p.y, p.z)); }
  deck.add(U.rod(stairA.clone().add(V(0, 0, 0.45)), stairB.clone().add(V(0, 0, 0.45)), 0.05, M.woodDark, 6));
  deck.add(U.rod(stairA.clone().add(V(0, 0, -0.45)), stairB.clone().add(V(0, 0, -0.45)), 0.05, M.woodDark, 6));
  deck.add(U.rod(stairA.clone().add(V(0, 1.0, 0.45)), stairB.clone().add(V(0, 1.0, 0.45)), 0.03, M.brass, 6));

  // 驾驶台（前部）
  const helm = new THREE.Group();
  helm.add(U.box(0.9, 1.0, 1.6, M.woodDark, DX1 - 0.6, y0 + 0.5, 0));
  helm.add(U.box(1.0, 0.06, 1.7, M.brass, DX1 - 0.6, y0 + 1.03, 0));
  for (let k = 0; k < 3; k++) {
    const gz = -0.5 + k * 0.5;
    helm.add(U.cyl(0.14, 0.14, 0.06, M.brass, DX1 - 0.55, y0 + 1.18, gz, 16).rotateZ(Math.PI / 2 - 0.5));
    const face = U.cyl(0.11, 0.11, 0.02, M.paintCream, DX1 - 0.52, y0 + 1.2, gz, 16); face.rotation.z = Math.PI / 2 - 0.5; helm.add(face);
  }
  for (let k = 0; k < 4; k++) {
    const lz = -0.6 + k * 0.4;
    helm.add(U.rod(V(DX1 - 0.85, y0 + 1.05, lz), V(DX1 - 1.0, y0 + 1.6, lz), 0.025, M.steel, 6));
    helm.add(U.sphere(0.06, k % 2 ? M.paintRed : M.ivory, DX1 - 1.0, y0 + 1.62, lz, 8, 6));
  }
  const wheel = new THREE.Group(); wheel.position.set(DX1 - 1.15, y0 + 1.25, 0); wheel.rotation.y = Math.PI / 2;
  wheel.add(U.torus(0.42, 0.035, M.woodDark, 0, 0, 0, 8, 32));
  for (let k = 0; k < 8; k++) { const a = k / 8 * TAU; wheel.add(U.rod(V(0, 0, 0), V(Math.cos(a) * 0.55, Math.sin(a) * 0.55, 0), 0.025, M.woodDark, 5)); }
  wheel.add(U.sphere(0.08, M.brass, 0, 0, 0, 8, 6));
  helm.add(wheel);
  const pilot = U.person(907); pilot.position.set(DX1 - 1.7, y0, 0); pilot.rotation.y = Math.PI / 2; helm.add(pilot);
  deck.add(helm);
  // 汽笛 / 排气烟囱（后部）
  const stackX = DX0 + 0.5;
  deck.add(U.lathe([[0.22, 0], [0.22, 1.5], [0.32, 1.7], [0.36, 2.05], [0.25, 2.1]], M.copper, 20).translateX(stackX).translateY(y0).translateZ(-1.6));
  deck.add(U.torus(0.24, 0.035, M.brass, stackX, y0 + 0.8, -1.6, 6, 18).rotateX(Math.PI / 2));
  const puff = U.makeSteam(22, { size: 1.3, rise: 6, spread: 0.6, life: 3.5, opacity: 0.4 });
  puff.position.set(stackX, y0 + 2.15, -1.6); deck.add(puff);
  // 四角挂灯
  for (const [x, z] of [[DX0 + 0.1, DZ], [DX0 + 0.1, -DZ], [DX1 - 0.1, DZ], [DX1 - 0.1, -DZ]]) {
    deck.add(U.rod(V(x, y0 + 1.05, z), V(x, y0 + 1.7, z), 0.03, M.brass, 6));
    deck.add(U.rod(V(x, y0 + 1.7, z), V(x, y0 + 1.7, z + Math.sign(z) * 0.4), 0.025, M.brass, 6));
    const l = U.lantern(M, 0.75); l.position.set(x, y0 + 1.08, z + Math.sign(z) * 0.4); deck.add(l);
  }
  // 乘客
  const seats = [[-3.6, 2.2], [-3.4, -2.1], [1.9, 2.25], [2.2, -2.2], [-0.5, 2.3], [-1.6, -2.3], [0.6, -2.25], [-3.9, 0.8]];
  seats.forEach(([x, z], i) => { const p = U.person(500 + i, { child: i === 4 }); p.position.set(x, y0, z); p.rotation.y = z > 0 ? 0 : Math.PI; p.rotation.y += (i % 3 - 1) * 0.5; deck.add(p); });
  [[-1.8, 0.8], [0.2, -0.9], [-0.6, 0.6]].forEach(([x, z], i) => { const p = U.person(560 + i); p.position.set(x, rtop, z); p.rotation.y = i * 2.1; deck.add(p); });
  body.add(deck);

  // 夜间：腹中灯 & 平台灯
  const bellyLight = new THREE.PointLight(0xffb066, 0, 22, 2); bellyLight.position.set(0, 3.0, 0); body.add(bellyLight);
  ctx.addNightLight(bellyLight, 60);
  const deckLight = new THREE.PointLight(0xffc27a, 0, 18, 2); deckLight.position.set(-0.8, y0 + 3.5, 0); body.add(deckLight);
  ctx.addNightLight(deckLight, 45);

  // 乘坐视角锚点
  const rideAnchor = new THREE.Object3D(); rideAnchor.position.set(DX1 - 0.3, y0 + 1.75, 0.0); body.add(rideAnchor);
  const rideLook = new THREE.Object3D(); rideLook.position.set(DX1 + 12, y0 - 3, 0); body.add(rideLook);

  // ---------- 合并静态几何（按刚体分组） ----------
  for (const L of legs) { U.mergeStatic(L.ankle); U.mergeStatic(L.knee); U.mergeStatic(L.hip); }
  for (const sgp of segs) U.mergeStatic(sgp);
  for (const tg of tailSegs) U.mergeStatic(tg);
  U.mergeStatic(tuft);
  for (const e of ears) U.mergeStatic(e.ear);
  U.mergeStatic(head);
  U.mergeStatic(body);

  // ═════════════ 登象塔（停靠站） ═════════════
  const station = new THREE.Group();
  const RX = 34, RZ = 26;
  const path = new THREE.CatmullRomCurve3(Array.from({ length: 48 }, (_, i) => {
    const a = (i / 48) * TAU;
    const c = Math.cos(a), s = Math.sin(a);
    const k = 1 / Math.pow(Math.pow(Math.abs(c), 3) + Math.pow(Math.abs(s), 3), 1 / 3);
    return V(c * RX * (0.5 + 0.5 * k), 0, s * RZ * (0.5 + 0.5 * k));
  }), true, 'centripetal');
  const LEN = path.getLength();
  {
    const sp0 = path.getPointAt(0), tg0 = path.getTangentAt(0);
    const out = V(tg0.z, 0, -tg0.x).normalize(); // 向外侧
    if (out.dot(sp0) < 0) out.negate();
    const tw = 4.2;
    const base = sp0.clone().addScaledVector(out, 8.6);
    station.position.copy(base);
    station.lookAt(sp0.x, 0, sp0.z);
    // 塔身：四柱钢桁架 + 木平台
    const H = deckY + 0.11;
    for (const [x, z] of [[-tw / 2, -tw / 2], [tw / 2, -tw / 2], [tw / 2, tw / 2], [-tw / 2, tw / 2]]) {
      station.add(U.box(0.35, H, 0.35, M.ironPlain, x, H / 2, z));
      station.add(U.cyl(0.5, 0.6, 0.5, M.stone, x, 0.25, z, 8));
    }
    for (let y = 2; y < H; y += 2.4) {
      station.add(U.truss(V(-tw / 2, y, -tw / 2), V(tw / 2, y, -tw / 2), 0.5, M.ironPlain, { r: 0.05 }));
      station.add(U.truss(V(-tw / 2, y, tw / 2), V(tw / 2, y, tw / 2), 0.5, M.ironPlain, { r: 0.05 }));
      station.add(U.truss(V(-tw / 2, y, -tw / 2), V(-tw / 2, y, tw / 2), 0.5, M.ironPlain, { r: 0.05 }));
    }
    station.add(U.box(tw + 1.4, 0.3, tw + 1.4, withRepeat(M.deck, 2, 2), 0, H - 0.15, 0));
    // 伸缩栈桥（朝向大象）
    station.add(U.box(1.8, 0.2, 2.9, withRepeat(M.deck, 1, 1), 0, H - 0.1, tw / 2 + 0.7 + 1.45));
    station.add(U.railing([V(-0.9, H, tw / 2 + 0.7), V(-0.9, H, tw / 2 + 0.7 + 2.9)], { height: 1.0, mat: M.brass, baluster: 0.2 }));
    station.add(U.railing([V(0.9, H, tw / 2 + 0.7), V(0.9, H, tw / 2 + 0.7 + 2.9)], { height: 1.0, mat: M.brass, baluster: 0.2 }));
    station.add(U.railing([V(-0.9, H, tw / 2 + 0.7), V(-(tw + 1.4) / 2, H, tw / 2 + 0.7), V(-(tw + 1.4) / 2, H, -(tw + 1.4) / 2), V((tw + 1.4) / 2, H, -(tw + 1.4) / 2), V((tw + 1.4) / 2, H, tw / 2 + 0.7), V(0.9, H, tw / 2 + 0.7)], { height: 1.05, mat: M.woodDark, postMat: M.brass, ornate: true }));
    // 螺旋楼梯
    const sc = V(0, 0, -tw / 2 - 2.6);
    station.add(U.cyl(0.22, 0.22, H + 1.2, M.ironPlain, sc.x, (H + 1.2) / 2, sc.z, 12));
    const steps = Math.round(H / 0.22);
    for (let k = 0; k < steps; k++) {
      const a = k * 0.42;
      const st = U.box(1.5, 0.06, 0.5, M.woodDark, sc.x + Math.cos(a) * 0.85, (k + 1) * 0.22, sc.z + Math.sin(a) * 0.85);
      st.rotation.y = -a; station.add(st);
    }
    const helix = []; for (let k = 0; k <= steps; k += 2) { const a = k * 0.42; helix.push(V(sc.x + Math.cos(a) * 1.6, (k + 1) * 0.22 + 1.0, sc.z + Math.sin(a) * 1.6)); }
    station.add(U.tube(helix, 0.035, M.brass, false, steps * 3, 6));
    station.add(U.box(1.4, 0.2, 2.0, M.deck, 0, H - 0.1, -tw / 2 - 1.0));
    // 顶棚
    const roof = new THREE.Mesh(new THREE.ConeGeometry(4.4, 2.4, 4, 1, false), M.patina);
    roof.rotation.y = Math.PI / 4; roof.position.set(0, H + 3.9, 0); roof.castShadow = true; station.add(roof);
    for (const [x, z] of [[-tw / 2, -tw / 2], [tw / 2, -tw / 2], [tw / 2, tw / 2], [-tw / 2, tw / 2]]) station.add(U.cyl(0.08, 0.08, 2.7, M.brass, x, H + 1.35, z, 8));
    station.add(U.sphere(0.2, M.gold, 0, H + 5.2, 0, 10, 8));
    const sign = U.signBoard('LE GRAND ÉLÉPHANT', 3.6, 0.8, { sub: 'Les Machines de l\'Île' });
    sign.position.set(0, H + 2.4, tw / 2 + 0.05); station.add(sign);
    const lamp1 = U.lampPost(M, { h: 3.2, arms: 2 }); lamp1.position.set(tw / 2 + 1.0, 0, tw / 2 + 1.0); station.add(lamp1);
    const lamp2 = U.lampPost(M, { h: 3.2, arms: 2 }); lamp2.position.set(-tw / 2 - 1.0, 0, tw / 2 + 1.0); station.add(lamp2);
    // 排队游客
    for (let k = 0; k < 6; k++) { const p = U.person(700 + k); p.position.set(Math.cos(k) * 0.4 + 0.3, H, -0.8 + k * 0.45 - 1.2); p.rotation.y = 0.2 * k; station.add(p); }
    U.mergeStatic(station);
  }
  group.add(station);

  // ═════════════ 动画 ═════════════
  const VMAX = 1.25;           // m/s
  const STRIDE = 2.5;          // 每个步态周期前进距离
  const BETA = 0.74;           // 支撑相占比
  const WALK_T = LEN / VMAX * 1.12, STOP_T = 12, PERIOD = WALK_T + STOP_T;
  const ease = (x) => { // 加减速：前后各 8% 平滑
    const a = 0.08;
    if (x < a) return (x * x) / (2 * a) / (1 - a);
    if (x > 1 - a) return 1 - ((1 - x) * (1 - x)) / (2 * a) / (1 - a);
    return (x - a / 2) / (1 - a);
  };
  const distAt = (t) => { const lap = Math.floor(t / PERIOD); const tau = t - lap * PERIOD; return lap * LEN + LEN * (tau < WALK_T ? ease(tau / WALK_T) : 1); };

  const tmp = V(), tmp2 = V(), tgt = V();
  const ik = (L, tx, ty) => {
    let d = Math.hypot(tx, ty);
    const maxd = LU + LL - 0.002; if (d > maxd) { tx *= maxd / d; ty *= maxd / d; d = maxd; }
    const alpha = Math.atan2(ty, tx);
    const cb = (LU * LU + d * d - LL * LL) / (2 * LU * d);
    const beta = Math.acos(Math.min(1, Math.max(-1, cb)));
    const kneeSign = 1; // 关节均向前凸（前腿为腕关节，后腿为膝关节）
    const phiU = alpha + kneeSign * beta;
    const kx = LU * Math.cos(phiU), ky = LU * Math.sin(phiU);
    const phiL = Math.atan2(ty - ky, tx - kx);
    L.hip.rotation.z = phiU + Math.PI / 2;
    L.knee.rotation.z = phiL - phiU;
  };

  let lastT = 0;
  function update(t, dt, env) {
    const s = distAt(t);
    const speed = (distAt(t + 0.05) - distAt(t - 0.05)) / 0.1;
    const walkK = Math.min(1, speed / VMAX);
    const u = (((s % LEN) + LEN) % LEN) / LEN;
    const p = path.getPointAt(u), tg = path.getTangentAt(u);
    walker.position.set(p.x, 0, p.z);
    walker.rotation.y = Math.atan2(-tg.z, tg.x);
    const gait = s / STRIDE;

    const bodyBob = Math.sin(gait * TAU * 2) * 0.07 * walkK;
    // 腿
    const H = HIP_Y - FOOT;
    const span = STRIDE * BETA;
    for (const L of legs) {
      const ph = (((gait + L.phase) % 1) + 1) % 1;
      let fx, fy;
      if (ph < BETA) { fx = span / 2 - span * (ph / BETA); fy = 0; }
      else {
        const k = (ph - BETA) / (1 - BETA);
        const e = 0.5 - 0.5 * Math.cos(k * Math.PI);
        fx = -span / 2 + span * e;
        fy = Math.sin(k * Math.PI) * 0.55 * Math.min(1, walkK * 1.5);
      }
      ik(L, fx, -H + fy - bodyBob);
      L.ankle.rotation.z = -(L.hip.rotation.z + L.knee.rotation.z) + (ph >= BETA ? Math.sin(((ph - BETA) / (1 - BETA)) * Math.PI) * (L.front ? -0.25 : 0.2) * walkK : 0);
    }
    // 身体起伏 & 侧摆
    body.position.y = bodyBob;
    body.rotation.x = Math.sin(gait * TAU) * 0.012 * walkK;
    body.rotation.z = Math.sin(gait * TAU * 2 + 0.6) * 0.008 * walkK;

    // 头：随步点头 + 偶尔环顾
    head.rotation.z = Math.sin(gait * TAU * 2 - 0.8) * 0.035 * walkK + Math.sin(t * 0.21) * 0.04;
    head.rotation.y = Math.sin(t * 0.13) * 0.08;
    // 耳朵扇动（双频）
    const flap = 0.25 + 0.22 * Math.max(0, Math.sin(t * 1.3)) ** 2 + 0.05 * Math.sin(t * 7.0);
    for (const e of ears) e.ear.rotation.y = e.s * flap;
    // 眨眼
    const bl = (t % 5.3);
    const blink = bl < 0.25 ? Math.sin((bl / 0.25) * Math.PI) : 0;
    for (const lid of lids) lid.rotation.x = -1.2 + blink * 2.5;
    // 象鼻：摆动 + 周期抬起喷水
    const cyc = t % 26;
    const raise = cyc > 16 && cyc < 23 ? Math.sin(((cyc - 16) / 7) * Math.PI) : 0;
    const r2 = raise * raise * (3 - 2 * raise);
    trunkRoot.rotation.z = 0.5 + r2 * 0.75 + Math.sin(t * 0.7) * 0.05;
    trunkRoot.rotation.x = Math.sin(t * 0.37) * 0.12 * (1 - r2);
    segs.forEach((sg, i) => {
      sg.rotation.z = 0.025 + 0.028 * i + Math.sin(t * 1.1 - i * 0.35) * 0.05 * (1 - r2) + r2 * (0.11 + 0.008 * i);
      sg.rotation.x = Math.sin(t * 0.8 - i * 0.4) * 0.035 * (1 - r2);
    });
    spray.userData.update(dt, r2 > 0.6 ? (r2 - 0.6) / 0.4 : 0, V(0, 0, 0));
    // 尾巴
    tailSegs.forEach((sg, i) => { sg.rotation.x = Math.sin(t * 1.6 - i * 0.5) * 0.12; sg.rotation.z = -0.05 + Math.sin(t * 1.1 - i * 0.4) * 0.05; });
    // 旗帜飘动
    {
      const pa = flag.geometry.attributes.position;
      if (!flag.userData.base) flag.userData.base = Float32Array.from(pa.array);
      const b = flag.userData.base;
      for (let i = 0; i < pa.count; i++) { const x = 0.55 - b[i * 3]; pa.setZ(i, Math.sin(x * 5 - t * 6) * 0.12 * x); }
      pa.needsUpdate = true; flag.geometry.computeVertexNormals();
    }
    // 底盘飞轮
    fly.rotation.z = -s * 1.2; fly2.rotation.z = s * 2.16;
    puff.userData.update(dt, 0.5 + 0.5 * walkK, V(-0.6, 0, 0));

    // 活塞（在 body 坐标下计算）
    body.updateMatrixWorld(true);
    const inv = new THREE.Matrix4().copy(body.matrixWorld).invert();
    const toBody = (obj, x, y, z) => tmp.set(x, y, z).applyMatrix4(obj.matrixWorld).applyMatrix4(inv).clone();
    for (const L of legs) {
      L.p1.set(L.a1, toBody(L.hip, 0, -1.35, L.side * 0.98));
      L.p2.set(toBody(L.hip, L.front ? 0.6 : -0.6, -0.9, L.side * 0.86), toBody(L.knee, L.front ? 0.55 : -0.55, -0.85, L.side * 0.66));
    }
    for (let i = 0; i < 2; i++) neckP[i].set(neckA[i], toBody(head, neckB[i].x, neckB[i].y, neckB[i].z));
    lastT = t; void tmp2; void tgt; void lastT; void env;
  }

  return {
    group,
    update,
    footprint: 42,
    rideAnchor, rideLook,
    walker,
    focus() {
      // 跟随视角：大象侧前方
      const p = walker.position, h = walker.rotation.y;
      const fwd = V(Math.cos(h), 0, -Math.sin(h)), side = V(Math.sin(h), 0, Math.cos(h));
      const pos = p.clone().addScaledVector(fwd, 16).addScaledVector(side, 16).setY(9);
      return { pos: pos.toArray(), target: [p.x, 6.5, p.z] };
    },
  };
}

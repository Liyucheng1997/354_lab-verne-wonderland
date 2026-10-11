// ─────────────────────────────────────────────────────────────
//  中央广场小品（美好年代 Belle Époque）
//   · createPlazaProps —— 八角音乐亭（kiosque à musique），铸铁柱 + 铜绿屋顶 + 乐手
//   · createCafe       —— « CAFÉ NEMO » 玻璃门面咖啡馆 + 条纹遮阳篷露台
//   · createFountain   —— 青铜章鱼托举鹦鹉螺壳的喷泉，水柱脉动 + 水面涟漪
//  三者都遵循景点模块约定：{ group, update, focus, footprint }，原点 = 地面中心
// ─────────────────────────────────────────────────────────────
import * as THREE from 'three';
import * as U from '../util.js';
import { withRepeat, rng } from '../materials.js';

const PI = Math.PI, TAU = Math.PI * 2;
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const AZ = V(0, 0, 1);
const put = (parent, o) => { parent.add(o); return o; };

// ---------- 本地小工具 ----------
function beam(a, b, h, w, mat, n = AZ) {
  const d = new THREE.Vector3().subVectors(b, a);
  const len = d.length() || 1e-4;
  const x = d.clone().divideScalar(len);
  let z = n.clone().addScaledVector(x, -n.dot(x));
  if (z.lengthSq() < 1e-6) z = Math.abs(x.y) < 0.9 ? V(0, 1, 0).addScaledVector(x, -x.y) : V(1, 0, 0).addScaledVector(x, -x.x);
  z.normalize();
  const y = new THREE.Vector3().crossVectors(z, x);
  const m = U.mesh(new THREE.BoxGeometry(len, h, w), mat);
  m.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
  m.position.copy(a).addScaledVector(d, 0.5);
  return m;
}
function scrollHalf(L, c, turns = 1.5, n = 16) {
  const pts = [V(0, 0, 0), V(L * 0.5, 0, 0)];
  for (let i = 0; i <= n; i++) { const th = (i / n) * turns * TAU; const r = c * Math.exp(-0.3 * th); const ph = -PI / 2 + th; pts.push(V(L + Math.cos(ph) * r, c + Math.sin(ph) * r, 0)); }
  return pts;
}
function sScrollPts(L, c, turns = 1.4) { const h = scrollHalf(L, c, turns); const neg = h.map((p) => V(-p.x, -p.y, 0)).reverse(); return [...neg.slice(0, -1), ...h]; }
function scrollMesh(pts, r, mat) { return U.tube(pts, r, mat, false, Math.round(pts.length * 1.5), 4); }
/** 变径管：沿曲线半径由 rFn(u) 给出 */
function taperTube(points, rFn, mat, segs = 48, radial = 10) {
  const curve = new THREE.CatmullRomCurve3(points);
  const g = new THREE.TubeGeometry(curve, segs, 1, radial, false);
  const p = g.attributes.position; const c = new THREE.Vector3(), v = new THREE.Vector3();
  for (let i = 0; i <= segs; i++) {
    curve.getPointAt(i / segs, c); const r = rFn(i / segs);
    for (let j = 0; j <= radial; j++) { const k = i * (radial + 1) + j; v.fromBufferAttribute(p, k).sub(c).multiplyScalar(r).add(c); p.setXYZ(k, v.x, v.y, v.z); }
  }
  g.computeVertexNormals();
  return U.mesh(g, mat);
}
/** 水平方向对齐：让局部 +X 指向水平方向 d */
const yawTo = (d) => Math.atan2(-d.z, d.x);

// 八角形约定：角点角度 octA(k)（x = sin, z = cos），面 0 朝 +Z
const octA = (k) => k * PI / 4 + PI / 8;
const cornerPt = (r, k, y) => V(Math.sin(octA(k)) * r, y, Math.cos(octA(k)) * r);
const oct = (rt, rb, h, mat, y, open = false) => { const c = U.cyl(rt, rb, h, mat, 0, y, 0, 8, open); c.rotation.y = PI / 8; return c; };

/** 小青铜椅（法式小酒馆曲木椅） */
function bistroChair(M, x, z, ry) {
  const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = ry;
  g.add(U.cyl(0.21, 0.21, 0.04, M.wood, 0, 0.46, 0, 16));
  g.add(U.torus(0.21, 0.015, M.woodDark, 0, 0.44, 0, 4, 20)).children;
  g.children[1].rotation.x = PI / 2;
  for (let k = 0; k < 4; k++) { const a = k / 4 * TAU + PI / 4; g.add(U.rod(V(Math.cos(a) * 0.16, 0.44, Math.sin(a) * 0.16), V(Math.cos(a) * 0.21, 0, Math.sin(a) * 0.21), 0.014, M.woodDark, 5)); }
  const ring = U.torus(0.12, 0.012, M.woodDark, 0, 0.3, 0, 3, 16); ring.rotation.x = PI / 2; g.add(ring);
  // 弯木靠背（朝 -Z）
  const back = U.torus(0.19, 0.016, M.woodDark, 0, 0.7, -0.17, 4, 20, PI); back.rotation.x = -0.15; g.add(back);
  for (const sx of [-0.19, 0.19]) g.add(U.rod(V(sx, 0.46, -0.16), V(sx, 0.72, -0.2), 0.015, M.woodDark, 5));
  for (const sx of [-0.06, 0.06]) g.add(U.rod(V(sx, 0.46, -0.18), V(sx, 0.86, -0.22), 0.01, M.woodDark, 4));
  return g;
}

// ═════════════════════════════════════════════════════════════
//  1) 八角音乐亭
// ═════════════════════════════════════════════════════════════
export function createPlazaProps(M, ctx) {
  const group = new THREE.Group(); group.name = 'Kiosque';
  const S = new THREE.Group(); group.add(S);
  const iron = M.paintGreen, gold = M.gold;
  const H0 = 1.3, RC = 4.0, YT = 4.62; // 平台高度、柱圈半径、柱顶
  const stoneR = withRepeat(M.stone, 6, 1);

  // ─── 平台 ───
  S.add(oct(4.62, 4.7, 0.22, M.stone, 0.11));
  S.add(oct(4.45, 4.45, 0.9, stoneR, 0.67));
  S.add(oct(4.62, 4.62, 0.14, M.stone, 1.19));
  S.add(oct(4.47, 4.47, 0.05, M.deck, 1.285));
  // 平台立面铸铁格栅板
  for (let f = 1; f < 8; f++) {
    const a = f * PI / 4; const p = new THREE.Group(); p.rotation.y = a;
    const ap = 4.45 * Math.cos(PI / 8) + 0.01;
    p.add(U.box(2.6, 0.62, 0.03, M.paintBlack, 0, 0.67, ap));
    for (const y of [0.34, 1.0]) p.add(U.box(2.7, 0.05, 0.05, iron, 0, y, ap + 0.02));
    for (const x of [-1.33, 1.33]) p.add(U.box(0.05, 0.7, 0.05, iron, x, 0.67, ap + 0.02));
    for (let k = 0; k < 6; k++) {
      const x0 = -1.3 + k * 0.52;
      p.add(U.rod(V(x0, 0.37, ap + 0.025), V(x0 + 0.52, 0.97, ap + 0.025), 0.012, iron, 4));
      p.add(U.rod(V(x0 + 0.52, 0.37, ap + 0.025), V(x0, 0.97, ap + 0.025), 0.012, iron, 4));
      p.add(U.torus(0.11, 0.012, gold, x0 + 0.26, 0.67, ap + 0.03, 3, 12));
    }
    S.add(p);
  }
  // ─── 台阶（面 0，+Z）───
  {
    const n = 6, rise = H0 / n, tread = 0.32, z0 = 4.45 * Math.cos(PI / 8) - 0.1, w = 2.4;
    for (let k = 0; k < n; k++) { const d = (n - k) * tread + 0.1; S.add(U.box(w, rise, d, M.stone, 0, k * rise + rise / 2, z0 + d / 2)); }
    const sh = new THREE.Shape(); sh.moveTo(0, 0); sh.lineTo(n * tread + 0.25, 0); sh.lineTo(n * tread + 0.25, 0.42); sh.lineTo(0.15, H0 + 0.24); sh.lineTo(0, H0 + 0.24); sh.lineTo(0, 0);
    for (const sx of [-1, 1]) {
      const cg = new THREE.ExtrudeGeometry(sh, { depth: 0.3, bevelEnabled: false });
      const ch = U.mesh(cg, M.stone); ch.rotation.y = -PI / 2; ch.position.set(sx * (w / 2 + 0.15) + 0.15, 0, z0); S.add(ch);
      // 铜扶手 + 端柱
      const top0 = V(sx * (w / 2 + 0.15), H0 + 0.24 + 0.85, z0 + 0.1), top1 = V(sx * (w / 2 + 0.15), 0.42 + 0.85, z0 + n * tread + 0.15);
      S.add(U.tube([top0, top0.clone().lerp(top1, 0.5).add(V(0, 0.02, 0)), top1], 0.03, M.brass, false, 16, 6));
      for (let k = 0; k <= 4; k++) { const p = top0.clone().lerp(top1, k / 4); S.add(U.rod(V(p.x, p.y - 0.85, p.z), p, 0.018, iron, 5)); }
      S.add(U.lathe([[0.001, 0], [0.12, 0], [0.12, 0.08], [0.07, 0.14], [0.06, 0.7], [0.09, 0.78], [0.001, 0.82]], iron, 10)).position;
      S.children[S.children.length - 1].position.set(top1.x, 0.4, top1.z);
      S.add(U.sphere(0.09, gold, top1.x, 1.28, top1.z, 10, 8));
    }
  }
  // ─── 8 根铸铁柱（螺旋金线 + 金色柱头） ───
  for (let k = 0; k < 8; k++) {
    const p = cornerPt(RC, k, H0);
    const prof = [[0.2, 0], [0.2, 0.08], [0.15, 0.12], [0.16, 0.18], [0.11, 0.24], [0.1, 0.4], [0.085, 1.6], [0.075, 2.9], [0.09, 2.95], [0.075, 3.0], [0.08, 3.05], [0.14, 3.22], [0.2, 3.28], [0.2, 3.32]];
    const c = U.lathe(prof, iron, 14); c.position.copy(p); S.add(c);
    const hel = []; for (let i = 0; i <= 44; i++) { const u = i / 44; const a = u * TAU * 5; const y = 0.45 + u * 2.4; const r = 0.1 - u * 0.022; hel.push(V(p.x + Math.cos(a) * r, p.y + y, p.z + Math.sin(a) * r)); }
    S.add(U.tube(hel, 0.011, gold, false, 88, 4));
    for (const y of [0.42, 2.92]) { const t = U.torus(0.1, 0.018, gold, p.x, p.y + y, p.z, 4, 14); t.rotation.x = PI / 2; S.add(t); }
    for (let i = 0; i < 6; i++) { const a = i / 6 * TAU; const l = U.sphere(0.07, gold, p.x + Math.cos(a) * 0.12, p.y + 3.12, p.z + Math.sin(a) * 0.12, 5, 3); l.scale.set(0.6, 1.5, 0.6); S.add(l); }
  }
  // ─── 柱间：额枋 + 弧形花边 + 托架涡卷 + 垂饰 ───
  for (let k = 0; k < 8; k++) {
    const A = cornerPt(RC, k, 0), B = cornerPt(RC, k + 1, 0);
    const mid = A.clone().lerp(B, 0.5); const nrm = V(mid.x, 0, mid.z).normalize(); const dir = B.clone().sub(A).normalize();
    S.add(beam(A.clone().setY(YT), B.clone().setY(YT), 0.2, 0.14, iron, nrm));
    S.add(beam(A.clone().setY(YT + 0.12), B.clone().setY(YT + 0.12), 0.04, 0.2, gold, nrm));
    const arc = []; for (let i = 0; i <= 12; i++) { const s = i / 12; arc.push(A.clone().lerp(B, s).setY(YT - 0.62 + 0.46 * Math.pow(Math.sin(PI * s), 0.7))); }
    S.add(U.tube(arc, 0.03, iron, false, 32, 5));
    for (const s of [0.22, 0.78]) { const p = A.clone().lerp(B, s); const t = U.torus(0.13, 0.016, iron, p.x, YT - 0.2, p.z, 3, 14); t.rotation.y = yawTo(dir); S.add(t); S.add(U.sphere(0.035, gold, p.x, YT - 0.2, p.z, 6, 4)); }
    for (const [P, sgn] of [[A, 1], [B, -1]]) {
      const sc = scrollMesh(scrollHalf(0.28, 0.12, 1.4), 0.02, iron);
      sc.position.set(P.x, YT - 0.75, P.z); sc.rotation.y = yawTo(dir.clone().multiplyScalar(sgn)); sc.scale.y = 1.3; S.add(sc);
    }
    const md = A.clone().lerp(B, 0.5); const dr = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.2, 6), gold); dr.position.set(md.x, YT - 0.3, md.z); dr.rotation.z = PI; S.add(dr);
    // 栏杆（除台阶面）
    if (k !== 7) {
      const ra = U.railing([cornerPt(RC, k, H0), cornerPt(RC, k + 1, H0)], { height: 0.95, mat: iron, postEvery: 4, baluster: 0.13, ornate: false, rail: 0.03 });
      S.add(ra);
      for (let i = 1; i < 6; i++) { const p = A.clone().lerp(B, i / 6); const t = U.torus(0.09, 0.012, gold, p.x, H0 + 0.72, p.z, 3, 12); t.rotation.y = yawTo(dir); S.add(t); }
    }
  }
  // ─── 檐口 + 天花 + 铜绿屋顶 + 屋脊金线 + 檐口垂饰 ───
  S.add(oct(4.86, 4.86, 0.24, iron, YT + 0.26));
  S.add(oct(4.9, 4.9, 0.05, gold, YT + 0.16));
  const ceil = U.lathe([[0.001, 5.62], [0.8, 5.56], [2.0, 5.32], [3.5, 5.0], [4.84, 4.78]], M.wood, 8); ceil.rotation.y = PI / 8; S.add(ceil);
  const roofP = [[4.98, 4.86], [4.7, 4.98], [3.9, 5.3], [2.9, 5.84], [2.0, 6.38], [1.25, 6.86], [0.82, 7.12]];
  const roof = U.lathe(roofP, M.patina, 8); roof.rotation.y = PI / 8; S.add(roof);
  for (let k = 0; k < 8; k++) { const a = octA(k); S.add(U.tube(roofP.map(([r, y]) => V(Math.sin(a) * (r + 0.03), y + 0.03, Math.cos(a) * (r + 0.03))), 0.035, gold, false, 24, 5)); }
  for (let k = 0; k < 8; k++) {
    const A = cornerPt(4.95, k, 0), B = cornerPt(4.95, k + 1, 0); const dir = B.clone().sub(A).normalize();
    for (let i = 0; i < 9; i++) {
      const p = A.clone().lerp(B, (i + 0.5) / 9);
      const s = new THREE.Shape(); s.moveTo(-0.17, 0); s.lineTo(0.17, 0); s.absarc(0, 0, 0.17, 0, -PI, true);
      const m = U.mesh(new THREE.ExtrudeGeometry(s, { depth: 0.025, bevelEnabled: false, curveSegments: 6 }), M.patina);
      m.position.set(p.x, YT + 0.14, p.z); m.rotation.y = yawTo(dir); S.add(m);
      S.add(U.sphere(0.03, gold, p.x, YT - 0.06, p.z, 5, 3));
    }
  }
  // 屋顶灯笼 + 小屋顶 + 竖琴风向标
  S.add(oct(0.82, 0.82, 0.62, M.glowWarm, 7.43));
  for (let k = 0; k < 8; k++) { const p = cornerPt(0.84, k, 7.43); S.add(U.box(0.06, 0.62, 0.06, iron, p.x, p.y, p.z)); }
  S.add(oct(1.0, 1.0, 0.1, iron, 7.79));
  const cap = U.lathe([[1.02, 7.84], [0.78, 7.98], [0.42, 8.2], [0.16, 8.45], [0.001, 8.55]], M.patina, 8); cap.rotation.y = PI / 8; S.add(cap);
  S.add(U.sphere(0.14, gold, 0, 8.62, 0, 14, 10));
  {
    const ly = new THREE.Group(); ly.position.set(0, 8.75, 0);
    for (const s of [-1, 1]) ly.add(U.tube([V(0, 0, 0), V(s * 0.16, 0.1, 0), V(s * 0.22, 0.35, 0), V(s * 0.13, 0.55, 0), V(s * 0.2, 0.68, 0), V(s * 0.28, 0.66, 0)], 0.022, gold, false, 20, 5));
    ly.add(U.box(0.5, 0.03, 0.03, gold, 0, 0.56, 0));
    for (let i = -2; i <= 2; i++) ly.add(U.rod(V(i * 0.04, 0.06, 0), V(i * 0.05, 0.56, 0), 0.005, gold, 3));
    ly.add(U.rod(V(0, -0.1, 0), V(0, 0.06, 0), 0.02, gold, 6));
    S.add(ly);
  }
  // 吊灯（黄铜环 + 6 盏小灯）
  {
    const yR = 4.05;
    S.add(U.rod(V(0, 5.6, 0), V(0, yR + 0.2, 0), 0.02, M.brass, 6));
    const t = U.torus(0.62, 0.025, M.brass, 0, yR, 0, 4, 32); t.rotation.x = PI / 2; S.add(t);
    for (let k = 0; k < 6; k++) { const a = k / 6 * TAU; S.add(U.rod(V(0, yR + 0.5, 0), V(Math.cos(a) * 0.62, yR, Math.sin(a) * 0.62), 0.01, M.brass, 4)); const l = U.lantern(M, 0.55); l.position.set(Math.cos(a) * 0.62, yR + 0.02, Math.sin(a) * 0.62); S.add(l); }
    const b = U.sphere(0.12, M.glowWarm, 0, yR - 0.1, 0, 12, 8); b.castShadow = false; S.add(b);
  }

  // ─── 乐手 + 乐器 + 谱架 ───
  const band = [];
  const stand = (x, z, ry) => {
    const g = new THREE.Group(); g.position.set(x, H0, z); g.rotation.y = ry;
    g.add(U.rod(V(0, 0, 0), V(0, 1.05, 0), 0.012, M.paintBlack, 4));
    for (let k = 0; k < 3; k++) { const a = k / 3 * TAU; g.add(U.rod(V(0, 0.15, 0), V(Math.cos(a) * 0.22, 0, Math.sin(a) * 0.22), 0.01, M.paintBlack, 4)); }
    const desk = U.box(0.42, 0.3, 0.015, M.paintBlack, 0, 1.15, 0.02); desk.rotation.x = -0.35; g.add(desk);
    const sheet = U.box(0.36, 0.25, 0.005, M.paintCream, 0, 1.16, 0.04); sheet.rotation.x = -0.35; g.add(sheet);
    return g;
  };
  const players = [
    { x: -1.9, z: -0.6, inst: 'tuba' }, { x: -0.7, z: -1.5, inst: 'cornet' }, { x: 0.7, z: -1.5, inst: 'clarinet' },
    { x: 1.9, z: -0.6, inst: 'horn' }, { x: 0.0, z: -2.6, inst: 'drum' }, { x: -2.4, z: -2.0, inst: 'cornet' }, { x: 2.4, z: -2.0, inst: 'clarinet' },
  ];
  players.forEach((pl, i) => {
    const p = U.person(500 + i); p.position.set(pl.x, H0, pl.z); p.rotation.y = Math.atan2(-pl.x, 2.2 - pl.z) * 0.6;
    // 统一深色乐队制服帽
    p.add(U.cyl(0.12, 0.12, 0.12, M.paintNavy, 0, 1.78, 0, 12)); p.add(U.cyl(0.13, 0.13, 0.02, M.paintBlack, 0, 1.72, 0.04, 12)); p.add(U.sphere(0.025, gold, 0, 1.8, 0.12, 6, 4));
    const ins = new THREE.Group();
    if (pl.inst === 'tuba') {
      ins.add(U.torus(0.2, 0.06, M.brass, 0, 1.15, 0.2, 8, 24)).children; ins.children[0].rotation.y = PI / 2;
      const bell = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.06, 0.4, 20, 1, true), M.brass); bell.material.side = THREE.DoubleSide; bell.position.set(0.05, 1.55, 0.2); bell.castShadow = true; ins.add(bell);
      ins.add(U.rod(V(0, 1.4, 0.2), V(0, 1.55, 0.12), 0.012, M.brass, 5));
    } else if (pl.inst === 'cornet' || pl.inst === 'horn') {
      if (pl.inst === 'horn') { ins.add(U.torus(0.17, 0.025, M.brass, 0.0, 1.3, 0.25, 6, 24)); const bl = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.03, 0.18, 16, 1, true), M.brass); bl.rotation.z = PI / 2; bl.position.set(0.22, 1.18, 0.25); ins.add(bl); }
      else { ins.add(U.rod(V(0, 1.58, 0.12), V(0, 1.5, 0.45), 0.015, M.brass, 6)); const bl = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.015, 0.14, 14, 1, true), M.brass); bl.rotation.x = PI / 2 - 0.25; bl.position.set(0, 1.48, 0.52); ins.add(bl); ins.add(U.torus(0.05, 0.012, M.brass, 0, 1.52, 0.3, 4, 12)); }
    } else if (pl.inst === 'clarinet') {
      ins.add(U.rod(V(0, 1.56, 0.12), V(0, 1.05, 0.42), 0.018, M.paintBlack, 6)); ins.add(new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.02, 0.07, 10), M.paintBlack)); ins.children[1].position.set(0, 1.02, 0.44); ins.children[1].rotation.x = -0.5;
    } else if (pl.inst === 'drum') {
      const dr = U.cyl(0.32, 0.32, 0.36, M.paintRed, 0, 0.9, 0.35, 24); dr.rotation.x = PI / 2; ins.add(dr);
      for (const z of [0.17, 0.53]) { const r = U.torus(0.32, 0.02, M.brass, 0, 0.9, z, 4, 24); ins.add(r); const h = U.cyl(0.31, 0.31, 0.01, M.ivory, 0, 0.9, z, 24); h.rotation.x = PI / 2; ins.add(h); }
      for (let k = 0; k < 8; k++) { const a = k / 8 * TAU; ins.add(U.rod(V(Math.cos(a) * 0.32, 0.9 + Math.sin(a) * 0.32, 0.19), V(Math.cos(a + 0.5) * 0.32, 0.9 + Math.sin(a + 0.5) * 0.32, 0.51), 0.006, M.paintCream, 3)); }
    }
    p.add(ins);
    // 演奏姿态：前臂抬起
    p.userData.arms.forEach((a, j) => { a.rotation.x = -1.0 - (j ? 0.15 : 0); a.rotation.z = (j ? -1 : 1) * 0.25; });
    U.mergeStatic(p); // 姿态固定：按材质合并，整体摇摆
    p.userData.dynamic = true; p.userData.base = p.rotation.y; band.push(p); group.add(p);
    if (pl.inst !== 'drum') S.add(stand(pl.x * 1.0 + Math.sin(p.rotation.y) * 0.6, pl.z + Math.cos(p.rotation.y) * 0.6, p.rotation.y + PI));
    S.add(bistroChair(M, pl.x - Math.sin(p.rotation.y) * 0.5, pl.z - Math.cos(p.rotation.y) * 0.5, p.rotation.y).translateY(H0));
  });
  // 指挥（面向乐队）
  const cond = U.person(560); cond.position.set(0, H0 + 0.12, 1.7); cond.rotation.y = PI; cond.userData.dynamic = true; group.add(cond);
  const baton = U.rod(V(0, -0.62, 0), V(0, -1.0, 0.0), 0.006, M.paintWhite, 3); cond.userData.arms[0].add(baton);
  S.add(U.box(0.7, 0.12, 0.5, M.woodDark, 0, H0 + 0.06, 1.7));

  // ─── 听众 + 长椅 ───
  const aud = [[-2.6, 7.2], [-1.2, 7.8], [0.6, 7.4], [2.2, 7.9], [3.8, 6.8], [-4.4, 6.4], [5.6, 5.4], [-6.0, 4.8]];
  aud.forEach(([x, z], i) => { const p = U.person(600 + i, { child: i === 2 || i === 6 }); p.position.set(x, 0, z); p.rotation.y = Math.atan2(-x, -z); S.add(p); });
  const parkBench = (x, z, ry) => {
    const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = ry;
    for (const dx of [-0.85, 0.85]) {
      g.add(U.tube([V(dx, 0, 0.25), V(dx, 0.42, 0.2), V(dx, 0.45, -0.1), V(dx, 0.9, -0.28), V(dx, 0.95, -0.2)], 0.03, M.paintBlack, false, 16, 5));
      g.add(U.tube([V(dx, 0, -0.25), V(dx, 0.42, 0.2)], 0.028, M.paintBlack, false, 4, 5));
    }
    for (let k = 0; k < 4; k++) g.add(U.box(1.9, 0.035, 0.09, M.wood, 0, 0.45, 0.17 - k * 0.1));
    for (let k = 0; k < 3; k++) g.add(U.box(1.9, 0.08, 0.03, M.wood, 0, 0.62 + k * 0.11, -0.16 - k * 0.04));
    return g;
  };
  for (const s of [-1, 1]) S.add(parkBench(s * 5.6, 3.6, Math.atan2(-s * 5.6, -3.6)));

  // 夜灯
  const lt = new THREE.PointLight(0xffc27a, 0, 16, 2); lt.position.set(0, 3.8, 0); group.add(lt); ctx.addNightLight(lt, 22);

  U.mergeStatic(S);
  return {
    group,
    focus: { pos: [6, 4.5, 14], target: [0, 3, 0] },
    footprint: 8,
    update(t, dt, env) {
      const beat = t * 2.2;
      band.forEach((p, i) => {
        p.rotation.z = Math.sin(beat + i * 0.7) * 0.035;
        p.rotation.y = p.userData.base + Math.sin(beat * 0.5 + i) * 0.05;
        p.position.y = H0 + Math.max(0, Math.sin(beat * 2 + i)) * 0.015;
      });
      const [aR, aL] = cond.userData.arms;
      aR.rotation.x = -1.3 + Math.sin(t * 4.4) * 0.35; aR.rotation.z = 0.3 + Math.cos(t * 4.4) * 0.25;
      aL.rotation.x = -0.9 + Math.sin(t * 2.2 + 1) * 0.25; aL.rotation.z = -0.35;
      cond.rotation.y = PI + Math.sin(t * 0.6) * 0.25;
    },
  };
}

// ═════════════════════════════════════════════════════════════
//  2) CAFÉ NEMO
// ═════════════════════════════════════════════════════════════
export function createCafe(M, ctx) {
  const group = new THREE.Group(); group.name = 'CafeNemo';
  const S = new THREE.Group(); group.add(S);
  const iron = M.paintGreen, gold = M.gold;
  const R = rng(1870);
  const W = 10, ZF = -1.0, ZB = -6.0; // 立面 z、背墙 z
  const creamW = withRepeat(M.stone, 3, 1);
  const slateR = withRepeat(M.slate, 6, 1.2);
  const terr = withRepeat(M.stone, 6, 4);

  // ─── 建筑本体 ───
  S.add(U.box(W + 0.5, 0.35, ZF - ZB + 0.4, M.stone, 0, 0.175, (ZF + ZB) / 2));
  S.add(U.box(W, 4.0, 0.3, M.paintCream, 0, 2.35, ZB + 0.15));
  for (const sx of [-1, 1]) {
    S.add(U.box(0.3, 4.0, ZF - ZB, M.paintCream, sx * (W / 2 - 0.15), 2.35, (ZF + ZB) / 2));
    for (const z of [ZF + 0.1, ZB + 0.25]) S.add(U.box(0.5, 4.0, 0.5, creamW, sx * (W / 2 - 0.05), 2.35, z));
    // 侧窗（拱形）
    for (const z of [-4.6, -2.5]) {
      const g = new THREE.Group(); g.position.set(sx * (W / 2 + 0.01), 0, z); g.rotation.y = sx * PI / 2;
      g.add(U.box(1.0, 1.6, 0.04, M.glowWindow, 0, 2.3, 0));
      const fan = U.mesh(new THREE.CircleGeometry(0.5, 16, 0, PI), M.glowWindow); fan.position.set(0, 3.1, 0.02); g.add(fan);
      const tr = U.torus(0.56, 0.07, M.stone, 0, 3.1, 0.04, 4, 16, PI); g.add(tr);
      for (const x of [-0.56, 0.56]) g.add(U.box(0.14, 1.6, 0.1, M.stone, x, 2.3, 0.04));
      g.add(U.box(1.3, 0.1, 0.22, M.stone, 0, 1.45, 0.08));
      g.add(U.box(0.04, 2.1, 0.05, iron, 0, 2.55, 0.04)); for (const y of [1.9, 2.6]) g.add(U.box(1.0, 0.04, 0.05, iron, 0, y, 0.04));
      S.add(g);
    }
  }
  // ─── 铸铁玻璃门面（5 开间） ───
  const bays = [-4, -2, 0, 2, 4];
  for (const x of [-5, -3, -1, 1, 3, 5]) {
    S.add(U.box(0.24, 3.55, 0.24, iron, x * 0.98, 2.12, ZF + 0.05));
    S.add(U.box(0.34, 0.22, 0.32, iron, x * 0.98, 0.46, ZF + 0.05));
    S.add(U.box(0.34, 0.14, 0.32, gold, x * 0.98, 3.84, ZF + 0.05));
    for (let i = 0; i < 5; i++) { const a = i / 5 * TAU; const l = U.sphere(0.05, gold, x * 0.98 + Math.cos(a) * 0.12, 3.68, ZF + 0.05 + Math.sin(a) * 0.12, 5, 3); l.scale.y = 1.6; S.add(l); }
  }
  for (const x of bays) {
    const door = x === 0;
    if (!door) {
      S.add(U.box(1.76, 0.72, 0.1, M.woodDark, x, 0.71, ZF));
      S.add(U.box(1.3, 0.42, 0.04, M.paintTeal, x, 0.71, ZF + 0.06));
      for (const y of [0.5, 0.92]) S.add(U.box(1.36, 0.03, 0.03, gold, x, y, ZF + 0.08));
      S.add(U.box(1.76, 1.88, 0.05, M.glowWindow, x, 2.02, ZF));
      S.add(U.box(0.04, 1.88, 0.06, iron, x, 2.02, ZF + 0.03));
      for (const y of [1.55, 2.5]) S.add(U.box(1.76, 0.04, 0.06, iron, x, y, ZF + 0.03));
      S.add(U.box(1.86, 0.08, 0.18, iron, x, 1.08, ZF + 0.05));
    } else {
      // 双开玻璃门
      for (const s of [-1, 1]) {
        const dx = s * 0.45;
        S.add(U.box(0.86, 2.55, 0.08, M.woodDark, dx, 1.62, ZF));
        S.add(U.box(0.62, 1.7, 0.03, M.glowWindow, dx, 1.95, ZF + 0.05));
        S.add(U.box(0.6, 0.45, 0.03, M.paintTeal, dx, 0.68, ZF + 0.05));
        S.add(U.rod(V(dx - s * 0.32, 1.25, ZF + 0.12), V(dx - s * 0.32, 1.75, ZF + 0.12), 0.018, M.brass, 6));
        S.add(U.mesh(new THREE.CircleGeometry(0.16, 20), M.brass)).position;
        S.children[S.children.length - 1].position.set(dx, 1.95, ZF + 0.07);
      }
      S.add(U.box(2.0, 0.06, 0.6, M.brass, 0, 0.38, ZF + 0.25));
    }
    // 拱形气窗
    const fan = U.mesh(new THREE.CircleGeometry(0.86, 24, 0, PI), M.glowWindow); fan.position.set(x, 2.98, ZF); S.add(fan);
    for (let k = 1; k < 6; k++) { const a = k / 6 * PI; S.add(beam(V(x + Math.cos(a) * 0.18, 2.98 + Math.sin(a) * 0.18, ZF + 0.03), V(x + Math.cos(a) * 0.86, 2.98 + Math.sin(a) * 0.86, ZF + 0.03), 0.03, 0.04, iron)); }
    S.add(U.torus(0.88, 0.04, iron, x, 2.98, ZF + 0.03, 4, 24, PI));
    S.add(U.torus(0.18, 0.025, gold, x, 2.98, ZF + 0.04, 4, 12, PI));
    S.add(U.box(1.86, 0.08, 0.12, iron, x, 2.96, ZF + 0.03));
    const fill = new THREE.Shape(); fill.moveTo(-0.92, 0); fill.lineTo(-0.92, 0.92); fill.lineTo(0.92, 0.92); fill.lineTo(0.92, 0); fill.absarc(0, 0, 0.9, 0, PI, false);
    const fm = U.mesh(new THREE.ExtrudeGeometry(fill, { depth: 0.08, bevelEnabled: false, curveSegments: 12 }), iron); fm.position.set(x, 2.98, ZF - 0.02); S.add(fm);
  }
  // ─── 檐部：招牌 + 舷窗徽章 + 檐口齿饰 ───
  S.add(U.box(W + 0.4, 0.78, 0.26, iron, 0, 4.29, ZF + 0.02));
  for (const y of [3.92, 4.66]) S.add(U.box(W + 0.42, 0.05, 0.3, gold, 0, y, ZF + 0.03));
  const sign = U.signBoard('CAFÉ NEMO', 4.6, 0.62, { w: 1536, h: 208, bg: '#173c3d', fg: '#f0cf7a', border: '#d8b25a', font: 'bold 140px "Playfair Display", "Times New Roman", serif', edge: M.brass });
  sign.position.set(0, 4.29, ZF + 0.2); S.add(sign);
  for (const sx of [-1, 1]) {
    const px = sx * 3.6; const g = new THREE.Group(); g.position.set(px, 4.29, ZF + 0.17);
    g.add(U.torus(0.27, 0.06, M.brass, 0, 0, 0, 8, 28));
    const gl = U.mesh(new THREE.CircleGeometry(0.24, 24), M.glowCyan); gl.position.z = -0.01; g.add(gl);
    for (let k = 0; k < 8; k++) { const a = k / 8 * TAU; g.add(U.sphere(0.028, M.brass, Math.cos(a) * 0.27, Math.sin(a) * 0.27, 0.05, 6, 4)); }
    for (const s2 of [-1, 1]) { const sc = scrollMesh(scrollHalf(0.35, 0.12, 1.4), 0.02, gold); sc.position.set(s2 * 0.32, -0.05, 0.02); sc.scale.x = s2; g.add(sc); }
    S.add(g);
  }
  S.add(U.box(W + 0.8, 0.16, 0.7, M.stone, 0, 4.76, ZF - 0.12));
  for (let k = 0; k < 44; k++) S.add(U.box(0.09, 0.09, 0.1, M.stone, -W / 2 - 0.25 + k * ((W + 0.5) / 43), 4.64, ZF + 0.18));
  // ─── 孟莎式屋顶 + 牛眼老虎窗 + 顶冠铁花 + 烟囱 ───
  {
    const zc = (ZF + ZB) / 2, wB = W + 0.6, dB = ZF - ZB + 0.6;
    const rb = 1 / Math.SQRT2, k = 0.86;
    const man = new THREE.Mesh(new THREE.CylinderGeometry(rb * k, rb, 1.25, 4, 1), slateR);
    man.rotation.y = PI / 4; man.scale.set(wB, 1, dB); man.position.set(0, 4.84 + 0.625, zc); man.castShadow = true; man.receiveShadow = true;
    const wrap = new THREE.Group(); wrap.add(man); wrap.scale.set(1, 1, 1);
    // CylinderGeometry 旋转 45° 后再缩放会扭曲；改为先烘焙旋转
    man.geometry.rotateY(PI / 4); man.rotation.y = 0;
    S.add(wrap);
    const topW = wB * k, topD = dB * k;
    S.add(U.box(topW, 0.08, topD, M.ironPlain, 0, 6.13, zc));
    // 顶冠铁花
    const crest = (a, b) => { const n = Math.round(a.distanceTo(b) / 0.3); S.add(beam(a.clone().setY(6.2), b.clone().setY(6.2), 0.03, 0.03, M.paintBlack)); S.add(beam(a.clone().setY(6.45), b.clone().setY(6.45), 0.025, 0.025, M.paintBlack)); for (let i = 0; i <= n; i++) { const p = a.clone().lerp(b, i / n); S.add(U.rod(V(p.x, 6.17, p.z), V(p.x, 6.5, p.z), 0.01, M.paintBlack, 4)); const sp = new THREE.Mesh(new THREE.ConeGeometry(0.025, 0.1, 5), gold); sp.position.set(p.x, 6.55, p.z); S.add(sp); } };
    const c1 = V(-topW / 2, 0, zc - topD / 2), c2 = V(topW / 2, 0, zc - topD / 2), c3 = V(topW / 2, 0, zc + topD / 2), c4 = V(-topW / 2, 0, zc + topD / 2);
    crest(c4, c3); crest(c1, c4); crest(c2, c3);
    // 牛眼窗（前坡）
    const slope = Math.atan2((dB - topD) / 2, 1.25);
    for (const x of [-3, 0, 3]) {
      const g = new THREE.Group(); g.position.set(x, 5.4, zc + dB / 2 - (dB - topD) / 2 * 0.45 + 0.04); g.rotation.x = -slope;
      g.add(U.torus(0.34, 0.07, M.patina, 0, 0, 0.04, 6, 24));
      const gw = U.mesh(new THREE.CircleGeometry(0.3, 20), M.glowWindow); gw.position.z = 0.03; g.add(gw);
      g.add(U.box(0.6, 0.03, 0.03, iron, 0, 0, 0.05)); g.add(U.box(0.03, 0.6, 0.03, iron, 0, 0, 0.05));
      const hood = U.torus(0.42, 0.06, M.patina, 0, 0.02, 0.08, 4, 16, PI); g.add(hood);
      g.add(U.sphere(0.06, gold, 0, 0.5, 0.08, 8, 6));
      S.add(g);
    }
    // 烟囱
    S.add(U.box(0.7, 1.6, 0.6, withRepeat(M.brick, 1, 2), 3.4, 6.5, zc - 1.2));
    S.add(U.box(0.84, 0.12, 0.74, M.stone, 3.4, 7.34, zc - 1.2));
    for (const dx of [-0.16, 0.16]) S.add(U.cyl(0.08, 0.1, 0.32, M.copper, 3.4 + dx, 7.56, zc - 1.2, 10));
  }
  // ─── 壁灯 ───
  for (const x of [-4.9, 4.9]) {
    const br = new THREE.Group(); br.position.set(x, 3.0, ZF + 0.18);
    br.add(scrollMesh(scrollHalf(0.3, 0.1, 1.3), 0.018, M.paintBlack)).rotation;
    br.children[0].rotation.y = -PI / 2;
    br.add(U.rod(V(0, 0.05, 0), V(0, 0.05, 0.4), 0.02, M.paintBlack, 5));
    const l = U.lantern(M, 0.85); l.position.set(0, -0.6, 0.4); br.add(l);
    br.add(U.rod(V(0, 0.05, 0.4), V(0, -0.0, 0.4), 0.01, M.paintBlack, 4));
    S.add(br);
  }

  // ─── 条纹遮阳篷（下垂 + 扇贝垂边 + 侧帘 + 伸缩臂） ───
  {
    const y0 = 3.62, z0 = ZF + 0.05, y1 = 2.82, z1 = 3.0, AW = W + 0.4;
    const len = Math.hypot(z1 - z0, y1 - y0); const phi = Math.atan2(z1 - z0, y1 - y0); // 局部 +Y → 斜坡方向
    const geo = new THREE.PlaneGeometry(AW, len, 20, 10);
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i); const v = y / len + 0.5, u = x / AW + 0.5; p.setZ(i, Math.sin(PI * v) * 0.09 * (0.75 + 0.25 * Math.sin(PI * u * 5) ** 2)); }
    geo.computeVertexNormals();
    const aw = new THREE.Mesh(geo, M.stripeGreen); aw.castShadow = true; aw.receiveShadow = true;
    aw.rotation.x = phi; aw.position.set(0, (y0 + y1) / 2, (z0 + z1) / 2);
    S.add(aw);
    // 扇贝垂边
    const vs = new THREE.Shape(); const hV = 0.24, sc = 0.13, nS = Math.round(AW / (sc * 2));
    vs.moveTo(-AW / 2, 0); vs.lineTo(AW / 2, 0); vs.lineTo(AW / 2, -hV);
    for (let i = nS - 1; i >= 0; i--) { const cx = -AW / 2 + (i + 0.5) * (AW / nS); vs.absarc(cx, -hV, AW / nS / 2, 0, -PI, true); }
    vs.lineTo(-AW / 2, 0);
    const vg = new THREE.ShapeGeometry(vs, 4);
    const vp = vg.attributes.position, vu = vg.attributes.uv;
    for (let i = 0; i < vp.count; i++) vu.setXY(i, vp.getX(i) / AW + 0.5, (vp.getY(i) + hV + sc) / (hV + sc) * 0.12);
    const val = U.mesh(vg, M.stripeGreen); val.position.set(0, y1 + 0.01, z1 + 0.01); S.add(val);
    S.add(U.box(AW + 0.1, 0.05, 0.05, M.brass, 0, y1 + 0.02, z1 + 0.02));
    for (const sx of [-1, 1]) {
      S.add(U.sphere(0.07, gold, sx * (AW / 2 + 0.08), y1 + 0.02, z1 + 0.02, 10, 8));
      // 侧帘
      const cs = new THREE.Shape(); cs.moveTo(0, 0); cs.lineTo(z1 - z0, y1 - y0); cs.lineTo(z1 - z0, y1 - y0 - 0.3); cs.quadraticCurveTo((z1 - z0) * 0.5, -0.45, 0, -0.18); cs.lineTo(0, 0);
      const cg = new THREE.ShapeGeometry(cs, 8); const cp = cg.attributes.position, cu = cg.attributes.uv;
      for (let i = 0; i < cp.count; i++) cu.setXY(i, cp.getX(i) / (z1 - z0) * 0.4, cp.getY(i));
      const cm = U.mesh(cg, M.stripeGreen); cm.rotation.y = -PI / 2; cm.position.set(sx * AW / 2, y0, z0); S.add(cm);
      // 伸缩臂
      S.add(U.rod(V(sx * 3.6, 2.35, z0 + 0.05), V(sx * 3.6, y1 + 0.0, z1 - 0.05), 0.022, M.paintBlack, 6));
      S.add(U.sphere(0.05, M.brass, sx * 3.6, 2.35, z0 + 0.06, 8, 6));
      S.add(U.rod(V(sx * 1.5, 2.35, z0 + 0.05), V(sx * 1.5, y1 + 0.0, z1 - 0.05), 0.02, M.paintBlack, 6));
    }
  }

  // ─── 露台地坪 + 花槽 + 凡尔赛花箱 ───
  S.add(U.box(W + 1.2, 0.08, 6.6, terr, 0, 0.04, ZF + 3.3));
  for (const sx of [-1, 1]) {
    const x = sx * 3.6; S.add(U.box(2.8, 0.55, 0.5, iron, x, 0.3, ZF + 6.55));
    S.add(U.box(2.9, 0.06, 0.6, gold, x, 0.58, ZF + 6.55));
    for (let i = 0; i < 9; i++) { const f = new THREE.Mesh(new THREE.IcosahedronGeometry(0.2 + R() * 0.08, 0), [M.foliage, M.foliage2][i % 2]); f.position.set(x - 1.2 + i * 0.3, 0.75, ZF + 6.55 + (R() - 0.5) * 0.15); S.add(f); }
    for (let i = 0; i < 7; i++) S.add(U.sphere(0.05, [M.paintRed, M.paintWhite, M.glowRed][i % 3], x - 1.1 + i * 0.37, 0.92 + R() * 0.08, ZF + 6.5 + (R() - 0.5) * 0.25, 6, 4));
  }
  const versailles = (x, z, orange) => {
    const g = new THREE.Group(); g.position.set(x, 0.08, z);
    g.add(U.box(0.8, 0.75, 0.8, M.paintWhite, 0, 0.42, 0));
    for (const dx of [-0.4, 0.4]) for (const dz of [-0.4, 0.4]) { g.add(U.box(0.09, 0.86, 0.09, iron, dx, 0.45, dz)); g.add(U.sphere(0.07, gold, dx, 0.94, dz, 8, 6)); }
    for (let k = 0; k < 4; k++) { const p = new THREE.Group(); p.rotation.y = k * PI / 2; p.add(U.box(0.55, 0.04, 0.02, iron, 0, 0.42, 0.41)); p.add(U.box(0.04, 0.5, 0.02, iron, 0, 0.42, 0.41)); g.add(p); }
    g.add(U.cyl(0.05, 0.07, 1.0, M.bark, 0, 1.3, 0, 6));
    const crown = new THREE.Mesh(new THREE.IcosahedronGeometry(0.62, 1), M.foliage); crown.position.y = 2.05; crown.castShadow = true; g.add(crown);
    if (orange) for (let i = 0; i < 9; i++) { const a = i * 2.4, el = (R() - 0.3) * 1.1; g.add(U.sphere(0.06, M.copper, Math.cos(a) * Math.cos(el) * 0.6, 2.05 + Math.sin(el) * 0.55, Math.sin(a) * Math.cos(el) * 0.6, 8, 6)); }
    return g;
  };
  S.add(versailles(-5.6, ZF + 6.3, true)); S.add(versailles(5.6, ZF + 6.3, true));
  S.add(versailles(-1.7, ZF + 0.6, false)); S.add(versailles(1.7, ZF + 0.6, false));

  // ─── 圆桌 + 椅子 + 桌面小物 ───
  const tables = [[-3.8, 0.9], [-2.0, 2.9], [-4.0, 4.5], [3.8, 0.9], [2.0, 2.9], [4.0, 4.5]];
  tables.forEach(([x, z], i) => {
    const g = new THREE.Group(); g.position.set(x, 0.08, z);
    g.add(U.cyl(0.36, 0.36, 0.04, M.ivory, 0, 0.74, 0, 28));
    g.add(U.torus(0.36, 0.012, M.brass, 0, 0.74, 0, 4, 28)).children; g.children[1].rotation.x = PI / 2;
    g.add(U.lathe([[0.001, 0], [0.03, 0], [0.03, 0.2], [0.05, 0.25], [0.025, 0.3], [0.03, 0.62], [0.07, 0.68], [0.12, 0.72], [0.001, 0.72]], M.paintBlack, 10));
    for (let k = 0; k < 3; k++) { const a = k / 3 * TAU; g.add(U.tube([V(0, 0.12, 0), V(Math.cos(a) * 0.18, 0.06, Math.sin(a) * 0.18), V(Math.cos(a) * 0.3, 0.02, Math.sin(a) * 0.3)], 0.018, M.paintBlack, false, 8, 4)); }
    // 小物
    for (let k = 0; k < 2; k++) { const a = k * PI + i; const cx = Math.cos(a) * 0.17, cz = Math.sin(a) * 0.17; g.add(U.cyl(0.07, 0.07, 0.008, M.paintWhite, cx, 0.765, cz, 14)); g.add(U.cyl(0.04, 0.032, 0.06, M.paintWhite, cx, 0.8, cz, 12)); g.add(U.cyl(0.033, 0.033, 0.002, M.woodDark, cx, 0.83, cz, 10)); }
    put(g, U.lathe([[0.001, 0], [0.05, 0], [0.06, 0.08], [0.03, 0.16], [0.02, 0.22], [0.025, 0.24], [0.001, 0.24]], M.glass, 12)).position.set(0, 0.76, 0);
    S.add(g);
    const nc = 2 + (i % 2);
    for (let k = 0; k < nc; k++) { const a = (k / nc) * TAU + i * 0.7; S.add(bistroChair(M, x + Math.cos(a) * 0.68, z + Math.sin(a) * 0.68, Math.atan2(Math.cos(a), Math.sin(a)) + PI).translateY(0.08)); }
  });
  // 黑板菜单架
  {
    const g = new THREE.Group(); g.position.set(0.0, 0.08, ZF + 6.4); g.rotation.y = 0;
    const b = U.signBoard('PLAT DU JOUR', 0.62, 0.9, { w: 256, h: 372, bg: '#1d1f1c', fg: '#f2efe0', border: '#a07b4a', font: 'italic 34px "Times New Roman", serif', sub: 'Bouillabaisse · 2 F', edge: M.woodDark });
    b.position.set(0, 0.85, 0.12); b.rotation.x = -0.22; g.add(b);
    for (const sx of [-0.33, 0.33]) { g.add(U.rod(V(sx, 0, 0.32), V(sx, 1.35, 0.03), 0.02, M.woodDark, 5)); g.add(U.rod(V(sx, 0, -0.3), V(sx, 1.35, 0.0), 0.02, M.woodDark, 5)); }
    S.add(g);
  }
  // 路灯
  { const l = U.lampPost(M, { h: 4.0, arms: 2 }); l.position.set(-6.4, 0, ZF + 6.8); S.add(l); }

  // ─── 人物：顾客 + 侍者 ───
  const ppl = [[-3.3, 1.5, 2.5], [-2.6, 3.4, -0.6], [3.2, 1.3, -2.2], [4.6, 4.9, 3.6], [-4.7, 4.0, 1.2], [1.0, 6.4, PI]];
  ppl.forEach(([x, z, ry], i) => { const p = U.person(700 + i); p.position.set(x, 0.08, z); p.rotation.y = ry; S.add(p); });
  const waiter = U.person(777); waiter.userData.dynamic = true;
  waiter.add(U.box(0.42, 0.55, 0.03, M.paintWhite, 0, 0.7, 0.19)); // 白围裙
  const trayArm = waiter.userData.arms[1]; trayArm.rotation.x = -1.4;
  const tray = new THREE.Group(); tray.position.set(0, -0.6, 0.0);
  tray.add(U.cyl(0.2, 0.2, 0.015, M.brass, 0, 0, 0, 20));
  tray.add(U.cyl(0.035, 0.03, 0.08, M.paintWhite, 0.06, 0.05, 0, 10)); tray.add(U.lathe([[0.001, 0], [0.04, 0], [0.045, 0.12], [0.02, 0.2], [0.02, 0.26], [0.001, 0.26]], M.glass, 10)).position;
  tray.children[2].position.set(-0.07, 0.01, 0.02);
  tray.rotation.x = 1.4; trayArm.add(tray);
  group.add(waiter);

  // 夜灯
  const lt = new THREE.PointLight(0xffb868, 0, 14, 2); lt.position.set(0, 2.5, 1.2); group.add(lt); ctx.addNightLight(lt, 18);

  U.mergeStatic(S);
  return {
    group,
    focus: { pos: [7, 4, 13], target: [0, 2.2, -1] },
    footprint: 8,
    update(t, dt, env) {
      // 侍者在桌间巡游：沿 8 字形
      const a = t * 0.28;
      const x = Math.sin(a) * 2.9, z = 2.4 + Math.sin(a * 2) * 1.3;
      const dx = Math.cos(a) * 2.9, dz = Math.cos(a * 2) * 2.6;
      waiter.position.set(x, 0.08, z); waiter.rotation.y = Math.atan2(dx, dz);
      U.animatePerson(waiter, t, 0.7); trayArm.rotation.x = -1.4;
    },
  };
}

// ═════════════════════════════════════════════════════════════
//  3) 章鱼与鹦鹉螺喷泉
// ═════════════════════════════════════════════════════════════
export function createFountain(M, ctx) {
  const group = new THREE.Group(); group.name = 'FontaineNautilus';
  const S = new THREE.Group(); group.add(S);
  const bronze = M.patina, gold = M.gold;
  const R = rng(1866);
  const WATER_Y = 0.48, RB = 3.94;
  const waterMat = new THREE.MeshStandardMaterial({ color: 0x3c8ea6, roughness: 0.06, metalness: 0.3, transparent: true, opacity: 0.78 });
  const streamMat = new THREE.MeshStandardMaterial({ color: 0xcfeefa, emissive: 0x204a58, roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.45, depthWrite: false });
  const dropMat = new THREE.MeshStandardMaterial({ color: 0xe6f8ff, emissive: 0x2a5866, roughness: 0.05, transparent: true, opacity: 0.85 });

  // ─── 地坪 + 水池 ───
  S.add(U.cyl(5.0, 5.05, 0.08, withRepeat(M.cobbles, 3, 3), 0, 0.04, 0, 48));
  S.add(U.torus(5.0, 0.05, M.stone, 0, 0.06, 0, 4, 64)).children;
  S.children[S.children.length - 1].rotation.x = PI / 2;
  const basin = U.lathe([[4.25, 0], [4.3, 0.08], [4.22, 0.12], [4.22, 0.5], [4.32, 0.55], [4.36, 0.62], [4.28, 0.69], [4.0, 0.69], [3.94, 0.63], [3.94, 0.12], [3.8, 0.1], [0.001, 0.1]], M.stone, 72);
  S.add(basin);
  const floor = U.cyl(3.9, 3.9, 0.02, M.paintTeal, 0, 0.11, 0, 48); S.add(floor);
  for (let i = 0; i < 24; i++) { const a = R() * TAU, d = 0.9 + R() * 2.8; const c = U.cyl(0.035, 0.035, 0.006, gold, Math.cos(a) * d, 0.125, Math.sin(a) * d, 10); c.rotation.set((R() - 0.5) * 0.3, 0, (R() - 0.5) * 0.3); S.add(c); }
  // 外壁扇贝饰（8 个）
  for (let k = 0; k < 8; k++) {
    const a = k / 8 * TAU + PI / 8;
    const sh = new THREE.Shape(); sh.moveTo(0, 0);
    for (let i = 0; i <= 18; i++) { const t = i / 18; const ang = PI * 0.15 + t * PI * 0.7; const r = 0.3 * (1 + 0.08 * Math.cos(t * PI * 9 * 2)); sh.lineTo(Math.cos(ang) * r, Math.sin(ang) * r); }
    sh.lineTo(0, 0);
    const m = U.mesh(new THREE.ExtrudeGeometry(sh, { depth: 0.04, bevelEnabled: true, bevelSize: 0.015, bevelThickness: 0.015, bevelSegments: 1 }), bronze);
    m.position.set(Math.sin(a) * 4.27, 0.15, Math.cos(a) * 4.27); m.rotation.y = a; S.add(m);
    for (let i = 0; i < 7; i++) { const ang = PI * 0.2 + i / 6 * PI * 0.6; const rr = U.rod(V(0, 0, 0.05), V(Math.cos(ang) * 0.28, Math.sin(ang) * 0.28, 0.05), 0.008, gold, 3); const gg = new THREE.Group(); gg.position.copy(m.position); gg.rotation.y = a; gg.add(rr); S.add(gg); }
  }
  // 池沿四盏青铜灯
  for (let k = 0; k < 4; k++) {
    const a = k / 4 * TAU + PI / 4; const x = Math.sin(a) * 4.15, z = Math.cos(a) * 4.15;
    S.add(U.box(0.5, 0.12, 0.5, M.stone, x, 0.75, z));
    S.add(U.lathe([[0.001, 0], [0.16, 0], [0.16, 0.06], [0.08, 0.12], [0.06, 0.8], [0.1, 0.86], [0.001, 0.9]], bronze, 12)).position;
    S.children[S.children.length - 1].position.set(x, 0.81, z);
    const l = U.lantern(M, 0.9); l.position.set(x, 1.71, z); S.add(l);
  }

  // ─── 中央石柱 + 承水盘 ───
  S.add(U.lathe([[0.75, 0], [0.75, 0.2], [0.6, 0.3], [0.5, 0.45], [0.38, 0.6], [0.32, 1.0], [0.3, 1.25], [0.001, 1.25]].map(([r, y]) => [r, y + 0.1]), M.stone, 32));
  const bowl = U.lathe([[0.3, 1.25], [0.45, 1.3], [0.9, 1.45], [1.3, 1.68], [1.52, 1.9], [1.56, 1.96], [1.48, 1.98], [1.38, 1.86], [0.001, 1.82]], bronze, 48);
  S.add(bowl);
  S.add(U.torus(1.53, 0.035, gold, 0, 1.96, 0, 4, 64)).children; S.children[S.children.length - 1].rotation.x = PI / 2;
  const bowlWater = U.mesh(new THREE.CircleGeometry(1.4, 48), waterMat); bowlWater.rotation.x = -PI / 2; bowlWater.position.y = 1.9; bowlWater.castShadow = false; S.add(bowlWater);
  for (let k = 0; k < 16; k++) { const a = k / 16 * TAU; const l = U.sphere(0.07, bronze, Math.cos(a) * 1.15, 1.58, Math.sin(a) * 1.15, 6, 4); l.scale.set(1.6, 0.6, 1.0); l.rotation.y = -a; S.add(l); }

  // ─── 青铜章鱼 ───
  const O = new THREE.Group(); O.position.y = 0;
  const mantle = U.sphere(0.56, bronze, 0, 2.9, 0, 28, 20); mantle.scale.set(1, 1.3, 1.05); O.add(mantle);
  const headB = U.sphere(0.48, bronze, 0, 2.35, 0.05, 24, 16); headB.scale.set(1.1, 0.75, 1.05); O.add(headB);
  for (const s of [-1, 1]) {
    O.add(U.sphere(0.13, M.brass, s * 0.36, 2.5, 0.3, 14, 10));
    O.add(U.sphere(0.07, M.eye, s * 0.4, 2.51, 0.39, 10, 8));
    O.add(U.torus(0.13, 0.025, gold, s * 0.37, 2.5, 0.33, 4, 16)).children; O.children[O.children.length - 1].rotation.y = s * 0.5;
  }
  // 体表疣点
  for (let i = 0; i < 26; i++) { const th = R() * TAU, el = 0.2 + R() * 1.1; const p = V(Math.cos(th) * Math.sin(el) * 0.57, 2.9 + Math.cos(el) * 0.73, Math.sin(th) * Math.sin(el) * 0.6); O.add(U.sphere(0.03 + R() * 0.03, bronze, p.x, p.y, p.z, 6, 4)); }
  // 6 只下垂触手（尖端为喷口）
  const nozzles = [];
  const tentacle = (ang, raised) => {
    const c = Math.cos(ang), s = Math.sin(ang), tc = -s, ts = c; // 切向
    const pts = raised
      ? [[0.32, 2.3, 0], [0.55, 2.55, 0.05], [0.72, 3.0, 0.1], [0.66, 3.5, 0.05], [0.5, 3.85, -0.05], [0.32, 4.0, -0.1]]
      : [[0.3, 2.12, 0], [0.75, 2.05, 0.05], [1.25, 2.06, 0.12], [1.56, 2.02, 0.18], [1.74, 1.72, 0.22], [1.7, 1.38, 0.2], [1.82, 1.18, 0.12], [2.0, 1.25, 0.06], [2.06, 1.42, 0.0]];
    const P = pts.map(([r, y, t]) => V(c * r + tc * t, y, s * r + ts * t));
    const m = taperTube(P, (u) => (raised ? 0.15 : 0.16) * (1 - u * 0.78), bronze, 48, 10);
    O.add(m);
    // 吸盘（沿内侧）
    const cv = new THREE.CatmullRomCurve3(P);
    for (let i = 2; i < 11; i++) { const u = i / 12; const q = cv.getPointAt(u); const r0 = (raised ? 0.15 : 0.16) * (1 - u * 0.78); O.add(U.sphere(r0 * 0.38, M.copper, q.x, q.y - r0 * 0.8, q.z, 6, 4)); }
    if (!raised) { const tip = cv.getPointAt(1), tg = cv.getTangentAt(1); nozzles.push({ p: tip, d: tg }); O.add(U.torus(0.045, 0.012, gold, tip.x, tip.y, tip.z, 4, 10)); }
    return cv;
  };
  for (let k = 0; k < 6; k++) tentacle(k / 6 * TAU + PI / 6, false);
  tentacle(0.25, true); tentacle(PI - 0.25, true);

  // ─── 鹦鹉螺壳（对数螺线变径管） ───
  const shell = new THREE.Group(); shell.position.set(0, 4.35, 0.05);
  {
    const b = 0.175, a = 0.42; const th0 = -2.4 * PI;
    const pts = []; const N = 70;
    for (let i = 0; i <= N; i++) { const th = th0 + (i / N) * (0 - th0); const r = a * Math.exp(b * th); pts.push(V(Math.cos(th) * r, Math.sin(th) * r, 0)); }
    const rad = (u) => { const th = th0 + u * (0 - th0); return a * Math.exp(b * th) * 0.62; };
    const sm = taperTube(pts, rad, M.copper, 120, 16); shell.add(sm);
    // 虎纹条（金色环）
    const cv = new THREE.CatmullRomCurve3(pts);
    for (let i = 4; i < 30; i++) {
      const u = i / 30; const q = cv.getPointAt(u), tg = cv.getTangentAt(u); const rr = rad(u) * 1.02;
      const t = U.torus(rr, rr * 0.06, i % 2 ? gold : M.brass, 0, 0, 0, 3, 24); t.position.copy(q); t.quaternion.setFromUnitVectors(AZ, tg); t.scale.z = 0.7; shell.add(t);
    }
    // 壳口：唇缘 + 暗色内腔
    const q = cv.getPointAt(1), tg = cv.getTangentAt(1), r1 = rad(1);
    const lip = U.torus(r1, 0.04, gold, 0, 0, 0, 6, 32); lip.position.copy(q); lip.quaternion.setFromUnitVectors(AZ, tg); shell.add(lip);
    const hole = U.mesh(new THREE.CircleGeometry(r1 * 0.96, 28), M.black); hole.position.copy(q).addScaledVector(tg, -0.03); hole.quaternion.setFromUnitVectors(AZ, tg); shell.add(hole);
    shell.userData.mouth = q.clone().add(shell.position);
    shell.rotation.z = 0.35;
  }
  O.add(shell);
  S.add(O);
  // 壳口位置（旋转后）
  shell.updateMatrixWorld(true);
  const mouth = V().copy(shell.userData.mouth);
  {
    const loc = shell.userData.mouth.clone().sub(shell.position);
    loc.applyAxisAngle(AZ, shell.rotation.z);
    mouth.copy(loc.add(shell.position));
  }

  // ─── 水：池面（涟漪顶点动画） ───
  const wgeo = new THREE.RingGeometry(0.72, RB, 72, 10);
  wgeo.rotateX(-PI / 2);
  const water = new THREE.Mesh(wgeo, waterMat); water.position.y = WATER_Y; water.receiveShadow = true; water.userData.dynamic = true; group.add(water);
  const wpos = wgeo.attributes.position; const wbase = Float32Array.from(wpos.array);

  // ─── 水柱：6 道弧形水流 + 中央水冠 ───
  const G = 6.2, T = 0.9;
  const jets = nozzles.map(({ p, d }) => {
    const dirH = V(d.x, 0, d.z).normalize(); const r0 = Math.hypot(p.x, p.z);
    const D = 3.55 - r0; // 落点半径约 3.55
    const vy = (WATER_Y - p.y + 0.5 * G * T * T) / T;
    const at = (tau) => V(p.x + dirH.x * D * tau / T, p.y + vy * tau - 0.5 * G * tau * tau, p.z + dirH.z * D * tau / T);
    const pts = []; for (let i = 0; i <= 16; i++) pts.push(at((i / 16) * T));
    const tb = U.tube(pts, 0.022, streamMat, false, 32, 5); tb.castShadow = false; S.add(tb);
    return { at, land: at(T) };
  });
  const plumeN = 36, perJet = 14;
  const drops = new THREE.InstancedMesh(new THREE.SphereGeometry(0.03, 6, 4), dropMat, jets.length * perJet + plumeN);
  drops.castShadow = false; drops.frustumCulled = false; drops.userData.dynamic = true; group.add(drops);
  const plume = []; for (let i = 0; i < plumeN; i++) plume.push({ a: R() * TAU, sp: 0.35 + R() * 0.45, h: 0.9 + R() * 0.6, ph: R() });
  // 中央直喷水柱（细管）
  const plumeTube = U.cyl(0.03, 0.05, 1.0, streamMat, mouth.x, mouth.y + 0.5, mouth.z, 8, true); plumeTube.castShadow = false; plumeTube.userData.dynamic = true; group.add(plumeTube);

  // 游客
  const vis = [[5.3, 1.8, -1.9], [-4.8, 3.0, 2.4], [1.2, -5.4, 0.2], [2.2, -5.2, -0.4]];
  vis.forEach(([x, z, ry], i) => { const p = U.person(800 + i, { child: i === 3 }); p.position.set(x, 0.08, z); p.rotation.y = ry; S.add(p); });

  // 夜灯（水下青光）
  const lt = new THREE.PointLight(0x9fe8ff, 0, 12, 2); lt.position.set(0, 1.2, 0); group.add(lt); ctx.addNightLight(lt, 16);

  U.mergeStatic(S);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), pp = new THREE.Vector3();
  return {
    group,
    focus: { pos: [7.5, 4.2, 8.5], target: [0, 2.2, 0] },
    footprint: 5.5,
    update(t, dt, env) {
      const pulse = 0.75 + 0.25 * Math.sin(t * 2.6);
      streamMat.opacity = 0.28 + 0.22 * pulse;
      let n = 0;
      jets.forEach((j, ji) => {
        for (let i = 0; i < perJet; i++) {
          const u = ((t * 0.9 + i / perJet + ji * 0.13) % 1);
          pp.copy(j.at(u * T)); const s = (0.7 + 0.6 * pulse) * (1 - u * 0.3);
          sc.set(s, s * 1.4, s); m4.compose(pp, q, sc); drops.setMatrixAt(n++, m4);
        }
      });
      for (const d of plume) {
        const u = (t * 0.7 + d.ph) % 1; const h = d.h * pulse;
        const vy0 = 2 * h / 0.5; // 上升段占 0.5
        const tau = u * 1.25; const y = mouth.y + vy0 * tau - 0.5 * (vy0 / 0.5) * tau * tau;
        pp.set(mouth.x + Math.cos(d.a) * d.sp * tau, Math.max(1.9, y), mouth.z + Math.sin(d.a) * d.sp * tau);
        const s = 0.9 * (1 - u * 0.4); sc.set(s, s, s); m4.compose(pp, q, sc); drops.setMatrixAt(n++, m4);
      }
      drops.instanceMatrix.needsUpdate = true;
      plumeTube.scale.set(1, pulse * 1.2, 1); plumeTube.position.y = mouth.y + 0.5 * pulse * 1.2;
      // 涟漪：以各落点为圆心的衰减正弦波
      for (let i = 0; i < wpos.count; i++) {
        const x = wbase[i * 3], z = wbase[i * 3 + 2]; let h = 0;
        for (const j of jets) { const dx = x - j.land.x, dz = z - j.land.z; const d = Math.sqrt(dx * dx + dz * dz); h += Math.sin(d * 11 - t * 7) * Math.exp(-d * 1.4) * 0.018 * pulse; }
        h += Math.sin(Math.hypot(x, z) * 4 - t * 2.2) * 0.004;
        wpos.setY(i, h);
      }
      wpos.needsUpdate = true; wgeo.computeVertexNormals();
    },
  };
}

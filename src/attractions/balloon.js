// ─────────────────────────────────────────────────────────────
//  “维多利亚号”气球 · Cinq semaines en ballon (1863)
//  红/奶油条纹气囊（12 片鼓起的瓣）、菱形绳网、王冠环与黄铜排气阀、
//  脚环（吊环）+ 鸦爪索、柳条编织吊篮、沙袋、锚、旗、三位乘客，
//  以及弗格森博士的加热装置（铜管通入气囊颈部）。
//  原点 = 吊篮底板中心（y=0）。动画只作用于内部 sway 组，group 本身交由主程序定位。
// ─────────────────────────────────────────────────────────────
import * as THREE from 'three';
import * as U from '../util.js';

const { V } = U;
const TAU = Math.PI * 2;
const lerp = U.lerp;

// ═════════════════ 局部几何工具 ═════════════════
function orient(geo, toward) {
  const p = geo.attributes.position, idx = geo.index.array;
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  const e1 = new THREE.Vector3(), e2 = new THREE.Vector3(), cen = new THREE.Vector3();
  let s = 0;
  for (let k = 0; k < idx.length; k += 3) {
    a.fromBufferAttribute(p, idx[k]); b.fromBufferAttribute(p, idx[k + 1]); c.fromBufferAttribute(p, idx[k + 2]);
    cen.copy(a).add(b).add(c).multiplyScalar(1 / 3);
    e1.subVectors(b, a); e2.subVectors(c, a); e1.cross(e2);
    s += e1.dot(toward(cen));
  }
  if (s < 0) for (let k = 0; k < idx.length; k += 3) { const t = idx[k + 1]; idx[k + 1] = idx[k + 2]; idx[k + 2] = t; }
  geo.index.needsUpdate = true;
  return geo;
}

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

function put(parent, o) { parent.add(o); return o; }

// ═════════════════ 气囊型线 ═════════════════
// 顶部为球面（半径 6.2，球心 y=17），赤道以下 110° 处以三次贝塞尔收为锥形颈口（r=0.5, y=7.4）
const ER = 6.2, EC = 17.0, TH1 = (110 / 180) * Math.PI, NECK = [0.5, 7.4];
function buildProfile() {
  // 返回自顶向下的密集点 [{r,y}]
  const pts = [];
  const nA = 160;
  for (let i = 0; i <= nA; i++) { const th = (TH1 * i) / nA; pts.push({ r: ER * Math.sin(th), y: EC + ER * Math.cos(th) }); }
  const P0 = [ER * Math.sin(TH1), EC + ER * Math.cos(TH1)];
  const T = [Math.cos(TH1), -Math.sin(TH1)]; // d/dθ (sinθ, cosθ) → 切向
  const L1 = 3.0;
  const P1 = [P0[0] + T[0] * L1, P0[1] + T[1] * L1];
  const P2 = [NECK[0] + 1.1, NECK[1] + 1.0];
  const P3 = NECK;
  const nB = 120;
  for (let i = 1; i <= nB; i++) {
    const t = i / nB, mt = 1 - t;
    const a = mt * mt * mt, b = 3 * mt * mt * t, c = 3 * mt * t * t, d = t * t * t;
    pts.push({ r: a * P0[0] + b * P1[0] + c * P2[0] + d * P3[0], y: a * P0[1] + b * P1[1] + c * P2[1] + d * P3[1] });
  }
  // 弧长 + 外法线
  let s = 0;
  for (let i = 0; i < pts.length; i++) {
    if (i > 0) s += Math.hypot(pts[i].r - pts[i - 1].r, pts[i].y - pts[i - 1].y);
    pts[i].s = s;
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
    let nr = -(b.y - a.y), ny = b.r - a.r; // 垂直于向下切线
    const l = Math.hypot(nr, ny) || 1; nr /= l; ny /= l;
    if (nr * pts[i].r + ny * (pts[i].y - EC + 2) < 0) { nr = -nr; ny = -ny; }
    pts[i].nr = nr; pts[i].ny = ny;
  }
  return pts;
}
const PROF = buildProfile();
/** 气囊下半部在高度 y 处的半径（颈口到赤道之间单调） */
function envR(y) {
  let best = 0;
  for (let i = 1; i < PROF.length; i++) {
    const a = PROF[i - 1], b = PROF[i];
    if ((a.y - y) * (b.y - y) <= 0 && a.y !== b.y) { const t = (y - a.y) / (b.y - a.y); best = Math.max(best, lerp(a.r, b.r, t)); }
  }
  return best;
}
/** 沿型线插值（按弧长 s） */
function profAt(s) {
  let i = 1; while (i < PROF.length - 1 && PROF[i].s < s) i++;
  const a = PROF[i - 1], b = PROF[i]; const t = Math.min(1, Math.max(0, (s - a.s) / ((b.s - a.s) || 1)));
  return { r: lerp(a.r, b.r, t), y: lerp(a.y, b.y, t), nr: lerp(a.nr, b.nr, t), ny: lerp(a.ny, b.ny, t) };
}

// ═════════════════ 吊篮型线（圆角矩形超椭圆） ═════════════════
const BA = 0.95, BB = 0.75, BN = 4.0, BH = 1.1;
const flare = (y) => 1 + 0.05 * (y / BH);
function basketPerimeter(N) {
  const dense = [];
  const M = 1440;
  for (let i = 0; i <= M; i++) {
    const th = (i / M) * TAU, c = Math.cos(th), s = Math.sin(th);
    dense.push([BA * Math.sign(c) * Math.pow(Math.abs(c), 2 / BN), BB * Math.sign(s) * Math.pow(Math.abs(s), 2 / BN)]);
  }
  const acc = [0]; for (let i = 1; i < dense.length; i++) acc.push(acc[i - 1] + Math.hypot(dense[i][0] - dense[i - 1][0], dense[i][1] - dense[i - 1][1]));
  const total = acc[acc.length - 1];
  const out = []; let j = 1;
  for (let k = 0; k < N; k++) {
    const target = (k / N) * total;
    while (j < acc.length - 1 && acc[j] < target) j++;
    const t = (target - acc[j - 1]) / ((acc[j] - acc[j - 1]) || 1);
    const x = lerp(dense[j - 1][0], dense[j][0], t), z = lerp(dense[j - 1][1], dense[j][1], t);
    let nx = Math.sign(x) * Math.pow(Math.abs(x / BA), BN - 1) / BA, nz = Math.sign(z) * Math.pow(Math.abs(z / BB), BN - 1) / BB;
    const l = Math.hypot(nx, nz) || 1; nx /= l; nz /= l;
    out.push({ x, z, nx, nz });
  }
  return out;
}

// ═════════════════ 主模块 ═════════════════
export function createBalloon(M, ctx) {
  const group = new THREE.Group();
  group.name = 'Victoria';
  const PIV = 14; // 摇摆支点高度（约气囊中心）
  const sway = new THREE.Group(); sway.position.y = PIV; group.add(sway);
  const body = new THREE.Group(); body.position.y = -PIV; sway.add(body);
  const add = (o) => { body.add(o); return o; };

  // ———————————————— 气囊（12 瓣，瓣中鼓起、缝线内收）————————————————
  const GORES = 12;
  {
    // 自颈口向上取样（稀疏化）
    const prof = []; for (let i = PROF.length - 1; i >= 0; i -= 3) prof.push(PROF[i]);
    if (prof[prof.length - 1] !== PROF[0]) prof.push(PROF[0]);
    const SEG = GORES * 10;
    const g = gridGeo(SEG + 1, prof.length, (i, j) => {
      const u = i / SEG, phi = u * TAU;
      const f = (u * GORES) % 1;
      const bul = 1 - 0.018 * (1 - Math.sin(Math.PI * f)) * Math.min(1, prof[j].r / 1.5);
      const r = prof[j].r * bul;
      return [r * Math.sin(phi), prof[j].y, r * Math.cos(phi)];
    }, (i, j, p) => [i / SEG, p[1] / 16], (c) => V(c.x, c.y - (EC - 3), c.z));
    add(new THREE.Mesh(g, M.stripeRed));
    // 颈口（开口帆布袖）
    add(U.lathe([[0.52, 7.5], [0.49, 7.3], [0.45, 7.05], [0.43, 6.85], [0.46, 6.78]], M.canvas, 24));
    const nc = U.torus(0.47, 0.03, M.rope, 0, 7.0, 0, 6, 24); nc.rotation.x = Math.PI / 2; add(nc);
  }

  // ———————————————— 顶部：王冠环 + 黄铜排气阀 ————————————————
  const crownR = 0.75;
  const crownY = EC + Math.sqrt(ER * ER - crownR * crownR);
  {
    const cr = U.torus(crownR, 0.055, M.woodDark, 0, crownY + 0.03, 0, 8, 40); cr.rotation.x = Math.PI / 2; add(cr);
    const vy = EC + Math.sqrt(ER * ER - 0.55 * 0.55);
    const valve = U.lathe([[0.56, -0.03], [0.58, 0.02], [0.52, 0.06], [0.4, 0.09], [0.3, 0.1], [0.26, 0.16], [0.2, 0.2], [0.12, 0.24], [0.05, 0.27], [0, 0.28]], M.brass, 32);
    valve.position.y = vy; add(valve);
    const vr = U.torus(0.5, 0.02, M.brass, 0, vy + 0.05, 0, 6, 32); vr.rotation.x = Math.PI / 2; add(vr);
    for (let k = 0; k < 12; k++) { const a = (k / 12) * TAU; add(U.sphere(0.022, M.brass, Math.sin(a) * 0.46, vy + 0.075, Math.cos(a) * 0.46, 6, 4)); }
    add(U.cyl(0.03, 0.03, 0.12, M.brass, 0, vy + 0.33, 0, 10));
    add(U.sphere(0.045, M.gold, 0, vy + 0.41, 0, 10, 8));
  }

  // ———————————————— 菱形绳网（恒角螺旋线，网眼随半径成比例变大）————————————————
  const NL = 24, DEL = TAU / NL, KAP = 0.62, OFF = 0.07;
  // 自王冠环向下：积分 g(s) = ∫ ds / r
  const sCrown = (() => { for (const p of PROF) if (p.r >= crownR) return p.s; return 0; })();
  const gTab = []; // [s, g]
  {
    let gAcc = 0, prev = sCrown;
    for (let s = sCrown; s < PROF[PROF.length - 1].s; s += 0.02) { const p = profAt(s); gAcc += (s - prev) / Math.max(p.r, 0.3); prev = s; gTab.push([s, gAcc, p.y]); }
  }
  const sAtG = (g) => { for (let i = 1; i < gTab.length; i++) if (gTab[i][1] >= g) { const a = gTab[i - 1], b = gTab[i]; return lerp(a[0], b[0], (g - a[1]) / ((b[1] - a[1]) || 1)); } return gTab[gTab.length - 1][0]; };
  const gAtY = (y) => { for (const row of gTab) if (row[2] <= y) return row[1]; return gTab[gTab.length - 1][1]; };
  const MEND = Math.round((2 * KAP * gAtY(13.6)) / DEL);
  const gEnd = (MEND * DEL) / (2 * KAP), sEnd = sAtG(gEnd);
  const netPt = (s, phi, extra = 0) => { const p = profAt(s); const r = p.r + p.nr * (OFF + extra), y = p.y + p.ny * (OFF + extra); return V(r * Math.sin(phi), y, r * Math.cos(phi)); };
  {
    const nS = 64;
    for (const fam of [1, -1]) for (let i = 0; i < NL; i++) {
      const pts = [];
      for (let k = 0; k <= nS; k++) {
        const g = (gEnd * k) / nS; // 以 g 等分 → 网眼处取样均匀
        pts.push(netPt(sAtG(g), i * DEL + fam * KAP * g));
      }
      add(U.tube(pts, 0.024, M.rope, false, 96, 4));
    }
    // 网结（实例化）
    const knots = [];
    for (let m = 1; m < MEND; m++) { const s = sAtG((m * DEL) / (2 * KAP)); for (let i = 0; i < NL; i++) knots.push(netPt(s, (i + m / 2) * DEL, 0.005)); }
    const kg = new THREE.SphereGeometry(0.05, 8, 6);
    const im = new THREE.InstancedMesh(kg, M.rope, knots.length);
    const m4 = new THREE.Matrix4();
    knots.forEach((p, i) => { m4.makeTranslation(p.x, p.y, p.z); im.setMatrixAt(i, m4); });
    im.castShadow = true; add(im);
  }
  // 腰带环（网底边）+ 鸦爪索 + 吊环
  const RING_Y = 5.3, RING_R = 0.72;
  {
    const gk = []; for (let k = 0; k < NL; k++) gk.push(netPt(sEnd, (k + MEND / 2) * DEL, 0.01));
    add(U.tube(gk, 0.04, M.rope, true, 192, 5));
    for (const p of gk) add(U.sphere(0.07, M.rope, p.x, p.y, p.z, 8, 6));
    // 吊环（木质）+ 绳缠
    const ring = U.torus(RING_R, 0.055, M.woodDark, 0, RING_Y, 0, 8, 40); ring.rotation.x = Math.PI / 2; add(ring);
    for (let k = 0; k < 24; k++) { const a = (k / 24) * TAU; const w = U.torus(0.065, 0.014, M.rope, Math.sin(a) * RING_R, RING_Y, Math.cos(a) * RING_R, 4, 10); w.rotation.y = a; add(w); }
    let minClear = 99;
    for (let n = 0; n < NL / 2; n++) {
      const A = gk[2 * n], B = gk[2 * n + 1];
      const phiL = (2 * n + 0.5 + MEND / 2) * DEL;
      const L = V(Math.sin(phiL) * RING_R, RING_Y, Math.cos(phiL) * RING_R);
      const mid = A.clone().add(B).multiplyScalar(0.5);
      const J = mid.clone().lerp(L, 0.24);
      const rJ = Math.hypot(J.x, J.z), need = envR(J.y) + 0.14;
      if (rJ < need) { J.x *= need / rJ; J.z *= need / rJ; }
      add(U.rod(A, J, 0.022, M.rope, 5)); add(U.rod(B, J, 0.022, M.rope, 5));
      add(U.rod(J, L, 0.028, M.rope, 6));
      add(U.sphere(0.06, M.rope, J.x, J.y, J.z, 8, 6));
      // 木栓（toggle）
      const tg = U.cyl(0.025, 0.025, 0.16, M.wood, L.x, L.y + 0.1, L.z, 6); tg.rotation.z = Math.PI / 2; tg.rotation.y = phiL; add(tg);
      // 检查与气囊的间隙
      for (let k = 0; k <= 20; k++) { const P = J.clone().lerp(L, k / 20); const e = envR(P.y); if (e > 0) minClear = Math.min(minClear, Math.hypot(P.x, P.z) - e); }
      for (let k = 0; k <= 10; k++) { const P = A.clone().lerp(J, k / 10); const e = envR(P.y); if (e > 0 && P.y < EC) minClear = Math.min(minClear, Math.hypot(P.x, P.z) - e); }
    }
    group.userData.ropeClearance = minClear;
  }

  // ———————————————— 吊篮（柳条编织）————————————————
  const NST = 64;
  const per = basketPerimeter(NST);
  const at = (q, y, off = 0) => { const f = flare(y); return V(q.x * f + q.nx * off, y, q.z * f + q.nz * off); };
  {
    // 立桩
    for (const q of per) add(U.rod(at(q, -0.03), at(q, BH + 0.02), 0.013, M.woodDark, 5));
    // 编织横条：相邻立桩内外交替，逐行错相
    const rows = Math.round((BH - 0.06) / 0.04);
    for (let j = 0; j <= rows; j++) {
      const y = 0.03 + j * 0.04;
      const pts = per.map((q, s) => at(q, y, ((s + j) % 2 ? 1 : -1) * 0.017));
      const dark = j === 2 || j === 3 || j === rows - 3 || j === rows - 4 || j === Math.round(rows / 2);
      add(U.tube(pts, 0.021, dark ? M.woodDark : M.rope, true, NST * 3, 4));
    }
    // 皮革包边篮沿 + 缠绕绳
    const rimY = BH + 0.03;
    const rimPts = per.map((q) => at(q, rimY));
    add(U.tube(rimPts, 0.055, M.leather, true, 200, 8));
    const wraps = 90, wpts = [];
    const rimCurve = new THREE.CatmullRomCurve3(rimPts, true);
    for (let i = 0; i < wraps * 8; i++) {
      const u = i / (wraps * 8); const c = rimCurve.getPointAt(u); const tng = rimCurve.getTangentAt(u);
      const out = V(tng.z, 0, -tng.x).normalize(); if (out.x * c.x + out.z * c.z < 0) out.negate();
      const a = u * wraps * TAU;
      wpts.push(c.clone().addScaledVector(out, Math.cos(a) * 0.062).add(V(0, Math.sin(a) * 0.062, 0)));
    }
    add(U.tube(wpts, 0.009, M.rope, true, wraps * 10, 3));
    // 底板 + 甲板地板 + 滑橇
    const shp = new THREE.Shape(); per.forEach((q, i) => (i ? shp.lineTo(q.x, q.z) : shp.moveTo(q.x, q.z)));
    const bot = new THREE.ExtrudeGeometry(shp, { depth: 0.08, bevelEnabled: true, bevelSize: 0.02, bevelThickness: 0.015, bevelSegments: 1, curveSegments: 4 });
    bot.rotateX(Math.PI / 2); add(U.mesh(bot, M.woodDark));
    const shp2 = new THREE.Shape(); per.forEach((q, i) => (i ? shp2.lineTo(q.x * 0.97, -q.z * 0.97) : shp2.moveTo(q.x * 0.97, -q.z * 0.97)));
    const fl = new THREE.ShapeGeometry(shp2); fl.rotateX(-Math.PI / 2); fl.translate(0, 0.012, 0);
    const uvA = fl.attributes.uv; for (let i = 0; i < uvA.count; i++) uvA.setXY(i, uvA.getX(i) * 0.6, uvA.getY(i) * 0.6);
    add(U.mesh(fl, M.deck));
    for (const sz of [-0.48, 0.48]) add(U.tube([V(-1.12, 0.0, sz), V(-1.0, -0.12, sz), V(0, -0.14, sz), V(1.0, -0.12, sz), V(1.12, 0.0, sz)], 0.035, M.woodDark, false, 30, 6));
  }

  // ———————————————— 吊索（吊环 → 篮沿 → 包到篮底）————————————————
  const ropeIdx = []; for (let k = 0; k < 8; k++) ropeIdx.push(Math.round((k / 8) * NST + NST / 16) % NST);
  for (const ix of ropeIdx) {
    const q = per[ix];
    const a = Math.atan2(q.x, q.z);
    const R = V(Math.sin(a) * RING_R, RING_Y - 0.02, Math.cos(a) * RING_R);
    const top = at(q, BH + 0.1, 0.06), bot = at(q, -0.05, 0.05), under = V(q.x * 0.35, -0.11, q.z * 0.35);
    add(U.rod(R, top, 0.02, M.rope, 6));
    add(U.rod(top, bot, 0.018, M.rope, 5));
    add(U.rod(bot, under, 0.018, M.rope, 5));
    add(U.sphere(0.035, M.rope, top.x, top.y, top.z, 6, 5));
    add(U.cyl(0.03, 0.03, 0.12, M.wood, R.x, R.y - 0.12, R.z, 6));
  }

  // ———————————————— 沙袋 ————————————————
  {
    const bagP = [[0, 0], [0.07, 0.01], [0.105, 0.06], [0.11, 0.13], [0.09, 0.2], [0.05, 0.25], [0.03, 0.27], [0.04, 0.3], [0, 0.31]];
    const skip = new Set(ropeIdx.flatMap((i) => [i, (i + 1) % NST, (i + NST - 1) % NST]));
    let n = 0;
    for (let i = 3; i < NST && n < 12; i += 5) {
      if (skip.has(i) || skip.has((i + 1) % NST)) continue;
      const q = per[i];
      const bag = U.lathe(bagP, M.canvas, 12);
      const p = at(q, 0.6, 0.14); bag.position.copy(p); bag.rotation.y = n * 1.3; bag.scale.setScalar(0.9 + (n % 3) * 0.08); add(bag);
      const tie = U.torus(0.032, 0.008, M.rope, p.x, p.y + 0.27, p.z, 4, 10); tie.rotation.x = Math.PI / 2; add(tie);
      add(U.rod(V(p.x, p.y + 0.28, p.z), at(q, BH + 0.02, 0.07), 0.008, M.rope, 4));
      n++;
    }
  }

  // ———————————————— 弗格森加热装置 + 铜管 ————————————————
  {
    const ax = 0.55, az = 0.32;
    add(U.lathe([[0.19, 0], [0.19, 0.04], [0.16, 0.06], [0.16, 0.62], [0.18, 0.65], [0.18, 0.69], [0.1, 0.74], [0.05, 0.78], [0, 0.79]], M.copper, 20)).position.set(ax, 0, az);
    for (const yy of [0.12, 0.35, 0.58]) { const t = U.torus(0.165, 0.012, M.brass, ax, yy, az, 6, 20); t.rotation.x = Math.PI / 2; add(t); }
    add(U.box(0.22, 0.18, 0.16, M.woodDark, ax - 0.05, 0.09, az - 0.3));
    for (const dz of [-0.04, 0.04]) {
      const pts = [V(ax, 0.78, az + dz), V(ax - 0.05, 1.3, az * 0.8 + dz), V(0.3, 3.0, 0.18 + dz), V(0.15, 5.6, 0.08 + dz), V(0.1, 7.0, 0.04 + dz), V(0.08, 7.8, dz)];
      add(U.tube(pts, 0.022, M.copper, false, 60, 6));
    }
    const vw = U.torus(0.06, 0.008, M.brass, ax - 0.04, 1.25, az * 0.8 + 0.04, 4, 12); add(vw);
    // 小木箱
    add(U.box(0.32, 0.3, 0.42, M.wood, 0.7, 0.15, -0.42));
    add(U.box(0.34, 0.03, 0.44, M.brass, 0.7, 0.31, -0.42));
  }

  // ———————————————— 乘客：弗格森博士、肯尼迪、乔 ————————————————
  const man = (seed, x, z, ry) => {
    let p = null;
    for (let s = seed; s < seed + 80; s++) { const c = U.person(s); if (c.userData.legs.length === 2) { p = c; break; } }
    p = p || U.person(seed);
    p.position.set(x, 0.012, z); p.rotation.y = ry; add(p); return p;
  };
  man(5, -0.5, -0.32, Math.PI + 0.4);
  man(17, -0.42, 0.36, 0.3);
  const joe = man(29, 0.22, -0.3, Math.PI - 0.15);
  {
    // 乔手持望远镜眺望
    const s = joe.scale.x, ey = 1.56 * s;
    const p0 = V(0.24, ey, -0.42), dir = V(-0.08, 0.06, -1).normalize();
    const seg = (a, b, r, m) => add(U.rod(p0.clone().addScaledVector(dir, a), p0.clone().addScaledVector(dir, b), r, m, 10));
    seg(0, 0.18, 0.022, M.brass); seg(0.18, 0.36, 0.027, M.woodDark); seg(0.36, 0.55, 0.032, M.brass);
    const lr = U.torus(0.034, 0.008, M.brass, 0, 0, 0, 4, 12); lr.position.copy(p0).addScaledVector(dir, 0.55); lr.quaternion.setFromUnitVectors(V(0, 0, 1), dir); add(lr);
  }

  // ———————————————— 吊灯（挂于吊环下）————————————————
  {
    const lx = -0.42, lz = -0.3, ly = 3.9;
    const ln = U.lantern(M, 0.65); ln.position.set(lx, ly, lz); add(ln);
    add(U.rod(V(lx, ly + 0.47, lz), V(Math.sin(Math.atan2(lx, lz)) * RING_R, RING_Y - 0.03, Math.cos(Math.atan2(lx, lz)) * RING_R), 0.008, M.rope, 4));
    const pl = new THREE.PointLight(0xffb060, 0, 14, 2); pl.position.set(lx, ly + 0.2, lz); add(pl);
    ctx.addNightLight(pl, 14);
  }

  // ———————————————— 旗帜 ————————————————
  const dyn = [];
  {
    const cv = document.createElement('canvas'); cv.width = 256; cv.height = 128;
    const g = cv.getContext('2d');
    if (g && g.fillRect) {
      g.fillStyle = '#8e1c18'; g.fillRect(0, 0, 256, 128);
      g.fillStyle = '#eee2c2'; g.fillRect(0, 10, 256, 8); g.fillRect(0, 110, 256, 8);
      g.font = 'bold italic 46px "Times New Roman", serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText && g.fillText('VICTORIA', 128, 66);
    }
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
    const flagMat = new THREE.MeshStandardMaterial({ map: tex, side: THREE.DoubleSide, roughness: 0.85 });
    const q = per[Math.round(NST * 0.5)]; // −X 端
    const base = at(q, BH + 0.02, 0.09);
    add(U.rod(base.clone().add(V(0, -0.5, 0)), base.clone().add(V(0, 1.9, 0)), 0.018, M.woodDark, 8));
    add(U.sphere(0.04, M.gold, base.x, base.y + 1.93, base.z, 10, 8));
    for (const yy of [-0.35, 0.0]) add(U.torus(0.03, 0.008, M.brass, base.x, base.y + yy, base.z, 4, 10)).rotation.x = Math.PI / 2;
    const W = 0.95, H = 0.48;
    const fg = new THREE.PlaneGeometry(W, H, 14, 5); fg.translate(-W / 2, -H / 2, 0);
    const fm = new THREE.Mesh(fg, flagMat); fm.position.set(base.x - 0.02, base.y + 1.86, base.z); fm.castShadow = true; fm.userData.dynamic = true;
    add(fm);
    dyn.push({ m: fm, base: Float32Array.from(fg.attributes.position.array), w: W });
  }

  // ———————————————— 锚（悬挂、可摆动）————————————————
  const anchor = new THREE.Group(); anchor.userData.dynamic = true;
  {
    const q = per[Math.round(NST * 0.06)];
    const p = at(q, BH - 0.05, 0.09); anchor.position.copy(p);
    const L = 3.0;
    anchor.add(U.rod(V(0, 0, 0), V(0, -L, 0), 0.016, M.rope, 5));
    const ar = U.torus(0.07, 0.016, M.ironPlain, 0, -L - 0.05, 0, 6, 14); anchor.add(ar);
    anchor.add(U.rod(V(0, -L - 0.11, 0), V(0, -L - 0.7, 0), 0.03, M.ironPlain, 8));
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * TAU + 0.4, ca = Math.cos(a), sa = Math.sin(a);
      const pts = [V(0, -L - 0.66, 0), V(ca * 0.12, -L - 0.72, sa * 0.12), V(ca * 0.25, -L - 0.62, sa * 0.25), V(ca * 0.31, -L - 0.45, sa * 0.31)];
      anchor.add(U.tube(pts, 0.022, M.ironPlain, false, 12, 6));
      const tip = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.12, 6), M.ironPlain);
      tip.position.set(ca * 0.32, -L - 0.4, sa * 0.32); tip.lookAt(ca * 0.4, -L - 0.2, sa * 0.4); tip.rotateX(Math.PI / 2); anchor.add(tip);
    }
    anchor.add(U.sphere(0.045, M.ironPlain, 0, -L - 0.7, 0, 8, 6));
    // 篮沿上的备用绳卷（静态）
    for (let k = 0; k < 3; k++) {
      const c = U.torus(0.12 - k * 0.025, 0.018, M.rope, p.x - q.nx * 0.1, BH + 0.1 + k * 0.03, p.z - q.nz * 0.1, 5, 16);
      c.rotation.x = Math.PI / 2; add(c);
    }
    add(anchor);
  }

  // ———————————————— 合并静态部分 ————————————————
  U.mergeStatic(body);

  const waveFlag = (F, t) => {
    const p = F.m.geometry.attributes.position, b = F.base;
    for (let i = 0; i < p.count; i++) {
      const bx = b[i * 3], by = b[i * 3 + 1];
      const d = Math.max(0, -bx / F.w);
      p.setXYZ(i, bx, by - 0.04 * d * d, Math.sin(d * 6 - t * 4.5) * 0.07 * Math.pow(d, 0.8) + Math.sin(d * 11 - t * 7 + by * 4) * 0.015 * d);
    }
    p.needsUpdate = true; F.m.geometry.computeVertexNormals();
  };

  return {
    group,
    focus: { pos: [20, 10, 25], target: [0, 10, 0] },
    footprint: 7,
    update(t, dt, env) {
      sway.rotation.z = Math.sin(t * 0.43) * 0.022 + Math.sin(t * 1.1 + 0.5) * 0.004;
      sway.rotation.x = Math.sin(t * 0.31 + 1.2) * 0.018;
      sway.rotation.y = Math.sin(t * 0.06) * 0.7 + t * 0.012;
      anchor.rotation.z = Math.sin(t * 0.9 + 0.3) * 0.05;
      anchor.rotation.x = Math.sin(t * 0.7) * 0.035;
      for (const F of dyn) waveFlag(F, t);
    },
  };
}

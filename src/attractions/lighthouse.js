// ─────────────────────────────────────────────────────────────
//  《世界尽头的灯塔》(Le Phare du bout du monde, 1905)
//  火地岛以东·埃斯塔多斯岛（Staten Island）圣胡安角的孤岛灯塔
//  —— 嶙峋礁岛（水线以下延伸到 y≈−4.3）+ 32 m 收分石塔 + 灯廊铁栏
//     + 多边形玻璃灯室（铜绿穹顶、通风球、避雷针、风向标）
//     + 旋转菲涅耳透镜与扫掠光束 + 看守人石屋 + 栈桥与小划艇 + 雾钟
//  坐标：塔轴位于原点；礁岛台地顶面约 y=3；栈桥伸向 +Z（x≈6）。
// ─────────────────────────────────────────────────────────────
import * as THREE from 'three';
import * as U from '../util.js';
import { rng, makeFbm } from '../materials.js';

const V = U.V;
const DEG = Math.PI / 180;
const TAU = Math.PI * 2;
const ss = U.smoothstep;
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

// ═════════════════════ 本地建模小工具 ═════════════════════
function scaleUV(geo, su, sv) {
  const uv = geo.attributes.uv;
  if (!uv) return geo;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv);
  uv.needsUpdate = true;
  return geo;
}

function tbox(w, h, d, mat, x = 0, y = 0, z = 0, tile = 3) {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv;
  const S = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) for (let k = 0; k < 4; k++) {
    const i = f * 4 + k;
    uv.setXY(i, uv.getX(i) * S[f][0] / tile, uv.getY(i) * S[f][1] / tile);
  }
  return U.mesh(g, mat, x, y, z);
}

/** 硬边车床体：轮廓急转处断开法线；u 绕圈重复 tileU 次，v 按弧长 / tileV 米 */
function crispLathe(profile, mat, { seg = 48, tileU = 1, tileV = 0, angle = 38, phiStart = 0, phiLen = TAU } = {}) {
  const pts = [];
  for (const p of profile) { const l = pts[pts.length - 1]; if (!l || Math.hypot(l[0] - p[0], l[1] - p[1]) > 1e-5) pts.push(p); }
  const n = pts.length;
  const cum = [0];
  for (let i = 1; i < n; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const runs = []; let s0 = 0;
  for (let i = 1; i < n - 1; i++) {
    const ax = pts[i][0] - pts[i - 1][0], ay = pts[i][1] - pts[i - 1][1];
    const bx = pts[i + 1][0] - pts[i][0], by = pts[i + 1][1] - pts[i][1];
    const c = (ax * bx + ay * by) / (Math.hypot(ax, ay) * Math.hypot(bx, by));
    if (Math.acos(clamp(c, -1, 1)) / DEG > angle) { runs.push([s0, i]); s0 = i; }
  }
  runs.push([s0, n - 1]);
  const g = new THREE.Group();
  for (const [a, b] of runs) {
    const sub = pts.slice(a, b + 1).map(([r, y]) => new THREE.Vector2(Math.max(r, 1e-4), y));
    if (sub.length < 2) continue;
    const geo = new THREE.LatheGeometry(sub, seg, phiStart, phiLen);
    const uv = geo.attributes.uv, np = sub.length;
    for (let i = 0; i <= seg; i++) for (let j = 0; j < np; j++) uv.setXY(i * np + j, (i / seg) * tileU, tileV ? cum[a + j] / tileV : j / (np - 1));
    g.add(U.mesh(geo, mat));
  }
  return g;
}

function softTexture(stops, size = 128) {
  const cv = document.createElement('canvas'); cv.width = cv.height = size;
  const cx = cv.getContext('2d');
  const grd = cx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  for (const [o, c] of stops) grd.addColorStop(o, c);
  cx.fillStyle = grd; cx.fillRect(0, 0, size, size);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** 不规则礁石：按顶点位置散列位移的二十面体（面片化，切削感） */
function boulder(r, seed, mat, sx = 1, sy = 0.72, sz = 0.9) {
  const g = new THREE.IcosahedronGeometry(1, 1);
  const p = g.attributes.position;
  const hash = (x, y, z) => { const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7 + seed * 13.13) * 43758.5453; return s - Math.floor(s); };
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const f = 0.72 + 0.5 * hash(Math.round(x * 100), Math.round(y * 100), Math.round(z * 100));
    p.setXYZ(i, x * f * r * sx, y * f * r * sy, z * f * r * sz);
  }
  g.computeVertexNormals();
  scaleUV(g, r * 0.6, r * 0.6);
  return U.mesh(g, mat);
}

// ═════════════════════ 小划艇 ═════════════════════
function rowboat(M) {
  const g = new THREE.Group();
  const L = 4.2, B = 1.45, D = 0.5, half = L / 2, ns = 28, nv = 10;
  const bw = (s) => (s >= 0 ? (B / 2) * Math.pow(Math.max(0, 1 - s * s), 0.55) : (B / 2) * (1 - 0.42 * s * s));
  const sheer = (s) => D + 0.16 * s * s + 0.05 * s;
  const bot = (s) => -0.02 * (1 - s * s) + (s > 0 ? s * s * s * 0.28 : 0.05 * s * s);
  const pt = (s, v, sg, inset = 0) => {
    const a = v * Math.PI / 2;
    const w = Math.max(0, bw(s) - inset);
    const x = sg * w * Math.pow(Math.sin(a), 0.7);
    const y = bot(s) + inset * 0.8 + (sheer(s) - bot(s) - inset * 0.8) * Math.pow(1 - Math.cos(a), 0.9);
    return [x, y, s * half];
  };
  const surf = (v0, v1, inset, mat, flip) => {
    const pos = [], idx = [], uvs = [];
    const nvv = Math.max(2, Math.round(nv * (v1 - v0)));
    for (const sg of [1, -1]) {
      const base = pos.length / 3;
      for (let k = 0; k <= ns; k++) {
        const s = -1 + (2 * k) / ns;
        for (let j = 0; j <= nvv; j++) { const v = v0 + (v1 - v0) * (j / nvv); pos.push(...pt(s, v, sg, inset)); uvs.push(s * 2, v); }
      }
      for (let k = 0; k < ns; k++) for (let j = 0; j < nvv; j++) {
        const a = base + k * (nvv + 1) + j, b = a + 1, c = a + (nvv + 1), d = c + 1;
        const outward = (sg > 0) !== flip;
        if (outward) idx.push(a, b, c, b, d, c); else idx.push(a, c, b, b, c, d);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geo.setIndex(idx); geo.computeVertexNormals();
    return U.mesh(geo, mat);
  };
  g.add(surf(0, 0.74, 0, M.paintTeal, false));
  g.add(surf(0.74, 1, 0, M.paintWhite, false));
  g.add(surf(0.08, 1, 0.045, M.deck, true));
  // 船舷护木
  for (const sg of [1, -1]) {
    const pts = []; for (let k = 0; k <= 16; k++) { const s = -1 + (2 * k) / 16; const p = pt(s, 1, sg); pts.push(V(p[0], p[1] + 0.015, p[2])); }
    g.add(U.tube(pts, 0.04, M.woodDark, false, 40, 6));
  }
  // 艉板
  {
    const sh = new THREE.Shape();
    const n = 10;
    for (let j = 0; j <= n; j++) { const p = pt(-1, 1 - j / n, 1); j ? sh.lineTo(p[0], p[1]) : sh.moveTo(p[0], p[1]); }
    for (let j = 1; j <= n; j++) { const p = pt(-1, j / n, -1); sh.lineTo(p[0], p[1]); }
    const tg = new THREE.ExtrudeGeometry(sh, { depth: 0.05, bevelEnabled: false }); tg.translate(0, 0, -half - 0.02);
    g.add(U.mesh(tg, M.woodDark));
  }
  // 坐板、桨、船首环
  for (const [s, y] of [[-0.62, 0.36], [0.05, 0.36], [0.55, 0.4]]) g.add(tbox(2 * bw(s) - 0.12, 0.05, 0.26, M.wood, 0, y, s * half, 1));
  for (const [x0, x1] of [[-0.32, 0.18], [0.3, -0.2]]) {
    g.add(U.rod(V(x0, 0.43, -1.55), V(x1, 0.46, 1.25), 0.025, M.wood, 6));
    const bl = tbox(0.14, 0.02, 0.6, M.wood, x1 + (x1 - x0) * 0.08, 0.465, 1.45, 1); bl.rotation.y = Math.atan2(x1 - x0, 2.8); g.add(bl);
  }
  const ring = U.torus(0.06, 0.012, M.brass, 0, sheer(1) - 0.05, half + 0.02, 6, 12); g.add(ring);
  return g;
}

// ═════════════════════ 主体 ═════════════════════
export function createLighthouse(M, ctx) {
  const group = new THREE.Group();
  group.name = 'Lighthouse';
  const R = rng(1905);
  const GY = 3.0;           // 台地顶面
  const SXJ = 6.0;          // 栈桥/阶梯中心线 x

  // 自定义材质（少量）
  const lightBlue = new THREE.MeshStandardMaterial({ color: 0x74acdf, roughness: 0.85, side: THREE.DoubleSide });
  const flagWhite = new THREE.MeshStandardMaterial({ color: 0xf4f1ea, roughness: 0.85, side: THREE.DoubleSide });
  const bellInside = new THREE.MeshStandardMaterial({ color: 0x3a2c18, roughness: 0.5, metalness: 0.8 });

  // ───────────── 1. 礁岛：极坐标高度场（悬崖 + 层理台阶 + 噪声） ─────────────
  const nEdge = makeFbm(905, 4, 4), nCl = makeFbm(911, 8, 4), nTop = makeFbm(917, 4, 3), nW = makeFbm(923, 4, 3);
  const angDiff = (a, b) => { let d = (a - b) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return d; };
  const bump = (phi, c, w) => Math.exp(-(angDiff(phi, c) ** 2) / (2 * w * w));
  const PHI_J = 61 * DEG;
  const edgeR = (phi) => {
    const u = ((phi / TAU) % 1 + 1) % 1;
    let e = 13.0 + 6.5 * (nEdge(u, 0.3) - 0.5) + 0.8 * Math.sin(2 * phi + 1.1) + 0.45 * Math.sin(5 * phi + 0.4) + 2.2 * bump(phi, 192 * DEG, 0.55);
    if (e > 14.8) e = 14.8 + (e - 14.8) * 0.35;
    const w = bump(phi, PHI_J, 0.2);
    return e * (1 - w) + 12.5 * w;
  };
  const plateauR = (phi) => {
    const u = ((phi / TAU) % 1 + 1) % 1;
    const p = edgeR(phi) - (2.8 + 1.6 * (nW(u, 0.6) - 0.5)) * (1 - 0.4 * bump(phi, 192 * DEG, 0.5));
    const w = bump(phi, PHI_J, 0.2);
    return p * (1 - w) + 9.9 * w;
  };
  // 看守人石屋位置/朝向（正面朝向灯塔）
  const CPHI = 190 * DEG, CR = 9.0;
  const CC = V(Math.cos(CPHI) * CR, 0, Math.sin(CPHI) * CR);
  const CROT = Math.atan2(-Math.cos(CPHI), -Math.sin(CPHI));
  const toCot = (x, z) => { const dx = x - CC.x, dz = z - CC.z; const c = Math.cos(CROT), s = Math.sin(CROT); return [dx * c - dz * s, dx * s + dz * c]; };
  const stairTop = (z) => GY - clamp(Math.ceil((z - 7.6) / 0.3), 0, 10) * 0.2;

  function rawH(rho, phi) {
    const u = ((phi / TAU) % 1 + 1) % 1;
    const e = edgeR(phi), p = plateauR(phi);
    const x = Math.cos(phi) * rho, z = Math.sin(phi) * rho;
    const und = (nTop(x / 48 + 0.5, z / 48 + 0.5) - 0.5) * 1.1 * ss(5.4, 8, rho);
    const top = GY + und - 0.4 * ss(p - 1.6, p, rho);
    if (rho <= p) return top;
    const t = Math.min(1, (rho - p) / Math.max(0.6, e - p));
    let h = top - (top + 4.3) * (1 - Math.pow(1 - t, 2.4));
    h += (nCl(u, t * 0.35 + 0.1) - 0.5) * 2.6 * Math.sin(Math.PI * Math.min(1, t * 1.15));
    const S = 0.85, f = h / S, fl = Math.floor(f);
    const q = (fl + ss(0.62, 1, f - fl)) * S;
    h += (q - h) * 0.7 * ss(0, 0.12, t) * (1 - ss(0.85, 1, t));
    return h;
  }
  function H(x, z) {
    const rho = Math.hypot(x, z), phi = Math.atan2(z, x);
    let h = rawH(rho, phi);
    if (rho < 6.0) h = GY - 0.04 + (h - GY + 0.04) * ss(5.4, 6.0, rho);
    const [lx, lz] = toCot(x, z);
    if (Math.abs(lx) < 5.3 && Math.abs(lz) < 3.0) h = clamp(h, GY - 0.35, GY + 0.04);
    if (Math.abs(x - SXJ) < 1.2 && z > 7.3) h = Math.min(h, stairTop(z) - 0.12);
    return h;
  }
  {
    const NA = 232, NR = 54;
    const pos = [], uvs = [], idx = [];
    for (let i = 0; i <= NA; i++) {
      const phi = (i / NA) * TAU, e = edgeR(phi);
      for (let j = 0; j <= NR + 1; j++) {
        let rho, y;
        if (j <= NR) { const q = 1 - Math.pow(1 - j / NR, 1.35); rho = q * e; y = H(Math.cos(phi) * rho, Math.sin(phi) * rho); }
        else { rho = e + 1.5; y = -4.9; }
        const x = Math.cos(phi) * rho, z = Math.sin(phi) * rho;
        pos.push(x, y, z);
        uvs.push((phi * e) / 4.5, (y * 1.25 + rho * 0.55) / 4.5);
      }
    }
    const C = NR + 2;
    for (let i = 0; i < NA; i++) for (let j = 0; j < NR + 1; j++) {
      const a = i * C + j, b = a + 1, c = a + C, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
    let geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geo.setIndex(idx);
    geo = geo.toNonIndexed(); geo.computeVertexNormals();
    const islet = U.mesh(geo, M.rock); islet.name = 'islet'; group.add(islet);
  }
  // 岸边乱石（半没于水）
  for (let i = 0; i < 34; i++) {
    const phi = R() * TAU;
    if (Math.abs(angDiff(phi, PHI_J)) < 0.32) continue;
    const e = edgeR(phi), rho = e * (0.96 + R() * 0.16);
    const r = 0.5 + R() * 1.5;
    const b = boulder(r, i + 1, M.rock, 1 + R() * 0.4, 0.55 + R() * 0.35, 0.8 + R() * 0.4);
    b.position.set(Math.cos(phi) * rho, -0.9 + R() * 1.0, Math.sin(phi) * rho);
    b.rotation.set(R() * 0.6, R() * TAU, R() * 0.6); group.add(b);
  }
  // 台地上的零星石块
  for (let i = 0; i < 12; i++) {
    const phi = R() * TAU; const rho = plateauR(phi) - 0.4 - R() * 1.2;
    const x = Math.cos(phi) * rho, z = Math.sin(phi) * rho;
    const [lx, lz] = toCot(x, z);
    if ((Math.abs(lx) < 5 && Math.abs(lz) < 3.6) || (Math.abs(x - SXJ) < 2 && z > 5) || Math.hypot(x - 7, z - 3.6) < 2) continue;
    const r = 0.3 + R() * 0.5;
    const b = boulder(r, 100 + i, M.rock); b.position.set(x, H(x, z) + r * 0.25, z); b.rotation.y = R() * TAU; group.add(b);
  }
  // 草皮斑块 + 簇生草丛（巴塔哥尼亚丛生草）
  {
    const patch = (cx, cz, rad, seed) => {
      const r2 = rng(seed); const n = 22; const pos = [cx, H(cx, cz) + 0.05, cz]; const uvs = [cx / 3, cz / 3]; const idx = [];
      const rr = []; for (let i = 0; i < n; i++) rr.push(rad * (0.65 + r2() * 0.5));
      for (let i = 0; i < n; i++) {
        const a = (i / n) * TAU, x = cx + Math.cos(a) * rr[i], z = cz + Math.sin(a) * rr[i];
        pos.push(x, H(x, z) + 0.05, z); uvs.push(x / 3, z / 3);
        idx.push(0, 1 + ((i + 1) % n), 1 + i);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2)); g.setIndex(idx); g.computeVertexNormals();
      const m = U.mesh(g, M.grass); m.castShadow = false; group.add(m);
    };
    [[-3.5, -6.8, 1.6], [3.2, -6.9, 1.9], [7.3, -2.4, 1.5], [-6.0, 5.6, 1.7], [-1.8, 8.0, 1.2], [-10.6, 3.9, 1.0], [8.4, -6.6, 1.2]].forEach(([x, z, r], i) => {
      if (Math.hypot(x, z) < plateauR(Math.atan2(z, x)) - 0.6) patch(x, z, r, 300 + i);
    });
    const bladeG = new THREE.ConeGeometry(0.05, 0.55, 4); bladeG.translate(0, 0.27, 0);
    let made = 0;
    for (let i = 0; i < 120 && made < 46; i++) {
      const phi = R() * TAU, rho = 6.0 + R() * (plateauR(phi) - 6.3);
      const x = Math.cos(phi) * rho, z = Math.sin(phi) * rho;
      const [lx, lz] = toCot(x, z);
      if ((Math.abs(lx) < 5.2 && Math.abs(lz) < 3.8) || (Math.abs(x - SXJ) < 1.8 && z > 6.5) || Math.hypot(x - 7, z - 3.6) < 1.8 || (Math.abs(x) < 1.6 && z > 5)) continue;
      made++;
      const y = H(x, z);
      const nb = 6 + Math.floor(R() * 4);
      for (let k = 0; k < nb; k++) {
        const b = U.mesh(bladeG, k % 3 ? M.foliage2 : M.foliage3, x + (R() - 0.5) * 0.25, y, z + (R() - 0.5) * 0.25);
        b.rotation.set((R() - 0.5) * 0.9, R() * TAU, (R() - 0.5) * 0.9); b.scale.setScalar(0.7 + R() * 0.7); b.castShadow = false; group.add(b);
      }
    }
  }

  // ───────────── 2. 灯塔石塔身 ─────────────
  const rT = (y) => 2.35 + 1.25 * (1 - (y - 3.6) / 21.2) + 0.5 * Math.exp(-(y - 3.6) / 1.8);
  {
    const prof = [[5.0, 1.4], [5.0, 3.12], [4.94, 3.18], [4.78, 3.2], [4.78, 3.52], [4.72, 3.58], [4.42, 3.6]];
    const courses = [10.8, 17.6];
    let y = 3.62;
    prof.push([rT(3.6), 3.6]);
    while (y < 24.8) {
      const c = courses.find((cy) => y > cy - 0.25 && y < cy + 0.25);
      if (c !== undefined) {
        const r0 = rT(c - 0.2), r1 = rT(c + 0.2);
        prof.push([r0, c - 0.2], [r0 + 0.1, c - 0.15], [r0 + 0.14, c - 0.06], [r1 + 0.14, c + 0.12], [r1 + 0.05, c + 0.19], [r1, c + 0.22]);
        y = c + 0.6; continue;
      }
      prof.push([rT(y), y]);
      y += y < 8 ? 0.35 : 0.9;
    }
    prof.push([rT(24.8), 24.8], [2.41, 24.86], [2.41, 25.0], [2.46, 25.05], [2.46, 26.02]);
    group.add(crispLathe(prof, M.stone, { seg: 96, tileU: 8, tileV: 3.2, angle: 40 }));
    // 避雷导线（铜，沿塔身而下，带卡箍）
    {
      const a = 283 * DEG, pts = [];
      for (let y = 25.9; y > 3.3; y -= 1.4) { const r = rT(Math.max(3.7, y)) + 0.07; pts.push(V(Math.cos(a) * r, y, Math.sin(a) * r)); }
      pts.push(V(Math.cos(a) * 5.15, 3.3, Math.sin(a) * 5.15), V(Math.cos(a) * 5.4, 2.9, Math.sin(a) * 5.4));
      group.add(U.tube(pts, 0.03, M.copper, false, 90, 5));
      for (let y = 24.5; y > 4.5; y -= 2.8) { const r = rT(y) + 0.02; const c = tbox(0.16, 0.06, 0.1, M.brass, Math.cos(a) * r, y, Math.sin(a) * r, 1); c.rotation.y = -a; group.add(c); }
    }
    // 灯廊托石（悬挑牛腿）
    const cs = new THREE.Shape();
    cs.moveTo(0, 0); cs.lineTo(0.22, 0);
    cs.bezierCurveTo(0.3, 0.35, 0.75, 0.45, 0.95, 0.7);
    cs.lineTo(1.12, 0.92); cs.lineTo(1.12, 1.0); cs.lineTo(0, 1.0); cs.lineTo(0, 0);
    const cg = new THREE.ExtrudeGeometry(cs, { depth: 0.3, bevelEnabled: true, bevelSize: 0.02, bevelThickness: 0.02, bevelSegments: 1, curveSegments: 8 });
    cg.translate(0, 0, -0.15); scaleUV(cg, 0.5, 0.5);
    for (let k = 0; k < 24; k++) {
      const a = (k / 24) * TAU;
      const m = U.mesh(cg, M.stone, Math.cos(a) * 2.4, 25.0, Math.sin(a) * 2.4); m.rotation.y = -a; group.add(m);
    }
    // 灯廊石板
    group.add(crispLathe([[0, 26.0], [3.66, 26.0], [3.76, 26.06], [3.8, 26.12], [3.8, 26.26], [3.72, 26.32], [2.2, 26.32]], M.stone, { seg: 64, tileU: 6, tileV: 2 }));
    group.add(U.ringRailing(3.56, 26.32, { height: 1.05, mat: M.paintBlack, postMat: M.paintBlack, ornate: true, baluster: 0.17, postEvery: 1.4, rail: 0.03 }, 40));
    const topRail = U.torus(3.56, 0.045, M.brass, 0, 27.4, 0, 6, 96); topRail.rotation.x = Math.PI / 2; group.add(topRail);
  }
  // 塔身小窗（沿内部螺旋楼梯盘旋）
  const winAt = (phi, yc, w = 0.55, h = 1.05) => {
    const r = rT(yc);
    const W = new THREE.Group(); W.position.set(Math.cos(phi) * r, yc, Math.sin(phi) * r); W.rotation.y = Math.PI / 2 - phi;
    const gl = U.box(w, h, 0.08, M.glowWindow, 0, 0, 0); gl.castShadow = false; W.add(gl);
    const arch = U.mesh(new THREE.CircleGeometry(w / 2, 14, 0, Math.PI), M.glowWindow, 0, h / 2, 0.041); arch.castShadow = false; W.add(arch);
    for (const sx of [-1, 1]) W.add(tbox(0.17, h + 0.08, 0.24, M.stone, sx * (w / 2 + 0.08), -0.02, 0.02, 1.5));
    for (let i = 0; i < 7; i++) {
      const a = (i / 6) * Math.PI;
      const vb = tbox(0.15, 0.24, 0.24, M.stone, Math.cos(a) * (w / 2 + 0.1), h / 2 + Math.sin(a) * (w / 2 + 0.1), 0.02, 1.5);
      vb.rotation.z = a - Math.PI / 2; W.add(vb);
    }
    W.add(tbox(w + 0.5, 0.1, 0.34, M.stone, 0, -h / 2 - 0.08, 0.08, 1.5));
    W.add(U.rod(V(0, -h / 2, 0.06), V(0, h / 2 + w / 2 - 0.04, 0.06), 0.015, M.paintBlack, 4));
    W.add(U.rod(V(-w / 2, 0.05, 0.06), V(w / 2, 0.05, 0.06), 0.015, M.paintBlack, 4));
    group.add(W);
  };
  [[70, 6.6], [160, 9.6], [250, 13.0], [340, 15.9], [70, 19.6], [160, 22.6], [300, 22.6], [20, 12.2]].forEach(([d, y]) => winAt(d * DEG, y));
  // 入口门廊（朝 +Z）+ 门 + 台阶 + 门楣铭牌
  {
    const P = new THREE.Group(); group.add(P);
    const zf = 5.55, zb = 3.0, pw = 2.5, ph = 3.8, y0 = 3.6;
    P.add(tbox(pw, ph, zf - zb, M.stone, 0, y0 + ph / 2, (zf + zb) / 2, 3));
    for (const sx of [-1, 1]) {
      P.add(tbox(0.36, ph + 0.05, 0.22, M.stone, sx * (pw / 2 - 0.1), y0 + ph / 2, zf + 0.08, 2));
      for (let i = 0; i < 6; i++) P.add(tbox(i % 2 ? 0.42 : 0.3, 0.5, i % 2 ? 0.3 : 0.42, M.stone, sx * (pw / 2 + 0.02 - (i % 2 ? 0.21 : 0.15)), y0 + 0.3 + i * 0.56, zf - (i % 2 ? 0.15 : 0.21) + 0.04, 1.5));
    }
    P.add(tbox(pw + 0.4, 0.2, zf - zb + 0.3, M.stone, 0, y0 + ph + 0.1, (zf + zb) / 2 + 0.1, 2));
    const tri = new THREE.Shape([new THREE.Vector2(-pw / 2 - 0.2, 0), new THREE.Vector2(pw / 2 + 0.2, 0), new THREE.Vector2(0, 0.9)]);
    const tg = new THREE.ExtrudeGeometry(tri, { depth: 0.35, bevelEnabled: false }); scaleUV(tg, 0.4, 0.4);
    P.add(U.mesh(tg, M.stone, 0, y0 + ph + 0.2, zf - 0.2));
    // 门：拱形木门 + 铁合页
    const dw = 1.15, dh = 2.25;
    P.add(tbox(dw, dh, 0.06, M.woodDark, 0, y0 + dh / 2, zf + 0.02, 1.2));
    const da = U.mesh(new THREE.CircleGeometry(dw / 2, 16, 0, Math.PI), M.woodDark, 0, y0 + dh, zf + 0.05); P.add(da);
    for (let i = 0; i < 9; i++) { const a = (i / 8) * Math.PI; const vb = tbox(0.18, 0.28, 0.16, M.stone, Math.cos(a) * (dw / 2 + 0.1), y0 + dh + Math.sin(a) * (dw / 2 + 0.1), zf + 0.06, 1.5); vb.rotation.z = a - Math.PI / 2; P.add(vb); }
    for (const yy of [0.45, 1.75]) P.add(tbox(0.75, 0.07, 0.03, M.paintBlack, -0.15, y0 + yy, zf + 0.065, 1));
    P.add(U.torus(0.07, 0.015, M.brass, 0.38, y0 + 1.1, zf + 0.08, 6, 12));
    for (let i = 0; i < 3; i++) P.add(tbox(dw + 0.9 + i * 0.5, 0.2, 0.36, M.stone, 0, y0 - 0.1 - i * 0.2, zf + 0.18 + i * 0.36, 1.5));
    P.add(tbox(dw + 2.0, 0.6, 0.5, M.stone, 0, GY - 0.27, zf + 1.1, 1.5));
    const sign = U.signBoard('FARO DEL FIN DEL MUNDO', 2.1, 0.42, { w: 2048, h: 384, font: 'bold 150px "Times New Roman", serif', sub: 'ISLA DE LOS ESTADOS · 1905', bg: '#1c2a30', fg: '#e8d8a8', border: '#b89a50', edge: M.brass });
    sign.position.set(0, y0 + ph - 0.36, zf + 0.06); P.add(sign);
  }

  // ───────────── 3. 灯室：12 边形玻璃 + 铜绿穹顶 ─────────────
  const LB = 26.32, LG0 = 27.6, LG1 = 30.5, NS = 12, RG = 2.2;
  {
    const base = U.mesh(new THREE.CylinderGeometry(2.28, 2.32, LG0 - LB, NS), M.paintRed, 0, (LB + LG0) / 2, 0); base.rotation.y = Math.PI / NS; group.add(base);
    group.add(crispLathe([[2.34, LB], [2.4, LB + 0.05], [2.4, LB + 0.14], [2.32, LB + 0.18]], M.paintBlack, { seg: NS, phiStart: Math.PI / NS }));
    group.add(crispLathe([[2.3, LG0 - 0.16], [2.42, LG0 - 0.12], [2.42, LG0 - 0.02], [2.26, LG0]], M.paintBlack, { seg: NS, phiStart: Math.PI / NS }));
    const ap = 2.3 * Math.cos(Math.PI / NS);
    for (let k = 0; k < NS; k++) {
      const a = (k / NS) * TAU; // 面中心方向（lathe/cylinder 坐标：x=sin, z=cos）
      const nx = Math.sin(a), nz = Math.cos(a);
      if (k === 0) { // 通往灯廊的小铁门
        const dr = tbox(0.62, 0.95, 0.05, M.paintBlack, nx * (ap + 0.02), LB + 0.62, nz * (ap + 0.02), 1); dr.rotation.y = a; group.add(dr);
        group.add(U.sphere(0.04, M.brass, nx * (ap + 0.06) + Math.cos(a) * 0.2, LB + 0.62, nz * (ap + 0.06) - Math.sin(a) * 0.2, 6, 4));
      } else if (k % 2 === 0) { // 黄铜圆形通风孔
        const vt = U.cyl(0.13, 0.13, 0.05, M.brass, nx * (ap + 0.02), LB + 0.68, nz * (ap + 0.02), 16); vt.rotation.set(Math.PI / 2, 0, 0); vt.rotation.order = 'YXZ'; vt.rotation.y = a; group.add(vt);
        const vh = U.cyl(0.09, 0.09, 0.06, M.black, nx * (ap + 0.03), LB + 0.68, nz * (ap + 0.03), 12); vh.rotation.order = 'YXZ'; vh.rotation.set(Math.PI / 2, a, 0); group.add(vh);
      }
    }
    // 玻璃
    const glass = U.mesh(new THREE.CylinderGeometry(RG, RG, LG1 - LG0, NS, 1, true), M.glass, 0, (LG0 + LG1) / 2, 0);
    glass.rotation.y = Math.PI / NS; glass.castShadow = false; group.add(glass);
    // 竖棂（黄铜）与横格条（黑）
    const vtx = (k, r = RG) => { const a = (k / NS) * TAU + Math.PI / NS; return [Math.sin(a) * r, Math.cos(a) * r, a]; };
    for (let k = 0; k < NS; k++) {
      const [x, z, a] = vtx(k, RG + 0.01);
      const mb = tbox(0.09, LG1 - LG0, 0.11, M.brass, x, (LG0 + LG1) / 2, z, 1); mb.rotation.y = a; group.add(mb);
      const [x2, z2] = vtx(k + 1, RG + 0.01);
      for (const yy of [LG0 + (LG1 - LG0) / 3, LG0 + (2 * (LG1 - LG0)) / 3]) group.add(U.rod(V(x, yy, z), V(x2, yy, z2), 0.022, M.paintBlack, 5));
      // 擦窗扶手托架
      const [x3, z3] = vtx(k, 2.55);
      group.add(U.rod(V(x, 29.2, z), V(x3, 29.2, z3), 0.02, M.brass, 4));
    }
    const hr = U.torus(2.55, 0.03, M.brass, 0, 29.2, 0, 5, 72); hr.rotation.x = Math.PI / 2; group.add(hr);
    for (const yy of [LG0, LG1]) { const ring = U.torus(RG + 0.02, 0.06, M.brass, 0, yy, 0, 6, NS); ring.rotation.x = Math.PI / 2; ring.rotation.z = Math.PI / NS; group.add(ring); }
    // 檐口 + 穹顶 + 肋条
    group.add(crispLathe([[2.12, LG1], [2.36, LG1 + 0.04], [2.56, LG1 + 0.18], [2.6, LG1 + 0.3], [2.48, LG1 + 0.34]], M.paintBlack, { seg: 48 }));
    const dome = [];
    const D0 = LG1 + 0.34, DR = 2.48, DH = 2.0;
    for (let k = 0; k <= 16; k++) { const a = (k / 16) * (Math.PI / 2) * 0.93; dome.push([DR * Math.pow(Math.cos(a), 0.85), D0 + DH * Math.sin(a)]); }
    const topY = dome[dome.length - 1][1];
    dome.push([0.34, topY + 0.03], [0.32, topY + 0.15], [0.0, topY + 0.16]);
    group.add(crispLathe(dome, M.patina, { seg: 48, tileU: 6, tileV: 1.6, angle: 50 }));
    for (let k = 0; k < NS; k++) {
      const a = (k / NS) * TAU + Math.PI / NS;
      const pts = dome.slice(0, 17).filter((_, i) => i % 2 === 0 || i === 16).map(([r, y]) => V(Math.sin(a) * (r + 0.04), y + 0.02, Math.cos(a) * (r + 0.04)));
      group.add(U.tube(pts, 0.045, M.copper, false, 24, 5));
    }
    // 穹顶检修爬梯（沿穹面，正对灯廊门）
    {
      const rails = [-0.11, 0.11].map((da) => dome.slice(0, 15).map(([r, y]) => V(Math.sin(da) * (r + 0.13), y + 0.05, Math.cos(da) * (r + 0.13))));
      for (const pts of rails) group.add(U.tube(pts, 0.018, M.brass, false, 30, 4));
      for (let i = 1; i < 14; i++) group.add(U.rod(rails[0][i], rails[1][i], 0.012, M.brass, 4));
    }
    // 通风球 + 尖顶 + 避雷针
    const vy = topY + 0.62;
    group.add(U.sphere(0.5, M.copper, 0, vy, 0, 24, 16));
    const vb = U.torus(0.5, 0.05, M.brass, 0, vy, 0, 6, 32); vb.rotation.x = Math.PI / 2; group.add(vb);
    for (let k = 0; k < 8; k++) { const a = (k / 8) * TAU; const s = tbox(0.08, 0.2, 0.08, M.black, Math.sin(a) * 0.47, vy + 0.18, Math.cos(a) * 0.47, 1); s.rotation.y = a; group.add(s); }
    group.add(crispLathe([[0.14, vy + 0.46], [0.2, vy + 0.55], [0.12, vy + 0.7], [0.07, vy + 0.95], [0.1, vy + 1.05], [0.04, vy + 1.12], [0.0, vy + 1.13]], M.brass, { seg: 16 }));
    group.add(U.rod(V(0, vy + 1.1, 0), V(0, vy + 3.2, 0), 0.028, M.steel, 6, 0.018));
    group.add(U.cyl(0.0, 0.05, 0.25, M.gold, 0, vy + 3.32, 0, 8));
    // 风向标十字（N/S/E/W）
    for (const [dx, dz] of [[1, 0], [0, 1]]) group.add(U.rod(V(-dx * 0.55, vy + 2.3, -dz * 0.55), V(dx * 0.55, vy + 2.3, dz * 0.55), 0.015, M.brass, 4));
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) group.add(U.sphere(0.04, M.gold, dx * 0.57, vy + 2.3, dz * 0.57, 6, 4));
  }
  // 风向标（动态）
  const vane = new THREE.Group(); vane.userData.dynamic = true; vane.position.set(0, LG1 + 0.34 + 2.0 * Math.sin(0.93 * Math.PI / 2) + 0.03 + 0.62 + 2.65, 0); group.add(vane);
  {
    vane.add(U.rod(V(-0.75, 0, 0), V(0.65, 0, 0), 0.018, M.brass, 5));
    const head = new THREE.Shape([new THREE.Vector2(0, 0.1), new THREE.Vector2(0.28, 0), new THREE.Vector2(0, -0.1)]);
    const hg = new THREE.ExtrudeGeometry(head, { depth: 0.015, bevelEnabled: false }); hg.translate(0, 0, -0.0075);
    vane.add(U.mesh(hg, M.gold, 0.62, 0, 0));
    const tail = new THREE.Shape([new THREE.Vector2(0, 0), new THREE.Vector2(-0.38, 0.22), new THREE.Vector2(-0.48, 0.2), new THREE.Vector2(-0.42, 0), new THREE.Vector2(-0.48, -0.2), new THREE.Vector2(-0.38, -0.22)]);
    const tg = new THREE.ExtrudeGeometry(tail, { depth: 0.012, bevelEnabled: false }); tg.translate(0, 0, -0.006);
    vane.add(U.mesh(tg, M.gold, -0.42, 0, 0));
    vane.add(U.sphere(0.05, M.brass, 0, 0, 0, 8, 6));
    U.mergeStatic(vane);
  }

  // ───────────── 4. 菲涅耳透镜（旋转）+ 光束 + 光晕 ─────────────
  const LY = 29.05;
  {
    group.add(crispLathe([[0.42, LB], [0.42, LB + 0.12], [0.3, LB + 0.2], [0.22, LB + 0.4], [0.18, 27.9], [0.3, 28.0], [0.34, 28.05], [0.0, 28.05]], M.brass, { seg: 24 }));
    group.add(tbox(0.7, 0.55, 0.7, M.paintBlack, 0.0, LB + 0.6, 0, 1));
    for (const s of [-1, 1]) { const dial = U.cyl(0.13, 0.13, 0.03, M.ivory, s * 0.36, LB + 0.65, 0, 16); dial.rotation.z = Math.PI / 2; group.add(dial); }
  }
  const lensRot = new THREE.Group(); lensRot.position.y = LY; lensRot.userData.dynamic = true; group.add(lensRot);
  {
    const core = U.sphere(0.2, M.glowBeacon, 0, 0, 0, 16, 12); core.castShadow = false; lensRot.add(core);
    lensRot.add(U.cyl(0.05, 0.05, 0.5, M.brass, 0, -0.45, 0, 8));
    const shell = U.mesh(new THREE.CylinderGeometry(0.74, 0.74, 0.62, 24, 1, true), M.glass, 0, 0, 0); shell.castShadow = false; lensRot.add(shell);
    for (let i = 0; i < 6; i++) {
      const t = (i + 1) / 7;
      const r = 0.74 * Math.sqrt(1 - t * t * 0.85), y = 0.31 + t * 0.72;
      for (const sy of [-1, 1]) { const ring = U.torus(r, 0.045, M.glass, 0, sy * y, 0, 6, 32); ring.rotation.x = Math.PI / 2; ring.castShadow = false; lensRot.add(ring); }
    }
    for (const sy of [-1, 1]) { const rr = U.torus(0.76, 0.03, M.brass, 0, sy * 0.31, 0, 6, 36); rr.rotation.x = Math.PI / 2; lensRot.add(rr); }
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * TAU + TAU / 16;
      const pts = []; for (let i = -7; i <= 7; i++) { const t = Math.abs(i) / 7; const y = i < 0 ? -(0.31 + t * 0.72) : 0.31 + t * 0.72; const r = Math.abs(i) < 0.5 ? 0.76 : 0.76 * Math.sqrt(1 - t * t * 0.85) + 0.03; pts.push(V(Math.cos(a) * r, Math.abs(i) < 1 ? y * 0 + (i === 0 ? 0 : y) : y, Math.sin(a) * r)); }
      lensRot.add(U.tube(pts, 0.014, M.brass, false, 30, 4));
    }
    // 两面牛眼透镜（朝 ±X，即光束方向）
    for (const sx of [-1, 1]) {
      for (let i = 1; i <= 4; i++) { const tr = U.torus(0.07 + i * 0.065, 0.022, M.glass, sx * 0.75, 0, 0, 5, 24); tr.rotation.y = Math.PI / 2; tr.castShadow = false; lensRot.add(tr); }
      const eye = U.mesh(new THREE.CircleGeometry(0.1, 16), M.glowBeacon, sx * 0.755, 0, 0); eye.rotation.y = sx * Math.PI / 2; eye.castShadow = false; lensRot.add(eye);
    }
    U.mergeStatic(lensRot);
  }
  const beamMats = [];
  {
    const mkBeam = (radius, len, col, sign) => {
      const g = new THREE.ConeGeometry(radius, len, 28, 10, true);
      g.translate(0, -len / 2, 0); g.rotateZ(sign * Math.PI / 2);
      const p = g.attributes.position; const cols = new Float32Array(p.count * 3);
      const c = new THREE.Color(col);
      for (let i = 0; i < p.count; i++) {
        const d = Math.abs(p.getX(i)) / len;
        const k = Math.pow(1 - d, 1.7) * ss(0, 0.04, d);
        cols[i * 3] = c.r * k; cols[i * 3 + 1] = c.g * k; cols[i * 3 + 2] = c.b * k;
      }
      g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
      const m = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.1, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
      const mesh = new THREE.Mesh(g, m); mesh.castShadow = false; mesh.receiveShadow = false; mesh.position.x = sign * 0.6; mesh.rotation.z = -sign * 0.012;
      mesh.userData.keep = true; lensRot.add(mesh); beamMats.push({ m, base: radius < 3 ? 0.55 : 0.28 });
    };
    for (const s of [-1, 1]) { mkBeam(2.2, 64, 0xfff1c8, s); mkBeam(6.0, 64, 0xffe4a8, s); }
  }
  const haloTex = softTexture([[0, 'rgba(255,250,230,1)'], [0.2, 'rgba(255,236,190,0.7)'], [0.55, 'rgba(255,210,140,0.18)'], [1, 'rgba(255,200,120,0)']]);
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: haloTex, color: 0xfff0d0, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.1 }));
  halo.position.set(0, LY, 0); halo.scale.setScalar(5); halo.userData.dynamic = true; group.add(halo);
  const lensLight = new THREE.PointLight(0xfff0c8, 0, 60, 2); lensLight.position.set(0, LY, 0); group.add(lensLight);
  ctx.addNightLight(lensLight, 140);

  // ───────────── 5. 看守人石屋 ─────────────
  let chimneySmoke;
  {
    const K = new THREE.Group(); K.position.set(CC.x, GY, CC.z); K.rotation.y = CROT; group.add(K);
    const W = 6.4, Dp = 4.2, WH = 2.9, F = 0.35, pitch = 40 * DEG, rise = (Dp / 2) * Math.tan(pitch);
    K.add(tbox(W + 0.3, 1.9, Dp + 0.3, M.stone, 0, F - 0.95, 0, 2));
    K.add(tbox(W, WH - F, Dp, M.paintWhite, 0, (WH + F) / 2, 0, 2));
    // 隅石
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) for (let i = 0; i < 5; i++) {
      const lx = i % 2 ? 0.32 : 0.55, lz = i % 2 ? 0.55 : 0.32;
      K.add(tbox(lx, 0.46, lz, M.stone, sx * (W / 2 - lx / 2 + 0.04), F + 0.25 + i * 0.5, sz * (Dp / 2 - lz / 2 + 0.04), 1.5));
    }
    // 山墙
    const gs = new THREE.Shape([new THREE.Vector2(-Dp / 2, 0), new THREE.Vector2(Dp / 2, 0), new THREE.Vector2(0, rise)]);
    const gg = new THREE.ExtrudeGeometry(gs, { depth: 0.3, bevelEnabled: false }); gg.translate(0, 0, -0.15); gg.rotateY(Math.PI / 2); scaleUV(gg, 0.5, 0.5);
    for (const sx of [-1, 1]) K.add(U.mesh(gg, M.paintWhite, sx * (W / 2 - 0.15), WH, 0));
    // 屋面
    const ov = 0.35, sl = (Dp / 2 + ov) / Math.cos(pitch);
    for (const sz of [-1, 1]) {
      const roof = tbox(W + 0.6, 0.14, sl, M.slate, 0, 0, 0, 2);
      roof.position.set(0, WH + rise - (sl / 2) * Math.sin(pitch) + 0.1 * Math.cos(pitch), sz * ((sl / 2) * Math.cos(pitch) + 0.1 * Math.sin(pitch)));
      roof.rotation.x = sz * pitch; K.add(roof);
      // 封檐板
      for (const sx of [-1, 1]) {
        const bb = tbox(0.06, 0.24, sl + 0.05, M.woodDark, sx * (W / 2 + 0.31), roof.position.y - 0.05, roof.position.z, 1);
        bb.rotation.x = sz * pitch; K.add(bb);
      }
      // 檐沟 + 落水管
      const gt = U.cyl(0.08, 0.08, W + 0.5, M.copper, 0, WH + rise - (Dp / 2 + ov) * Math.tan(pitch) - 0.02, sz * (Dp / 2 + ov - 0.02), 10);
      gt.rotation.z = Math.PI / 2; K.add(gt);
    }
    K.add(U.rod(V(W / 2 + 0.05, WH - 0.05, Dp / 2 + 0.25), V(W / 2 + 0.05, 0.85, Dp / 2 + 0.25), 0.045, M.copper, 8));
    const butt = crispLathe([[0, 0], [0.36, 0], [0.4, 0.2], [0.42, 0.45], [0.4, 0.7], [0.36, 0.85], [0.0, 0.85]], M.woodDark, { seg: 16 });
    butt.position.set(W / 2 + 0.05, 0, Dp / 2 + 0.25); K.add(butt);
    for (const y of [0.12, 0.72]) { const h = U.torus(0.39, 0.02, M.ironPlain, W / 2 + 0.05, y, Dp / 2 + 0.25, 4, 18); h.rotation.x = Math.PI / 2; K.add(h); }
    const ridge = U.cyl(0.11, 0.11, W + 0.6, M.slate, 0, WH + rise + 0.12, 0, 10); ridge.rotation.z = Math.PI / 2; K.add(ridge);
    // 烟囱
    K.add(tbox(0.8, 2.9, 0.7, M.stone, W / 2 - 0.7, WH + 1.4, 0, 1.5));
    K.add(tbox(0.96, 0.14, 0.86, M.stone, W / 2 - 0.7, WH + 2.9, 0, 1.5));
    for (const dz of [-0.16, 0.16]) {
      const pot = crispLathe([[0.13, 0], [0.13, 0.05], [0.1, 0.1], [0.11, 0.42], [0.14, 0.48], [0.1, 0.5], [0.08, 0.3]], M.brick, { seg: 10 });
      pot.position.set(W / 2 - 0.7, WH + 2.97, dz); K.add(pot);
    }
    chimneySmoke = U.makeSteam(14, { color: 0xb8b4ae, size: 0.8, rise: 4.5, spread: 0.3, life: 5, opacity: 0.28 });
    chimneySmoke.position.set(W / 2 - 0.7, WH + 3.5, 0); K.add(chimneySmoke);
    // 正面：门、门罩、壁灯、窗
    const fz = Dp / 2;
    const door = (x) => {
      K.add(tbox(1.0, 2.0, 0.06, M.paintTeal, x, F + 1.0, fz + 0.01, 1));
      for (const yy of [0.5, 1.5]) K.add(tbox(0.8, 0.6, 0.02, M.paintTeal, x, F + yy, fz + 0.045, 1));
      for (const sx of [-1, 1]) K.add(tbox(0.1, 2.45, 0.1, M.paintCream, x + sx * 0.55, F + 1.2, fz + 0.04, 1));
      K.add(tbox(1.2, 0.1, 0.1, M.paintCream, x, F + 2.05, fz + 0.04, 1));
      const tr = U.box(0.95, 0.32, 0.04, M.glowWindow, x, F + 2.27, fz + 0.01); tr.castShadow = false; K.add(tr);
      K.add(tbox(1.2, 0.1, 0.12, M.paintCream, x, F + 2.47, fz + 0.04, 1));
      K.add(U.sphere(0.045, M.brass, x + 0.36, F + 1.0, fz + 0.08, 8, 6));
      K.add(tbox(1.5, F, 0.7, M.stone, x, F / 2, fz + 0.35, 1.5));
      const can = tbox(1.7, 0.08, 1.0, M.slate, x, F + 2.75, fz + 0.48, 1.5); can.rotation.x = 0.32; K.add(can);
      for (const sx of [-1, 1]) { const br = U.torus(0.42, 0.035, M.woodDark, x + sx * 0.72, F + 2.25, fz + 0.42, 4, 10, Math.PI / 2); br.rotation.order = 'YXZ'; br.rotation.set(0, Math.PI / 2, Math.PI / 2); K.add(br); }
      const lan = U.lantern(M, 0.75); lan.position.set(x + 0.95, F + 1.8, fz + 0.28); K.add(lan);
      K.add(U.rod(V(x + 0.95, F + 2.35, fz), V(x + 0.95, F + 2.35, fz + 0.28), 0.02, M.paintBlack, 4));
    };
    const win = (x, y, zf, nrm, ww = 0.9, wh = 1.2, shutters = true) => {
      const G = new THREE.Group(); G.position.set(x, y, zf); G.rotation.y = nrm; K.add(G);
      const gl = U.box(ww, wh, 0.05, M.glowWindow, 0, 0, 0.0); gl.castShadow = false; G.add(gl);
      for (const sx of [-1, 1]) G.add(tbox(0.08, wh + 0.16, 0.09, M.paintCream, sx * (ww / 2 + 0.04), 0, 0.03, 1));
      for (const sy of [-1, 1]) G.add(tbox(ww + 0.16, 0.08, 0.09, M.paintCream, 0, sy * (wh / 2 + 0.04), 0.03, 1));
      G.add(tbox(0.04, wh, 0.05, M.paintCream, 0, 0, 0.04, 1)); G.add(tbox(ww, 0.04, 0.05, M.paintCream, 0, wh * 0.12, 0.04, 1));
      G.add(tbox(ww + 0.35, 0.09, 0.24, M.stone, 0, -wh / 2 - 0.12, 0.08, 1));
      G.add(tbox(ww + 0.4, 0.22, 0.1, M.stone, 0, wh / 2 + 0.2, 0.04, 1));
      if (shutters) for (const sx of [-1, 1]) {
        const sh = new THREE.Group(); sh.position.set(sx * (ww / 2 + 0.09), 0, 0.06); sh.rotation.y = sx * 0.35; G.add(sh);
        sh.add(tbox(ww / 2 + 0.02, wh + 0.1, 0.04, M.paintTeal, sx * (ww / 4 + 0.01), 0, 0, 1));
        for (let i = 0; i < 6; i++) sh.add(tbox(ww / 2 - 0.06, 0.03, 0.03, M.paintTeal, sx * (ww / 4 + 0.01), -wh / 2 + 0.15 + i * (wh - 0.2) / 5, 0.03, 1));
      }
    };
    door(-0.3);
    win(-2.1, F + 1.35, fz + 0.01, 0); win(1.8, F + 1.35, fz + 0.01, 0);
    win(-1.6, F + 1.35, -fz - 0.01, Math.PI); win(1.6, F + 1.35, -fz - 0.01, Math.PI);
    win(W / 2 + 0.01, WH + 0.55, 0, Math.PI / 2, 0.55, 0.65, false);
    // 披屋（工具与油料间）
    const lx = -W / 2 - 0.9;
    K.add(tbox(1.8, 2.1, 3.2, M.woodDark, lx, 1.05, -0.2, 1.5));
    for (let z = -1.7; z <= 1.31; z += 0.5) K.add(tbox(0.04, 2.1, 0.06, M.wood, lx - 0.91, 1.05, z, 1));
    const lr = tbox(2.2, 0.1, 3.6, M.slate, lx - 0.05, 2.25, -0.2, 2); lr.rotation.z = 0.18; K.add(lr);
    K.add(tbox(0.05, 1.7, 0.85, M.wood, lx, 0.85, 1.42, 1));
    K.add(U.torus(0.05, 0.01, M.ironPlain, lx + 0.3, 0.95, 1.46, 4, 8));
    // 屋旁木桶、木箱
    for (const [x, z] of [[lx - 0.4, 2.0], [lx + 0.5, 2.2]]) {
      const b = crispLathe([[0, 0], [0.3, 0], [0.35, 0.2], [0.37, 0.45], [0.35, 0.7], [0.3, 0.9], [0, 0.9]], M.woodDark, { seg: 14 }); b.position.set(x, 0, z); K.add(b);
      for (const y of [0.12, 0.78]) { const h = U.torus(0.34, 0.018, M.ironPlain, x, y, z, 4, 16); h.rotation.x = Math.PI / 2; K.add(h); }
    }
    K.add(tbox(0.8, 0.6, 0.6, M.wood, lx + 0.1, 0.3, -2.25, 1));
    // 室内暖光
    const homeLight = new THREE.PointLight(0xffb060, 0, 11, 2); homeLight.position.set(-0.3, F + 2.3, fz + 0.9); K.add(homeLight);
    ctx.addNightLight(homeLight, 22);
  }
  // 干砌石墙（石屋后院）
  {
    const wall = (a, b, seed) => {
      const r2 = rng(seed); const len = a.distanceTo(b); const n = Math.round(len / 0.48);
      const dir = b.clone().sub(a).normalize(); const ang = Math.atan2(-dir.z, dir.x);
      for (let i = 0; i < n; i++) for (let row = 0; row < 2; row++) {
        const t = (i + 0.5 + (row ? 0.5 : 0)) / n; if (t > 1) continue;
        const p = a.clone().lerp(b, t);
        const s = tbox(0.42 + r2() * 0.15, 0.26 + r2() * 0.08, 0.42 + r2() * 0.1, M.stone, p.x, H(p.x, p.z) + 0.12 + row * 0.27, p.z, 1);
        s.rotation.set((r2() - 0.5) * 0.12, ang + (r2() - 0.5) * 0.25, (r2() - 0.5) * 0.12); group.add(s);
      }
    };
    wall(V(-9.6, 0, -7.3), V(-6.6, 0, -8.3), 71);
    wall(V(-6.6, 0, -8.3), V(-3.2, 0, -8.5), 72);
  }
  // 石板小径：石屋门 → 绕塔 → 塔门 → 栈桥阶梯
  {
    const pts = [];
    const doorW = (() => { const c = Math.cos(CROT), s = Math.sin(CROT); const lx = -0.3, lz = 4.2 / 2 + 0.9; return V(CC.x + lx * c + lz * s, 0, CC.z - lx * s + lz * c); })();
    pts.push(doorW);
    for (const d of [176, 156, 136, 118]) pts.push(V(Math.cos(d * DEG) * 5.95, 0, Math.sin(d * DEG) * 5.95));
    pts.push(V(-1.9, 0, 7.15), V(-0.4, 0, 7.45), V(1.6, 0, 7.6), V(3.6, 0, 7.4), V(SXJ - 0.4, 0, 7.15));
    const curve = new THREE.CatmullRomCurve3(pts);
    const L = curve.getLength(); const n = Math.round(L / 0.62);
    const r2 = rng(77);
    for (let i = 0; i <= n; i++) {
      const p = curve.getPointAt(i / n);
      for (const off of [-0.3, 0.3]) {
        const tg = curve.getTangentAt(i / n); const nx = -tg.z, nz = tg.x;
        const x = p.x + nx * (off + (r2() - 0.5) * 0.12), z = p.z + nz * (off + (r2() - 0.5) * 0.12);
        const st = U.cyl(0.26 + r2() * 0.08, 0.28 + r2() * 0.08, 0.08, M.stone, x, H(x, z) + 0.03, z, 6);
        st.rotation.y = r2() * 3; scaleUV(st.geometry, 0.4, 0.4); st.castShadow = false; group.add(st);
      }
    }
  }

  // ───────────── 6. 阶梯 + 栈桥 + 系泊小划艇 ─────────────
  {
    for (let k = 0; k < 10; k++) {
      const top = GY - 0.2 * (k + 1), zc = 7.6 + 0.3 * k + 0.15;
      group.add(tbox(1.6, top + 4.6, 0.3, M.stone, SXJ, (top - 4.6) / 2, zc, 2));
      for (const sx of [-1, 1]) group.add(tbox(0.28, top + 4.6 + 0.65, 0.3, M.stone, SXJ + sx * 0.94, (top + 0.65 - 4.6) / 2, zc, 2));
    }
    for (const sx of [-1, 1]) {
      group.add(tbox(0.4, 1.0, 0.4, M.stone, SXJ + sx * 0.94, GY + 0.5, 7.4, 1.5));
      group.add(U.sphere(0.16, M.stone, SXJ + sx * 0.94, GY + 1.1, 7.4, 10, 8));
    }
    group.add(U.railing([V(SXJ + 0.65, GY, 7.55), V(SXJ + 0.65, 1.0, 10.6)], { height: 0.9, mat: M.paintBlack, baluster: 0, postEvery: 1.2 }));
    // 栈桥
    const z0 = 10.6, z1 = 17.0, x0 = SXJ - 0.9, x1 = SXJ + 0.9, DY = 1.0;
    for (let z = z0 + 0.12; z < z1; z += 0.25) {
      const pl = tbox(1.82 + (R() - 0.5) * 0.06, 0.06, 0.22, M.deck, SXJ + (R() - 0.5) * 0.04, DY - 0.03, z, 1.5);
      pl.rotation.y = (R() - 0.5) * 0.02; group.add(pl);
    }
    for (const x of [x0 + 0.12, SXJ, x1 - 0.12]) group.add(tbox(0.12, 0.2, z1 - z0, M.woodDark, x, DY - 0.16, (z0 + z1) / 2, 1.5));
    const pileZ = [11.0, 12.6, 14.2, 15.8, 16.9];
    for (const z of pileZ) {
      group.add(tbox(2.1, 0.2, 0.2, M.woodDark, SXJ, DY - 0.36, z, 1.5));
      for (const x of [x0 - 0.05, x1 + 0.05]) group.add(U.cyl(0.15, 0.17, 4.9, M.woodDark, x, -1.35 + (z === 16.9 ? 0.4 : 0), z, 10).translateY(z === 16.9 ? 0.0 : 0));
      group.add(U.rod(V(x0 - 0.05, DY - 0.45, z), V(x1 + 0.05, -1.6, z), 0.05, M.woodDark, 5));
      group.add(U.rod(V(x1 + 0.05, DY - 0.45, z), V(x0 - 0.05, -1.6, z), 0.05, M.woodDark, 5));
    }
    for (const x of [x0 - 0.05, x1 + 0.05]) group.add(U.cyl(0.15, 0.15, 0.6, M.woodDark, x, DY + 0.3, 16.9, 10));
    // 系船柱
    const bollard = (x, z) => group.add(crispLathe([[0.16, 0], [0.16, 0.05], [0.11, 0.1], [0.1, 0.3], [0.15, 0.36], [0.15, 0.42], [0.09, 0.45], [0, 0.46]], M.ironPlain, { seg: 14 }).translateX(x).translateY(DY).translateZ(z));
    bollard(x1 - 0.2, 12.6); bollard(x1 - 0.2, 16.2); bollard(x0 + 0.2, 14.8);
    // 救生圈（红白相间）
    {
      const post = U.rod(V(x0 + 0.1, DY, 13.4), V(x0 + 0.1, DY + 1.6, 13.4), 0.06, M.woodDark, 8); group.add(post);
      for (let k = 0; k < 4; k++) { const seg = U.torus(0.3, 0.07, k % 2 ? M.paintWhite : M.paintRed, x0 + 0.02, DY + 1.05, 13.4, 8, 10, Math.PI / 2); seg.rotation.set(0, Math.PI / 2, (k * Math.PI) / 2); group.add(seg); }
    }
    // 栈桥尽端灯柱 + 爬梯
    {
      group.add(U.rod(V(x0 - 0.05, DY + 0.6, 16.9), V(x0 - 0.05, DY + 2.4, 16.9), 0.08, M.woodDark, 8));
      group.add(U.rod(V(x0 - 0.05, DY + 2.3, 16.9), V(x0 - 0.45, DY + 2.3, 16.9), 0.03, M.paintBlack, 6));
      const ln = U.lantern(M, 0.8); ln.position.set(x0 - 0.45, DY + 1.72, 16.9); group.add(ln);
      for (const x of [SXJ - 0.25, SXJ + 0.25]) group.add(U.rod(V(x, DY + 0.7, z1 + 0.05), V(x, -1.5, z1 + 0.05), 0.025, M.steel, 6));
      for (let y = -1.3; y < DY + 0.6; y += 0.3) group.add(U.rod(V(SXJ - 0.25, y, z1 + 0.05), V(SXJ + 0.25, y, z1 + 0.05), 0.018, M.steel, 4));
    }
    // 绳圈、木桶、鱼箱
    for (let i = 0; i < 4; i++) { const c = U.torus(0.28 - i * 0.02, 0.035, M.rope, SXJ - 0.35, DY + 0.035 + i * 0.06, 15.6, 5, 18); c.rotation.x = Math.PI / 2; group.add(c); }
    const bar = crispLathe([[0, 0], [0.28, 0], [0.33, 0.2], [0.35, 0.42], [0.33, 0.64], [0.28, 0.84], [0, 0.84]], M.woodDark, { seg: 14 }); bar.position.set(SXJ + 0.4, DY, 11.4); group.add(bar);
    for (const y of [0.1, 0.74]) { const h = U.torus(0.32, 0.018, M.ironPlain, SXJ + 0.4, DY + y, 11.4, 4, 16); h.rotation.x = Math.PI / 2; group.add(h); }
    group.add(tbox(0.7, 0.35, 0.45, M.wood, SXJ - 0.35, DY + 0.18, 11.6, 1));
  }
  const boat = rowboat(M);
  boat.position.set(SXJ + 1.95, -0.2, 14.4); boat.userData.dynamic = true; U.mergeStatic(boat); group.add(boat);
  // 系泊缆
  group.add(U.tube([V(SXJ + 1.95, 0.55, 16.55), V(SXJ + 1.45, 0.5, 16.5), V(SXJ + 0.75, 1.3, 16.2)], 0.022, M.rope, false, 12, 4));
  group.add(U.tube([V(SXJ + 1.95, 0.45, 12.3), V(SXJ + 1.35, 0.4, 12.4), V(SXJ + 0.75, 1.3, 12.6)], 0.022, M.rope, false, 12, 4));

  // ───────────── 7. 雾钟 ─────────────
  const BELL = V(7.0, 0, 3.4);
  const bell = new THREE.Group();
  {
    const gy = H(BELL.x, BELL.z);
    const F = new THREE.Group(); F.position.set(BELL.x, gy, BELL.z); F.rotation.y = -0.4; group.add(F);
    F.add(tbox(2.0, 0.6, 1.2, M.stone, 0, 0.0, 0, 1.5));
    for (const sx of [-1, 1]) {
      F.add(tbox(0.2, 2.8, 0.2, M.woodDark, sx * 0.75, 1.7, 0, 1));
      F.add(U.rod(V(sx * 0.75, 0.6, 0.45), V(sx * 0.75, 1.6, 0.05), 0.05, M.woodDark, 5));
      F.add(U.rod(V(sx * 0.75, 0.6, -0.45), V(sx * 0.75, 1.6, -0.05), 0.05, M.woodDark, 5));
    }
    F.add(tbox(1.9, 0.22, 0.24, M.woodDark, 0, 3.1, 0, 1));
    for (const sz of [-1, 1]) { const rf = tbox(2.2, 0.06, 0.7, M.slate, 0, 3.42, sz * 0.27, 1); rf.rotation.x = sz * 0.55; F.add(rf); }
    const axle = U.cyl(0.05, 0.05, 1.5, M.steel, 0, 2.85, 0, 8); axle.rotation.z = Math.PI / 2; F.add(axle);
    // 敲钟机匣
    F.add(tbox(0.35, 0.5, 0.3, M.paintRed, 0.55, 2.2, 0.2, 1));
    const dial = U.cyl(0.1, 0.1, 0.04, M.brass, 0.55, 2.25, 0.36, 12); dial.rotation.x = Math.PI / 2; F.add(dial);
    bell.position.set(0, 2.85, 0); bell.userData.dynamic = true; F.add(bell);
    const bp = [[0, -0.1], [0.2, -0.12], [0.22, -0.3], [0.25, -0.5], [0.36, -0.72], [0.4, -0.8], [0.46, -0.8], [0.45, -0.76], [0.39, -0.66], [0.32, -0.5], [0.29, -0.3], [0.27, -0.12], [0.2, -0.04], [0, -0.02]];
    const bm = crispLathe(bp.slice(0, 6), bellInside, { seg: 28 }); bell.add(bm);
    bell.add(crispLathe(bp.slice(5), M.brass, { seg: 28, angle: 30 }));
    bell.add(tbox(0.12, 0.16, 0.12, M.ironPlain, 0, 0.0, 0, 1));
    bell.add(U.rod(V(0, -0.1, 0), V(0, -0.62, 0), 0.02, M.ironPlain, 5));
    bell.add(U.sphere(0.07, M.ironPlain, 0, -0.66, 0, 10, 8));
    U.mergeStatic(bell);
  }

  // ───────────── 8. 旗杆（阿根廷国旗） ─────────────
  const flagParts = [];
  {
    const fx = -4.5, fz = -5.9, gy = H(fx, fz);
    group.add(tbox(0.7, 0.4, 0.7, M.stone, fx, gy + 0.1, fz, 1));
    group.add(U.rod(V(fx, gy + 0.3, fz), V(fx, gy + 8.0, fz), 0.07, M.paintWhite, 8, 0.045));
    group.add(U.sphere(0.1, M.gold, fx, gy + 8.07, fz, 10, 8));
    group.add(U.rod(V(fx, gy + 7.6, fz), V(fx + 0.7, gy + 6.9, fz), 0.03, M.paintWhite, 5));
    const fw = 1.8, fh = 1.14;
    [[lightBlue, 0], [flagWhite, 1], [lightBlue, 2]].forEach(([m, i]) => {
      const g = new THREE.PlaneGeometry(fw, fh / 3, 12, 2); g.translate(fw / 2, -fh / 6 - (i * fh) / 3, 0);
      const mesh = U.mesh(g, m, fx + 0.06, gy + 7.75, fz); mesh.castShadow = false; mesh.userData.dynamic = true;
      mesh.userData.base = Float32Array.from(g.attributes.position.array); group.add(mesh); flagParts.push(mesh);
    });
    const sun = U.mesh(new THREE.CircleGeometry(0.11, 16), M.gold, fx + 0.06 + fw / 2, gy + 7.75 - fh / 2, fz + 0.01); sun.material = M.gold; sun.userData.dynamic = true; sun.castShadow = false; group.add(sun);
    flagParts.sun = sun; flagParts.sunX = fw / 2; flagParts.z0 = fz;
  }

  // ───────────── 9. 游客 / 看守人 ─────────────
  const walkers = [];
  {
    const keeper = U.person(1905); keeper.position.set(2.2, 26.32, 2.75); keeper.rotation.y = 0.7; keeper.userData.dynamic = true; group.add(keeper);
    walkers.push({ p: keeper, kind: 'gallery' });
    const p2 = U.person(1906); p2.position.set(SXJ - 0.3, 1.0, 16.0); p2.rotation.y = 0.2; group.add(p2);
    const p3 = U.person(1907); p3.position.set(-2.2, H(-2.2, 6.8), 6.8); p3.rotation.y = 2.2; group.add(p3);
    const p4 = U.person(1911, { child: true }); p4.position.set(6.2, H(6.2, 4.4), 4.4); p4.rotation.y = 0.4; group.add(p4);
    const walker = U.person(1913); walker.userData.dynamic = true; group.add(walker);
    walkers.push({ p: walker, kind: 'path' });
  }
  const walkPath = new THREE.CatmullRomCurve3([V(-6.0, 0, 1.4), V(-5.3, 0, 4.4), V(-2.8, 0, 6.8), V(0.4, 0, 7.55), V(3.7, 0, 7.25), V(5.3, 0, 5.9), V(5.9, 0, 1.6)]);

  // ───────────── 10. 合并 ─────────────
  U.mergeStatic(group);

  const _cam = V();
  function update(t, dt, env) {
    const night = (env && env.night) || 0;
    // 透镜旋转（10 s 一周 → 每 5 s 一道闪光）
    lensRot.rotation.y = -t * (TAU / 10);
    for (const b of beamMats) b.m.opacity = 0.05 * b.base + b.base * 0.95 * night;
    halo.material.opacity = 0.08 + 0.85 * night;
    // 面向相机时光晕增强（光束扫过视线）
    if (env && env.camera) {
      group.updateMatrixWorld();
      _cam.copy(env.camera.position); group.worldToLocal(_cam);
      const dx = _cam.x, dz = _cam.z, dl = Math.hypot(dx, dz) || 1;
      const a = lensRot.rotation.y; // 光束方向（局部）= (cos a, 0, −sin a) 及其反向
      const k = Math.abs((Math.cos(a) * dx - Math.sin(a) * dz) / dl);
      halo.scale.setScalar(4 + 12 * Math.pow(k, 30) * (0.25 + night));
    }
    vane.rotation.y = 0.8 + 0.35 * Math.sin(t * 0.11) + 0.05 * Math.sin(t * 1.7);
    // 雾钟：每 20 s 摇响 6 s
    const bt = t % 20;
    const env1 = bt < 6 ? Math.sin((bt / 6) * Math.PI) : 0;
    bell.rotation.x = 0.38 * env1 * Math.sin(bt * 3.3);
    // 小艇随波起伏
    boat.position.y = -0.2 + 0.035 * Math.sin(t * 1.1);
    boat.rotation.z = 0.045 * Math.sin(t * 0.85);
    boat.rotation.x = 0.02 * Math.sin(t * 1.3 + 1);
    boat.rotation.y = 0.03 * Math.sin(t * 0.3);
    // 烟囱炊烟
    if (chimneySmoke) chimneySmoke.userData.update(dt, 0.6 + 0.4 * night, V(0.6, 0, 0.25));
    // 旗帜
    for (const f of flagParts) {
      const p = f.geometry.attributes.position, b = f.userData.base;
      for (let i = 0; i < p.count; i++) {
        const x = b[i * 3], y = b[i * 3 + 1], fx = x / 1.8;
        p.setXYZ(i, x - fx * fx * 0.08, y - fx * 0.06, Math.sin(x * 2.6 - t * 6 + 0.5) * 0.14 * fx + Math.sin(y * 4 + t * 4) * 0.02 * fx);
      }
      p.needsUpdate = true; f.geometry.computeVertexNormals();
    }
    if (flagParts.sun) { const x = flagParts.sunX; flagParts.sun.position.z = flagParts.z0 + 0.012 + Math.sin(x * 2.6 - t * 6 + 0.5) * 0.14 * (x / 1.8); flagParts.sun.position.x = -4.5 + 0.06 + x - (x / 1.8) ** 2 * 0.08; }
    // 看守人在灯廊上绕行，游客沿小径散步
    for (const w of walkers) {
      if (w.kind === 'gallery') {
        const a = t * 0.12;
        w.p.position.set(Math.cos(a) * 3.1, 26.32, Math.sin(a) * 3.1);
        w.p.rotation.y = -a; // 切向行走
        U.animatePerson(w.p, t, 0.5);
      } else {
        const s2 = (t * 0.032) % 2, u = s2 < 1 ? s2 : 2 - s2, sg = s2 < 1 ? 1 : -1;
        const p = walkPath.getPointAt(u), tg = walkPath.getTangentAt(u);
        w.p.position.set(p.x, H(p.x, p.z), p.z);
        w.p.rotation.y = Math.atan2(sg * tg.x, sg * tg.z);
        U.animatePerson(w.p, t, 0.9);
      }
    }
  }

  return {
    group,
    update,
    focus: { pos: [26, 15, 32], target: [0, 14, 0] },
    footprint: 19,
  };
}

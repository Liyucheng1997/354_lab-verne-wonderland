// ─────────────────────────────────────────────────────────────
//  《从地球到月球》(De la Terre à la Lune, 1865)
//  大炮俱乐部的巨炮「哥伦比亚炮」(Columbiad) 与铝制炮弹
//  —— 主题乐园演绎：铸铁巨炮 + 纪念性砌石与铆接铁炮架 + 俯仰齿扇
//     + 钢桁架塔吊 + 炮弹展台 + 观礼看台。每 45 秒开炮一次。
//  坐标：炮耳轴心 (0, 14, 3)；炮管位于 YZ 平面，炮口朝 −Z 方向上扬 50°
//  （炮尾/炮钮朝 +Z，靠近游客入口；看台在 +X 侧，塔吊在 −X/−Z 侧）。
// ─────────────────────────────────────────────────────────────
import * as THREE from 'three';
import * as U from '../util.js';
import { rng } from '../materials.js';

const V = U.V;
const DEG = Math.PI / 180;
const ss = U.smoothstep;

// ═════════════════════ 本地建模小工具 ═════════════════════

/** 缩放几何体 UV（让共享贴图在大尺寸构件上保持真实比例） */
function scaleUV(geo, su, sv) {
  const uv = geo.attributes.uv;
  if (!uv) return geo;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv);
  uv.needsUpdate = true;
  return geo;
}

/** 带真实尺度 UV 的盒子：tile = 一个 UV 单位对应的米数 */
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

/**
 * 「硬边」车床体：在轮廓急转处断开，使线脚/环箍的棱角清晰锐利，
 * 而平缓段保持光滑法线。UV：u 绕圈重复 tileU 次（整数），v 按弧长 / tileV 米。
 */
function crispLathe(profile, mat, { seg = 48, tileU = 1, tileV = 0, angle = 38, phiStart = 0, phiLen = Math.PI * 2 } = {}) {
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
    if (Math.acos(Math.max(-1, Math.min(1, c))) / DEG > angle) { runs.push([s0, i]); s0 = i; }
  }
  runs.push([s0, n - 1]);
  const g = new THREE.Group();
  for (const [a, b] of runs) {
    const sub = pts.slice(a, b + 1).map(([r, y]) => new THREE.Vector2(Math.max(r, 1e-4), y));
    if (sub.length < 2) continue;
    const geo = new THREE.LatheGeometry(sub, seg, phiStart, phiLen);
    const uv = geo.attributes.uv, np = sub.length;
    for (let i = 0; i <= seg; i++) for (let j = 0; j < np; j++) {
      uv.setXY(i * np + j, (i / seg) * tileU, tileV ? cum[a + j] / tileV : j / (np - 1));
    }
    g.add(U.mesh(geo, mat));
  }
  return g;
}

/** 铆钉收集器：最后一次性生成一个 InstancedMesh */
class Rivets {
  constructor() { this.p = []; this.n = []; }
  add(p, n) { this.p.push(p.clone()); this.n.push(n.clone().normalize()); }
  /** 绕 Y 轴一圈（车床体局部坐标） */
  ring(r, y, count, a0 = 0) {
    for (let i = 0; i < count; i++) { const a = a0 + (i / count) * Math.PI * 2; this.add(V(Math.sin(a) * r, y, Math.cos(a) * r), V(Math.sin(a), 0, Math.cos(a))); }
  }
  line(a, b, step, nrm) {
    const len = a.distanceTo(b); const k = Math.max(1, Math.round(len / step));
    for (let i = 0; i <= k; i++) this.add(a.clone().lerp(b, i / k), nrm);
  }
  /** 低面数圆头铆钉（7×2 半球，压扁），一个 InstancedMesh */
  build(size, mat) {
    if (!this.p.length) return new THREE.Group();
    const geo = new THREE.SphereGeometry(size, 7, 2, 0, Math.PI * 2, 0, Math.PI / 2);
    geo.scale(1, 0.62, 1);
    const im = new THREE.InstancedMesh(geo, mat, this.p.length);
    const q = new THREE.Quaternion(), one = V(1, 1, 1), m4 = new THREE.Matrix4(), up = V(0, 1, 0);
    this.p.forEach((pp, i) => { q.setFromUnitVectors(up, this.n[i]); m4.compose(pp, q, one); im.setMatrixAt(i, m4); });
    im.castShadow = false; im.receiveShadow = true;
    return im;
  }
}

/** 在 (z,y) 平面画的形状，沿 X 方向挤出（厚度居中），x 为中心 */
function extrudeZY(pts, depth, mat, x = 0, uvTile = 3.5, holes = []) {
  const s = new THREE.Shape(pts.map(([z, y]) => new THREE.Vector2(z, y)));
  for (const h of holes) s.holes.push(h);
  const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: false, curveSegments: 16 });
  g.translate(0, 0, -depth / 2);
  g.rotateY(-Math.PI / 2); // 形状 x → 世界 z，挤出 → 世界 −x
  scaleUV(g, 1 / uvTile, 1 / uvTile);
  return U.mesh(g, mat, x, 0, 0);
}

/** 柔和径向渐变贴图（烟/火光精灵用） */
function softTexture(stops, size = 128) {
  const cv = document.createElement('canvas'); cv.width = cv.height = size;
  const cx = cv.getContext('2d');
  const grd = cx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  for (const [o, c] of stops) grd.addColorStop(o, c);
  cx.fillStyle = grd; cx.fillRect(0, 0, size, size);
  // 少量絮状斑点，让烟团不那么“完美圆”
  const r = rng(size + stops.length);
  for (let i = 0; i < 26; i++) {
    const a = r() * Math.PI * 2, d = r() * size * 0.28, rr = size * (0.08 + r() * 0.14);
    const x = size / 2 + Math.cos(a) * d, y = size / 2 + Math.sin(a) * d;
    const g2 = cx.createRadialGradient(x, y, 0, x, y, rr);
    g2.addColorStop(0, 'rgba(255,255,255,0.22)'); g2.addColorStop(1, 'rgba(255,255,255,0)');
    cx.fillStyle = g2; cx.fillRect(0, 0, size, size);
  }
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** 在数组折线（闭合）上按弧长取点 */
function pathAt(pts, s) {
  let total = 0; const L = [];
  for (let i = 0; i < pts.length; i++) { const d = pts[i].distanceTo(pts[(i + 1) % pts.length]); L.push(d); total += d; }
  s = ((s % total) + total) % total;
  for (let i = 0; i < pts.length; i++) {
    if (s <= L[i]) { const a = pts[i], b = pts[(i + 1) % pts.length]; return { p: a.clone().lerp(b, s / L[i]), dir: b.clone().sub(a).normalize() }; }
    s -= L[i];
  }
  return { p: pts[0].clone(), dir: V(1, 0, 0) };
}

// ═════════════════════ 铝制炮弹（锥头圆柱弹） ═════════════════════
/** 炮弹：底面在 y=0，弹尖朝 +Y，高约 3.6 m，直径 1.6 m */
function makeProjectile(M) {
  const g = new THREE.Group();
  const rv = new Rivets(), bolts = new Rivets();
  const RB = 0.8, YN = 2.0, HN = 1.42;
  const prof = [[0, 0], [0.42, 0], [0.62, 0.02], [0.73, 0.07], [0.79, 0.15], [RB, 0.24], [RB, YN]];
  const nose = (t) => RB * Math.pow(Math.max(0, 1 - Math.pow(t, 1.8)), 0.62);
  for (let k = 1; k <= 14; k++) { const t = (k / 14) * 0.965; prof.push([nose(t), YN + HN * t]); }
  g.add(crispLathe(prof, M.steel, { seg: 56, tileU: 3, tileV: 1.2, angle: 50 }));
  // 黄铜箍：底箍、腰箍、颈箍
  const band = (y0, y1, r, mat = M.brass) => g.add(crispLathe([[r - 0.01, y0], [r + 0.03, y0 + 0.015], [r + 0.035, y0 + 0.04], [r + 0.035, y1 - 0.04], [r + 0.03, y1 - 0.015], [r - 0.01, y1]], mat, { seg: 56, tileU: 4, tileV: 0.5, angle: 30 }));
  band(0.26, 0.42, RB); band(1.0, 1.06, RB); band(1.92, 2.08, RB);
  const rN1 = nose(0.2 / HN), rN2 = nose(0.75 / HN);
  band(YN + 0.17, YN + 0.23, rN1 - 0.005);
  // 弹尖：黄铜尖顶
  const yTip = YN + HN * 0.965;
  g.add(crispLathe([[0.07, yTip - 0.04], [0.11, yTip], [0.1, yTip + 0.05], [0.05, yTip + 0.08], [0.035, yTip + 0.12], [0.018, 3.56], [0.001, 3.6]], M.brass, { seg: 20 }));
  g.add(U.sphere(0.06, M.brass, 0, yTip + 0.1, 0, 12, 8));
  // 底板缓冲盘
  g.add(crispLathe([[0, -0.06], [0.55, -0.06], [0.6, -0.03], [0.6, 0.0]], M.brass, { seg: 40 }));
  bolts.ring(0.5, -0.06, 16);
  // 铆钉：箍边、纵缝、锥头
  rv.ring(RB + 0.004, 0.47, 44); rv.ring(RB + 0.004, 1.86, 44);
  rv.ring(rN1 + 0.004, YN + 0.32, 36); rv.ring(rN2 + 0.004, YN + 0.75, 28);
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * Math.PI * 2 + 36 * DEG;
    for (let y = 0.55; y < 1.85; y += 0.11) { if (Math.abs(y - 1.03) < 0.06) continue; rv.add(V(Math.sin(a) * (RB + 0.004), y, Math.cos(a) * (RB + 0.004)), V(Math.sin(a), 0, Math.cos(a))); }
  }
  // 舱门（φ=0，朝 +Z）：弧形门板 + 合页 + 把手
  const hd = 21 * DEG;
  g.add(crispLathe([[RB - 0.005, 0.56], [RB + 0.03, 0.58], [RB + 0.03, 1.72], [RB - 0.005, 1.74]], M.steel, { seg: 10, phiStart: -hd, phiLen: 2 * hd, angle: 30 }));
  g.add(crispLathe([[RB + 0.03, 0.6], [RB + 0.045, 0.61], [RB + 0.045, 1.69], [RB + 0.03, 1.7]], M.brass, { seg: 2, phiStart: -hd, phiLen: 0.05, angle: 30 }));
  g.add(crispLathe([[RB + 0.03, 0.6], [RB + 0.045, 0.61], [RB + 0.045, 1.69], [RB + 0.03, 1.7]], M.brass, { seg: 2, phiStart: hd - 0.05, phiLen: 0.05, angle: 30 }));
  for (const y of [0.78, 1.52]) {
    const a = hd + 0.02;
    g.add(U.cyl(0.035, 0.035, 0.2, M.brass, Math.sin(a) * (RB + 0.04), y, Math.cos(a) * (RB + 0.04), 10));
  }
  const hdl = U.torus(0.07, 0.014, M.brass, Math.sin(-0.15) * (RB + 0.06), 1.15, Math.cos(-0.15) * (RB + 0.06), 6, 14, Math.PI);
  hdl.rotation.set(0, -0.15, Math.PI / 2); g.add(hdl);
  for (let k = 0; k < 9; k++) { const a = -hd + 0.04 + (k / 8) * (2 * hd - 0.08); for (const y of [0.63, 1.67]) bolts.add(V(Math.sin(a) * (RB + 0.032), y, Math.cos(a) * (RB + 0.032)), V(Math.sin(a), 0, Math.cos(a))); }
  // 透镜舷窗 ×4：黄铜窗框 + 凸透镜玻璃（夜晚透出暖光）+ 螺栓
  for (let k = 1; k <= 4; k++) {
    const a = (k / 5) * Math.PI * 2;
    const pw = new THREE.Group();
    pw.position.set(Math.sin(a) * RB, 1.42, Math.cos(a) * RB);
    pw.rotation.y = a;
    pw.add(U.torus(0.2, 0.045, M.brass, 0, 0, 0.02, 8, 28));
    pw.add(U.cyl(0.25, 0.25, 0.03, M.brass, 0, 0, 0.0, 28));
    pw.children[1].rotation.x = Math.PI / 2;
    const lens = U.mesh(new THREE.SphereGeometry(0.34, 24, 6, 0, Math.PI * 2, 0, 0.56), M.glowWindow, 0, 0, -0.245);
    lens.rotation.x = Math.PI / 2; lens.castShadow = false; pw.add(lens);
    pw.updateMatrixWorld(true);
    for (let j = 0; j < 10; j++) {
      const b = (j / 10) * Math.PI * 2;
      const lp = V(Math.cos(b) * 0.225, Math.sin(b) * 0.225, 0.035).applyMatrix4(pw.matrix);
      bolts.add(lp, V(Math.sin(a), 0, Math.cos(a)));
    }
    g.add(pw);
  }
  g.add(rv.build(0.022, M.steel));
  g.add(bolts.build(0.022, M.brass));
  return g;
}

// ═════════════════════ 主体 ═════════════════════
export function createColumbiad(M, ctx) {
  const group = new THREE.Group();
  group.name = 'Columbiad';
  const R = rng(1865);

  const CYCLE = 45, FIRE = 30;            // 每 45 s 开炮一次（第 30 s）
  const E0 = 50 * DEG, ELOW = 48 * DEG;  // 开炮仰角 50°，装填时降到 48°
  const HT = 14, ZT = 3;                 // 炮耳轴心
  const T = V(0, HT, ZT);
  const axisDir = (e) => V(0, Math.sin(e), -Math.cos(e));
  const upDir = (e) => V(0, Math.cos(e), Math.sin(e));

  // 本模块少量自定义材质
  const boreMat = new THREE.MeshStandardMaterial({ color: 0x060606, roughness: 0.95, side: THREE.BackSide });
  const boreCap = new THREE.MeshStandardMaterial({ color: 0x050505, roughness: 1 });
  const warnMat = new THREE.MeshStandardMaterial({ color: 0x501010, emissive: 0xff2010, emissiveIntensity: 0.2, roughness: 0.3 });
  const flagMats = {
    red: new THREE.MeshStandardMaterial({ color: 0x9a1d18, roughness: 0.85, side: THREE.DoubleSide }),
    cream: new THREE.MeshStandardMaterial({ color: 0xeee2c2, roughness: 0.85, side: THREE.DoubleSide }),
    navy: new THREE.MeshStandardMaterial({ color: 0x1b2a50, roughness: 0.85, side: THREE.DoubleSide }),
  };
  const stripeFlag = M.stripeRed;

  const rvS = new Rivets();   // 静态铆钉（铁）
  const rvB = new Rivets();   // 静态螺栓（黄铜）
  const dyn = [];             // 需要逐帧更新的对象

  // ───────────── 1. 三级台阶式石砌台座 ─────────────
  const PX = 8.9, PZ0 = -5.9, PZ1 = 16.4, PCZ = (PZ0 + PZ1) / 2, PD = PZ1 - PZ0;
  for (let k = 0; k < 3; k++) {
    const grow = (2 - k) * 0.42;
    const h = k < 2 ? 0.4 : 0.26;
    group.add(tbox(2 * PX + 2 * grow, h, PD + 2 * grow, M.stone, 0, 0.4 * k + h / 2, PCZ, 3));
  }
  group.add(tbox(2 * PX + 0.14, 0.14, PD + 0.14, M.stone, 0, 1.13, PCZ, 3)); // 压顶石（顶面 y=1.2）
  const TOP = 1.2;
  // 压顶边上的铜嵌条
  for (const sx of [-1, 1]) group.add(tbox(0.05, 0.03, PD + 0.1, M.brass, sx * (PX + 0.06), TOP - 0.06, PCZ, 2));
  for (const sz of [PZ0 - 0.06, PZ1 + 0.06]) group.add(tbox(2 * PX + 0.1, 0.03, 0.05, M.brass, 0, TOP - 0.06, sz, 2));
  // 台面中央：铜质罗盘玫瑰嵌花（炮尾前方）
  {
    const cz = 14.6;
    group.add(U.cyl(1.25, 1.25, 0.02, M.slate, 0, TOP + 0.01, cz, 48));
    const cr = U.torus(1.2, 0.03, M.brass, 0, TOP + 0.02, cz, 6, 64); cr.rotation.x = Math.PI / 2; group.add(cr);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2, L = i % 2 ? 0.7 : 1.15;
      const s = new THREE.Shape([new THREE.Vector2(0, 0.12), new THREE.Vector2(L, 0), new THREE.Vector2(0, -0.12)]);
      const ge = new THREE.ExtrudeGeometry(s, { depth: 0.02, bevelEnabled: false });
      ge.rotateX(Math.PI / 2);
      const m = U.mesh(ge, i % 2 ? M.brass : M.gold, 0, TOP + 0.045, cz); m.rotation.y = a; group.add(m);
    }
  }

  // ───────────── 2. 两座纪念性桥墩：砌石下段 + 铆接铁炮架板 ─────────────
  const PIER_IN = 3.0, PIER_OUT = 5.4, PIER_C = 4.2, PIER_L = 9.0;
  const CH_IN = 3.2, CH_OUT = 5.0, CH_T = CH_OUT - CH_IN, CH_C = (CH_IN + CH_OUT) / 2;
  const MAS_TOP = 7.6;

  function buildPier(s) {
    const x = s * PIER_C;
    // 基座线脚、墩身、檐口
    group.add(tbox(2.95, 0.5, PIER_L + 0.9, M.stone, x, TOP + 0.25, ZT, 3));
    group.add(tbox(2.7, 0.14, PIER_L + 0.5, M.stone, x, TOP + 0.57, ZT, 3));
    group.add(tbox(2.4, 5.5, PIER_L, M.stone, x, 4.45, ZT, 3));
    group.add(tbox(2.62, 0.18, PIER_L + 0.36, M.stone, x, 7.29, ZT, 3));
    group.add(tbox(2.8, 0.22, PIER_L + 0.56, M.stone, x, 7.49, ZT, 3));
    // 隅石（凸出的交错石块）
    for (const cz of [-1, 1]) for (const cx of [PIER_IN, PIER_OUT]) {
      for (let i = 0; i < 9; i++) {
        const y = TOP + 0.71 + 0.58 * i + 0.27;
        if (y > 7.0) continue;
        const lx = i % 2 ? 0.5 : 0.85, lz = i % 2 ? 0.85 : 0.5;
        const sx = cx === PIER_OUT ? 1 : -1;
        group.add(tbox(lx, 0.52, lz, M.stone, s * (cx - sx * (lx / 2 - 0.06)), y, ZT + cz * (PIER_L / 2 - lz / 2 + 0.06), 3));
      }
    }
    // 外立面盲拱：壁柱 + 楔石拱 + 砖砌填心
    const fx = s * (PIER_OUT + 0.06), ay = 4.3, ar = 1.75;
    for (const dz of [-1, 1]) {
      group.add(tbox(0.14, 2.45, 0.5, M.stone, fx, TOP + 0.71 + 1.22, ZT + dz * (ar + 0.25), 3));
      group.add(tbox(0.2, 0.18, 0.66, M.stone, s * (PIER_OUT + 0.08), ay - 0.05, ZT + dz * (ar + 0.25), 3));
    }
    const nV = 13;
    for (let i = 0; i < nV; i++) {
      const a = (i / (nV - 1)) * Math.PI;
      const key = i === (nV - 1) / 2;
      const rm = ar + 0.25;
      const b = tbox(key ? 0.2 : 0.14, key ? 0.75 : 0.5, key ? 0.48 : 0.4, M.stone, fx + (key ? s * 0.03 : 0), ay + Math.sin(a) * (rm + (key ? 0.1 : 0)), ZT + Math.cos(a) * (rm + (key ? 0.1 : 0)), 3);
      b.rotation.x = -(a - Math.PI / 2);
      group.add(b);
    }
    const infill = tbox(0.04, ay - (TOP + 0.71), 2 * ar, M.brick, s * (PIER_OUT + 0.02), (ay + TOP + 0.71) / 2, ZT, 2);
    group.add(infill);
    const half = U.mesh(new THREE.CircleGeometry(ar, 32, 0, Math.PI), M.brick, s * (PIER_OUT + 0.025), ay, ZT);
    half.rotation.y = s * Math.PI / 2;
    scaleUV(half.geometry, 1.6, 1.6);
    group.add(half);
    if (s > 0) {
      const sign = U.signBoard('COLUMBIAD', 2.7, 0.9, { sub: 'GUN CLUB · BALTIMORE', bg: '#20281f', fg: '#e8c675', border: '#c9a24a', edge: M.brass });
      sign.position.set(s * (PIER_OUT + 0.1), 3.35, ZT); sign.rotation.y = Math.PI / 2;
      group.add(sign);
      for (const dz of [-1.25, 1.25]) for (const dy of [-0.35, 0.35]) rvB.add(V(PIER_OUT + 0.15, 3.35 + dy, ZT + dz), V(1, 0, 0));
    } else {
      const med = U.gear({ radius: 0.85, teeth: 24, depth: 0.08, thickness: 0.1, hole: 0.1, spokes: 6, rim: 0.16 }, M.brass);
      med.position.set(s * (PIER_OUT + 0.1), 3.4, ZT); med.rotation.y = Math.PI / 2; group.add(med);
      const boss = U.sphere(0.22, M.brass, s * (PIER_OUT + 0.12), 3.4, ZT, 16, 10); boss.scale.x = 0.5; group.add(boss);
    }

    // 铁炮架板（阶梯形侧板，经典炮车造型）
    const cheek = [[-4.3, MAS_TOP], [4.3, MAS_TOP], [4.3, 9.0], [3.5, 9.0], [3.5, 10.4], [2.7, 10.4], [2.7, 11.8], [1.9, 11.8], [1.9, 14.0], [0.74, 14.0]];
    for (let i = 1; i < 16; i++) { const a = (i / 16) * Math.PI; cheek.push([Math.cos(a) * 0.74, HT - Math.sin(a) * 0.74]); }
    cheek.push([-0.74, 14.0], [-1.9, 14.0], [-1.9, 11.8], [-2.7, 11.8], [-2.7, 10.4], [-3.5, 10.4], [-3.5, 9.0], [-4.3, 9.0]);
    const ck = extrudeZY(cheek.map(([z, y]) => [z + ZT, y]), CH_T, M.iron, s * CH_C, 3.2);
    group.add(ck);
    // 角铁包边 + 铆钉（两面）
    const outline = [[-4.3, MAS_TOP], [-4.3, 9.0], [-3.5, 9.0], [-3.5, 10.4], [-2.7, 10.4], [-2.7, 11.8], [-1.9, 11.8], [-1.9, 14.0], [-0.74, 14.0]];
    const outlineR = outline.map(([z, y]) => [-z, y]).reverse();
    for (const ol of [outline, outlineR]) {
      for (let i = 0; i < ol.length - 1; i++) {
        const [z0, y0] = ol[i], [z1, y1] = ol[i + 1];
        const len = Math.hypot(z1 - z0, y1 - y0);
        for (const face of [CH_OUT, CH_IN]) {
          const fn = face === CH_OUT ? 1 : -1;
          const fxp = s * (face + fn * 0.03);
          const horiz = Math.abs(y1 - y0) < 1e-6;
          // 角铁条贴边内缩 0.09
          const inset = 0.09;
          const midz = (z0 + z1) / 2 + ZT, midy = (y0 + y1) / 2;
          const nz = horiz ? 0 : (ol === outline ? (z0 < 0 ? 1 : 1) : -1), ny = horiz ? -1 : 0;
          const b = horiz ? tbox(0.06, 0.18, len + 0.18, M.ironPlain, fxp, midy + ny * inset, midz, 2) : tbox(0.06, len + 0.18, 0.18, M.ironPlain, fxp, midy, midz + nz * inset * (ol === outline ? 1 : 1), 2);
          group.add(b);
          // 铆钉列
          const oz = horiz ? 0 : nz * 0.09 * (ol === outline ? 1 : 1);
          const oy = horiz ? -0.09 : 0;
          rvS.line(V(s * (face + fn * 0.06), y0 + oy, z0 + ZT + oz), V(s * (face + fn * 0.06), y1 + oy, z1 + ZT + oz), 0.3, V(s * fn, 0, 0));
        }
      }
    }
    // 底部水平角铁 + 竖向加劲肋
    for (const face of [CH_OUT, CH_IN]) {
      const fn = face === CH_OUT ? 1 : -1;
      group.add(tbox(0.12, 0.22, 8.8, M.ironPlain, s * (face + fn * 0.06), MAS_TOP + 0.11, ZT, 2));
      rvS.line(V(s * (face + fn * 0.12), MAS_TOP + 0.13, ZT - 4.2), V(s * (face + fn * 0.12), MAS_TOP + 0.13, ZT + 4.2), 0.3, V(s * fn, 0, 0));
      if (face === CH_OUT) for (const rz of [-2.3, 2.3]) {
        const top = Math.abs(rz) < 1.9 ? 14 : (Math.abs(rz) < 2.7 ? 11.8 : 10.4);
        group.add(tbox(0.16, top - MAS_TOP - 0.4, 0.1, M.ironPlain, s * (face + 0.08), (top + MAS_TOP) / 2 + 0.05, ZT + rz, 2));
        rvS.line(V(s * (face + 0.165), MAS_TOP + 0.4, ZT + rz), V(s * (face + 0.165), top - 0.25, ZT + rz), 0.28, V(s, 0, 0));
      }
    }
    // 炮耳轴承：盖板（半圆）+ 螺栓 + 黄铜衬套
    const cap = U.mesh(new THREE.CylinderGeometry(1.0, 1.0, CH_T + 0.1, 28, 1, false, Math.PI, Math.PI), M.ironPlain, s * CH_C, HT, ZT);
    cap.rotation.z = -Math.PI / 2; group.add(cap);
    for (const dz of [-1.2, 1.2]) {
      group.add(tbox(CH_T + 0.1, 0.12, 0.6, M.ironPlain, s * CH_C, 14.06, ZT + dz, 2));
      for (const dx of [-0.5, 0.5]) {
        group.add(U.cyl(0.07, 0.07, 0.5, M.steel, s * CH_C + dx, 14.3, ZT + dz, 8));
        group.add(U.cyl(0.12, 0.12, 0.1, M.brass, s * CH_C + dx, 14.17, ZT + dz, 6));
        group.add(U.cyl(0.11, 0.11, 0.09, M.steel, s * CH_C + dx, 14.5, ZT + dz, 6));
      }
    }
    for (const fx2 of [CH_OUT + 0.02, CH_IN - 0.02]) {
      const bush = U.torus(0.74, 0.07, M.brass, s * fx2, HT, ZT, 8, 40);
      bush.rotation.y = Math.PI / 2; group.add(bush);
    }
    // 炮架前端横梁（两侧板之间，位于炮管下方安全区域）
    if (s > 0) {
      group.add(tbox(2 * CH_IN, 1.1, 0.6, M.iron, 0, 8.65, ZT - 3.6, 3));
      group.add(tbox(2 * CH_IN, 0.12, 0.8, M.ironPlain, 0, 9.25, ZT - 3.6, 2));
      group.add(tbox(2 * CH_IN, 0.12, 0.8, M.ironPlain, 0, 8.05, ZT - 3.6, 2));
      rvS.line(V(-CH_IN + 0.2, 8.65, ZT - 3.92), V(CH_IN - 0.2, 8.65, ZT - 3.92), 0.3, V(0, 0, -1));
      // 前部 X 形拉杆
      for (const sd of [-1, 1]) group.add(U.rod(V(-sd * CH_IN, MAS_TOP + 0.25, ZT - 4.25), V(sd * CH_IN, 8.85, ZT - 4.25), 0.05, M.steel, 8));
      // 后部低位石砌横墙（炮尾下方）
      group.add(tbox(2 * PIER_IN, 0.9, 1.0, M.stone, 0, TOP + 0.45, ZT + 4.0, 3));
      group.add(tbox(2 * PIER_IN + 0.1, 0.12, 1.12, M.stone, 0, TOP + 0.96, ZT + 4.0, 3));
    }
  }
  buildPier(1); buildPier(-1);

  // ───────────── 3. 俯仰机构（随炮管转动）+ 炮管 ─────────────
  const elev = new THREE.Group();
  elev.position.copy(T); elev.rotation.x = E0 - Math.PI / 2;
  elev.userData.dynamic = true; group.add(elev);
  const recoilG = new THREE.Group(); recoilG.userData.dynamic = true; elev.add(recoilG);
  const rvBar = new Rivets(), rvBarB = new Rivets();

  // 炮管外轮廓 [r, y]（局部 +Y 为炮膛轴线，炮口 y=23.6，炮钮尖 y=−14.4，全长 38 m）
  const body = [
    [0.0, -14.4], [0.22, -14.37], [0.38, -14.28], [0.47, -14.14], [0.5, -13.98], [0.47, -13.82], [0.38, -13.7], // 炮钮球
    [0.3, -13.62], [0.3, -13.52], [0.44, -13.48], [0.44, -13.41], // 颈 + 圆箍
    [0.9, -13.37], [1.5, -13.29], [1.95, -13.15], [2.28, -12.93], [2.48, -12.63], [2.58, -12.26], [2.6, -11.92], // 圆弧炮尾（罗德曼式）
    [2.69, -11.88], [2.69, -11.54], [2.6, -11.5], // 炮尾环
    [2.58, -11.0], [2.56, -9.0], [2.52, -7.0], [2.48, -5.62], // 第一加强段
    [2.56, -5.58], [2.56, -5.28], [2.46, -5.24], // 加强环
    [2.42, -3.0], [2.36, 0.0], [2.3, 3.0], [2.25, 4.6],
    [2.32, 4.64], [2.32, 4.92], [2.22, 4.96], // 第二加强环
    [2.12, 6.5], [1.99, 9.0], [1.87, 12.0], [1.77, 15.0], [1.67, 18.0], [1.61, 19.78], // 炮身
    [1.68, 19.82], [1.68, 20.16], [1.6, 20.2], // 炮颈带
    [1.55, 20.6], [1.54, 21.2], [1.58, 21.55], [1.66, 22.05], [1.74, 22.55], [1.79, 22.95], // 炮口膨出
    [1.85, 22.99], [1.85, 23.26], [1.8, 23.3], // 炮口铁箍
  ];
  const mainProf = body.slice(20); // 单调 y 段，用于求半径
  const rAt = (y) => {
    for (let i = 0; i < mainProf.length - 1; i++) {
      const [r0, y0] = mainProf[i], [r1, y1] = mainProf[i + 1];
      if (y >= y0 && y <= y1 && y1 > y0) return r0 + (r1 - r0) * (y - y0) / (y1 - y0);
    }
    return 1.6;
  };
  recoilG.add(crispLathe(body, M.ironPlain, { seg: 72, tileU: 6, tileV: 4, angle: 38 }));
  // 炮口冠（黄铜）+ 膛口内壁
  recoilG.add(crispLathe([[1.8, 23.3], [1.87, 23.33], [1.87, 23.5], [1.82, 23.6], [1.25, 23.62], [0.98, 23.6], [0.92, 23.52]], M.brass, { seg: 72, tileU: 8, angle: 30 }));
  recoilG.add(crispLathe([[0.92, 23.52], [0.92, 21.0]], M.ironPlain, { seg: 48, tileU: 3, tileV: 2 }));
  const bore = U.mesh(new THREE.CylinderGeometry(0.92, 0.92, 17, 32, 1, true), boreMat, 0, 12.5, 0); bore.castShadow = false; recoilG.add(bore);
  const boreBottom = U.mesh(new THREE.CircleGeometry(0.92, 24), boreCap, 0, 4.05, 0); boreBottom.rotation.x = -Math.PI / 2; recoilG.add(boreBottom);
  // 黄铜加强箍 + 铆钉
  const bands = [[-10.62, -10.12, true], [-8.0, -7.62, false], [-3.65, -3.2, true], [6.55, 6.95, true], [10.95, 11.3, false], [15.15, 15.45, false], [18.55, 18.85, false]];
  for (const [y0, y1, riv] of bands) {
    const r0 = rAt(y0), r1 = rAt(y1);
    recoilG.add(crispLathe([[r0 - 0.02, y0], [r0 + 0.06, y0 + 0.025], [r0 + 0.07, y0 + 0.07], [r1 + 0.07, y1 - 0.07], [r1 + 0.06, y1 - 0.025], [r1 - 0.02, y1]], M.brass, { seg: 72, tileU: 10, tileV: 0.6, angle: 30 }));
    if (riv) { const rm = rAt((y0 + y1) / 2) + 0.07; rvBarB.ring(rm, (y0 + y1) / 2, Math.round((Math.PI * 2 * rm) / 0.26)); }
  }
  // 锻铁炮耳箍（铆接）
  {
    const y0 = -1.45, y1 = 1.45, r0 = rAt(y0) + 0.09, r1 = rAt(y1) + 0.09;
    recoilG.add(crispLathe([[r0 - 0.1, y0], [r0, y0 + 0.05], [r0, y0 + 0.12], [r1, y1 - 0.12], [r1, y1 - 0.05], [r1 - 0.1, y1]], M.iron, { seg: 72, tileU: 5, tileV: 3.2, angle: 30 }));
    rvBar.ring(r0 + 0.002, y0 + 0.2, 64); rvBar.ring(r1 + 0.002, y1 - 0.2, 64);
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * Math.PI * 2 + Math.PI / 16;
      if (Math.abs(Math.sin(a)) > 0.85) continue; // 让开炮耳
      for (let y = -0.95; y <= 0.96; y += 0.32) { const rr = rAt(y) + 0.092; rvBar.add(V(Math.sin(a) * rr, y, Math.cos(a) * rr), V(Math.sin(a), 0, Math.cos(a))); }
    }
  }
  // 炮耳（沿局部 X）+ 耳根盘
  for (const s of [-1, 1]) {
    const tr = crispLathe([[1.15, 0], [1.12, 0.05], [0.95, 0.12], [0.8, 0.24], [0.7, 0.42], [0.68, 0.55], [0.68, 3.35], [0.66, 3.4], [0.5, 3.42], [0.0, 3.43]], M.ironPlain, { seg: 40, tileU: 2, tileV: 1.5, angle: 35 });
    tr.position.x = s * 2.42; tr.rotation.z = -s * Math.PI / 2; recoilG.add(tr);
  }
  // 海豚提耳（炮身顶部一对卷曲把手）
  for (const sx of [-0.78, 0.78]) {
    const zs = (y) => Math.sqrt(Math.max(0, rAt(y) ** 2 - sx * sx));
    const pts = [V(sx, 1.65, zs(1.65) - 0.05), V(sx, 1.95, zs(1.95) + 0.55), V(sx, 2.6, zs(2.6) + 0.95), V(sx * 0.98, 3.4, zs(3.4) + 0.9), V(sx * 0.97, 4.05, zs(4.05) + 0.45), V(sx, 4.25, zs(4.25) - 0.04)];
    recoilG.add(U.tube(pts, 0.13, M.brass, false, 40, 10));
    for (const [y, sc] of [[1.65, 1], [4.25, 0.9]]) { const p = U.sphere(0.22 * sc, M.brass, sx, y, zs(y) - 0.02, 14, 10); p.scale.set(1, 1.4, 0.55); p.rotation.x = 0; recoilG.add(p); }
    const curl = U.torus(0.2, 0.06, M.brass, sx, 2.72, zs(2.72) + 1.12, 8, 20, Math.PI * 1.5);
    curl.rotation.y = Math.PI / 2; recoilG.add(curl);
    recoilG.add(U.sphere(0.09, M.gold, sx, 2.72, zs(2.72) + 1.32, 10, 8));
  }
  // 点火孔座、表尺与准星
  {
    const yv = -10.95, rv0 = rAt(yv);
    const vent = crispLathe([[0.38, 0], [0.36, 0.06], [0.3, 0.1], [0.3, 0.2], [0.18, 0.24], [0.06, 0.26], [0.06, 0.3], [0, 0.3]], M.brass, { seg: 24 });
    vent.position.set(0, yv, rv0 - 0.05); vent.rotation.x = Math.PI / 2; recoilG.add(vent);
    recoilG.add(tbox(0.08, 0.5, 0.62, M.brass, 0, -11.25, rAt(-11.25) + 0.26, 1));
    recoilG.add(tbox(0.22, 0.12, 0.08, M.brass, 0, -11.25, rAt(-11.25) + 0.58, 1));
    recoilG.add(tbox(0.06, 0.32, 0.36, M.brass, 0, 22.75, rAt(22.75) + 0.14, 1));
    // 炮钮环（吊环）
    const loop = U.torus(0.33, 0.07, M.brass, 0, -13.57, 0, 8, 28);
    loop.rotation.x = Math.PI / 2; recoilG.add(loop);
  }
  recoilG.add(rvBar.build(0.05, M.ironPlain));
  recoilG.add(rvBarB.build(0.045, M.brass));
  U.mergeStatic(recoilG);

  // 发射用炮弹：炮膛内待发（隐藏），开炮后沿轴线飞出
  const launch = makeProjectile(M);
  U.mergeStatic(launch);
  launch.userData.dynamic = true; launch.visible = false;
  const restLaunch = () => { launch.position.copy(T).addScaledVector(axisDir(E0), 19.8); launch.rotation.set(E0 - Math.PI / 2, 0, 0); };
  restLaunch();
  group.add(launch);
  const launchTrail = U.mesh(new THREE.ConeGeometry(0.75, 14, 20, 1, true), new THREE.MeshBasicMaterial({ color: 0xffc070, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }), 0, -7, 0);
  launchTrail.rotation.x = Math.PI; launchTrail.castShadow = false; launch.add(launchTrail);

  // ───────────── 4. 巨型俯仰齿扇（两侧，随炮管转动）+ 齿轮传动 ─────────────
  const RS = 4.2, TD = 0.16;          // 齿扇节圆、齿高
  const aMid = Math.atan2(-Math.cos(E0), -Math.sin(E0)); // 指向世界正下方的局部角度
  const SPAN = 38 * DEG, SX = 5.72;
  const sectorG = new THREE.Group(); elev.add(sectorG);
  const permute = new THREE.Matrix4().set(0, 0, 1, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1); // 形状(x,y,挤出z) → 局部(y,z,x)
  const LP = (x, rho, a) => V(x, Math.cos(a) * rho, Math.sin(a) * rho);
  for (const s of [-1, 1]) {
    const x = s * SX;
    // 齿圈
    const sh = new THREE.Shape();
    const nT = 22; const a0 = aMid - SPAN, a1 = aMid + SPAN;
    sh.moveTo(Math.cos(a0) * (RS - 0.55), Math.sin(a0) * (RS - 0.55));
    for (let i = 0; i <= nT * 4; i++) {
      const a = a0 + (a1 - a0) * (i / (nT * 4));
      const ph = i % 4; const r = (ph === 1 || ph === 2) ? RS + TD : RS;
      sh.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    for (let i = 24; i >= 0; i--) { const a = a0 + (a1 - a0) * (i / 24); sh.lineTo(Math.cos(a) * (RS - 0.55), Math.sin(a) * (RS - 0.55)); }
    const sg = new THREE.ExtrudeGeometry(sh, { depth: 0.26, bevelEnabled: true, bevelSize: 0.02, bevelThickness: 0.02, bevelSegments: 1, curveSegments: 4 });
    sg.translate(0, 0, -0.13); sg.applyMatrix4(permute); sg.translate(x, 0, 0);
    scaleUV(sg, 0.3, 0.3);
    sectorG.add(U.mesh(sg, M.ironPlain));
    // 内缘法兰（黄铜）
    const fl = new THREE.Shape();
    for (let i = 0; i <= 30; i++) { const a = a0 + (a1 - a0) * (i / 30); const p = [Math.cos(a) * (RS - 0.5), Math.sin(a) * (RS - 0.5)]; i ? fl.lineTo(...p) : fl.moveTo(...p); }
    for (let i = 30; i >= 0; i--) { const a = a0 + (a1 - a0) * (i / 30); fl.lineTo(Math.cos(a) * (RS - 0.7), Math.sin(a) * (RS - 0.7)); }
    const fg = new THREE.ExtrudeGeometry(fl, { depth: 0.42, bevelEnabled: false, curveSegments: 4 });
    fg.translate(0, 0, -0.21); fg.applyMatrix4(permute); fg.translate(x, 0, 0);
    sectorG.add(U.mesh(fg, M.brass));
    // 轮毂 + 辐条 + 斜撑
    const hub = crispLathe([[0.0, -0.22], [0.95, -0.22], [1.0, -0.17], [1.0, 0.17], [0.95, 0.22], [0.45, 0.25], [0.4, 0.34], [0.0, 0.34]], M.ironPlain, { seg: 36 });
    hub.position.x = x; hub.rotation.z = -s * Math.PI / 2; sectorG.add(hub);
    sectorG.add(U.sphere(0.32, M.brass, x + s * 0.34, 0, 0, 16, 10));
    for (const da of [-SPAN + 0.06, -SPAN / 2, 0, SPAN / 2, SPAN - 0.06]) {
      const a = aMid + da;
      sectorG.add(U.rod(LP(x, 0.9, a), LP(x, RS - 0.62, a), Math.abs(da) < 0.01 ? 0.15 : 0.11, M.ironPlain, 10));
    }
    for (const da of [-SPAN / 2, SPAN / 2]) sectorG.add(U.rod(LP(x, RS - 0.62, aMid), LP(x, 2.4, aMid + da * 1.6), 0.06, M.steel, 8));
    // 齿扇与炮耳的连接键板
    const key = tbox(0.3, 0.5, 1.3, M.ironPlain, x, 0, 0, 1); sectorG.add(key);
  }
  U.mergeStatic(sectorG);
  // 小齿轮 + 大齿轮 + 小齿轮 + 手轮（固定在炮架外侧，转角随仰角联动）
  const gearDyn = [];
  const PIN_R = 0.6, PIN_C = RS + TD / 2 + PIN_R + 0.07;
  const PY = HT - PIN_C, BIG_R = 1.15, SM_R = 0.42;
  const smOff = V(0, -0.82, 1.5).normalize().multiplyScalar(BIG_R + SM_R + 0.13);
  for (const s of [-1, 1]) {
    const mk = (r, teeth, th, mat, x, y, z, ratio, spokes = 0) => {
      const holder = new THREE.Group(); holder.position.set(x, y, z); holder.rotation.y = Math.PI / 2;
      const gm = U.gear({ radius: r, teeth, depth: 0.12, thickness: th, hole: 0.08, spokes, rim: r * 0.2 }, mat);
      holder.add(gm); group.add(holder);
      holder.userData.dynamic = true; gearDyn.push({ g: gm, ratio, base: R() * 2 });
    };
    mk(PIN_R, 13, 0.32, M.steel, s * SX, PY, ZT, -(RS + TD / 2) / (PIN_R + 0.06));
    mk(BIG_R, 28, 0.2, M.brass, s * 6.2, PY, ZT, -(RS + TD / 2) / (PIN_R + 0.06), 5);
    mk(SM_R, 10, 0.24, M.steel, s * 6.2, PY + smOff.y, ZT + smOff.z, (RS + TD / 2) / (PIN_R + 0.06) * (BIG_R / SM_R));
    // 手轮
    const hw = new THREE.Group(); hw.position.set(s * 6.75, PY + smOff.y, ZT + smOff.z); hw.userData.dynamic = true;
    const rim = U.torus(0.78, 0.055, M.brass, 0, 0, 0, 8, 40); rim.rotation.y = Math.PI / 2; hw.add(rim);
    for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI * 2; hw.add(U.rod(V(0, 0, 0), V(0, Math.cos(a) * 0.76, Math.sin(a) * 0.76), 0.035, M.brass, 6)); }
    hw.add(U.cyl(0.13, 0.13, 0.22, M.brass, 0, 0, 0, 14)); hw.children[hw.children.length - 1].rotation.z = Math.PI / 2;
    hw.add(U.rod(V(s * 0.02, 0.78, 0), V(s * 0.32, 0.78, 0), 0.04, M.woodDark, 8));
    group.add(hw); gearDyn.push({ g: hw, ratio: (RS + TD / 2) / (PIN_R + 0.06) * (BIG_R / SM_R), base: 0, axisX: true });
    // 轴与外伸轴承架
    group.add(U.rod(V(s * CH_OUT, PY, ZT), V(s * 6.55, PY, ZT), 0.12, M.steel, 12));
    group.add(U.rod(V(s * CH_OUT, PY + smOff.y, ZT + smOff.z), V(s * 6.95, PY + smOff.y, ZT + smOff.z), 0.09, M.steel, 12));
    const brk = tbox(0.14, 2.3, 0.5, M.ironPlain, s * 6.55, PY + smOff.y / 2, ZT + smOff.z / 2, 2); brk.rotation.x = Math.atan2(1.5, -0.82); group.add(brk);
    for (const [yy, zz] of [[PY, ZT], [PY + smOff.y, ZT + smOff.z]]) {
      const bb = U.cyl(0.22, 0.22, 0.2, M.brass, s * 6.55, yy, zz, 16); bb.rotation.z = Math.PI / 2; group.add(bb);
    }
    for (const [yy, zz] of [[PY + 1.2, ZT - 0.6], [PY - 1.6, ZT + 2.0]]) group.add(U.rod(V(s * CH_OUT, yy, zz), V(s * 6.55, (yy + PY) / 2 - 0.2, (zz + ZT) / 2 + 0.4), 0.06, M.ironPlain, 8));
  }

  // ───────────── 5. 炮口闪光 + 硝烟 ─────────────
  const flashTex = softTexture([[0, 'rgba(255,255,240,1)'], [0.25, 'rgba(255,220,140,0.95)'], [0.6, 'rgba(255,140,40,0.35)'], [1, 'rgba(255,90,10,0)']]);
  const smokeTex = softTexture([[0, 'rgba(255,255,255,0.95)'], [0.45, 'rgba(255,255,255,0.6)'], [1, 'rgba(255,255,255,0)']]);
  const flashSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: flashTex, color: 0xffe0a0, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0 }));
  flashSprite.position.set(0, 25.0, 0); flashSprite.visible = false; elev.add(flashSprite);
  const coneGeo = new THREE.ConeGeometry(3.2, 11, 28, 1, true); coneGeo.rotateX(Math.PI); coneGeo.translate(0, 5.5, 0);
  const flashCone = U.mesh(coneGeo, new THREE.MeshBasicMaterial({ color: 0xffa040, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }), 0, 23.7, 0);
  flashCone.castShadow = false; flashCone.visible = false; elev.add(flashCone);
  const flashCore = U.mesh(new THREE.SphereGeometry(1.6, 20, 14), new THREE.MeshBasicMaterial({ color: 0xfff2d0, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }), 0, 24.4, 0);
  flashCore.castShadow = false; flashCore.visible = false; elev.add(flashCore);

  const smokeG = new THREE.Group(); smokeG.userData.dynamic = true; group.add(smokeG);
  const puffs = [];
  const dirF = axisDir(E0), upF = upDir(E0), sideF = V(1, 0, 0);
  const muzzleW = T.clone().addScaledVector(dirF, 24.0);
  const flightS = (u) => 19.8 + 38 * u + 14 * u * u; // 炮弹基座沿轴线距离
  const mkPuff = (o) => {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: smokeTex, color: o.color || 0xdcd6cb, transparent: true, depthWrite: false, opacity: 0 }));
    sp.visible = false; Object.assign(sp.userData, o); sp.userData.base = new THREE.Color(o.color || 0xdcd6cb); smokeG.add(sp); puffs.push(sp);
  };
  for (let i = 0; i < 18; i++) { // 沿炮轴喷出的主烟柱
    const sp = 0.16; const d = dirF.clone().addScaledVector(sideF, (R() - 0.5) * sp).addScaledVector(upF, (R() - 0.5) * sp).normalize();
    mkPuff({ kind: 'jet', delay: R() * 0.25, v0: 18 + R() * 42, k: 1.1 + R() * 0.9, dir: d, s0: 3 + R() * 2, s1: 9 + R() * 8, life: 9 + R() * 5, op: 0.75 + R() * 0.2 });
  }
  for (let i = 0; i < 12; i++) { // 炮口涡环
    const a = (i / 12) * Math.PI * 2 + R() * 0.3;
    const d = sideF.clone().multiplyScalar(Math.cos(a)).addScaledVector(upF, Math.sin(a)).addScaledVector(dirF, 0.25).normalize();
    mkPuff({ kind: 'ring', delay: 0.03 + R() * 0.08, v0: 12 + R() * 8, k: 2.4 + R(), dir: d, s0: 2.5, s1: 7 + R() * 3, life: 7 + R() * 3, op: 0.7 });
  }
  for (let i = 0; i < 8; i++) { // 地面震起的尘土
    const a = (i / 8) * Math.PI * 2 + R() * 0.4;
    mkPuff({ kind: 'dust', delay: 0.1 + R() * 0.2, v0: 6 + R() * 5, k: 1.6, dir: V(Math.cos(a), 0.12, Math.sin(a)), origin: V(Math.cos(a) * 6, 1.6, ZT + 4 + Math.sin(a) * 9), s0: 2, s1: 6 + R() * 3, life: 5 + R() * 2, op: 0.45, color: 0xbba88a });
  }
  for (let i = 0; i < 16; i++) { // 炮弹拖出的尾迹
    const te = 0.12 + i * 0.2;
    mkPuff({ kind: 'trail', delay: te, origin: T.clone().addScaledVector(dirF, flightS(te)), s0: 1.6 + i * 0.15, s1: 6 + i * 0.5, life: 6 + R() * 2, op: 0.55 - i * 0.02, color: 0xe6e1d8 });
  }
  const wind = V(1.1, 0, 0.35);

  // ───────────── 6. 钢桁架塔吊（−X/−Z 侧） ─────────────
  const TWR = V(-13, 0, -9);
  const tower = new THREE.Group(); tower.position.copy(TWR); group.add(tower);
  const TH = 34, hw0 = 2.0, hw1 = 1.4, NP = 10;
  const thw = (y) => hw0 + (hw1 - hw0) * (y / TH);
  const corners = [[1, 1], [1, -1], [-1, -1], [-1, 1]];
  const CP = (c, y) => V(c[0] * thw(y), y, c[1] * thw(y));
  for (const c of corners) {
    tower.add(U.rod(CP(c, 0.6), CP(c, TH), 0.17, M.ironPlain, 8, 0.14));
    tower.add(tbox(1.3, 0.6, 1.3, M.stone, c[0] * hw0, 0.3, c[1] * hw0, 2));
    tower.add(tbox(0.7, 0.08, 0.7, M.ironPlain, c[0] * hw0, 0.64, c[1] * hw0, 1));
    for (const dx of [-0.25, 0.25]) for (const dz of [-0.25, 0.25]) tower.add(U.cyl(0.04, 0.05, 0.12, M.brass, c[0] * hw0 + dx, 0.72, c[1] * hw0 + dz, 6));
  }
  for (let i = 0; i <= NP; i++) {
    const y = 0.6 + (TH - 0.6) * (i / NP), yn = 0.6 + (TH - 0.6) * ((i + 1) / NP);
    for (let k = 0; k < 4; k++) {
      const c1 = corners[k], c2 = corners[(k + 1) % 4];
      if (i > 0) tower.add(U.rod(CP(c1, y), CP(c2, y), 0.08, M.ironPlain, 6));
      if (i < NP) {
        tower.add(U.rod(CP(c1, y), CP(c2, yn), 0.05, M.ironPlain, 5));
        tower.add(U.rod(CP(c2, y), CP(c1, yn), 0.05, M.ironPlain, 5));
      }
      tower.add(U.cyl(0.22, 0.22, 0.3, M.ironPlain, CP(c1, y).x, y, CP(c1, y).z, 8));
      if (i % 2 === 0) tower.add(U.sphere(0.1, M.brass, CP(c1, y).x * 1.06, y, CP(c1, y).z * 1.06, 8, 6));
    }
  }
  // 平台（两处中间平台 + 顶平台）
  for (const py of [0.6 + (TH - 0.6) * 0.4, 0.6 + (TH - 0.6) * 0.7, TH]) {
    const w = 2 * thw(py) + 1.3;
    tower.add(tbox(w, 0.14, w, M.woodDark, 0, py + 0.07, 0, 2));
    for (const sx of [-1, 1]) { tower.add(tbox(w + 0.1, 0.22, 0.12, M.ironPlain, 0, py - 0.04, sx * w / 2, 2)); tower.add(tbox(0.12, 0.22, w + 0.1, M.ironPlain, sx * w / 2, py - 0.04, 0, 2)); }
    const h = w / 2 - 0.05;
    tower.add(U.railing([V(h, py + 0.14, 0.55), V(h, py + 0.14, h), V(-h, py + 0.14, h), V(-h, py + 0.14, -h), V(h, py + 0.14, -h), V(h, py + 0.14, -0.55)], { height: 1.0, mat: M.ironPlain, postMat: M.ironPlain, baluster: 0, postEvery: 1.3, rail: 0.03 }));
  }
  // 爬梯 + 护笼（朝 +X，面向大炮）
  {
    const lx = (y) => thw(y) + 0.45;
    for (const z of [-0.28, 0.28]) tower.add(U.rod(V(lx(0), 0, z), V(lx(TH), TH + 1.1, z), 0.035, M.steel, 6));
    for (let y = 0.3; y < TH + 1; y += 0.32) tower.add(U.rod(V(lx(y), y, -0.28), V(lx(y), y, 0.28), 0.018, M.steel, 5));
    for (let y = 2.6; y < TH; y += 1.05) {
      const hoop = U.torus(0.45, 0.022, M.steel, lx(y), y, 0, 4, 16, Math.PI);
      hoop.rotation.order = 'YXZ'; hoop.rotation.set(-Math.PI / 2, -Math.PI / 2, 0); tower.add(hoop);
    }
    for (const a of [-Math.PI / 3, 0, Math.PI / 3]) tower.add(U.rod(V(lx(2.6) + Math.cos(a) * 0.45, 2.6, Math.sin(a) * 0.45), V(lx(TH) + Math.cos(a) * 0.45, TH - 0.3, Math.sin(a) * 0.45), 0.018, M.steel, 4));
  }
  // 顶部回转齿圈（固定）
  {
    const rg = U.gear({ radius: 1.55, teeth: 48, depth: 0.08, thickness: 0.18, hole: 1.25, spokes: 0 }, M.brass);
    rg.rotation.x = Math.PI / 2; rg.position.y = TH + 0.25; tower.add(rg);
  }
  // 回转塔吊（动态）
  const crane = new THREE.Group(); crane.position.set(TWR.x, TH + 0.35, TWR.z); crane.userData.dynamic = true; group.add(crane);
  {
    crane.add(U.cyl(1.45, 1.45, 0.3, M.steel, 0, 0.15, 0, 32));
    crane.add(tbox(3.6, 0.25, 2.8, M.ironPlain, -0.3, 0.42, 0, 2));
    // 机房：木板墙 + 石板瓦双坡顶 + 发光窗
    crane.add(tbox(2.4, 2.0, 2.4, M.wood, -0.7, 1.55, 0, 2.5));
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) crane.add(tbox(0.12, 2.0, 0.12, M.paintRed, -0.7 + sx * 1.2, 1.55, sz * 1.2, 1));
    for (const sz of [-1, 1]) { const rf = tbox(2.8, 0.08, 1.55, M.slate, -0.7, 2.95, sz * 0.62, 2); rf.rotation.x = sz * 0.5; crane.add(rf); }
    crane.add(U.cyl(0.07, 0.07, 2.85, M.copper, -0.7, 3.32, 0, 8)); crane.children[crane.children.length - 1].rotation.z = Math.PI / 2;
    for (const sx of [-1, 1]) { const gs = new THREE.Shape([new THREE.Vector2(-1.2, 0), new THREE.Vector2(1.2, 0), new THREE.Vector2(0, 0.75)]); const gg = new THREE.ExtrudeGeometry(gs, { depth: 0.06, bevelEnabled: false }); gg.rotateY(Math.PI / 2); scaleUV(gg, 0.4, 0.4); crane.add(U.mesh(gg, M.wood, -0.7 + sx * 1.2 - 0.03, 2.55, 0)); }
    for (const [x, z, ry] of [[0.52, 0, Math.PI / 2], [-0.7, 1.22, 0], [-0.7, -1.22, 0]]) {
      const w = U.box(0.9, 0.7, 0.05, M.glowWindow, x, 1.85, z); w.rotation.y = ry; w.castShadow = false; crane.add(w);
      const fr = U.box(1.02, 0.08, 0.08, M.paintCream, x, 2.22, z); fr.rotation.y = ry; crane.add(fr);
      const fr2 = U.box(1.02, 0.08, 0.08, M.paintCream, x, 1.48, z); fr2.rotation.y = ry; crane.add(fr2);
    }
    // A 字桅杆 + 拉杆
    const apex = V(0, 7.2, 0);
    for (const sz of [-1, 1]) { crane.add(U.rod(V(0.4, 0.55, sz * 1.2), apex, 0.1, M.ironPlain, 8)); crane.add(U.rod(V(-1.6, 0.55, sz * 1.2), apex, 0.09, M.ironPlain, 8)); }
    crane.add(U.rod(V(0.18, 3.5, -0.6), V(0.18, 3.5, 0.6), 0.06, M.ironPlain, 6));
    crane.add(U.sphere(0.18, M.brass, 0, 7.25, 0, 12, 8));
    const warn = U.sphere(0.2, warnMat, 0, 7.55, 0, 14, 10); warn.castShadow = false; crane.add(warn);
    crane.add(U.cyl(0.24, 0.26, 0.06, M.paintBlack, 0, 7.36, 0, 12));
    crane.add(U.cyl(0.02, 0.2, 0.18, M.paintBlack, 0, 7.82, 0, 10));
    // 起重臂（三角断面桁架）与平衡臂
    crane.add(U.truss(V(0.9, 1.2, 0), V(15, 1.4, 0), 1.0, M.ironPlain, { side: V(0, 0, -1), threeD: true, r: 0.07 }));
    crane.add(U.truss(V(-1.6, 1.2, 0), V(-7.2, 1.2, 0), 1.0, M.ironPlain, { side: V(0, 0, -1), threeD: true, r: 0.07 }));
    crane.add(U.rod(apex, V(15, 1.9, 0), 0.045, M.steel, 6));
    crane.add(U.rod(apex, V(8, 1.85, 0), 0.04, M.steel, 6));
    for (const sz of [-0.5, 0.5]) crane.add(U.rod(apex, V(-7.0, 1.2, sz), 0.045, M.steel, 6));
    crane.add(tbox(1.3, 1.9, 1.6, M.stone, -6.6, 0.25, 0, 2));
    for (let i = 0; i < 3; i++) crane.add(tbox(1.4, 0.08, 1.7, M.ironPlain, -6.6, -0.5 + i * 0.6 + 0.3, 0, 1));
    const tip = U.cyl(0.35, 0.35, 0.18, M.brass, 15.1, 1.4, 0, 20); tip.rotation.x = Math.PI / 2; crane.add(tip);
    // 小车 + 吊索 + 吊钩 + 火棉弹药箱
    const trolley = new THREE.Group(); trolley.userData.dynamic = true; trolley.position.set(10, 1.05, 0); crane.add(trolley);
    trolley.add(tbox(0.9, 0.3, 1.1, M.paintRed, 0, 0, 0, 1));
    for (const dx of [-0.3, 0.3]) for (const sz of [-0.55, 0.55]) { const wh = U.cyl(0.12, 0.12, 0.06, M.steel, dx, 0.18, sz, 12); wh.rotation.x = Math.PI / 2; trolley.add(wh); }
    const cableGeo = new THREE.CylinderGeometry(0.025, 0.025, 1, 6); cableGeo.translate(0, -0.5, 0);
    const cable = U.mesh(cableGeo, M.steel, 0, -0.15, 0); cable.userData.dynamic = true; trolley.add(cable);
    const hook = new THREE.Group(); hook.userData.dynamic = true; trolley.add(hook);
    hook.add(tbox(0.42, 0.55, 0.28, M.paintRed, 0, 0, 0, 1));
    const hk = U.torus(0.18, 0.05, M.steel, 0, -0.5, 0, 8, 16, Math.PI * 1.4); hk.rotation.z = Math.PI * 0.8; hook.add(hk);
    const crate = new THREE.Group(); crate.position.y = -2.4; hook.add(crate);
    crate.add(tbox(1.7, 1.1, 1.2, M.wood, 0, 0, 0, 1.5));
    for (const dx of [-0.6, 0, 0.6]) crate.add(tbox(0.08, 1.14, 1.24, M.ironPlain, dx, 0, 0, 1));
    for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) hook.add(U.rod(V(0, -0.62, 0), V(sx * 0.8, -1.85, sz * 0.55), 0.02, M.steel, 4));
    dyn.push({ kind: 'crane', crane, trolley, cable, hook });
    U.mergeStatic(trolley); U.mergeStatic(crane);
  }
  // 塔底蒸汽绞车（锅炉 + 飞轮 + 卷筒 + 烟囱蒸汽）
  {
    const W = new THREE.Group(); W.position.set(-9.2, 0, -12.6); W.rotation.y = 0.15; group.add(W);
    W.add(tbox(3.4, 0.3, 1.9, M.woodDark, 0, 0.15, 0, 2));
    for (const dz of [-0.85, 0.85]) W.add(tbox(3.6, 0.2, 0.18, M.ironPlain, 0, 0.35, dz, 1));
    const boiler = crispLathe([[0, 0.3], [0.6, 0.3], [0.62, 0.42], [0.62, 2.1], [0.58, 2.22], [0.44, 2.46], [0.22, 2.6], [0.0, 2.62]], M.copper, { seg: 32, tileU: 2, tileV: 1.5 });
    boiler.position.x = -1.0; W.add(boiler);
    for (const y of [0.7, 1.4, 2.0]) { const b = U.torus(0.63, 0.03, M.brass, -1.0, y, 0, 6, 32); b.rotation.x = Math.PI / 2; W.add(b); }
    W.add(tbox(0.42, 0.42, 0.1, M.ironPlain, -1.0, 0.75, 0.62, 1));
    W.add(U.cyl(0.13, 0.13, 1.7, M.paintBlack, -1.0, 3.4, 0, 12));
    W.add(crispLathe([[0.13, 4.2], [0.26, 4.32], [0.26, 4.4], [0.2, 4.42]], M.paintBlack, { seg: 16 }));
    const gauge = U.cyl(0.14, 0.14, 0.05, M.brass, -0.5, 2.05, 0.35, 16); gauge.rotation.z = Math.PI / 2; gauge.rotation.y = 0.6; W.add(gauge);
    for (const dz of [-0.45, 0.45]) { const cy = U.cyl(0.18, 0.18, 0.9, M.steel, 0.1, 0.75, dz, 14); cy.rotation.z = Math.PI / 2; W.add(cy); W.add(U.rod(V(0.55, 0.75, dz), V(1.0, 0.95, dz), 0.04, M.steel, 6)); }
    const drum = U.cyl(0.42, 0.42, 1.2, M.woodDark, 1.1, 0.95, 0, 20); drum.rotation.x = Math.PI / 2; W.add(drum);
    for (let i = 0; i < 9; i++) { const rr = U.torus(0.47, 0.045, M.rope, 1.1, 0.95, -0.48 + i * 0.12, 5, 20); W.add(rr); }
    for (const dz of [-0.66, 0.66]) { const fl2 = U.cyl(0.62, 0.62, 0.06, M.ironPlain, 1.1, 0.95, dz, 20); fl2.rotation.x = Math.PI / 2; W.add(fl2); }
    // 卷筒钢索升向塔顶滑轮
    W.updateMatrixWorld(true);
    const dTop = V(1.1, 1.4, 0).applyMatrix4(W.matrixWorld);
    group.add(U.rod(dTop, V(TWR.x + thw(TH) * 0.3, TH + 0.3, TWR.z + 0.2), 0.022, M.steel, 4));
    const fw = new THREE.Group(); fw.position.set(0.6, 0.98, 0.98); fw.userData.dynamic = true; W.add(fw);
    fw.add(U.torus(0.72, 0.09, M.ironPlain, 0, 0, 0, 8, 36));
    for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI * 2; fw.add(U.rod(V(0, 0, 0), V(Math.cos(a) * 0.7, Math.sin(a) * 0.7, 0), 0.035, M.ironPlain, 6)); }
    fw.add(U.cyl(0.11, 0.11, 0.2, M.brass, 0, 0, 0, 12)); fw.children[fw.children.length - 1].rotation.x = Math.PI / 2;
    fw.add(U.sphere(0.05, M.brass, 0.6, 0, 0.05, 6, 4));
    U.mergeStatic(fw);
    const steam = U.makeSteam(16, { size: 0.9, rise: 5, spread: 0.4, life: 4, opacity: 0.35, color: 0xd8d4cc });
    steam.position.set(-1.0, 4.45, 0); W.add(steam);
    dyn.push({ kind: 'winch', fw, steam });
    // 弹药与杂物：火棉箱、木桶
    const C = new THREE.Group(); group.add(C);
    const crates = [[-16.9, 0, -3.2, 0.1], [-16.9, 0, -1.8, -0.05], [-15.5, 0, -2.5, 0.2], [-16.8, 1.0, -2.5, 0.0], [-6.4, 0, -14.8, 0.4]];
    for (const [x, y, z, ry] of crates) {
      const b = tbox(1.2, 1.0, 1.25, M.wood, x, y + 0.5, z, 1.2); b.rotation.y = ry; C.add(b);
      for (const dx of [-0.45, 0.45]) { const st = tbox(0.07, 1.03, 1.28, M.ironPlain, 0, 0, 0, 1); st.position.set(x + Math.cos(ry) * dx, y + 0.5, z - Math.sin(ry) * dx); st.rotation.y = ry; C.add(st); }
    }
    for (const [x, z] of [[-11.9, -14.4], [-12.8, -14.9], [-6.9, -13.4]]) {
      const bl = crispLathe([[0, 0], [0.36, 0], [0.42, 0.25], [0.45, 0.55], [0.42, 0.85], [0.36, 1.1], [0, 1.1]], M.woodDark, { seg: 18 });
      bl.position.set(x, 0, z); C.add(bl);
      for (const y of [0.15, 0.95]) { const h2 = U.torus(0.4, 0.025, M.ironPlain, x, y, z, 4, 20); h2.rotation.x = Math.PI / 2; C.add(h2); }
    }
  }

  // ───────────── 7. 观礼看台（+X 侧，面向大炮） ─────────────
  const GS = new THREE.Group(); GS.position.set(13.6, 0, 0); group.add(GS);
  {
    const NT = 6, TR = 0.5, TDp = 1.2, X0 = 0.6, ZH = 10.0;
    const yk = (k) => TR * (k + 1);
    for (let k = 0; k < NT; k++) {
      const x0 = X0 + k * TDp, w = k === NT - 1 ? 8.6 - x0 : TDp;
      GS.add(tbox(w, yk(k), 2 * ZH, M.woodDark, x0 + w / 2, yk(k) / 2, 0, 2));
      GS.add(tbox(w + 0.06, 0.05, 2 * ZH, M.deck, x0 + w / 2 - 0.03, yk(k) + 0.025, 0, 2));
      // 长椅（中间留走道）
      for (const sz of [-1, 1]) {
        const bx = x0 + 0.82;
        GS.add(tbox(0.38, 0.06, ZH - 0.9, M.wood, bx, yk(k) + 0.47, sz * (ZH / 2 + 0.45), 1.5));
        for (let j = 0; j < 7; j++) GS.add(tbox(0.06, 0.42, 0.32, M.paintBlack, bx, yk(k) + 0.24, sz * (0.9 + j * ((ZH - 1.4) / 6)), 1));
      }
      // 走道半级踏步
      if (k < NT - 1) GS.add(tbox(0.6, TR / 2, 1.2, M.deck, x0 + TDp * 0.75, yk(k) + TR / 4, 0, 1));
    }
    // 两侧阶梯形侧板（奶油色漆 + 红色压条）
    const side = [[0.6, 0]];
    for (let k = 0; k < NT; k++) { side.push([X0 + k * TDp, yk(k)]); side.push([X0 + (k + 1) * TDp, yk(k)]); }
    side[side.length - 1][0] = 8.6; side.push([8.6, 0]);
    for (const sz of [-1, 1]) {
      const sh = new THREE.Shape(side.map(([x, y]) => new THREE.Vector2(x, y)));
      const g = new THREE.ExtrudeGeometry(sh, { depth: 0.1, bevelEnabled: false }); g.translate(0, 0, -0.05);
      const m = U.mesh(g, M.paintCream, 0, 0, sz * (ZH + 0.05)); GS.add(m);
      for (let k = 0; k < NT; k++) GS.add(tbox(TDp + 0.02, 0.07, 0.14, M.paintRed, X0 + k * TDp + TDp / 2, yk(k) - 0.02, sz * (ZH + 0.06), 1));
    }
    // 前护墙 + 彩旗扇饰
    GS.add(tbox(0.3, 1.0, 2 * ZH, M.paintCream, 0.3, 0.5, 0, 2));
    GS.add(tbox(0.42, 0.08, 2 * ZH + 0.1, M.woodDark, 0.3, 1.04, 0, 2));
    GS.add(tbox(0.34, 0.12, 2 * ZH, M.paintRed, 0.3, 0.06, 0, 2));
    const fan = (x, y, z, sc = 1, rot = -Math.PI / 2) => {
      [[0.55, flagMats.navy], [0.4, flagMats.cream], [0.26, flagMats.red], [0.09, M.gold]].forEach(([r, mt], i) => {
        const f = U.mesh(new THREE.CircleGeometry(r * sc, 14, Math.PI, Math.PI), mt, x - i * 0.012, y, z);
        f.rotation.y = rot; f.castShadow = false; GS.add(f);
      });
    };
    for (let z = -8.75; z <= 8.8; z += 2.5) fan(0.13, 0.98, z, 0.85);
    // 后墙
    GS.add(tbox(0.2, 4.2, 2 * ZH, M.paintCream, 8.7, 2.1, 0, 2));
    GS.add(tbox(0.3, 0.1, 2 * ZH + 0.1, M.woodDark, 8.7, 4.25, 0, 2));
    for (let z = -9; z <= 9.1; z += 3) GS.add(tbox(0.26, 4.2, 0.14, M.woodDark, 8.7, 2.1, z, 1));
    // 铸铁柱 + 雀替
    const col = (x, y0, y1, z) => {
      const h = y1 - y0;
      const c = crispLathe([[0.2, 0], [0.2, 0.18], [0.16, 0.22], [0.15, 0.4], [0.11, 0.48], [0.1, h - 0.6], [0.13, h - 0.5], [0.13, h - 0.44], [0.1, h - 0.4], [0.16, h - 0.2], [0.24, h - 0.08], [0.24, h]], M.paintBlack, { seg: 16, angle: 30 });
      c.position.set(x, y0, z); GS.add(c);
      const gr = U.torus(0.12, 0.025, M.gold, x, y0 + h * 0.45, z, 4, 16); gr.rotation.x = Math.PI / 2; GS.add(gr);
    };
    const roofY = (x) => 7.4 + 1.0 * ((x + 0.6) / 10) + 0.35 * Math.sin(Math.PI * (x + 0.6) / 10) * -1 + 0.35 * ((x + 0.6) / 10);
    const colZ = [-10, -6, -2, 2, 6, 10];
    for (const z of colZ) {
      col(0.3, 1.08, roofY(0.3) - 0.25, z);
      col(9.05, 0, roofY(9.05) - 0.25, z);
      for (const sz of [-1, 1]) {
        if (Math.abs(z + sz * 2) > 10.1) continue;
        for (const bx of [0.3, 9.05]) {
          const br = U.torus(0.9, 0.04, M.paintBlack, bx, roofY(bx) - 0.35 - 0.9, z + sz * 0.9, 4, 16, Math.PI / 2);
          br.rotation.order = 'YXZ'; br.rotation.set(0, -sz * Math.PI / 2, Math.PI / 2);
          GS.add(br);
        }
      }
    }
    // 屋面：条纹帆布遮阳顶（钟形微曲）+ 檐口垂边
    {
      const NX = 10, NZ = 2;
      const g = new THREE.PlaneGeometry(10, 21.6, NX, NZ);
      const pos = g.attributes.position, uv = g.attributes.uv;
      for (let i = 0; i < pos.count; i++) {
        const px = pos.getX(i) + 4.4, pz = pos.getY(i);
        pos.setXYZ(i, px, roofY(px), pz);
        uv.setXY(i, (pz + 10.8) / 10.8, (px + 0.6) / 10);
      }
      g.computeVertexNormals();
      GS.add(U.mesh(g, M.stripeRed));
      // 檐口垂边（扇贝形）
      for (let z = -10.8 + 0.45; z < 10.8; z += 0.9) {
        const sc = U.mesh(new THREE.CircleGeometry(0.45, 10, Math.PI, Math.PI), Math.round((z + 10.8) / 0.9) % 2 ? M.stripeRed : flagMats.cream, -0.62, roofY(-0.6) - 0.01, z);
        sc.rotation.y = -Math.PI / 2; sc.castShadow = false; GS.add(sc);
      }
      // 背面檐板 + 背向横匾（朝 +X，迎向入园游客）
      GS.add(tbox(0.18, 0.55, 21.6, M.paintCream, 9.4, roofY(9.4) - 0.2, 0, 2));
      const back = U.signBoard('GUN CLUB', 5.2, 1.2, { sub: 'FROM THE EARTH TO THE MOON', bg: '#3a0f0c', fg: '#f0d48a', border: '#d9b45a', edge: M.gold });
      back.position.set(9.55, roofY(9.4) - 0.95, 0); back.rotation.y = Math.PI / 2; GS.add(back);
      // 正面檐板 + 屋脊梁
      GS.add(tbox(0.18, 0.55, 21.6, M.paintCream, -0.5, roofY(-0.5) - 0.2, 0, 2));
      GS.add(tbox(0.22, 0.08, 21.7, M.gold, -0.5, roofY(-0.5) + 0.08, 0, 2));
      for (const x of [0.3, 9.05]) GS.add(tbox(0.25, 0.3, 21.4, M.woodDark, x, roofY(x) - 0.2, 0, 2));
      for (const z of colZ) GS.add(U.rod(V(0.3, roofY(0.3) - 0.15, z), V(9.05, roofY(9.05) - 0.15, z), 0.07, M.woodDark, 6));
    }
    // 中央山花：GUN CLUB 横匾 + 交叉火炮徽章 + 旗杆
    {
      const py = roofY(-0.5) + 0.12, pw = 8.4, ph = 2.3;
      const tri = new THREE.Shape([new THREE.Vector2(-pw / 2, 0), new THREE.Vector2(pw / 2, 0), new THREE.Vector2(0, ph)]);
      const tg = new THREE.ExtrudeGeometry(tri, { depth: 0.2, bevelEnabled: false }); tg.rotateY(Math.PI / 2); scaleUV(tg, 0.3, 0.3);
      GS.add(U.mesh(tg, M.paintCream, -0.6, py, 0));
      const sl = Math.hypot(pw / 2, ph), sa = Math.atan2(ph, pw / 2);
      for (const sz of [-1, 1]) {
        const e = tbox(0.3, 0.12, sl + 0.2, M.gold, -0.55, py + ph / 2, sz * pw / 4, 1);
        e.rotation.x = sz * sa; GS.add(e);
        GS.add(U.sphere(0.18, M.gold, -0.5, py + 0.15, sz * (pw / 2), 12, 8));
      }
      const banner = U.signBoard('GUN CLUB', 6.4, 1.5, { sub: 'BALTIMORE · 1865', bg: '#3a0f0c', fg: '#f0d48a', border: '#d9b45a', edge: M.gold });
      banner.position.set(-0.78, py - 0.35, 0); banner.rotation.y = -Math.PI / 2; GS.add(banner);
      // 徽章：圆盾 + 两门交叉小炮 + 金星
      const em = new THREE.Group(); em.position.set(-0.75, py + ph * 0.55, 0); em.rotation.y = -Math.PI / 2; GS.add(em);
      em.add(U.cyl(0.62, 0.62, 0.08, M.ornamentRed, 0, 0, 0, 32)); em.children[0].rotation.x = Math.PI / 2;
      em.add(U.torus(0.62, 0.05, M.gold, 0, 0, 0.04, 6, 32));
      for (const a of [-0.7, 0.7]) {
        const c = crispLathe([[0.0, -0.55], [0.07, -0.53], [0.09, -0.45], [0.08, 0.4], [0.1, 0.45], [0.1, 0.52], [0.0, 0.52]], M.ironPlain, { seg: 12 });
        c.position.z = 0.1; c.rotation.z = a; em.add(c);
      }
      const star = new THREE.Shape();
      for (let i = 0; i < 10; i++) { const a = Math.PI / 2 + (i / 10) * Math.PI * 2, r = i % 2 ? 0.08 : 0.2; i ? star.lineTo(Math.cos(a) * r, Math.sin(a) * r) : star.moveTo(Math.cos(a) * r, Math.sin(a) * r); }
      em.add(U.mesh(new THREE.ExtrudeGeometry(star, { depth: 0.04, bevelEnabled: false }), M.gold, 0, 0.32, 0.12));
      // 旗杆
      GS.add(U.rod(V(-0.55, py + ph - 0.1, 0), V(-0.55, py + ph + 5.4, 0), 0.06, M.paintWhite, 8, 0.04));
      GS.add(U.sphere(0.12, M.gold, -0.55, py + ph + 5.5, 0, 10, 8));
    }
  }
  // 两端阶梯 + 扶手
  {
    for (const sz of [-1, 1]) {
      for (let i = 0; i < 12; i++) {
        const h = 0.25 * (i + 1);
        GS.add(tbox(0.6, h, 1.2, M.stone, 1.5 + i * 0.6, h / 2, sz * 10.75, 2));
      }
      GS.add(tbox(0.6, 3.0, 1.2, M.stone, 8.7, 1.5, sz * 10.75, 2));
      GS.add(U.railing([V(1.2, 0.25, sz * 11.3), V(8.4, 3.0, sz * 11.3), V(9.4, 3.0, sz * 11.3)], { height: 1.0, mat: M.paintBlack, postMat: M.brass, baluster: 0.3, postEvery: 1.5, ornate: true }));
    }
  }
  // 屋顶彩旗（动态挥动）
  const flags = [];
  const mkFlag = (w, h, mat, x, y, z, kind, wRef = w) => {
    const g = new THREE.PlaneGeometry(w, h, 12, 6); g.translate(w / 2, -h / 2, 0);
    if (kind === 'stripes') { const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) { const u = uv.getX(i), v = uv.getY(i); uv.setXY(i, v * (13 / 12), u); } }
    if (kind === 'pennant') { const p = g.attributes.position; for (let i = 0; i < p.count; i++) { const fx = p.getX(i) / w; p.setY(i, -h / 2 + (p.getY(i) + h / 2) * (1 - fx * 0.92)); } }
    const m = U.mesh(g, mat, x, y, z); m.castShadow = false; m.userData.dynamic = true;
    m.userData.base = Float32Array.from(g.attributes.position.array); m.userData.w = wRef; m.userData.ph = kind === 'canton' ? flags[flags.length - 1].userData.ph : R() * 6;
    GS.add(m); flags.push(m); return m;
  };
  {
    const fy = 7.4 + 0.12 + 2.3 + 5.3;
    mkFlag(2.6, 1.55, stripeFlag, -0.55, fy, 0, 'stripes');
    mkFlag(1.05, 0.83, flagMats.navy, -0.55, fy, 0.012, 'canton', 2.6);
    const roofBack = 7.4 + 1.0 + 0.35;
    [[-8, flagMats.red], [-4, flagMats.navy], [4, flagMats.navy], [8, flagMats.red]].forEach(([z, mt]) => {
      GS.add(U.rod(V(9.05, roofBack - 0.2, z), V(9.05, roofBack + 3.6, z), 0.045, M.paintWhite, 6, 0.03));
      GS.add(U.sphere(0.08, M.gold, 9.05, roofBack + 3.65, z, 8, 6));
      mkFlag(1.9, 0.75, mt, 9.05, roofBack + 3.5, z, 'pennant');
    });
  }

  // ───────────── 8. 炮弹展台（游客入口前） ─────────────
  const PDC = V(10, 0, 21.5);
  const turn = new THREE.Group();
  {
    const P = new THREE.Group(); P.position.copy(PDC); group.add(P);
    const oct = (r, h, y, mat, rot = Math.PI / 8) => { const c = U.mesh(new THREE.CylinderGeometry(r, r, h, 8), mat, 0, y + h / 2, 0); c.rotation.y = rot; scaleUV(c.geometry, 3, h / 1.5); P.add(c); return c; };
    oct(2.3, 0.35, 0, M.stone); oct(1.95, 0.3, 0.35, M.stone); oct(1.55, 0.25, 0.65, M.stone);
    oct(1.35, 1.3, 0.9, M.stone); oct(1.6, 0.22, 2.2, M.stone); oct(1.45, 0.12, 2.42, M.stone);
    // 铜牌（4 面）
    const ap = 1.35 * Math.cos(Math.PI / 8);
    for (let k = 0; k < 4; k++) {
      const a = k * Math.PI / 2 + Math.PI / 4;
      const nx = Math.sin(a), nz = Math.cos(a);
      if (k === 0) {
        const sg = U.signBoard('PROJECTILE', 0.85, 0.62, { sub: 'ALUMINIUM · 1865', bg: '#2a2416', fg: '#e8c675', edge: M.brass });
        sg.position.set(nx * (ap + 0.04), 1.6, nz * (ap + 0.04)); sg.rotation.y = a; P.add(sg);
      } else {
        const pl = tbox(0.75, 0.55, 0.04, M.brass, nx * (ap + 0.02), 1.6, nz * (ap + 0.02), 1); pl.rotation.y = a; P.add(pl);
        const md = U.torus(0.16, 0.025, M.gold, nx * (ap + 0.05), 1.6, nz * (ap + 0.05), 6, 20); md.rotation.y = a; P.add(md);
      }
    }
    // 回转台 + 铜托爪
    turn.position.set(PDC.x, 2.54, PDC.z); turn.userData.dynamic = true; group.add(turn);
    turn.add(crispLathe([[0, 0], [1.0, 0], [1.02, 0.06], [0.95, 0.12], [0, 0.12]], M.brass, { seg: 40 }));
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI * 2 + Math.PI / 4;
      const c = Math.sin(a), s2 = Math.cos(a);
      turn.add(U.tube([V(c * 1.0, 0.1, s2 * 1.0), V(c * 1.08, 0.4, s2 * 1.08), V(c * 0.92, 0.75, s2 * 0.92), V(c * 0.84, 0.95, s2 * 0.84)], 0.05, M.brass, false, 16, 6));
      turn.add(U.sphere(0.07, M.gold, c * 0.84, 0.97, s2 * 0.84, 8, 6));
    }
    const disp = makeProjectile(M); disp.position.y = 0.12; turn.add(disp);
    U.mergeStatic(turn);
    P.add(U.ringRailing(2.75, 0, { height: 0.9, mat: M.paintBlack, postMat: M.brass, ornate: true, baluster: 0.22, postEvery: 1.2 }, 40));
    for (let k = 0; k < 4; k++) { const a = (k / 4) * Math.PI * 2 + Math.PI / 4; const lp = U.lampPost(M, { h: 3.0, arms: 0 }); lp.position.set(Math.cos(a) * 2.75, 0, Math.sin(a) * 2.75); P.add(lp); }
  }

  // ───────────── 9. 台座周边：系船柱铁链、炮弹金字塔、点火台、路灯 ─────────────
  {
    const ex = PX - 0.35, ez0 = PZ0 + 0.35, ez1 = PZ1 - 0.35;
    const runs = [[V(-ex, TOP, ez1), V(-2.2, TOP, ez1)], [V(2.2, TOP, ez1), V(ex, TOP, ez1)], [V(ex, TOP, ez1), V(ex, TOP, 7.2)], [V(ex, TOP, 3.4), V(ex, TOP, ez0)], [V(ex, TOP, ez0), V(-ex, TOP, ez0)], [V(-ex, TOP, ez0), V(-ex, TOP, ez1)]];
    for (const [a, b] of runs) {
      const len = a.distanceTo(b); const n = Math.max(1, Math.round(len / 2.6));
      let prev = null;
      for (let i = 0; i <= n; i++) {
        const p = a.clone().lerp(b, i / n);
        const post = crispLathe([[0.16, 0], [0.16, 0.06], [0.12, 0.1], [0.1, 0.62], [0.13, 0.66], [0.13, 0.72], [0.08, 0.76], [0.0, 0.77]], M.ironPlain, { seg: 12 });
        post.position.copy(p); group.add(post);
        group.add(U.sphere(0.08, M.brass, p.x, p.y + 0.8, p.z, 8, 6));
        if (prev) {
          const pts = []; for (let j = 0; j <= 6; j++) { const t = j / 6; const q = prev.clone().lerp(p, t); q.y += 0.62 - Math.sin(Math.PI * t) * 0.28; pts.push(q); }
          group.add(U.tube(pts, 0.025, M.ironPlain, false, 18, 5));
        }
        prev = p;
      }
    }
    // 炮弹金字塔（3×3 + 2×2 + 1）
    for (const sx of [-1, 1]) {
      const cx = sx * 6.6, cz = 12.4, r = 0.4;
      for (let l = 0; l < 3; l++) { const n = 3 - l; for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) group.add(U.sphere(r, M.ironPlain, cx + (i - (n - 1) / 2) * 2 * r, TOP + 0.12 + r + l * r * 1.414, cz + (j - (n - 1) / 2) * 2 * r, 14, 10)); }
      group.add(tbox(2.6, 0.12, 2.6, M.woodDark, cx, TOP + 0.06, cz, 1.5));
    }
    // 电点火台：铸铁小柱 + 黄铜起爆器 + 铜缆
    {
      const fx = 5.2, fz = 15.4;
      group.add(crispLathe([[0.32, 0], [0.32, 0.1], [0.22, 0.16], [0.16, 0.9], [0.26, 0.98], [0.3, 1.04], [0, 1.05]], M.paintBlack, { seg: 16 }).translateX(fx).translateY(TOP).translateZ(fz));
      group.add(tbox(0.55, 0.32, 0.4, M.brass, fx, TOP + 1.21, fz, 0.5));
      group.add(U.rod(V(fx, TOP + 1.37, fz), V(fx, TOP + 1.8, fz), 0.03, M.steel, 6));
      group.add(U.rod(V(fx - 0.22, TOP + 1.8, fz), V(fx + 0.22, TOP + 1.8, fz), 0.035, M.woodDark, 6));
      for (const dz of [-0.1, 0.1]) group.add(U.tube([V(fx - 0.28, TOP + 1.15, fz + dz), V(fx - 0.6, TOP + 0.05, fz + dz), V(3.5, TOP + 0.04, 10.5 + dz), V(PIER_IN + 0.3, TOP + 0.04, ZT + 4.8 + dz)], 0.025, M.copper, false, 30, 5));
    }
    // 路灯
    for (const [x, z] of [[-7.6, 15.2], [7.6, 15.2], [-7.6, -4.7], [7.6, -4.7]]) { const lp = U.lampPost(M, { h: 4.2, arms: 2 }); lp.position.set(x, TOP, z); group.add(lp); }
  }

  // ───────────── 10. 游客 ─────────────
  const walkers = [];
  {
    let seed = 40;
    // 看台观众
    const spots = [[0, -7.5], [0, -3.2], [1, 5.1], [1, 8.2], [2, -6.1], [2, 2.4], [3, -1.6], [3, 6.6], [4, -8.6], [4, 3.9], [5, -4.4], [5, 1.8]];
    for (const [k, z] of spots) {
      const p = U.person(seed++); p.position.set(13.6 + 0.6 + 1.2 * k + 0.34, 0.5 * (k + 1) + 0.05, z); p.rotation.y = -Math.PI / 2 + (R() - 0.5) * 0.5; group.add(p);
    }
    // 展台旁驻足者
    for (const [a, rr] of [[2.2, 3.4], [3.6, 3.3]]) { const p = U.person(seed++); p.position.set(PDC.x + Math.cos(a) * rr, 0, PDC.z + Math.sin(a) * rr); p.lookAt(PDC.x, 0, PDC.z); group.add(p); }
    // 台座上的大炮俱乐部会员
    for (const [x, z, ry] of [[4.4, 13.9, -2.4], [-4.2, 15.0, 2.8], [2.6, 15.9, 3.6]]) { const p = U.person(seed++); p.position.set(x, TOP, z); p.rotation.y = ry; group.add(p); }
    // 行走游客：绕展台、前广场往返、看台侧通道
    const circ = []; for (let i = 0; i < 24; i++) { const a = (i / 24) * Math.PI * 2; circ.push(V(PDC.x + Math.cos(a) * 3.8, 0, PDC.z + Math.sin(a) * 3.8)); }
    const prom = [V(-12, 0, 26.4), V(4, 0, 26.4), V(4.8, 0, 27.4), V(-12, 0, 27.4)];
    const side = [V(11.7, 0, -6), V(11.7, 0, 13.5), V(12.6, 0, 13.5), V(12.6, 0, -6)];
    for (const [path, off, spd] of [[circ, 0, 0.9], [circ, 11, 0.85], [prom, 5, 1.1], [side, 9, 1.0]]) {
      const p = U.person(seed++); p.userData.dynamic = true; group.add(p);
      walkers.push({ p, path, off, spd });
    }
  }

  // ───────────── 11. 夜间灯光（2 盏） ─────────────
  const flood = new THREE.PointLight(0xffc888, 0, 48, 2); flood.position.set(7.2, 9.5, 11); group.add(flood);
  ctx.addNightLight(flood, 160);
  const standLight = new THREE.PointLight(0xffb870, 0, 24, 2); standLight.position.set(18.2, 6.6, 0); group.add(standLight);
  ctx.addNightLight(standLight, 55);

  // ───────────── 12. 合并静态几何 ─────────────
  group.add(rvS.build(0.05, M.ironPlain));
  group.add(rvB.build(0.05, M.brass));
  U.mergeStatic(group);

  // ═════════════════════ 动画 ═════════════════════
  const REC = 0.4;
  const WARM = new THREE.Color(0xffa860);
  function update(t, dt, env) {
    const night = (env && env.night) || 0;
    const tau = ((t % CYCLE) + CYCLE) % CYCLE;
    const tf = tau - FIRE;
    // 俯仰：装填时降到 48°，随后摇回 50° 待发
    const e = ELOW + (E0 - ELOW) * (ss(6, 22, tau) - ss(37, 44, tau));
    elev.rotation.x = e - Math.PI / 2;
    const dE = e - E0;
    for (const gd of gearDyn) { if (gd.axisX) gd.g.rotation.x = gd.base + dE * gd.ratio; else gd.g.rotation.z = gd.base + dE * gd.ratio; }
    // 后坐
    let rc = 0;
    if (tf >= 0 && tf < 3) rc = tf < 0.08 ? REC * (tf / 0.08) : REC * (1 - ss(0.08, 2.6, tf));
    recoilG.position.y = -rc;
    elev.rotation.x += (tf >= 0 && tf < 1.5) ? 0.006 * Math.sin(Math.min(1, tf / 1.5) * Math.PI) : 0;
    // 炮口闪光
    const fl = tf >= 0 && tf < 1.2 ? (tf < 0.05 ? tf / 0.05 : Math.exp(-(tf - 0.05) * 6.5)) : 0;
    const on = fl > 0.003;
    flashSprite.visible = flashCone.visible = flashCore.visible = on;
    if (on) {
      flashSprite.scale.setScalar(6 + 16 * fl); flashSprite.material.opacity = Math.min(1, fl * 1.2);
      flashCone.scale.set(0.6 + 0.6 * fl, 0.5 + 0.9 * fl, 0.6 + 0.6 * fl); flashCone.material.opacity = 0.85 * fl;
      flashCore.scale.setScalar(0.5 + fl); flashCore.material.opacity = fl;
    }
    // 硝烟
    for (const sp of puffs) {
      const u = sp.userData; const a = tf - u.delay;
      if (a < 0 || a > u.life) { sp.visible = false; continue; }
      sp.visible = true;
      const k = a / u.life;
      if (u.kind === 'trail') {
        sp.position.copy(u.origin).addScaledVector(wind, a * 0.8); sp.position.y += a * 0.35;
      } else {
        const d = u.v0 / u.k * (1 - Math.exp(-u.k * a));
        sp.position.copy(u.kind === 'dust' ? u.origin : muzzleW).addScaledVector(u.dir, d).addScaledVector(wind, a);
        sp.position.y += u.kind === 'dust' ? a * 0.25 : a * 0.55 + a * a * 0.02;
      }
      const sc = u.s0 + (u.s1 - u.s0) * (1 - Math.exp(-a * 0.7)) + a * 0.25;
      sp.scale.setScalar(sc);
      const fadeIn = Math.min(1, a / 0.12);
      sp.material.opacity = u.op * fadeIn * Math.pow(1 - k, 1.6);
      const warm = u.kind === 'jet' || u.kind === 'ring' ? Math.exp(-a * 3.5) : 0; // 初期被火光映暖
      sp.material.color.copy(u.base).lerp(WARM, warm * 0.75);
    }
    // 炮弹飞出
    if (tf >= 0 && tf < 7) {
      launch.visible = true;
      launch.rotation.set(E0 - Math.PI / 2, 0, 0);
      launch.position.copy(T).addScaledVector(dirF, flightS(tf) - 0.35 * Math.exp(-tf * 30));
      launch.rotation.y = tf * 0.8;
      launchTrail.material.opacity = 0.7 * Math.exp(-tf * 0.6) * (tf > 0.05 ? 1 : tf / 0.05);
      launchTrail.scale.set(1, 1 + tf * 0.8, 1);
    } else if (launch.visible) { launch.visible = false; restLaunch(); }
    // 塔吊：开炮时机房臂转开，其余时间缓慢回转作业
    for (const d of dyn) {
      if (d.kind === 'crane') {
        d.crane.rotation.y = 1.65 + 0.68 * Math.sin((2 * Math.PI * t) / CYCLE + 0.4);
        d.trolley.position.x = 8.5 + 3.5 * Math.sin((2 * Math.PI * t) / 22.5);
        const L = 9 + 4.5 * Math.sin((2 * Math.PI * t) / CYCLE + 1.3);
        d.cable.scale.y = L; d.hook.position.y = -0.15 - L;
        d.hook.rotation.z = 0.035 * Math.sin(t * 1.3); d.hook.rotation.x = 0.03 * Math.sin(t * 0.9 + 1);
      } else if (d.kind === 'winch') {
        d.fw.rotation.z = -t * 2.2;
        d.steam.userData.update(dt, 0.8 + 0.2 * Math.sin(t));
      }
    }
    // 开炮前的红色警示灯闪烁
    const warning = tau > 22 && tau < FIRE;
    warnMat.emissiveIntensity = warning ? (Math.sin(t * 11) > 0 ? 7 : 0.3) : 0.6 + night * 1.4;
    // 展台缓慢旋转
    turn.rotation.y = t * 0.12;
    // 旗帜飘动
    for (const f of flags) {
      const p = f.geometry.attributes.position, b = f.userData.base, w = f.userData.w;
      for (let i = 0; i < p.count; i++) {
        const x = b[i * 3], y = b[i * 3 + 1], fx = x / w;
        p.setXYZ(i, x - fx * fx * 0.05 * w, y - fx * 0.05, Math.sin(x * 2.4 - t * 5.2 + f.userData.ph) * 0.13 * fx + Math.sin(y * 3 + t * 3) * 0.02 * fx);
      }
      p.needsUpdate = true; f.geometry.computeVertexNormals();
    }
    // 行走的游客
    for (const w of walkers) {
      const { p: pos, dir } = pathAt(w.path, w.off + t * w.spd);
      w.p.position.copy(pos);
      w.p.rotation.y = Math.atan2(dir.x, dir.z);
      U.animatePerson(w.p, t, w.spd);
    }
  }

  return {
    group,
    update,
    focus: { pos: [36, 15, 40], target: [0, 15, -1] },
    footprint: 30,
  };
}

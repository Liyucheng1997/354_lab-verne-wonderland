// ─────────────────────────────────────────────────────────────
//  Voyage au centre de la Terre (1864) · 斯奈菲尔火山入口
//  程序化置换火山体（脊/沟/雪冠/火山口熔岩湖/熔岩流）+ 山脚洞口：
//  矿井提升架、矿车轨道、发光水晶、巨型蘑菇林、木筏池塘、间歇泉、卢恩石碑
//  洞口朝向 +Z（主程序会将 +Z 朝向乐园中心）
// ─────────────────────────────────────────────────────────────
import * as THREE from 'three';
import * as U from '../util.js';
import { rng } from '../materials.js';

const { V } = U;
const TAU = Math.PI * 2;
const UP = new THREE.Vector3(0, 1, 0);

// ---------- 尺寸常量 ----------
const R_BASE = 46;      // 山体底半径
const RIM_R = 9;        // 火山口边缘半径
const RIM_H = 55;       // 火山口边缘高度
const LAKE_R = 5;       // 熔岩湖半径
const FLOOR_H = 47.5;   // 火山口底
const CLIFF_R = 28;     // 洞口崖壁所在半径（+Z 方向）
const PLAZA_Y = 0.05;   // 洞前广场高度
const ENT_A = Math.PI / 2; // 洞口方位角（atan2(z,x) = +Z）
const MOUTH_TW = 1.3, MOUTH_HOLE_R = 4.0; // 隧道直墙高、开孔半径

// ---------- 局部噪声（哈希值噪声 + fbm）----------
function hash2(i, j, seed) {
  let h = Math.imul(i, 374761393) + Math.imul(j, 668265263) + Math.imul(seed, 2147483647);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
function vnoise(x, z, seed = 1) {
  const xi = Math.floor(x), zi = Math.floor(z), xf = x - xi, zf = z - zi;
  const sx = xf * xf * (3 - 2 * xf), sz = zf * zf * (3 - 2 * zf);
  const a = hash2(xi, zi, seed), b = hash2(xi + 1, zi, seed), c = hash2(xi, zi + 1, seed), d = hash2(xi + 1, zi + 1, seed);
  return a + (b - a) * sx + (c - a) * sz + (a - b - c + d) * sx * sz;
}
function fbm(x, z, oct = 5, seed = 1) {
  let s = 0, amp = 0.5, f = 1, n = 0;
  for (let o = 0; o < oct; o++) { s += vnoise(x * f, z * f, seed + o * 17) * amp; n += amp; amp *= 0.5; f *= 2.03; }
  return s / n;
}
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const sstep = (e0, e1, x) => { const t = clamp01((x - e0) / (e1 - e0)); return t * t * (3 - 2 * t); };
const angDist = (a, b) => { let d = Math.abs(a - b) % TAU; return d > Math.PI ? TAU - d : d; };

/** 山体高度场（同时返回辅助量，用于着色） */
function terrain(x, z) {
  const r = Math.hypot(x, z), a = Math.atan2(z, x);
  const warp = fbm(x * 0.03 + 7, z * 0.03 - 3, 3, 5);
  let y, t = 0;
  const rimN = (fbm(Math.cos(a) * 2 + 3, Math.sin(a) * 2 + 3, 3, 9) - 0.5) * 6;
  if (r < RIM_R) {
    y = FLOOR_H + (RIM_H + rimN - FLOOR_H) * Math.pow(sstep(LAKE_R * 0.85, RIM_R, r), 1.3);
  } else {
    t = clamp01((r - RIM_R) / (R_BASE - RIM_R));
    y = (RIM_H + rimN * (1 - t)) * Math.pow(1 - t, 1.42);
  }
  // 放射状山脊 / 冲沟
  const flank = Math.sin(Math.PI * clamp01(t * 1.15)) * (r > RIM_R ? 1 : 0);
  const rid = Math.abs(Math.sin(a * 7 + warp * 5 + r * 0.045));
  const rid2 = Math.abs(Math.sin(a * 17 + warp * 9 - r * 0.07));
  const gully = Math.pow(rid, 0.55) * 0.7 + Math.pow(rid2, 0.7) * 0.3; // 0=沟底 1=脊
  y += (gully - 0.62) * 4.2 * flank;
  // 多尺度起伏
  const n1 = fbm(x * 0.045, z * 0.045, 5, 3);
  const n2 = fbm(x * 0.22, z * 0.22, 3, 11);
  const inCr = r < RIM_R ? 0.25 + 0.75 * sstep(LAKE_R, RIM_R, r) : 1;
  y += ((n1 - 0.5) * 7 * (0.25 + 0.75 * flank) + (n2 - 0.5) * 1.3) * inCr;
  if (r < LAKE_R + 0.6) y = Math.min(y, FLOOR_H + 0.3);
  // 洞口崖壁与广场（+Z 扇区）
  const da = angDist(a, ENT_A);
  const wedge = sstep(0.85, 0.62, da);
  const cr = CLIFF_R + 3.2 * Math.pow(da / 0.45, 2) + (n2 - 0.5) * 0.8 * sstep(0.1, 0.25, da);
  const cw = 2.2 - 1.75 * sstep(0.24, 0.15, da);
  const cut = sstep(cr, cr + cw, r) * wedge;
  y = y * (1 - cut) + PLAZA_Y * cut;
  // 山脚收边
  y *= sstep(R_BASE + 0.5, R_BASE - 4, r);
  y = Math.max(y, -0.3);
  return { y, r, a, t, gully, flank, cut, n1 };
}

// ---------- 通用小工具 ----------
function place(o, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) { o.position.set(x, y, z); o.rotation.set(rx, ry, rz); return o; }
/** 两点之间的方木（盒子） */
function beam(a, b, w, mat, d = w) {
  const dir = new THREE.Vector3().subVectors(b, a);
  const m = U.mesh(new THREE.BoxGeometry(w, dir.length(), d), mat);
  m.position.copy(a).addScaledVector(dir, 0.5);
  m.quaternion.setFromUnitVectors(UP, dir.normalize());
  return m;
}
/** 粗糙岩块（变形二十面体） */
function rockLump(r, seed, mat, detail = 1, squash = 0.75) {
  const rnd = rng(seed);
  const geo = new THREE.IcosahedronGeometry(r, detail);
  const p = geo.attributes.position;
  const ph = rnd() * 10;
  for (let i = 0; i < p.count; i++) {
    const v = V(p.getX(i), p.getY(i), p.getZ(i));
    const k = 0.72 + 0.38 * fbm(v.x * 1.7 / r + ph, v.z * 1.7 / r + v.y * 0.9 / r, 3, seed);
    v.multiplyScalar(k); v.y *= squash;
    p.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();
  return U.mesh(geo, mat);
}
/** 参数曲面网格 */
function gridGeo(n, m, fn, flip = false) {
  const pos = [], uv = [], idx = [];
  for (let i = 0; i <= n; i++) for (let j = 0; j <= m; j++) { const p = fn(i / n, j / m); pos.push(p.x, p.y, p.z); uv.push(i / n, j / m); }
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
/** 渐细圆管 */
function taperTube(points, r0, r1, mat, seg = 48, radial = 8) {
  const curve = new THREE.CatmullRomCurve3(points);
  const geo = new THREE.TubeGeometry(curve, seg, 1, radial, false);
  const pos = geo.attributes.position, P = new THREE.Vector3(), v = new THREE.Vector3();
  for (let i = 0; i <= seg; i++) {
    curve.getPointAt(i / seg, P);
    const r = r0 + (r1 - r0) * (i / seg);
    for (let j = 0; j <= radial; j++) { const k = i * (radial + 1) + j; v.fromBufferAttribute(pos, k).sub(P).multiplyScalar(r).add(P); pos.setXYZ(k, v.x, v.y, v.z); }
  }
  geo.computeVertexNormals();
  return U.mesh(geo, mat);
}

// ═════════════════════════════════════════════════════════════
//  山体网格（岩石 + 雪冠两组材质，顶点色）
// ═════════════════════════════════════════════════════════════
function buildMountain(rockMat, snowMat) {
  const NR = 150, NA = 320;
  const pos = [], col = [], uv = [], hts = [];
  // 径向非均匀：靠近崖壁/火山口加密
  const radii = [];
  for (let i = 0; i <= NR; i++) { const u = i / NR; radii.push(R_BASE * (0.06 * u + 0.94 * Math.pow(u, 1.12))); }
  radii[0] = 0.0;
  const snowLine = (x, z) => 34 + (fbm(x * 0.06 + 40, z * 0.06, 4, 21) - 0.5) * 12;
  const info = [];
  for (let i = 0; i <= NR; i++) {
    for (let j = 0; j <= NA; j++) {
      const a = (j / NA) * TAU, r = radii[i];
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      const T = terrain(x, z);
      pos.push(x, T.y, z); uv.push(x / 9, z / 9); hts.push(T.y);
      // 顶点色：沟谷偏暗、山脚苔藓、近火山口焦红、崖壁深色
      let c = [0.86, 0.82, 0.78];
      const dark = 0.62 + 0.38 * sstep(0.1, 0.75, T.gully);
      c = c.map((v) => v * dark);
      const moss = sstep(9, 1.5, T.y) * (1 - T.cut) * sstep(0.35, 0.7, T.n1);
      c = [c[0] * (1 - moss * 0.35), c[1] * (1 - moss * 0.12), c[2] * (1 - moss * 0.45)];
      const scorch = sstep(42, 52, T.y) * sstep(14, 6, r);
      c = [c[0] * (1 + scorch * 0.25), c[1] * (1 - scorch * 0.2), c[2] * (1 - scorch * 0.35)];
      const cliff = T.cut > 0.05 && T.cut < 0.95 ? 0.75 : 1;
      c = c.map((v) => v * cliff);
      col.push(...c);
      info.push(snowLine(x, z));
    }
  }
  const idx0 = [], idx1 = [];
  const W = NA + 1;
  for (let i = 0; i < NR; i++) for (let j = 0; j < NA; j++) {
    const a = i * W + j, b = (i + 1) * W + j, c = b + 1, d = a + 1;
    const tri = (p, q, s) => {
      const cx = (pos[p * 3] + pos[q * 3] + pos[s * 3]) / 3, cz = (pos[p * 3 + 2] + pos[q * 3 + 2] + pos[s * 3 + 2]) / 3;
      const hAvg = (hts[p] + hts[q] + hts[s]) / 3;
      const MR = MOUTH_HOLE_R;
      if (cz > CLIFF_R - 2.5 && cz < CLIFF_R + 1.2 && hAvg > 0.25 && Math.abs(cx) < MR && hAvg < MOUTH_TW + Math.sqrt(Math.max(0, MR * MR - cx * cx))) return; // 洞口开孔
      const sl = (info[p] + info[q] + info[s]) / 3;
      (hAvg > sl && hAvg < 57.5 && !(radii[i] < RIM_R * 0.92) ? idx1 : idx0).push(p, q, s);
    };
    tri(a, d, b); tri(b, d, c);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex([...idx0, ...idx1]);
  g.addGroup(0, idx0.length, 0);
  g.addGroup(idx0.length, idx1.length, 1);
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, [rockMat, snowMat]);
  m.castShadow = true; m.receiveShadow = true;
  m.userData.keep = true;
  return m;
}

// ═════════════════════════════════════════════════════════════
//  组件
// ═════════════════════════════════════════════════════════════
/** 巨型蘑菇（苍白菌柄 + 菌盖 + 菌褶 + 菌环） */
function mushroom(Mx, h, seed) {
  const rnd = rng(seed);
  const g = new THREE.Group();
  const sr = h * (0.07 + rnd() * 0.02);
  const capR = h * (0.42 + rnd() * 0.16);
  const lean = (rnd() - 0.5) * 0.18, leanDir = rnd() * TAU;
  // 菌柄：略弯曲的车床体
  g.add(U.lathe([[sr * 1.9, 0], [sr * 1.5, h * 0.04], [sr * 1.15, h * 0.12], [sr, h * 0.35], [sr * 0.92, h * 0.6], [sr * 0.95, h * 0.85], [sr * 1.1, h * 0.97], [sr * 0.4, h * 1.0]], Mx.stem, 18));
  for (let k = 0; k < 5; k++) { // 纵向纤维纹
    const a = rnd() * TAU, y0 = h * (0.1 + rnd() * 0.2), y1 = h * (0.6 + rnd() * 0.3);
    g.add(U.rod(V(Math.cos(a) * sr * 1.0, y0, Math.sin(a) * sr * 1.0), V(Math.cos(a) * sr * 0.93, y1, Math.sin(a) * sr * 0.93), sr * 0.08, Mx.stem, 4));
  }
  // 菌环（裙状）
  g.add(U.lathe([[sr * 0.98, h * 0.78], [sr * 1.9, h * 0.74], [sr * 2.3, h * 0.66], [sr * 2.2, h * 0.64], [sr * 1.5, h * 0.71], [sr * 0.98, h * 0.74]], Mx.gillDS, 18));
  // 菌盖
  const top = h * 1.04 + capR * 0.32, edgeY = h * 0.96;
  const capProf = [[0.0, top], [capR * 0.3, top - capR * 0.04], [capR * 0.58, top - capR * 0.14], [capR * 0.8, top - capR * 0.27], [capR * 0.95, (top + edgeY) / 2 - capR * 0.12], [capR * 1.02, edgeY + capR * 0.04], [capR * 0.98, edgeY - capR * 0.02], [capR * 0.9, edgeY + capR * 0.01]];
  g.add(U.lathe(capProf, rnd() < 0.35 ? Mx.cap2 : Mx.cap, 36));
  // 菌褶：放射状波纹面
  const NG = 36;
  const gill = gridGeo(5, NG * 4, (u, v) => {
    const r = sr * 1.05 + (capR * 0.9 - sr * 1.05) * u, a = v * TAU;
    const base = h * 0.99 + (edgeY + capR * 0.012 - h * 0.99) * u;
    const ridge = Math.pow(Math.abs(Math.cos(v * Math.PI * NG)), 5) * capR * 0.09 * Math.sin(Math.PI * Math.min(1, u * 1.15));
    return V(Math.cos(a) * r, base - ridge, Math.sin(a) * r);
  });
  g.add(U.mesh(gill, Mx.gillDS));
  // 菌盖上的斑点鳞片
  for (let k = 0; k < 7; k++) {
    const rr = capR * (0.15 + rnd() * 0.6), a = rnd() * TAU;
    const yy = capProf[0][1] - capR * 0.3 * (rr / capR) ** 2;
    const sc = U.sphere(1, Mx.capSpot, Math.cos(a) * rr, yy - 0.02, Math.sin(a) * rr, 7, 4);
    sc.scale.set(capR * 0.07, capR * 0.02, capR * 0.06); g.add(sc);
  }
  g.rotation.set(Math.cos(leanDir) * lean, rnd() * TAU, Math.sin(leanDir) * lean);
  return g;
}

/** 水晶簇 */
function crystalCluster(mat, n, size, seed, spread = 0.6) {
  const rnd = rng(seed);
  const g = new THREE.Group();
  for (let i = 0; i < n; i++) {
    const r = size * (0.08 + rnd() * 0.06), h = size * (0.5 + rnd() * 0.9);
    const c = new THREE.Group();
    c.add(U.cyl(r, r * 1.05, h, mat, 0, h / 2, 0, 6));
    const tip = new THREE.Mesh(new THREE.ConeGeometry(r * 1.0, r * 2.2, 6), mat); tip.position.y = h + r * 1.1; c.add(tip);
    const a = rnd() * TAU, d = rnd() * spread * size;
    c.position.set(Math.cos(a) * d, 0, Math.sin(a) * d);
    c.rotation.set((rnd() - 0.5) * 1.1, rnd() * TAU, (rnd() - 0.5) * 1.1);
    g.add(c);
  }
  return g;
}

/** 火把：木杆 + 铁篮 + 火焰 */
function torch(M, flameMat, h = 2.4) {
  const g = new THREE.Group();
  g.add(U.cyl(0.07, 0.09, h, M.woodDark, 0, h / 2, 0, 6));
  for (let k = 0; k < 3; k++) { const t = U.torus(0.09, 0.015, M.ironPlain, 0, h * (0.3 + k * 0.25), 0, 3, 10); t.rotation.x = Math.PI / 2; g.add(t); }
  const bk = U.lathe([[0.06, 0], [0.22, 0.12], [0.28, 0.32], [0.26, 0.34]], M.ironPlain, 8); bk.position.y = h; g.add(bk);
  for (let k = 0; k < 6; k++) { const a = (k / 6) * TAU; g.add(U.rod(V(Math.cos(a) * 0.08, h, Math.sin(a) * 0.08), V(Math.cos(a) * 0.29, h + 0.36, Math.sin(a) * 0.29), 0.012, M.ironPlain, 3)); }
  const f1 = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.7, 7), flameMat); f1.position.y = h + 0.6; g.add(f1);
  const f2 = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.5, 6), M.glowWarm); f2.position.y = h + 0.55; g.add(f2);
  return g;
}

// ═════════════════════════════════════════════════════════════
export function createVolcano(M, ctx) {
  const MSM = (o) => new THREE.MeshStandardMaterial(o);
  // —— 模块自有材质 ——
  const rockV = M.rock.clone(); rockV.vertexColors = true;
  rockV.color.setRGB(2.3, 2.05, 1.85); // 原始玄武岩贴图很暗，提亮以显出山脊与冲沟的明暗
  rockV.bumpScale = 6;
  const snow = MSM({ color: 0xf4f6f8, roughness: 0.92, metalness: 0, vertexColors: true });
  const lavaMat = M.lava.clone();
  for (const k of ['map', 'emissiveMap', 'bumpMap', 'roughnessMap']) if (lavaMat[k]) { lavaMat[k] = lavaMat[k].clone(); lavaMat[k].needsUpdate = true; }
  const lavaFlow = MSM({ color: 0x3a1408, emissive: 0xff5a10, emissiveIntensity: 2.0, roughness: 0.55 });
  const crust = MSM({ color: 0x1c1513, roughness: 0.95 });
  const crystal = MSM({ color: 0x8fe9ff, emissive: 0x2ab8ff, emissiveIntensity: 0.8, roughness: 0.08, metalness: 0.1, transparent: true, opacity: 0.82 });
  const crystal2 = MSM({ color: 0xe0a8ff, emissive: 0xb050ff, emissiveIntensity: 0.8, roughness: 0.08, metalness: 0.1, transparent: true, opacity: 0.82 });
  const tunnelMat = MSM({ color: 0x4a403a, roughness: 0.95, side: THREE.BackSide });
  if (M.rock.map) { tunnelMat.map = M.rock.map; tunnelMat.bumpMap = M.rock.bumpMap; tunnelMat.bumpScale = 3; }
  const flameMat = MSM({ color: 0xffb060, emissive: 0xff6a10, emissiveIntensity: 2.5, roughness: 0.4, transparent: true, opacity: 0.9 });
  const geyserMat = MSM({ color: 0xe6f4fa, emissive: 0x9ab8c4, emissiveIntensity: 0.15, roughness: 0.2, transparent: true, opacity: 0.55, depthWrite: false });
  const sinter = MSM({ color: 0xd8d0b8, roughness: 0.85 });
  const Mx = {
    stem: MSM({ color: 0xece4d2, roughness: 0.8 }),
    cap: MSM({ color: 0xe6d8bc, roughness: 0.7 }),
    cap2: MSM({ color: 0xc9ad86, roughness: 0.7 }),
    capSpot: MSM({ color: 0xf6f0e2, roughness: 0.9 }),
    gillDS: MSM({ color: 0xcbbca0, roughness: 0.9, side: THREE.DoubleSide }),
  };

  const group = new THREE.Group(); group.name = 'Voyage au centre de la Terre';
  const stat = new THREE.Group(); group.add(stat);
  const H = (x, z) => terrain(x, z).y;

  // ───────── 1. 山体 ─────────
  group.add(buildMountain(rockV, snow));

  // ───────── 2. 火山口：熔岩湖 + 浮壳 + 烟柱 ─────────
  const lake = U.mesh(new THREE.CircleGeometry(LAKE_R + 1.2, 48), lavaFlow); lake.rotation.x = -Math.PI / 2; lake.position.y = FLOOR_H + 0.55; lake.receiveShadow = false; stat.add(lake);
  const crustRing = U.mesh(new THREE.RingGeometry(LAKE_R * 0.62, LAKE_R + 1.2, 48, 2), lavaMat); crustRing.rotation.x = -Math.PI / 2; crustRing.position.y = FLOOR_H + 0.63; crustRing.receiveShadow = false; stat.add(crustRing);
  for (let i = 0; i < 9; i++) {
    const a = i * 2.4, d = 1 + (i % 4) * 1.05;
    const c = rockLump(0.5 + (i % 3) * 0.25, 300 + i, crust, 0, 0.35); c.position.set(Math.cos(a) * d, FLOOR_H + 0.62, Math.sin(a) * d); stat.add(c);
  }
  const crater = new THREE.Group(); crater.position.set(0, FLOOR_H + 1.5, 0); group.add(crater);
  const smoke = U.makeSteam(26, { color: 0x8a8580, size: 9, rise: 30, spread: 5, life: 9, opacity: 0.42 });
  crater.add(smoke);
  const glowLake = new THREE.PointLight(0xff6a20, 0, 60, 2); glowLake.position.set(0, FLOOR_H + 4, 0); group.add(glowLake);
  ctx.addNightLight(glowLake, 300);

  // ───────── 3. 熔岩流（一侧山腹）─────────
  const streaks = [ENT_A - 0.95, ENT_A - 1.12, ENT_A - 1.32];
  streaks.forEach((a0, k) => {
    const pts = [];
    const rEnd = 22 + k * 3.5;
    for (let r = RIM_R - 0.6; r <= rEnd; r += 1.2) {
      const a = a0 + 0.05 * Math.sin(r * 0.35 + k) + (r - RIM_R) * 0.002 * (k - 1);
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      pts.push(V(x, H(x, z) + 0.28, z));
    }
    stat.add(taperTube(pts, 0.55 - k * 0.08, 0.22, lavaFlow, pts.length * 3, 7));
    // 两侧冷却硬壳
    for (const s of [-1, 1]) {
      const side = pts.map((p, i) => { const r = Math.hypot(p.x, p.z), a = Math.atan2(p.z, p.x) + s * (0.62 - i * 0.004) / r; const x = Math.cos(a) * r, z = Math.sin(a) * r; return V(x, H(x, z) + 0.18, z); });
      stat.add(taperTube(side, 0.3, 0.12, crust, pts.length * 2, 5));
    }
    const e = pts[pts.length - 1];
    const pool = U.mesh(new THREE.CircleGeometry(1.1 - k * 0.15, 14), lavaFlow); pool.rotation.x = -Math.PI / 2; pool.position.set(e.x, e.y - 0.1, e.z); stat.add(pool);
  });
  // 山腹喷气孔
  const fumarole = U.makeSteam(10, { color: 0xd8d4cc, size: 2.5, rise: 7, spread: 0.8, life: 4, opacity: 0.35 });
  { const a = ENT_A + 1.1, r = 21; const x = Math.cos(a) * r, z = Math.sin(a) * r; fumarole.position.set(x, H(x, z), z); group.add(fumarole); }

  // ───────── 4. 散布的玄武岩巨石 + 苔藓丘 ─────────
  {
    const rnd = rng(77);
    for (let i = 0; i < 34; i++) {
      const a = rnd() * TAU, r = 14 + rnd() * 30;
      if (angDist(a, ENT_A) < 0.62 && r > CLIFF_R - 2) continue;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      const s = 0.8 + rnd() * 2.2;
      const b = rockLump(s, 100 + i, M.rock, 1, 0.7); b.position.set(x, H(x, z) - s * 0.25, z); b.rotation.y = rnd() * TAU; stat.add(b);
    }
    for (let i = 0; i < 26; i++) {
      const a = rnd() * TAU, r = 36 + rnd() * 9;
      if (angDist(a, ENT_A) < 0.5) continue;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      const m = rockLump(0.9 + rnd() * 1.1, 200 + i, i % 2 ? M.foliage3 : M.foliage2, 1, 0.45); m.position.set(x, H(x, z) - 0.1, z); stat.add(m);
    }
  }

  // ───────── 5. 洞口：岩石拱门 + 隧道 + 矿井木支架 + 水晶 ─────────
  const MOUTH_Z = CLIFF_R + 1.0, TR = 3.6, TW = MOUTH_TW; // 隧道半径、直墙高
  {
    // 隧道（内表面）
    const tg = new THREE.CylinderGeometry(TR, TR, 18, 22, 1, true, -Math.PI / 2, Math.PI);
    tg.rotateX(-Math.PI / 2); // 轴向 → Z，上半圆
    const tun = U.mesh(tg, tunnelMat, 0, TW, MOUTH_Z - 9 + 0.6); tun.rotation.z = 0; stat.add(tun);
    for (const s of [-1, 1]) stat.add(place(U.mesh(new THREE.PlaneGeometry(18, TW), tunnelMat), s * TR, TW / 2, MOUTH_Z - 9 + 0.6, 0, s * Math.PI / 2, 0));
    // 伸出崖壁部分的外壳
    const og = new THREE.CylinderGeometry(TR + 0.55, TR + 0.55, 3.2, 22, 1, true, -Math.PI / 2, Math.PI); og.rotateX(-Math.PI / 2);
    stat.add(U.mesh(og, M.rock, 0, TW, MOUTH_Z - 1.0));
    for (const s of [-1, 1]) stat.add(U.box(0.55, TW, 3.2, M.rock, s * (TR + 0.28), TW / 2, MOUTH_Z - 1.0));
    stat.add(U.box(TR * 2, 0.1, 18, M.dirt, 0, 0.0, MOUTH_Z - 9 + 0.6));
    const back = U.mesh(new THREE.CircleGeometry(TR + 0.2, 22), M.black); back.position.set(0, TW, MOUTH_Z - 17.8); stat.add(back);
    stat.add(U.box(TR * 2, TW + 0.1, 0.1, M.black, 0, TW / 2, MOUTH_Z - 17.8));
    // 深处的熔岩微光
    const deep = U.sphere(0.9, M.glowRed, 0, 1.2, MOUTH_Z - 17.2, 12, 8); deep.scale.set(2.2, 1, 0.3); stat.add(deep);
    // 拱门岩块
    const rnd = rng(31);
    const NA = 15;
    for (let i = 0; i <= NA; i++) {
      const th = (i / NA) * Math.PI;
      const rr = TR + 0.9 + rnd() * 0.5;
      const s = 1.0 + rnd() * 0.8 + (i === Math.floor(NA / 2) ? 0.6 : 0);
      const b = rockLump(s, 500 + i, M.rock, 1, 0.85);
      b.position.set(Math.cos(th) * rr, TW + Math.sin(th) * rr, MOUTH_Z + 0.4 + rnd() * 0.6);
      b.rotation.set(rnd() * 3, rnd() * 3, rnd() * 3); stat.add(b);
    }
    for (const s of [-1, 1]) for (let k = 0; k < 3; k++) {
      const b = rockLump(1.3 + rnd() * 0.6, 540 + k + (s > 0 ? 10 : 0), M.rock, 1, 0.8);
      b.position.set(s * (TR + 1.2 + rnd() * 0.4), 0.3 + k * 0.5, MOUTH_Z + 0.6); stat.add(b);
    }
    // 崖壁上的岩石垒块（遮挡隧道与山体接缝）
    for (let i = 0; i < 16; i++) {
      const x = (rnd() - 0.5) * 22, y = 5 + rnd() * 8;
      const b = rockLump(1.2 + rnd() * 1.6, 600 + i, M.rock, 1, 0.8); b.position.set(x, y, CLIFF_R + 0.6 + rnd() * 0.8 - Math.abs(x) * 0.02); stat.add(b);
    }
    // 玄武岩柱状节理崖面（斯奈菲尔半岛特有的六棱柱）
    const basalt = MSM({ color: 0x55504c, roughness: 0.9 });
    if (M.rock.map) { basalt.map = M.rock.map; basalt.bumpMap = M.rock.bumpMap; basalt.bumpScale = 2; }
    const colGeo = new THREE.CylinderGeometry(1, 1, 1, 6); colGeo.translate(0, 0.5, 0);
    const capGeo = new THREE.CylinderGeometry(1, 1, 0.12, 6); capGeo.translate(0, 0.06, 0);
    const rb = rng(321);
    for (let row = 0; row < 3; row++) {
      for (let da = -0.6; da <= 0.6; da += 0.037) {
        const a = ENT_A + da + row * 0.018;
        const crr = CLIFF_R + 3.2 * Math.pow(Math.abs(da) / 0.45, 2);
        const r = crr + 0.3 + row * 0.62 + rb() * 0.18;
        const x = Math.cos(a) * r, z = Math.sin(a) * r;
        const back = H(Math.cos(a) * (crr - 0.8), Math.sin(a) * (crr - 0.8));
        const top = row === 2 ? 0.4 + rb() * 1.6 : back * (0.8 + rb() * 0.18) - row * (2.5 + rb() * 4);
        let y0 = 0;
        const MR = MOUTH_HOLE_R + 1.4;
        if (Math.abs(x) < MR) { if (row === 2) continue; y0 = MOUTH_TW + Math.sqrt(MR * MR - x * x) + 0.4; }
        if (top - y0 < 0.4) continue;
        const rad = 0.5 + rb() * 0.2, ry = rb();
        const c = new THREE.Mesh(colGeo, basalt); c.scale.set(rad, top - y0, rad); c.position.set(x, y0, z); c.rotation.y = ry; c.castShadow = true; c.receiveShadow = true; stat.add(c);
        if (rb() < 0.5) { const cp = new THREE.Mesh(capGeo, M.rock); cp.scale.set(rad * 0.96, 1, rad * 0.96); cp.position.set(x, top, z); cp.rotation.y = ry; stat.add(cp); }
      }
    }
    for (let i = 0; i < 14; i++) { // 崖脚碎石
      const x = (rnd() - 0.5) * 30; if (Math.abs(x) < TR + 2) continue;
      const b = rockLump(0.5 + rnd() * 0.8, 650 + i, M.rock, 1, 0.6); b.position.set(x, 0.1, CLIFF_R + 2.2 + rnd() * 1.5 + Math.pow(Math.abs(x) / 15, 2) * 3); stat.add(b);
    }
    // 矿井木支架（洞口 + 洞内每 3m）
    for (let k = 0; k < 5; k++) {
      const z = MOUTH_Z - 0.3 - k * 3.2;
      for (const s of [-1, 1]) stat.add(U.box(0.32, 3.4, 0.32, M.woodDark, s * (TR - 0.55), 1.7, z));
      stat.add(U.box(TR * 2 - 0.6, 0.34, 0.36, M.woodDark, 0, 3.55, z));
      for (const s of [-1, 1]) stat.add(beam(V(s * (TR - 0.55), 2.8, z), V(s * (TR - 1.4), 3.4, z), 0.16, M.woodDark));
      if (k === 0) {
        const l = U.lantern(M, 1.0); l.position.set(0, 2.85, z + 0.25); stat.add(l);
        stat.add(U.rod(V(0, 3.38, z + 0.25), V(0, 3.55, z + 0.25), 0.012, M.paintBlack, 4));
      }
    }
    // 发光水晶：洞口两侧 + 洞壁
    const spots = [[-TR - 1.4, 0.1, MOUTH_Z + 1.4, 1.6, 0], [TR + 1.6, 0.1, MOUTH_Z + 1.2, 1.9, 1], [-TR + 0.4, 0.05, MOUTH_Z - 4, 1.2, 1], [TR - 0.4, 0.05, MOUTH_Z - 7.5, 1.4, 0], [-TR + 0.5, 0.05, MOUTH_Z - 11, 1.3, 0], [TR - 0.5, 0.05, MOUTH_Z - 14, 1.5, 1], [-2.2, 6.2, CLIFF_R + 1.2, 1.1, 1], [6.5, 0.1, CLIFF_R + 3.5, 1.3, 0], [-8, 0.1, CLIFF_R + 4.2, 1.0, 1]];
    spots.forEach(([x, y, z, s, k], i) => { const c = crystalCluster(k ? crystal2 : crystal, 7, s, 800 + i, 0.5); c.position.set(x, y, z); stat.add(c); });
  }

  // ───────── 6. 矿车轨道 + 往返矿车 ─────────
  const RAIL_Z0 = MOUTH_Z - 15, RAIL_Z1 = 46.5;
  {
    for (const s of [-1, 1]) {
      stat.add(U.box(0.07, 0.12, RAIL_Z1 - RAIL_Z0, M.steel, s * 0.55, 0.22, (RAIL_Z0 + RAIL_Z1) / 2));
      stat.add(U.box(0.14, 0.03, RAIL_Z1 - RAIL_Z0, M.steel, s * 0.55, 0.16, (RAIL_Z0 + RAIL_Z1) / 2));
    }
    for (let z = RAIL_Z0; z < RAIL_Z1; z += 0.72) stat.add(U.box(1.65, 0.11, 0.24, M.woodDark, 0, 0.1, z));
    // 车挡
    stat.add(U.box(1.6, 0.5, 0.3, M.woodDark, 0, 0.45, RAIL_Z1 + 0.1));
    for (const s of [-1, 1]) stat.add(U.cyl(0.08, 0.08, 0.8, M.ironPlain, s * 0.6, 0.4, RAIL_Z1 + 0.25, 6));
    { const rl = U.cyl(0.14, 0.14, 0.12, M.glowRed, 0, 0.75, RAIL_Z1 + 0.28, 10); rl.rotation.x = Math.PI / 2; stat.add(rl); }
  }
  const cart = new THREE.Group(); cart.userData.dynamic = true; group.add(cart);
  const wheels = [];
  {
    const body = new THREE.Group(); cart.add(body);
    const hopper = U.mesh(new THREE.CylinderGeometry(1.0, 0.75, 0.75, 4, 1, true), M.iron); hopper.rotation.y = Math.PI / 4; hopper.scale.set(0.95, 1, 1.3); hopper.position.y = 0.85; body.add(hopper);
    const inner = U.mesh(new THREE.CylinderGeometry(0.98, 0.73, 0.73, 4, 1, true), M.ironPlain); inner.material = inner.material.clone(); inner.material.side = THREE.BackSide; inner.rotation.y = Math.PI / 4; inner.scale.set(0.95, 1, 1.3); inner.position.y = 0.85; body.add(inner);
    body.add(U.box(1.0, 0.06, 1.35, M.ironPlain, 0, 0.5, 0));
    for (const z of [-0.6, 0.6]) body.add(U.box(1.42, 0.06, 0.06, M.brass, 0, 1.22, z * 1.08));
    for (const x of [-0.69, 0.69]) body.add(U.box(0.06, 0.06, 1.85, M.brass, x, 1.22, 0));
    // 矿石 + 水晶货物
    for (let i = 0; i < 5; i++) { const b = rockLump(0.28, 900 + i, M.rock, 0, 0.8); b.position.set(-0.3 + (i % 3) * 0.3, 1.12, -0.35 + Math.floor(i / 3) * 0.6); body.add(b); }
    const cc = crystalCluster(crystal, 4, 0.7, 950, 0.3); cc.position.set(0.1, 1.05, 0.1); body.add(cc);
    U.mergeStatic(body);
    for (const z of [-0.5, 0.5]) for (const s of [-1, 1]) {
      const w = new THREE.Group(); w.userData.dynamic = true; w.position.set(s * 0.55, 0.42, z); cart.add(w);
      const wm = U.cyl(0.2, 0.2, 0.08, M.ironPlain, 0, 0, 0, 12); wm.rotation.z = Math.PI / 2; w.add(wm);
      const hub = U.box(0.09, 0.3, 0.05, M.ironPlain, 0, 0, 0); w.add(hub);
      U.mergeStatic(w); wheels.push(w);
    }
  }

  // ───────── 7. 矿井提升架（木塔 + 天轮 + 罐笼 + 绞车房）─────────
  const HF = V(-8.5, 0, CLIFF_R + 6.5);
  const sheave = new THREE.Group(); sheave.userData.dynamic = true;
  const cage = new THREE.Group(); cage.userData.dynamic = true;
  let cable;
  const TOWER_H = 13.5;
  {
    const hf = new THREE.Group(); hf.position.copy(HF); stat.add(hf);
    const B = 2.7, T = 1.2;
    const cb = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
    const leg = (i, y) => { const k = y / TOWER_H; const w = B + (T - B) * k; return V(cb[i][0] * w, y, cb[i][1] * w); };
    for (let i = 0; i < 4; i++) hf.add(beam(leg(i, 0), leg(i, TOWER_H), 0.34, M.wood));
    const levels = [0.3, 3.6, 6.9, 10.2, TOWER_H - 0.2];
    levels.forEach((y, li) => {
      for (let i = 0; i < 4; i++) hf.add(beam(leg(i, y), leg((i + 1) % 4, y), 0.22, M.wood));
      if (li < levels.length - 1) {
        const y2 = levels[li + 1];
        for (let i = 0; i < 4; i++) {
          hf.add(beam(leg(i, y), leg((i + 1) % 4, y2), 0.13, M.woodDark));
          hf.add(beam(leg((i + 1) % 4, y), leg(i, y2), 0.13, M.woodDark));
        }
      }
      // 铁箍螺栓
      for (let i = 0; i < 4; i++) { const p = leg(i, y); hf.add(U.box(0.4, 0.08, 0.4, M.ironPlain, p.x, p.y, p.z)); }
    });
    // 顶部平台 + 栏杆
    hf.add(U.box(T * 2 + 1.4, 0.16, T * 2 + 1.4, M.deck, 0, TOWER_H + 0.05, 0));
    for (const [x, z] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) hf.add(U.box(0.1, 1.0, 0.1, M.woodDark, x * (T + 0.65), TOWER_H + 0.6, z * (T + 0.65)));
    for (const s of [-1, 1]) { hf.add(U.box(T * 2 + 1.4, 0.08, 0.08, M.woodDark, 0, TOWER_H + 1.05, s * (T + 0.65))); hf.add(U.box(0.08, 0.08, T * 2 + 1.4, M.woodDark, s * (T + 0.65), TOWER_H + 1.05, 0)); }
    // 天轮轴承座
    for (const s of [-1, 1]) { hf.add(U.box(0.3, 0.9, 0.5, M.ironPlain, s * 0.55, TOWER_H + 0.55, 1.6)); const bc = U.cyl(0.12, 0.12, 0.1, M.brass, s * 0.72, TOWER_H + 0.9, 1.6, 10); bc.rotation.z = Math.PI / 2; hf.add(bc); }
    // 斜撑（朝绞车房方向）
    for (const s of [-1, 1]) hf.add(beam(V(s * 1.0, TOWER_H - 0.4, 0.6), V(s * 1.6, 0, 6.6), 0.3, M.wood));
    hf.add(beam(V(-1.3, 5, 3.9), V(1.3, 5, 3.9), 0.18, M.woodDark));
    // 井口
    hf.add(U.box(2.2, 0.05, 2.2, M.black, 0, 0.06, 0));
    for (const s of [-1, 1]) { hf.add(U.box(2.8, 0.3, 0.3, M.woodDark, 0, 0.15, s * 1.25)); hf.add(U.box(0.3, 0.3, 2.8, M.woodDark, s * 1.25, 0.15, 0)); }
    // 罐笼导轨
    for (const s of [-1, 1]) hf.add(U.box(0.12, TOWER_H - 1.5, 0.12, M.ironPlain, s * 0.95, (TOWER_H - 1.5) / 2, 0));
    // 灯
    for (const s of [-1, 1]) { const l = U.lantern(M, 0.9); l.position.set(s * (T + 0.65), TOWER_H + 1.1, T + 0.65); hf.add(l); }
    // 天轮（动态）
    sheave.position.set(HF.x, HF.y + TOWER_H + 0.9, HF.z + 1.6); group.add(sheave);
    const wheel = new THREE.Group(); wheel.rotation.y = Math.PI / 2; sheave.add(wheel);
    const rim = U.torus(1.6, 0.09, M.ironPlain, 0, 0, 0, 6, 40); wheel.add(rim);
    const rim2 = U.torus(1.45, 0.05, M.ironPlain, 0, 0, 0, 5, 36); wheel.add(rim2);
    for (let k = 0; k < 10; k++) { const a = (k / 10) * TAU; wheel.add(U.rod(V(0, 0, 0), V(Math.cos(a) * 1.45, Math.sin(a) * 1.45, 0), 0.04, M.ironPlain, 5)); }
    { const hub = U.cyl(0.22, 0.22, 0.35, M.brass, 0, 0, 0, 12); hub.rotation.x = Math.PI / 2; wheel.add(hub); }
    U.mergeStatic(sheave);
    // 罐笼（动态）
    cage.position.set(HF.x, 0.2, HF.z); group.add(cage);
    const cf = new THREE.Group(); cage.add(cf);
    cf.add(U.box(1.5, 0.12, 1.5, M.deck, 0, 0.06, 0));
    cf.add(U.box(1.5, 0.1, 1.5, M.ironPlain, 0, 2.3, 0));
    for (const [x, z] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) cf.add(U.box(0.08, 2.3, 0.08, M.ironPlain, x * 0.7, 1.15, z * 0.7));
    for (const s of [-1, 1]) for (const y of [0.6, 1.1]) { cf.add(U.box(1.45, 0.05, 0.05, M.ironPlain, 0, y, s * 0.7)); cf.add(U.box(0.05, 0.05, 1.45, M.ironPlain, s * 0.7, y, 0)); }
    cf.add(U.cyl(0.08, 0.15, 0.3, M.brass, 0, 2.5, 0, 8));
    const lc = U.lantern(M, 0.7); lc.position.set(0, 1.9, 0); cf.add(lc);
    const pp = U.person(901); pp.position.set(0.2, 0.12, 0.1); pp.rotation.y = 0.4; cf.add(pp);
    U.mergeStatic(cage);
    cable = U.cyl(0.025, 0.025, 1, M.steel, 0, 0, 0, 5); cable.userData.dynamic = true; cable.userData.baseLen = 1; group.add(cable);
    // 绞车房 + 钢缆
    const wh = new THREE.Group(); wh.position.set(HF.x, 0, HF.z + 9.5); wh.rotation.y = Math.PI; stat.add(wh);
    wh.add(U.box(4.6, 3.2, 3.6, M.woodDark, 0, 1.6, 0));
    for (let k = -2; k <= 2; k++) wh.add(U.box(0.12, 3.25, 0.06, M.wood, k * 1.0, 1.62, 1.82));
    for (const s of [-1, 1]) { const rf = U.box(5.0, 0.12, 2.3, M.slate, 0, 3.75, s * 0.95); rf.rotation.x = s * 0.5; wh.add(rf); }
    wh.add(U.box(1.2, 1.8, 0.08, M.wood, -0.9, 0.9, 1.84));
    wh.add(U.box(0.9, 0.7, 0.06, M.glowWindow, 1.2, 1.9, 1.84));
    wh.add(U.cyl(0.28, 0.32, 3.0, M.brick, 1.6, 4.5, -0.8, 10));
    wh.add(U.cyl(0.36, 0.36, 0.2, M.ironPlain, 1.6, 6.0, -0.8, 10));
    const drum = U.cyl(0.6, 0.6, 1.4, M.brass, 0, 2.6, 1.95, 16); drum.rotation.z = Math.PI / 2; wh.add(drum);
    wh.add(U.rod(V(0, TOWER_H + 0.9, 9.5 - 3.2), V(0, 3.15, 1.95), 0.025, M.steel, 4));
    const lw = U.lantern(M, 0.9); lw.position.set(-1.9, 2.4, 1.95); wh.add(lw);
  }
  const chimney = U.makeSteam(10, { color: 0x6a6662, size: 1.6, rise: 6, spread: 0.5, life: 4, opacity: 0.4 });
  chimney.position.set(HF.x - 1.6, 6.1, HF.z + 9.5 + 0.8); group.add(chimney);

  // ───────── 8. 巨型蘑菇林 ─────────
  {
    const spots = [[9.5, CLIFF_R + 3.5, 9.5], [13.5, CLIFF_R + 2.2, 7.5], [16.5, CLIFF_R + 6, 6.2], [11.5, CLIFF_R + 8.2, 5.2], [7.6, CLIFF_R + 7.5, 4.0], [19.5, CLIFF_R + 2.5, 8.0], [15, CLIFF_R + 10.8, 4.4], [20.5, CLIFF_R + 7.8, 5.0], [6.0, CLIFF_R + 2.6, 4.6], [18.0, CLIFF_R + 11.5, 3.6]];
    spots.forEach(([x, z, h], i) => {
      const m = mushroom(Mx, h, 40 + i);
      m.position.set(x, Math.max(PLAZA_Y, H(x, z)) - 0.1, z); stat.add(m);
      if (i % 2 === 0) { const r = rockLump(0.5, 700 + i, M.rock, 1, 0.6); r.position.set(x + 0.9, PLAZA_Y, z + 0.6); stat.add(r); }
    });
    // 小蘑菇点缀
    const rnd = rng(55);
    for (let i = 0; i < 14; i++) { const x = 6 + rnd() * 15, z = CLIFF_R + 1.5 + rnd() * 11; const m = mushroom(Mx, 0.6 + rnd() * 1.1, 80 + i); m.position.set(x, Math.max(PLAZA_Y, H(x, z)) - 0.05, z); stat.add(m); }
  }

  // ───────── 9. 池塘 + 探险木筏 + 间歇泉 ─────────
  const POND = V(-18.5, 0, CLIFF_R + 9.5);
  const raft = new THREE.Group(); raft.userData.dynamic = true;
  const gey = new THREE.Group();
  const GEY = V(-15.5, 0, CLIFF_R + 16.5);
  let geyCol, geySteam, geySpray;
  {
    const rnd = rng(19);
    // 水面（不规则轮廓）
    const wg = new THREE.CircleGeometry(4.6, 40);
    const p = wg.attributes.position;
    for (let i = 1; i < p.count; i++) { const x = p.getX(i), y = p.getY(i); const a = Math.atan2(y, x); const k = 1 + 0.12 * Math.sin(a * 3 + 1) + 0.06 * Math.sin(a * 7); p.setXY(i, x * k * 1.15, y * k); }
    const water = U.mesh(wg, M.water); water.rotation.x = -Math.PI / 2; water.position.set(POND.x, 0.12, POND.z); water.receiveShadow = true; stat.add(water);
    const bed = U.mesh(wg.clone(), M.black); bed.rotation.x = -Math.PI / 2; bed.position.set(POND.x, 0.0, POND.z); bed.scale.set(0.96, 0.96, 1); stat.add(bed);
    // 岸边沙石
    const sand = U.mesh(new THREE.RingGeometry(4.6, 6.0, 40, 1), M.sand); sand.rotation.x = -Math.PI / 2; sand.position.set(POND.x, 0.08, POND.z); sand.scale.set(1.15, 1, 1); stat.add(sand);
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * TAU + rnd() * 0.2, r = 4.9 + rnd() * 0.6;
      const k = 1 + 0.12 * Math.sin(a * 3 + 1) + 0.06 * Math.sin(a * 7);
      const b = rockLump(0.35 + rnd() * 0.45, 400 + i, M.rock, 1, 0.55); b.position.set(POND.x + Math.cos(a) * r * k * 1.15, 0.05, POND.z + Math.sin(a) * r * k); stat.add(b);
    }
    // 芦苇
    for (let i = 0; i < 16; i++) { const a = rnd() * TAU, r = 4.4 + rnd() * 0.5; const x = POND.x + Math.cos(a) * r * 1.1, z = POND.z + Math.sin(a) * r; stat.add(U.rod(V(x, 0, z), V(x + (rnd() - 0.5) * 0.3, 1.0 + rnd() * 0.8, z + (rnd() - 0.5) * 0.3), 0.025, M.foliage2, 3)); }
    // 木筏（李登布洛克、阿克塞尔与汉斯的筏子）
    raft.position.set(POND.x + 0.5, 0.12, POND.z + 0.3); raft.rotation.y = 0.5; group.add(raft);
    const body = new THREE.Group(); raft.add(body);
    for (let i = 0; i < 8; i++) {
      const x = -1.05 + i * 0.3, len = 3.6 - Math.abs(i - 3.5) * 0.12;
      const lg = U.cyl(0.15, 0.16, len, M.bark, x, 0.05, 0, 9); lg.rotation.x = Math.PI / 2; body.add(lg);
      for (const s of [-1, 1]) { const end = U.cyl(0.15, 0.15, 0.02, M.wood, x, 0.05, s * len / 2, 9); end.rotation.x = Math.PI / 2; body.add(end); }
    }
    for (const z of [-1.3, 0, 1.3]) {
      body.add(U.box(2.6, 0.1, 0.16, M.woodDark, 0, 0.24, z));
      for (let i = 0; i < 8; i += 2) { const t = U.torus(0.17, 0.025, M.rope, -1.05 + i * 0.3, 0.06, z, 4, 10); t.rotation.y = Math.PI / 2; body.add(t); }
    }
    body.add(U.box(2.2, 0.05, 1.5, M.deck, 0, 0.3, -0.3));
    // 桅杆、横桁、方帆
    body.add(U.cyl(0.07, 0.09, 4.2, M.wood, 0, 2.3, 0.6, 8));
    { const yard = U.cyl(0.04, 0.04, 2.4, M.wood, 0, 3.9, 0.66, 6); yard.rotation.z = Math.PI / 2; body.add(yard); }
    const sail = gridGeo(6, 6, (u, v) => V(-1.1 + 2.2 * v, 3.85 - 2.5 * u, 0.7 + Math.sin(Math.PI * v) * 0.35 * (0.4 + 0.6 * u)));
    body.add(U.mesh(sail, M.canvas));
    body.add(U.rod(V(-1.1, 1.35, 0.72), V(0, 0.35, -1.7), 0.012, M.rope, 3));
    body.add(U.rod(V(1.1, 1.35, 0.72), V(0, 0.35, -1.7), 0.012, M.rope, 3));
    body.add(U.rod(V(0, 4.35, 0.6), V(0, 0.35, 1.75), 0.012, M.rope, 3));
    // 货物：木桶、箱子、仪器箱、舵桨
    { const barrel = U.lathe([[0.2, 0], [0.25, 0.12], [0.26, 0.3], [0.25, 0.48], [0.2, 0.6]], M.wood, 10); barrel.position.set(0.7, 0.32, -1.0); body.add(barrel); }
    body.add(U.box(0.6, 0.45, 0.5, M.woodDark, -0.6, 0.55, -0.9));
    body.add(U.box(0.35, 0.25, 0.3, M.brass, -0.6, 0.9, -0.9));
    body.add(U.rod(V(0, 0.4, -1.6), V(0.2, 0.05, -3.0), 0.04, M.wood, 5));
    body.add(U.box(0.25, 0.04, 0.7, M.wood, 0.22, 0.02, -3.0));
    U.mergeStatic(body);
    // 间歇泉：硅华丘 + 喷口 + 水柱 + 蒸汽
    gey.position.copy(GEY); group.add(gey);
    const mound = new THREE.Group(); mound.position.copy(GEY); stat.add(mound);
    mound.add(U.lathe([[2.4, 0], [2.2, 0.12], [1.6, 0.3], [0.9, 0.5], [0.45, 0.62], [0.32, 0.55], [0.25, 0.3]], sinter, 24));
    for (let k = 0; k < 3; k++) { const t = U.torus(1.0 + k * 0.5, 0.05, sinter, 0, 0.5 - k * 0.15, 0, 3, 28); t.rotation.x = Math.PI / 2; mound.add(t); }
    const vent = U.mesh(new THREE.CircleGeometry(0.3, 12), M.black); vent.rotation.x = -Math.PI / 2; vent.position.y = 0.4; mound.add(vent);
    for (let i = 0; i < 6; i++) { const a = i * 1.1; const b = rockLump(0.3, 450 + i, M.rock, 0, 0.6); b.position.set(Math.cos(a) * 2.0, 0.05, Math.sin(a) * 2.0); mound.add(b); }
    const cg = new THREE.CylinderGeometry(0.28, 0.55, 1, 12, 4, true); cg.translate(0, 0.5, 0);
    geyCol = U.mesh(cg, geyserMat); geyCol.position.y = 0.45; geyCol.castShadow = false; geyCol.scale.set(1, 0.01, 1); gey.add(geyCol);
    geySpray = U.makeSteam(18, { color: 0xffffff, size: 2.4, rise: 15, spread: 1.4, life: 2.6, opacity: 0.8 });
    geySpray.position.y = 0.5; gey.add(geySpray);
    geySteam = U.makeSteam(12, { color: 0xeeeeee, size: 3.2, rise: 9, spread: 1.8, life: 5, opacity: 0.4 });
    geySteam.position.y = 0.5; gey.add(geySteam);
  }

  // ───────── 10. 卢恩石碑 + 标牌 + 火把 + 游客 ─────────
  {
    const sign = new THREE.Group(); sign.position.set(6.0, 0, CLIFF_R + 15.5); sign.rotation.y = -0.25; stat.add(sign);
    for (const s of [-1, 1]) { sign.add(U.box(0.24, 3.4, 0.24, M.woodDark, s * 2.2, 1.7, 0)); sign.add(place(U.cyl(0.05, 0.16, 0.3, M.woodDark, 0, 0, 0, 4), s * 2.2, 3.5, 0, 0, Math.PI / 4, 0)); }
    const sb = U.signBoard('SNÆFELLS · 1864', 4.0, 1.0, { sub: 'Voyage au centre de la Terre', bg: '#2a1c12', fg: '#e8c675' });
    sb.position.set(0, 2.55, 0.05); sign.add(sb);
    sign.add(U.box(4.3, 0.12, 0.2, M.woodDark, 0, 3.1, 0));
    sign.add(U.box(3.4, 0.6, 0.06, M.woodDark, 0, 1.55, 0.05));
    for (const s of [-1, 1]) { const l = U.lantern(M, 0.8); l.position.set(s * 2.2, 3.66, 0); sign.add(l); }
    // 卢恩石碑（萨克努塞姆的密码羊皮纸）
    const rune = new THREE.Group(); rune.position.set(-4.6, 0, CLIFF_R + 15.0); rune.rotation.y = 0.3; stat.add(rune);
    const slab = rockLump(1, 990, M.stone, 1, 1); slab.scale.set(1.1, 2.4, 0.42); slab.position.y = 1.7; rune.add(slab);
    rune.add(U.box(1.6, 0.4, 0.9, M.stone, 0, 0.2, 0));
    const rr = rng(1864);
    for (let row = 0; row < 7; row++) for (let col = 0; col < 4; col++) {
      const x = -0.5 + col * 0.33, y = 2.9 - row * 0.32;
      const gch = new THREE.Group(); gch.position.set(x, y, 0.42);
      gch.add(U.box(0.025, 0.2, 0.02, M.gold, 0, 0, 0));
      const n = 1 + Math.floor(rr() * 2);
      for (let k = 0; k < n; k++) { const st = U.box(0.02, 0.11, 0.02, M.gold, (rr() - 0.5) * 0.08, (rr() - 0.5) * 0.1, 0); st.rotation.z = (rr() < 0.5 ? 1 : -1) * 0.7; gch.add(st); }
      rune.add(gch);
    }
    // 火把
    for (const [x, z] of [[-TR - 2.4, CLIFF_R + 2.6], [TR + 2.4, CLIFF_R + 2.6], [-2.8, CLIFF_R + 12.5], [2.8, CLIFF_R + 12.5]]) { const tc = torch(M, flameMat); tc.position.set(x, 0, z); stat.add(tc); }
    // 游客
    const ppl = [[3.2, CLIFF_R + 17.5, Math.PI], [4.4, CLIFF_R + 17.2, Math.PI + 0.3], [-3.0, CLIFF_R + 16.8, Math.PI - 0.4], [1.4, CLIFF_R + 9.0, Math.PI + 0.1], [-4.6, CLIFF_R + 8.5, -2.4], [12.0, CLIFF_R + 13.5, 2.8]];
    ppl.forEach(([x, z, ry], i) => { const p = U.person(700 + i, { child: i === 1 }); p.position.set(x, 0, z); p.rotation.y = ry; stat.add(p); });
  }
  const mouthLight = new THREE.PointLight(0xffa850, 0, 28, 2); mouthLight.position.set(0, 3.2, MOUTH_Z + 2.5); group.add(mouthLight);
  ctx.addNightLight(mouthLight, 160);

  // ───────── 合并静态几何 ─────────
  U.mergeStatic(stat);

  const sheaveR = 1.6;
  return {
    group,
    focus: { pos: [26, 18, 92], target: [0, 16, 18] },
    footprint: 48,
    update(t, dt, env) {
      const night = env?.night ?? 0;
      // 熔岩脉动
      const pulse = 0.5 + 0.5 * Math.sin(t * 0.9) * 0.7 + 0.15 * Math.sin(t * 2.7);
      lavaMat.emissiveIntensity = 1.8 + pulse * 1.4 + night * 1.2;
      lavaFlow.emissiveIntensity = 1.6 + 0.5 * Math.sin(t * 1.3) + night * 1.5;
      if (lavaMat.emissiveMap) { lavaMat.emissiveMap.offset.set(t * 0.004, t * 0.003); if (lavaMat.map) lavaMat.map.offset.copy(lavaMat.emissiveMap.offset); }
      // 水晶与火焰
      crystal.emissiveIntensity = 0.7 + night * 2.6 + 0.3 * Math.sin(t * 1.7);
      crystal2.emissiveIntensity = 0.7 + night * 2.6 + 0.3 * Math.sin(t * 1.3 + 1);
      flameMat.emissiveIntensity = 2.2 + night * 2 + 0.6 * Math.sin(t * 17) * Math.sin(t * 7.3);
      // 烟柱（间歇性加强）
      const puff = 0.35 + 0.65 * Math.pow(Math.max(0, Math.sin(t * 0.13)), 2);
      smoke.userData.update(dt, puff, V(1.2, 0, 0.4));
      fumarole.userData.update(dt, 0.8, V(0.3, 0, 0.1));
      chimney.userData.update(dt, 1, V(0.4, 0, 0.1));
      // 天轮 + 罐笼：升降往返
      const cyc = (t % 24) / 24;
      const k = cyc < 0.5 ? cyc * 2 : 2 - cyc * 2;
      const e = k * k * (3 - 2 * k);
      const cy = 0.2 + e * (TOWER_H - 4.5);
      const prevY = cage.position.y;
      cage.position.y = cy;
      sheave.rotation.x -= (cy - prevY) / sheaveR;
      U.aimRod(cable, V(HF.x, cy + 2.65, HF.z), V(HF.x, TOWER_H + 0.9, HF.z));
      // 矿车往返
      const ck = (t % 36) / 36, cm = ck < 0.5 ? ck * 2 : 2 - ck * 2;
      const ce = cm * cm * (3 - 2 * cm);
      const cz = RAIL_Z0 + 3 + ce * (RAIL_Z1 - RAIL_Z0 - 5);
      const dz = cz - (cart.userData.z ?? cz); cart.userData.z = cz;
      cart.position.set(0, 0, cz);
      for (const w of wheels) w.rotation.x += dz / 0.2;
      // 木筏轻摇
      raft.position.y = 0.12 + Math.sin(t * 0.9) * 0.05;
      raft.rotation.z = Math.sin(t * 0.7) * 0.03; raft.rotation.x = Math.sin(t * 0.8 + 1) * 0.025;
      // 间歇泉：每 30 秒喷发一次
      const gp = (t + 18) % 30;
      let erupt = 0;
      if (gp < 7) erupt = Math.pow(Math.sin((Math.PI * gp) / 7), 0.6) * (gp < 1 ? 0.6 + 0.4 * gp : 1);
      const pre = gp > 26 ? (gp - 26) / 4 : 0;
      geyCol.scale.set(1 + erupt * 0.4, Math.max(0.01, erupt * (12 + Math.sin(t * 9) * 0.8)), 1 + erupt * 0.4);
      geyCol.visible = erupt > 0.02;
      geySpray.userData.update(dt, erupt, V(0.3, 0, 0.1));
      geySteam.userData.update(dt, 0.25 + pre * 0.5 + erupt * 0.8, V(0.6, 0, 0.2));
    },
  };
}

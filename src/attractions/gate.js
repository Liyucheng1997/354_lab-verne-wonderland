// ─────────────────────────────────────────────────────────────
//  乐园大门 · « Les Voyages Extraordinaires »
//  1880 年代巴黎世博会风格的铸铁玻璃凯旋拱门：
//  石砌塔门 + 铆接格构铁拱 + 扇形玻璃拱心 + 天文钟 + 黄铜浑天仪
//  拱门横跨 X 轴，游客沿 Z 轴穿行（正面朝 +Z，背面 -Z 为园内）
// ─────────────────────────────────────────────────────────────
import * as THREE from 'three';
import * as U from '../util.js';
import { withRepeat, rng } from '../materials.js';

const PI = Math.PI, TAU = Math.PI * 2;
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const AXIS_Z = V(0, 0, 1);
const put = (parent, o) => { parent.add(o); return o; };

// ---------- 本地建模小工具 ----------

/** 两点间的矩形截面型钢：h 为面内高度，w 为沿法线 n 方向的宽度 */
function beam(a, b, h, w, mat, n = AXIS_Z) {
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

/** 涡卷的一半：直茎 + 对数螺线（XY 平面） */
function scrollHalf(L, c, turns = 1.5, n = 20) {
  const pts = [V(0, 0, 0), V(L * 0.5, 0, 0)];
  for (let i = 0; i <= n; i++) {
    const th = (i / n) * turns * TAU;
    const r = c * Math.exp(-0.3 * th);
    const ph = -PI / 2 + th;
    pts.push(V(L + Math.cos(ph) * r, c + Math.sin(ph) * r, 0));
  }
  return pts;
}
/** S 形涡卷（中心对称） */
function sScrollPts(L, c, turns = 1.5) {
  const h = scrollHalf(L, c, turns);
  const neg = h.map((p) => V(-p.x, -p.y, 0)).reverse();
  return [...neg.slice(0, -1), ...h];
}
function scrollMesh(pts, r, mat) { return U.tube(pts, r, mat, false, Math.round(pts.length * 1.6), 5); }

/** 平面扁三角放射线（金色太阳光芒） */
function rayGeo(r0, r1, w, depth) {
  const s = new THREE.Shape();
  s.moveTo(r0, -w / 2); s.lineTo(r1, 0); s.lineTo(r0, w / 2); s.lineTo(r0, -w / 2);
  const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: false });
  g.translate(0, 0, -depth / 2);
  return g;
}

/** 环形扇区（XY 平面） */
function sectorShape(r0, r1, a0, a1, n = 10) {
  const s = new THREE.Shape();
  s.moveTo(Math.cos(a0) * r1, Math.sin(a0) * r1);
  for (let i = 1; i <= n; i++) { const a = a0 + (a1 - a0) * (i / n); s.lineTo(Math.cos(a) * r1, Math.sin(a) * r1); }
  if (r0 <= 0.001) s.lineTo(0, 0);
  else for (let i = n; i >= 0; i--) { const a = a0 + (a1 - a0) * (i / n); s.lineTo(Math.cos(a) * r0, Math.sin(a) * r0); }
  return s;
}

/** 金色玫瑰花饰（扁球 + 花瓣环） */
function rosette(M, r, x, y, z, faceAxis = 'z') {
  const g = new THREE.Group();
  const c = U.sphere(r * 0.42, M.gold, 0, 0, 0, 8, 5); c.scale.z = 0.6; g.add(c);
  const petals = U.torus(r * 0.62, r * 0.26, M.gold, 0, 0, 0, 4, 8); petals.scale.z = 0.45; petals.rotation.z = PI / 8; g.add(petals);
  g.add(U.torus(r * 0.95, r * 0.08, M.brass, 0, 0, 0, 3, 14));
  if (faceAxis === 'x') g.rotation.y = PI / 2;
  g.position.set(x, y, z);
  return g;
}

// ---------- Canvas 贴图：天文钟盘 / 古地球仪 / 旗帜 ----------
function canvasTex(w, h, draw) {
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const c = cv.getContext('2d');
  draw(c, w, h);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}

function dialTexture() {
  return canvasTex(1024, 1024, (c, S) => {
    const o = S / 2;
    const circ = (r, fill) => { c.beginPath(); c.arc(o, o, r, 0, TAU); if (fill) { c.fillStyle = fill; c.fill(); } };
    const ring = (r, col, lw) => { c.beginPath(); c.arc(o, o, r, 0, TAU); c.strokeStyle = col; c.lineWidth = lw; c.stroke(); };
    circ(o, '#14233a');
    // 黄道十二宫环
    const zod = ['ARIES', 'TAURUS', 'GEMINI', 'CANCER', 'LEO', 'VIRGO', 'LIBRA', 'SCORPIO', 'SAGITTA', 'CAPRICOR', 'AQUARIUS', 'PISCES'];
    for (let k = 0; k < 12; k++) {
      const a0 = (k / 12) * TAU - PI / 2, a1 = ((k + 1) / 12) * TAU - PI / 2;
      c.beginPath(); c.moveTo(o, o); c.arc(o, o, o * 0.985, a0, a1); c.closePath();
      c.fillStyle = k % 2 ? '#1d3352' : '#152844'; c.fill();
      c.save(); c.translate(o, o); c.rotate((a0 + a1) / 2 + PI / 2);
      c.fillStyle = '#e3c272'; c.font = 'italic 34px "Times New Roman", serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText(zod[k], 0, -o * 0.905);
      c.restore();
      // 分隔线
      c.beginPath(); c.moveTo(o + Math.cos(a0) * o * 0.84, o + Math.sin(a0) * o * 0.84); c.lineTo(o + Math.cos(a0) * o * 0.98, o + Math.sin(a0) * o * 0.98);
      c.strokeStyle = '#d9b45a'; c.lineWidth = 3; c.stroke();
    }
    ring(o * 0.985, '#e0b450', 8); ring(o * 0.84, '#e0b450', 5);
    // 象牙色时圈
    circ(o * 0.83, '#efe4c6');
    ring(o * 0.81, '#3a2a18', 3); ring(o * 0.74, '#3a2a18', 2); ring(o * 0.5, '#b58a3a', 2);
    // 分钟刻度
    for (let i = 0; i < 60; i++) {
      const a = (i / 60) * TAU; const big = i % 5 === 0;
      const r0 = o * (big ? 0.735 : 0.765), r1 = o * 0.805;
      c.beginPath(); c.moveTo(o + Math.sin(a) * r0, o - Math.cos(a) * r0); c.lineTo(o + Math.sin(a) * r1, o - Math.cos(a) * r1);
      c.strokeStyle = '#2a1e12'; c.lineWidth = big ? 8 : 3; c.stroke();
    }
    // 罗马数字
    const rom = ['XII', 'I', 'II', 'III', 'IIII', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI'];
    c.fillStyle = '#20160c'; c.font = 'bold 78px "Times New Roman", serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * TAU;
      c.save(); c.translate(o + Math.sin(a) * o * 0.62, o - Math.cos(a) * o * 0.62); c.rotate(a); c.fillText(rom[i], 0, 0); c.restore();
    }
    // 中心：藏青星空 + 金色玫瑰线
    circ(o * 0.42, '#1b2a44');
    const r = rng(77);
    for (let i = 0; i < 70; i++) { const a = r() * TAU, d = Math.sqrt(r()) * o * 0.4; c.fillStyle = '#f2dc9a'; c.beginPath(); c.arc(o + Math.cos(a) * d, o + Math.sin(a) * d, 1 + r() * 2.5, 0, TAU); c.fill(); }
    c.strokeStyle = 'rgba(224,180,80,0.55)'; c.lineWidth = 1.5;
    for (let k = 0; k < 36; k++) { c.beginPath(); c.arc(o + Math.cos(k / 36 * TAU) * o * 0.12, o + Math.sin(k / 36 * TAU) * o * 0.12, o * 0.22, 0, TAU); c.stroke(); }
    ring(o * 0.42, '#e0b450', 6);
    c.fillStyle = '#e0b450'; c.font = 'italic 40px "Times New Roman", serif';
    c.fillText('PARIS · NANTES', o, o + o * 0.3);
  });
}

function globeTexture() {
  return canvasTex(1024, 512, (c, W, H) => {
    c.fillStyle = '#cdb98a'; c.fillRect(0, 0, W, H);
    const r = rng(1828);
    // 做旧斑驳
    for (let i = 0; i < 260; i++) { c.fillStyle = `rgba(120,90,40,${0.03 + r() * 0.05})`; c.beginPath(); c.arc(r() * W, r() * H, 6 + r() * 40, 0, TAU); c.fill(); }
    // 大陆（经纬近似：经度 -180..180 → 0..W，纬度 90..-90 → 0..H）
    const conts = [[-100, 45, 34, 26, '#7f8a4c'], [-60, -15, 18, 30, '#a8763e'], [15, 50, 22, 14, '#8a5a3a'], [20, 5, 22, 30, '#b08a48'], [90, 45, 48, 22, '#6f7d48'], [135, -25, 18, 12, '#a06a3a'], [-40, 72, 12, 8, '#e8e0cc'], [0, -80, 180, 8, '#ece6d6']];
    for (const [lon, lat, sx, sy, col] of conts) {
      c.fillStyle = col;
      for (let k = 0; k < 18; k++) {
        const x = (lon + 180 + (r() - 0.5) * sx * 1.4) / 360 * W, y = (90 - lat + (r() - 0.5) * sy * 1.4) / 180 * H;
        c.beginPath(); c.ellipse(x, y, sx * (0.25 + r() * 0.4) / 360 * W, sy * (0.25 + r() * 0.4) / 180 * H, r() * PI, 0, TAU); c.fill();
      }
    }
    // 经纬网
    c.strokeStyle = 'rgba(90,60,25,0.6)'; c.lineWidth = 1.5;
    for (let i = 0; i <= 12; i++) { c.beginPath(); c.moveTo(i / 12 * W, 0); c.lineTo(i / 12 * W, H); c.stroke(); }
    for (let i = 1; i < 6; i++) { c.beginPath(); c.moveTo(0, i / 6 * H); c.lineTo(W, i / 6 * H); c.stroke(); }
    c.strokeStyle = 'rgba(140,30,20,0.8)'; c.lineWidth = 3; c.beginPath(); c.moveTo(0, H / 2); c.lineTo(W, H / 2); c.stroke();
    // 一条航线
    c.setLineDash?.([10, 8]); c.strokeStyle = 'rgba(120,20,20,0.85)'; c.lineWidth = 2.5; c.beginPath();
    for (let i = 0; i <= 60; i++) { const x = i / 60 * W, y = H / 2 + Math.sin(i / 60 * TAU * 2) * H * 0.18; if (i === 0) c.moveTo(x, y); else c.lineTo(x, y); }
    c.stroke();
  });
}

function bannerTexture() {
  return canvasTex(512, 320, (c, W, H) => {
    c.fillStyle = '#1b2a44'; c.fillRect(0, 0, W, H);
    c.strokeStyle = '#e0b450'; c.lineWidth = 14; c.strokeRect(14, 14, W - 28, H - 28);
    c.lineWidth = 4; c.strokeRect(36, 36, W - 72, H - 72);
    c.fillStyle = '#e0b450'; c.font = 'bold 150px "Times New Roman", serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText('JV', W / 2, H / 2 + 6);
    c.fillStyle = '#8e1c18'; c.fillRect(0, H * 0.46, 40, H * 0.08); c.fillRect(W - 40, H * 0.46, 40, H * 0.08);
  });
}

// ---------- 旗帜（顶点波动动画） ----------
function makeFlag(w, h, mat, { pennant = false } = {}) {
  const geo = new THREE.PlaneGeometry(w, h, 18, 6);
  geo.translate(w / 2, -h / 2, 0);
  const p = geo.attributes.position;
  if (pennant) {
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i); const k = x / w; const yc = -h / 2;
      const yn = (y - yc) / (h / 2);
      let nx = x;
      if (k > 0.999) nx = x - w * 0.14 * (1 - Math.abs(yn));
      p.setXYZ(i, nx, yc + (y - yc) * (1 - 0.72 * k), 0);
    }
  }
  geo.computeVertexNormals();
  const base = Float32Array.from(p.array);
  const m = new THREE.Mesh(geo, mat); m.castShadow = true;
  m.userData.dynamic = true;
  const ph = Math.random() * 10;
  m.userData.wave = (t) => {
    for (let i = 0; i < p.count; i++) {
      const x = base[i * 3], y = base[i * 3 + 1]; const k = Math.min(1, x / w);
      const z = (Math.sin(x * 2.1 - t * 4.2 + ph) * 0.16 + Math.sin(x * 4.3 - t * 6.7 + y * 1.3 + ph) * 0.05) * k * (pennant ? 1.4 : 1);
      p.setXYZ(i, x - Math.abs(z) * 0.25, y - k * k * 0.06 * (1 + Math.sin(t * 1.3 + ph)), z);
    }
    p.needsUpdate = true; geo.computeVertexNormals();
  };
  return m;
}

// ═════════════════════════════════════════════════════════════
export function createGate(M, ctx) {
  const group = new THREE.Group(); group.name = 'Gate';
  const S = new THREE.Group(); S.name = 'gate-static'; group.add(S);
  const R = rng(1863);

  // 局部材质（每模块一次）
  const stoneBig = withRepeat(M.stone, 2, 3);
  const stoneMed = withRepeat(M.stone, 2.5, 0.6);
  const cobble = withRepeat(M.cobbles, 10, 5);
  const glassD = M.glass.clone(); glassD.side = THREE.DoubleSide; glassD.depthWrite = false;
  const dialMat = new THREE.MeshStandardMaterial({ map: dialTexture(), roughness: 0.42, metalness: 0.1 });
  const globeMat = new THREE.MeshStandardMaterial({ map: globeTexture(), roughness: 0.55, metalness: 0.05 });
  const bannerMat = new THREE.MeshStandardMaterial({ map: bannerTexture(), roughness: 0.85, side: THREE.DoubleSide });
  const pennantMat = new THREE.MeshStandardMaterial({ color: 0x9a1f1a, roughness: 0.8, side: THREE.DoubleSide });
  const iron = M.ironPlain, black = M.paintBlack;

  // 铆钉统一收集，最后生成一个 InstancedMesh
  const rivP = [], rivN = [];
  const rivet = (p, n) => { rivP.push(p); rivN.push(n); };

  // ─────────── 地面：石板广场 + 罗盘玫瑰 ───────────
  S.add(U.box(40, 0.06, 20, cobble, 0, 0.03, 0));
  for (const z of [-10, 10]) S.add(U.box(40.4, 0.12, 0.3, M.stone, 0, 0.06, z));
  for (const x of [-20, 20]) S.add(U.box(0.3, 0.12, 20, M.stone, x, 0.06, 0));
  {
    const rose = new THREE.Group(); rose.position.y = 0.06;
    rose.add(U.cyl(3.1, 3.1, 0.02, M.stone, 0, 0.01, 0, 48));
    rose.add(U.cyl(2.9, 2.9, 0.022, M.slate, 0, 0.012, 0, 48));
    rose.add(U.cyl(2.2, 2.2, 0.024, M.stone, 0, 0.013, 0, 48));
    for (const [r, tb] of [[3.0, 0.035], [2.25, 0.03], [0.45, 0.03]]) { const t = U.torus(r, tb, M.brass, 0, 0.025, 0, 4, 64); t.rotation.x = PI / 2; t.scale.z = 0.5; rose.add(t); }
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * TAU; const long = i % 4 === 0, mid = i % 2 === 0;
      const s = new THREE.Shape(); const L = long ? 2.85 : mid ? 2.1 : 1.5, w = long ? 0.32 : 0.2;
      s.moveTo(0, 0); s.lineTo(L * 0.25, w); s.lineTo(L, 0); s.lineTo(L * 0.25, -w); s.lineTo(0, 0);
      const g = new THREE.ExtrudeGeometry(s, { depth: 0.02, bevelEnabled: false });
      const m = U.mesh(g, long ? M.gold : mid ? M.brass : M.copper);
      m.rotation.x = -PI / 2; m.rotation.z = a; m.position.y = 0.02 + (long ? 0.006 : 0); rose.add(m);
    }
    rose.add(U.cyl(0.35, 0.35, 0.05, M.gold, 0, 0.025, 0, 24));
    S.add(rose);
  }

  // ─────────── 两座石砌塔门 ───────────
  const capLeaves = (g, x, y, z) => {
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU;
      const l = U.sphere(0.1, M.gold, x + Math.cos(a) * 0.26, y, z + Math.sin(a) * 0.26, 5, 3);
      l.scale.set(0.6, 1.6, 0.6); l.rotation.set(Math.sin(a) * 0.4, 0, -Math.cos(a) * 0.4); g.add(l);
    }
  };
  const column = (g, x, z) => {
    const prof = [[0.36, 0], [0.36, 0.14], [0.31, 0.18], [0.32, 0.23], [0.26, 0.28], [0.25, 0.36], [0.24, 0.6], [0.235, 3.0], [0.215, 5.25], [0.235, 5.3], [0.235, 5.36], [0.215, 5.4], [0.22, 5.5], [0.3, 5.74], [0.38, 5.8], [0.38, 6.0], [0.001, 6.0]];
    const c = U.lathe(prof, M.stone, 20); c.position.set(x, 3.3, z); g.add(c);
    const t1 = U.torus(0.23, 0.03, M.gold, x, 3.3 + 5.33, z, 4, 16); t1.rotation.x = PI / 2; g.add(t1);
    capLeaves(g, x, 3.3 + 5.58, z);
    const t2 = U.torus(0.245, 0.025, M.brass, x, 3.3 + 0.5, z, 4, 16); t2.rotation.x = PI / 2; g.add(t2);
    g.add(U.box(0.84, 0.8, 0.84, M.stone, x, 9.7, z));
    g.add(U.box(0.7, 0.06, 0.7, M.gold, x, 10.08, z));
    g.add(rosette(M, 0.15, x + Math.sign(x) * (Math.abs(x) > 1.9 ? 0.43 : 0), 9.85, z + Math.sign(z) * (Math.abs(z) > 1.9 ? 0.43 : 0), Math.abs(x) > 1.9 ? 'x' : 'z'));
  };
  const divingHelmet = (s) => {
    const h = new THREE.Group();
    h.add(U.lathe([[0.001, 0], [0.34, 0], [0.36, 0.06], [0.3, 0.12], [0.001, 0.14]], M.brass, 24));
    h.add(U.sphere(0.32, M.copper, 0, 0.44, 0, 24, 16));
    for (const [a, y, r] of [[0, 0.46, 0.13], [PI / 2, 0.44, 0.09], [-PI / 2, 0.44, 0.09], [0, 0.7, 0.07]]) {
      const d = new THREE.Vector3(Math.sin(a), (y - 0.44) / 0.32, Math.cos(a)).normalize();
      const p = d.clone().multiplyScalar(0.32).add(V(0, 0.44, 0));
      const port = new THREE.Group(); port.position.copy(p); port.lookAt(p.clone().add(d));
      port.add(U.torus(r, 0.03, M.brass, 0, 0, 0.02, 6, 20));
      put(port, U.cyl(r, r, 0.03, M.glassDark, 0, 0, 0.01, 16)).rotation.x = PI / 2;
      for (let k = 0; k < 3; k++) port.add(U.box(r * 2, 0.012, 0.012, M.brass, 0, (k - 1) * r * 0.55, 0.04));
      h.add(port);
    }
    for (let i = 0; i < 6; i++) { const a = i / 6 * TAU; h.add(U.sphere(0.03, M.brass, Math.cos(a) * 0.33, 0.09, Math.sin(a) * 0.33, 6, 4)); }
    h.scale.setScalar(s);
    return h;
  };
  const brassGlobe = (s) => {
    const g = new THREE.Group();
    g.add(U.lathe([[0.001, 0], [0.22, 0], [0.22, 0.04], [0.08, 0.1], [0.05, 0.3], [0.09, 0.34], [0.001, 0.36]], M.brass, 20));
    const gl = U.sphere(0.26, globeMat, 0, 0.62, 0, 24, 16); gl.rotation.z = 0.41; g.add(gl);
    const mer = U.torus(0.3, 0.015, M.brass, 0, 0.62, 0, 4, 40); mer.rotation.z = 0.41; g.add(mer);
    g.scale.setScalar(s);
    return g;
  };
  const niche = (g, zf, side, kind) => {
    // zf = 面的 z 坐标（±1.9），side = ±1
    const n = new THREE.Group(); n.position.set(0, 0, zf); if (side < 0) n.rotation.y = PI;
    n.add(U.box(1.36, 2.3, 0.06, M.ornament, 0, 5.35, 0.02));
    const arch = U.torus(0.68, 0.06, M.stone, 0, 6.5, 0.05, 6, 24, PI); n.add(arch);
    const back = U.mesh(new THREE.CircleGeometry(0.66, 20, 0, PI), M.paintNavy); back.position.set(0, 6.5, 0.04); n.add(back);
    for (const x of [-0.72, 0.72]) n.add(U.box(0.12, 2.3, 0.1, M.stone, x, 5.35, 0.05));
    n.add(U.box(1.6, 0.12, 0.3, M.stone, 0, 4.2, 0.15));
    n.add(U.box(1.3, 0.05, 0.26, M.brass, 0, 4.28, 0.15));
    put(n, U.lathe([[0.3, 0], [0.3, 0.08], [0.22, 0.14], [0.18, 0.6], [0.26, 0.66], [0.28, 0.72], [0.001, 0.72]], M.stone, 16)).position.set(0, 4.3, 0.18);
    const obj = kind === 0 ? divingHelmet(1.15) : brassGlobe(1.3); obj.position.set(0, 5.02, 0.18); n.add(obj);
    // 徽章
    const med = U.cyl(0.55, 0.55, 0.08, M.patina, 0, 8.25, 0.04, 32); med.rotation.x = PI / 2; n.add(med);
    n.add(U.torus(0.56, 0.06, M.gold, 0, 8.25, 0.08, 6, 36));
    for (let i = 0; i < 8; i++) { const a = i / 8 * TAU; const ray = U.mesh(rayGeo(0.06, 0.42, 0.12, 0.03), M.gold); ray.rotation.z = a; ray.position.set(0, 8.25, 0.1); n.add(ray); }
    n.add(U.sphere(0.12, M.gold, 0, 8.25, 0.12, 12, 8));
    // 月桂枝（两侧弧形小叶）
    for (const sx of [-1, 1]) for (let i = 0; i < 7; i++) {
      const a = -PI / 2 + sx * (0.5 + i * 0.32); const l = U.sphere(0.07, M.gold, Math.cos(a) * 0.72, 8.25 + Math.sin(a) * 0.72, 0.06, 5, 3);
      l.scale.set(0.5, 1.4, 0.4); l.rotation.z = a; n.add(l);
    }
    g.add(n);
  };

  const pylon = (sx) => {
    const g = new THREE.Group(); g.position.x = sx * 10;
    // 台基
    g.add(U.box(4.9, 0.3, 4.9, stoneMed, 0, 0.15, 0));
    g.add(U.box(4.55, 0.45, 4.55, stoneMed, 0, 0.525, 0));
    g.add(U.box(4.65, 0.1, 4.65, M.stone, 0, 0.8, 0));
    // 粗面石砌基座（凹缝）
    g.add(U.box(4.1, 2.2, 4.1, stoneMed, 0, 1.95, 0));
    for (let i = 0; i < 5; i++) g.add(U.box(4.26, 0.38, 4.26, stoneMed, 0, 0.85 + 0.22 + i * 0.44, 0));
    g.add(U.box(4.42, 0.16, 4.42, M.stone, 0, 3.13, 0));
    g.add(U.box(4.3, 0.1, 4.3, M.stone, 0, 3.26, 0));
    // 柱身
    g.add(U.box(3.8, 6.0, 3.8, stoneBig, 0, 6.3, 0));
    for (const cx of [-1.72, 1.72]) for (const cz of [-1.72, 1.72]) g.add(U.box(0.42, 6.0, 0.42, stoneMed, cx, 6.3, cz));
    // 壁柱
    for (const z of [-2.02, 2.02]) for (const x of [-1.12, 1.12]) column(g, x, z);
    for (const z of [-1.12, 1.12]) column(g, sx * 2.02, z);
    // 壁龛（正面潜水头盔 / 背面地球仪）
    niche(g, 1.9, 1, sx > 0 ? 1 : 0);
    niche(g, -1.9, -1, sx > 0 ? 0 : 1);
    // 外侧面：纪念铭牌
    {
      const pl = new THREE.Group(); pl.position.set(sx * 1.92, 0, 0); pl.rotation.y = sx * PI / 2;
      pl.add(U.box(1.5, 2.6, 0.05, M.ornamentRed, 0, 6.0, 0.02));
      for (const y of [4.68, 7.32]) pl.add(U.box(1.62, 0.08, 0.08, M.gold, 0, y, 0.05));
      for (const x of [-0.78, 0.78]) pl.add(U.box(0.08, 2.72, 0.08, M.gold, x, 6.0, 0.05));
      pl.add(rosette(M, 0.28, 0, 8.1, 0.08));
      g.add(pl);
    }
    // 内侧：拱脚托石
    g.add(U.box(0.6, 0.45, 2.2, M.stone, -sx * 2.1, 4.75, 0));
    g.add(U.box(0.45, 0.18, 2.0, M.stone, -sx * 2.05, 4.45, 0));
    // 檐部：额枋 + 饰带 + 齿饰 + 檐口
    g.add(U.box(4.05, 0.35, 4.05, M.stone, 0, 9.475, 0));
    g.add(U.box(3.95, 0.45, 3.95, M.paintNavy, 0, 9.875, 0));
    for (let i = 0; i < 4; i++) {
      const a = i * PI / 2;
      for (const k of [-0.55, 0, 0.55]) {
        const ro = rosette(M, 0.14, 0, 0, 0); ro.position.set(Math.sin(a) * 1.99 + Math.cos(a) * k, 9.875, Math.cos(a) * 1.99 - Math.sin(a) * k);
        ro.rotation.y = a; g.add(ro);
      }
    }
    for (let i = 0; i < 4; i++) {
      const a = i * PI / 2; const nx = Math.sin(a), nz = Math.cos(a), tx = Math.cos(a), tz = -Math.sin(a);
      for (let k = 0; k < 19; k++) { const s = -2.0 + k * (4.0 / 18); g.add(U.box(0.09, 0.1, 0.09, M.stone, nx * 2.08 + tx * s, 10.15, nz * 2.08 + tz * s)); }
    }
    g.add(U.box(4.5, 0.2, 4.5, M.stone, 0, 10.3, 0));
    g.add(U.box(4.62, 0.12, 4.62, M.stone, 0, 10.46, 0));
    // 女儿墙（阁楼层）+ 铜绿嵌板
    g.add(U.box(3.4, 0.98, 3.4, stoneMed, 0, 11.01, 0));
    for (let i = 0; i < 4; i++) {
      const a = i * PI / 2; const p = new THREE.Group(); p.rotation.y = a;
      p.add(U.box(2.3, 0.56, 0.05, M.patina, 0, 11.0, 1.71));
      for (const y of [10.7, 11.3]) p.add(U.box(2.42, 0.05, 0.06, M.gold, 0, y, 1.73));
      for (const x of [-1.18, 1.18]) p.add(U.box(0.05, 0.65, 0.06, M.gold, x, 11.0, 1.73));
      g.add(p);
    }
    g.add(U.box(3.6, 0.1, 3.6, M.stone, 0, 11.55, 0));
    // 四角铜瓮 + 金焰
    for (const cx of [-1.95, 1.95]) for (const cz of [-1.95, 1.95]) {
      const u = U.lathe([[0.001, 0], [0.2, 0], [0.2, 0.06], [0.12, 0.12], [0.1, 0.24], [0.24, 0.38], [0.3, 0.55], [0.26, 0.72], [0.17, 0.78], [0.2, 0.84], [0.001, 0.86]], M.brass, 18);
      u.position.set(cx, 10.52, cz); g.add(u);
      const f = U.sphere(0.13, M.gold, cx, 11.52, cz, 10, 8); f.scale.set(1, 1.5, 1); g.add(f);
      const fc = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.4, 8), M.gold); fc.position.set(cx, 11.8, cz); g.add(fc);
      for (const sxx of [-1, 1]) { const h = U.torus(0.12, 0.022, M.brass, cx + sxx * 0.28, 10.98, cz, 4, 12, PI * 1.2); h.rotation.y = PI / 2 * (cx * cz > 0 ? 1 : 0); g.add(h); }
    }
    // 鼓座 + 圆顶
    g.add(U.cyl(1.45, 1.5, 0.75, M.stone, 0, 11.98, 0, 32));
    for (let i = 0; i < 12; i++) { const a = i / 12 * TAU; put(g, U.box(0.14, 0.75, 0.12, M.stone, Math.sin(a) * 1.5, 11.98, Math.cos(a) * 1.5)).rotation.y = a; }
    for (let i = 0; i < 4; i++) {
      const a = i / 4 * TAU + PI / 4;
      const o = new THREE.Group(); o.position.set(Math.sin(a) * 1.47, 12.0, Math.cos(a) * 1.47); o.rotation.y = a;
      o.add(U.torus(0.2, 0.04, M.brass, 0, 0, 0.04, 6, 20));
      const gl = U.mesh(new THREE.CircleGeometry(0.19, 20), M.glowWarm); gl.position.z = 0.03; gl.castShadow = false; o.add(gl);
      g.add(o);
    }
    g.add(U.cyl(1.62, 1.62, 0.12, M.stone, 0, 12.41, 0, 32));
    const domeProf = [[1.56, 0], [1.5, 0.1], [1.42, 0.35], [1.25, 0.7], [1.0, 1.0], [0.72, 1.24], [0.46, 1.44], [0.3, 1.6], [0.25, 1.72], [0.3, 1.8], [0.2, 1.9], [0.001, 1.95]];
    const dome = U.lathe(domeProf, M.patina, 40); dome.position.y = 12.47; g.add(dome);
    for (let k = 0; k < 8; k++) {
      const a = k / 8 * TAU;
      const pts = domeProf.slice(0, 8).map(([r, y]) => V(Math.sin(a) * (r + 0.03), 12.47 + y, Math.cos(a) * (r + 0.03)));
      g.add(U.tube(pts, 0.035, M.gold, false, 24, 5));
    }
    const ring2 = U.torus(1.55, 0.05, M.gold, 0, 12.5, 0, 6, 48); ring2.rotation.x = PI / 2; g.add(ring2);
    // 塔顶金饰 + 旗杆
    g.add(U.sphere(0.2, M.gold, 0, 14.45, 0, 16, 12));
    g.add(U.rod(V(0, 14.4, 0), V(0, 17.6, 0), 0.045, M.brass, 8, 0.03));
    g.add(U.sphere(0.09, M.gold, 0, 17.66, 0, 10, 8));
    const pen = makeFlag(2.6, 0.7, pennantMat, { pennant: true }); pen.position.set(0, 17.45, 0.0); pen.rotation.y = sx > 0 ? 0.25 : PI - 0.25;
    group.add(pen); pen.position.x = sx * 10; flags.push(pen);
    // 内侧壁挂灯
    {
      const bz = 1.2;
      for (const z of [-bz, bz]) {
        const br = new THREE.Group(); br.position.set(-sx * 1.9, 3.9, z);
        br.add(U.box(0.08, 0.5, 0.25, black, 0, 0, 0));
        put(br, scrollMesh(scrollHalf(0.42, 0.1, 1.3).map((p) => V(p.x + 0.04, p.y - 0.05, 0)), 0.022, black)).rotation.x = PI;
        br.add(U.rod(V(0.04, 0.12, 0), V(0.62, 0.05, 0), 0.025, black, 6));
        br.add(U.rod(V(0.62, 0.05, 0), V(0.62, -0.18, 0), 0.012, black, 4));
        // br 局部 +X 指向拱洞内侧；绕 Y 旋转实现
        br.rotation.y = sx > 0 ? PI : 0;
        const l = U.lantern(M, 1.05); l.position.set(0.62, -0.95, 0); br.add(l);
        g.add(br);
      }
    }
    return g;
  };

  const flags = [];
  S.add(pylon(-1)); S.add(pylon(1));

  // ─────────── 铆接格构铁拱（双肋） ───────────
  const CY = 5.0, R_IN = 8.0, R_OUT = 8.9, RIB_Z = 0.85, NA = 32;
  const P = (r, th, z) => V(Math.cos(th) * r, CY + Math.sin(th) * r, z);
  for (const zs of [-1, 1]) {
    const z = zs * RIB_Z;
    for (let i = 0; i < NA; i++) {
      const t0 = (i / NA) * PI, t1 = ((i + 1) / NA) * PI, tm = (t0 + t1) / 2;
      // 内外弦杆（腹板 + 翼缘）
      S.add(beam(P(R_IN + 0.12, t0, z), P(R_IN + 0.12, t1, z), 0.22, 0.12, iron));
      S.add(beam(P(R_IN + 0.0, t0, z), P(R_IN + 0.0, t1, z), 0.05, 0.42, iron));
      S.add(beam(P(R_OUT - 0.12, t0, z), P(R_OUT - 0.12, t1, z), 0.22, 0.12, iron));
      S.add(beam(P(R_OUT, t0, z), P(R_OUT, t1, z), 0.05, 0.42, iron));
      // 双向斜腹杆（格构）+ 中心铁环
      S.add(beam(P(R_IN + 0.2, t0, z), P(R_OUT - 0.2, t1, z), 0.05, 0.07, iron));
      S.add(beam(P(R_OUT - 0.2, t0, z), P(R_IN + 0.2, t1, z), 0.05, 0.07, iron));
      const ring = U.torus(0.2, 0.026, iron, 0, 0, 0, 4, 14); ring.position.copy(P((R_IN + R_OUT) / 2, tm, z)); S.add(ring);
      if (i % 2 === 0) { const ro = U.sphere(0.06, M.gold, 0, 0, 0, 8, 6); ro.position.copy(P((R_IN + R_OUT) / 2, tm, z + zs * 0.05)); S.add(ro); }
      // 铆钉：翼缘两排
      for (const f of [0.5]) {
        const th = t0 + (t1 - t0) * f;
        for (const dz of [-0.15, 0.15]) {
          rivet(P(R_OUT + 0.025, th, z + dz), V(Math.cos(th), Math.sin(th), 0));
          rivet(P(R_IN - 0.025, th, z + dz), V(-Math.cos(th), -Math.sin(th), 0));
        }
      }
      // 外缘金色尖饰（cresting）
      if (i > 1 && i < NA - 1) {
        const sp = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.34, 6), M.gold);
        sp.position.copy(P(R_OUT + 0.2, t0, z)); sp.rotation.z = t0 - PI / 2; S.add(sp);
        const b = U.sphere(0.055, M.gold, 0, 0, 0, 5, 4); b.position.copy(P(R_OUT + 0.05, t0, z)); S.add(b);
      }
    }
    // 径向竖杆
    for (let i = 0; i <= NA; i++) { const th = (i / NA) * PI; S.add(beam(P(R_IN + 0.1, th, z), P(R_OUT - 0.1, th, z), 0.08, 0.1, iron)); }
  }
  // 两肋间横撑 + 顶面交叉拉杆
  for (let i = 0; i <= NA; i += 2) {
    const th = (i / NA) * PI;
    for (const r of [R_IN + 0.12, R_OUT - 0.12]) S.add(beam(P(r, th, -RIB_Z), P(r, th, RIB_Z), 0.09, 0.09, iron, V(Math.cos(th), Math.sin(th), 0)));
    if (i < NA) {
      const th2 = ((i + 2) / NA) * PI;
      S.add(U.rod(P(R_OUT - 0.05, th, -RIB_Z), P(R_OUT - 0.05, th2, RIB_Z), 0.018, iron, 4));
      S.add(U.rod(P(R_OUT - 0.05, th, RIB_Z), P(R_OUT - 0.05, th2, -RIB_Z), 0.018, iron, 4));
    }
  }

  // ─────────── 扇形玻璃拱心（z=0 平面） ───────────
  {
    const N = 12, rHub = 2.5, rMid = 5.25, rEdge = 7.95;
    for (let k = 0; k < N; k++) {
      const a0 = (k / N) * PI, a1 = ((k + 1) / N) * PI;
      for (const [r0, r1] of [[rHub, rMid], [rMid, rEdge]]) {
        const m = U.mesh(new THREE.ShapeGeometry(sectorShape(r0 + 0.02, r1 - 0.02, a0 + 0.004, a1 - 0.004, 8)), glassD);
        m.position.y = CY; m.castShadow = false; S.add(m);
      }
    }
    for (let k = 1; k < N; k++) { const a = (k / N) * PI; S.add(beam(P(rHub, a, 0), P(rEdge, a, 0), 0.09, 0.14, iron)); }
    for (const r of [rHub, rMid, rEdge]) {
      for (let i = 0; i < 36; i++) { const a0 = (i / 36) * PI, a1 = ((i + 1) / 36) * PI; S.add(beam(P(r, a0, 0), P(r, a1, 0), 0.1, r === rEdge ? 0.2 : 0.14, iron)); }
    }
    // 中层装饰小铁环
    for (let k = 0; k < N; k++) { const a = ((k + 0.5) / N) * PI; const t = U.torus(0.38, 0.03, iron, 0, 0, 0, 5, 20); t.position.copy(P((rMid + rEdge) / 2, a, 0)); S.add(t); const t2 = U.torus(0.22, 0.025, M.brass, 0, 0, 0, 4, 16); t2.position.copy(P((rHub + rMid) / 2, a, 0)); S.add(t2); }
    // 中心：金色旭日
    const sunBack = new THREE.ExtrudeGeometry(sectorShape(0, rHub - 0.03, 0, PI, 24), { depth: 0.06, bevelEnabled: false });
    sunBack.translate(0, 0, -0.03);
    const sb = U.mesh(sunBack, M.paintNavy); sb.position.y = CY; S.add(sb);
    for (let k = 0; k <= 16; k++) {
      const a = (k / 16) * PI; const long = k % 2 === 0;
      const ray = U.mesh(rayGeo(0.55, long ? 2.35 : 1.75, long ? 0.26 : 0.18, 0.14), M.gold); ray.position.y = CY; ray.rotation.z = a; S.add(ray);
    }
    const hub = U.cyl(0.55, 0.55, 0.22, M.brass, 0, CY, 0, 32, false); hub.rotation.x = PI / 2; S.add(hub);
    const hubT = U.torus(0.55, 0.05, M.gold, 0, CY, 0, 6, 32); S.add(hubT);
  }

  // ─────────── 拱脚横梁（铆接板梁）+ 花边垂饰 ───────────
  {
    const yb = 4.35, yt = 5.0;
    for (const z of [-RIB_Z, RIB_Z]) {
      S.add(U.box(16.2, yt - yb, 0.06, iron, 0, (yb + yt) / 2, z));
      for (let x = -7.5; x <= 7.51; x += 1.0) S.add(U.box(0.08, yt - yb, 0.06, iron, x, (yb + yt) / 2, z + Math.sign(z) * 0.05));
      for (let x = -7; x <= 7.01; x += 1.0) { const r = rosette(M, 0.13, x, (yb + yt) / 2, z + Math.sign(z) * 0.06); if (z < 0) r.rotation.y = PI; S.add(r); }
      for (let x = -7.9; x <= 7.91; x += 0.32) for (const y of [yb + 0.06, yt - 0.06]) rivet(V(x, y, z + Math.sign(z) * 0.03), V(0, 0, Math.sign(z)));
      // 花边垂饰
      for (let i = 0; i < 32; i++) {
        const x = -7.75 + i * 0.5;
        const ar = U.torus(0.25, 0.022, black, x, yb - 0.02, z, 3, 10, PI); ar.rotation.z = PI; S.add(ar);
        S.add(U.sphere(0.045, M.gold, x - 0.25, yb - 0.08, z, 6, 4));
        const dr = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.14, 6), M.gold); dr.position.set(x, yb - 0.36, z); dr.rotation.z = PI; S.add(dr);
      }
    }
    S.add(U.box(16.3, 0.06, 1.95, iron, 0, yt + 0.03, 0));
    S.add(U.box(16.3, 0.06, 1.95, iron, 0, yb - 0.03, 0));
    // 吊灯
    for (const x of [-4.2, 4.2]) {
      S.add(U.rod(V(x, yb - 0.05, 0), V(x, yb - 0.65, 0), 0.015, black, 4));
      for (let k = 0; k < 6; k++) { const t = U.torus(0.04, 0.009, black, x, yb - 0.1 - k * 0.09, 0, 3, 8); t.rotation.y = k % 2 ? PI / 2 : 0; S.add(t); }
      const l = U.lantern(M, 1.35); l.position.set(x, yb - 1.62, 0); S.add(l);
    }
  }

  // ─────────── 招牌（正面 / 背面） ───────────
  const signFrame = (zs, text, sub) => {
    const g = new THREE.Group(); g.position.z = zs * 1.05; if (zs < 0) g.rotation.y = PI;
    const W = 10.6, H = 1.62, yc = 5.95;
    const sb = U.signBoard(text, W, H, { w: 2048, h: 320, bg: '#14262a', fg: '#ecc977', border: '#c9a24a', font: 'bold 118px "Playfair Display", "Times New Roman", serif', sub, edge: M.brass });
    sb.position.set(0, yc, 0); g.add(sb);
    for (const y of [yc - H / 2 - 0.05, yc + H / 2 + 0.05]) g.add(U.box(W + 0.24, 0.1, 0.14, M.brass, 0, y, 0));
    for (const x of [-W / 2 - 0.07, W / 2 + 0.07]) g.add(U.box(0.1, H + 0.2, 0.14, M.brass, x, yc, 0));
    for (const x of [-W / 2 - 0.07, W / 2 + 0.07]) for (const y of [yc - H / 2 - 0.05, yc + H / 2 + 0.05]) g.add(U.sphere(0.11, M.gold, x, y, 0.05, 10, 8));
    // 两侧 S 涡卷托架
    for (const sx of [-1, 1]) {
      const sc = scrollMesh(sScrollPts(0.35, 0.22, 1.4), 0.03, M.gold);
      sc.position.set(sx * (W / 2 + 0.6), yc, 0); sc.rotation.z = sx > 0 ? PI / 2 : -PI / 2; sc.scale.x = sx; g.add(sc);
    }
    // 立柱支撑
    for (const x of [-3.6, 0, 3.6]) g.add(U.box(0.08, 0.2, 0.08, M.brass, x, yc - H / 2 - 0.2, 0));
    // 顶部金星冠饰
    const crest = new THREE.Group(); crest.position.set(0, yc + H / 2 + 0.55, 0.02);
    crest.add(U.torus(0.36, 0.05, M.brass, 0, 0, 0, 6, 32));
    for (let k = 0; k < 8; k++) { const r = U.mesh(rayGeo(0.0, k % 2 ? 0.3 : 0.44, 0.16, 0.06), M.gold); r.rotation.z = k / 8 * TAU + PI / 2; crest.add(r); }
    for (let k = 0; k < 12; k++) { const r = U.mesh(rayGeo(0.42, 0.62, 0.08, 0.04), M.gold); r.rotation.z = k / 12 * TAU; crest.add(r); }
    for (const sx of [-1, 1]) { const sc = scrollMesh(scrollHalf(0.5, 0.16, 1.4), 0.028, M.gold); sc.position.set(sx * 0.4, -0.42, 0); sc.scale.x = sx; crest.add(sc); }
    g.add(crest);
    return g;
  };
  S.add(signFrame(1, 'VOYAGES EXTRAORDINAIRES', 'JULES VERNE · 1828–1905'));
  S.add(signFrame(-1, 'BON VOYAGE !', 'De la Terre à la Lune · Vingt mille lieues sous les mers'));

  // ─────────── 拱肩涡卷（拱外弧与塔门之间） ───────────
  for (const sx of [-1, 1]) for (const zs of [-1, 1]) {
    const z = zs * RIB_Z;
    const a = V(sx * 8.05, 10.55, z), b = P(R_OUT, sx > 0 ? 0.92 : PI - 0.92, z);
    const mid = a.clone().lerp(b, 0.5); const ang = Math.atan2(b.y - a.y, b.x - a.x);
    const sc = scrollMesh(sScrollPts(0.32, 0.32, 1.35), 0.04, black);
    sc.position.copy(mid); sc.rotation.z = ang; sc.scale.setScalar(a.distanceTo(b) / 2.2); S.add(sc);
    S.add(U.sphere(0.1, M.gold, a.x, a.y, z, 8, 6));
  }

  // ─────────── 天文钟（拱顶鼓座） ───────────
  const CLK_Y = 13.2, DRUM_R = 1.62, DRUM_L = 2.5;
  const hands = [];
  {
    const drum = U.cyl(DRUM_R, DRUM_R, DRUM_L, M.patina, 0, CLK_Y, 0, 56); drum.rotation.x = PI / 2; S.add(drum);
    for (let i = 0; i < 16; i++) { const a = i / 16 * TAU; const rb = U.box(0.07, 0.07, DRUM_L - 0.1, M.brass, Math.cos(a) * (DRUM_R + 0.02), CLK_Y + Math.sin(a) * (DRUM_R + 0.02), 0); rb.rotation.z = a; S.add(rb); }
    for (const zs of [-1, 1]) {
      const zf = zs * (DRUM_L / 2);
      S.add(U.torus(DRUM_R + 0.02, 0.1, M.brass, 0, CLK_Y, zf, 8, 64));
      S.add(U.torus(DRUM_R - 0.13, 0.045, M.gold, 0, CLK_Y, zf + zs * 0.04, 6, 64));
      S.add(U.torus(0.42 * 1.5, 0.018, M.gold, 0, CLK_Y, zf + zs * 0.03, 4, 48));
      const face = U.mesh(new THREE.CircleGeometry(1.5, 64), dialMat); face.position.set(0, CLK_Y, zf + zs * 0.012); if (zs < 0) face.rotation.y = PI; S.add(face);
      // 立体金色时标
      for (let i = 0; i < 12; i++) {
        const a = i / 12 * TAU;
        const bt = U.box(0.05, i % 3 === 0 ? 0.2 : 0.13, 0.03, M.gold, Math.sin(a) * 1.16, CLK_Y + Math.cos(a) * 1.16, zf + zs * 0.03); bt.rotation.z = -a; S.add(bt);
      }
      for (let i = 0; i < 24; i++) { const a = i / 24 * TAU; S.add(U.sphere(0.035, M.gold, Math.sin(a) * (DRUM_R + 0.13), CLK_Y + Math.cos(a) * (DRUM_R + 0.13), zf + zs * 0.08, 6, 4)); }
      // 光芒（在肋前方，表盘后方）
      for (let k = 0; k < 28; k++) {
        const a = (k / 28) * TAU + PI / 28; const deg = (a * 180 / PI) % 360;
        if (deg > 58 && deg < 122) continue; // 顶部留给基座
        const long = k % 2 === 0;
        const ray = U.mesh(rayGeo(DRUM_R + 0.05, DRUM_R + (long ? 1.15 : 0.7), long ? 0.24 : 0.16, 0.04), M.gold);
        ray.position.set(0, CLK_Y, zs * 1.1); ray.rotation.z = a; S.add(ray);
      }
      // 指针（动态）
      const hg = new THREE.Group(); hg.position.set(0, CLK_Y, zf + zs * 0.05); if (zs < 0) hg.rotation.y = PI;
      const mkHand = (len, w, tail, mat, z, pomme) => {
        const s = new THREE.Shape();
        s.moveTo(-w * 0.55, -tail); s.lineTo(w * 0.55, -tail); s.lineTo(w * 0.42, 0); s.lineTo(w * 0.28, len * 0.7);
        s.lineTo(w * 0.95, len * 0.8); s.lineTo(0, len); s.lineTo(-w * 0.95, len * 0.8); s.lineTo(-w * 0.28, len * 0.7); s.lineTo(-w * 0.42, 0); s.lineTo(-w * 0.55, -tail);
        const h = new THREE.Group(); h.position.z = z; h.userData.dynamic = true;
        h.add(U.mesh(new THREE.ExtrudeGeometry(s, { depth: 0.025, bevelEnabled: false }), mat));
        if (pomme) h.add(U.torus(w * 1.1, w * 0.3, mat, 0, len * pomme, 0.012, 4, 16));
        h.add(U.sphere(w * 1.3, M.gold, 0, -tail, 0.012, 8, 6));
        return h;
      };
      const hourH = mkHand(0.82, 0.09, 0.22, black, 0.0, 0.62);
      const minH = mkHand(1.28, 0.065, 0.3, black, 0.035, 0.66);
      hg.add(hourH); hg.add(minH);
      let sunH = null;
      if (zs > 0) {
        sunH = new THREE.Group(); sunH.position.z = 0.07; sunH.userData.dynamic = true;
        sunH.add(U.box(0.025, 1.0, 0.012, M.gold, 0, 0.5, 0));
        const sd = U.cyl(0.1, 0.1, 0.03, M.gold, 0, 1.08, 0, 20); sd.rotation.x = PI / 2; sunH.add(sd);
        for (let k = 0; k < 12; k++) { const r = U.mesh(rayGeo(0.1, 0.19, 0.05, 0.02), M.gold); r.position.y = 1.08; r.rotation.z = k / 12 * TAU; sunH.add(r); }
        hg.add(sunH);
      }
      put(hg, U.cyl(0.07, 0.07, 0.16, M.gold, 0, 0, 0.06, 16)).rotation.x = PI / 2;
      hg.userData.dynamic = true;
      group.add(hg);
      hands.push({ hourH, minH, sunH });
    }
    // 月相球（表盘上方小窗）
    const moon = new THREE.Group(); moon.position.set(0, CLK_Y + 0.36, DRUM_L / 2 + 0.022); moon.userData.dynamic = true;
    moon.add(U.mesh(new THREE.CircleGeometry(0.15, 24, 0, PI), M.gold));
    moon.add(U.mesh(new THREE.CircleGeometry(0.15, 24, PI, PI), M.paintNavy));
    group.add(moon);
    hands.moon = moon;
    S.add(U.torus(0.16, 0.018, M.brass, 0, CLK_Y + 0.36, DRUM_L / 2 + 0.02, 4, 24));
    // 鼓座两端拱形托架
    for (const sx of [-1, 1]) {
      const sc = scrollMesh(scrollHalf(0.6, 0.35, 1.4), 0.05, M.gold);
      sc.position.set(sx * 0.55, CLK_Y + DRUM_R + 0.05, 0); sc.scale.x = sx; S.add(sc);
    }
  }

  // ─────────── 浑天仪 + 小型太阳系仪 ───────────
  let ARM_Y = 16.45;
  const armDyn = {};
  {
    const PED = CLK_Y + DRUM_R - 0.25; // 基座底
    S.add(U.box(1.9, 0.3, 1.4, M.stone, 0, PED + 0.15, 0));
    put(S, U.lathe([[0.001, 0], [0.92, 0], [0.92, 0.12], [0.72, 0.2], [0.56, 0.34], [0.5, 0.6], [0.62, 0.7], [0.74, 0.78], [0.74, 0.86], [0.001, 0.86]].map(([r, y]) => [r, y + 0.3]), M.brass, 32)).position.y = PED;
    const pedTop = PED + 1.16;
    ARM_Y = pedTop + 0.98;
    put(S, U.torus(0.72, 0.035, M.gold, 0, pedTop, 0, 6, 40)).rotation.x = PI / 2;
    // 支腿
    for (let k = 0; k < 4; k++) {
      const a = PI / 4 + k * PI / 2; const c = Math.cos(a), s = Math.sin(a);
      S.add(U.tube([V(0.62 * c, pedTop, 0.62 * s), V(0.88 * c, pedTop + 0.14, 0.88 * s), V(1.19 * c, ARM_Y - 0.4, 1.19 * s), V(1.13 * c, ARM_Y - 0.05, 1.13 * s)], 0.035, M.brass, false, 20, 6));
      S.add(U.sphere(0.06, M.gold, 1.19 * c, ARM_Y - 0.4, 1.19 * s, 8, 6));
    }
    // 地平环（宽带）
    put(S, U.lathe([[1.07, -0.045], [1.17, -0.045], [1.17, 0.045], [1.07, 0.045], [1.07, -0.045]], M.brass, 72)).position.y = ARM_Y;
    for (const y of [-0.05, 0.05]) put(S, U.torus(1.17, 0.012, M.gold, 0, ARM_Y + y, 0, 4, 72)).rotation.x = PI / 2;
    // 子午环（固定，竖直）
    S.add(U.torus(1.02, 0.04, M.brass, 0, ARM_Y, 0, 8, 72));
    S.add(U.torus(1.07, 0.012, M.gold, 0, ARM_Y, 0, 4, 72));
    for (let i = 0; i < 36; i++) { const a = i / 36 * TAU; const tk = U.box(0.012, 0.05, 0.09, M.gold, Math.cos(a) * 1.07, ARM_Y + Math.sin(a) * 1.07, 0); tk.rotation.z = a; S.add(tk); }
    // 顶部金太阳
    S.add(U.sphere(0.12, M.gold, 0, ARM_Y + 1.14, 0, 14, 10));
    for (let k = 0; k < 12; k++) { const r = U.mesh(rayGeo(0.12, k % 2 ? 0.22 : 0.3, 0.07, 0.03), M.gold); r.position.set(0, ARM_Y + 1.14, 0); r.rotation.z = k / 12 * TAU; S.add(r); }

    // 倾斜极轴组（南特纬度 47°）
    const tilt = new THREE.Group(); tilt.position.y = ARM_Y; tilt.rotation.z = -(PI / 2 - 47.2 * PI / 180); tilt.userData.dynamic = true;
    group.add(tilt);
    const axis = U.rod(V(0, -1.22, 0), V(0, 1.22, 0), 0.022, M.steel, 8); tilt.add(axis);
    tilt.add(U.sphere(0.05, M.gold, 0, 1.24, 0, 8, 6)); tilt.add(U.sphere(0.05, M.gold, 0, -1.24, 0, 8, 6));
    const rot = new THREE.Group();
    const eq = U.torus(0.93, 0.032, M.gold, 0, 0, 0, 6, 64); eq.rotation.x = PI / 2; rot.add(eq);
    const eps = 23.44 * PI / 180;
    for (const sy of [-1, 1]) {
      const tr = U.torus(0.93 * Math.cos(eps), 0.014, M.brass, 0, sy * 0.93 * Math.sin(eps), 0, 4, 56); tr.rotation.x = PI / 2; rot.add(tr);
      const ac = U.torus(0.93 * Math.sin(eps), 0.012, M.brass, 0, sy * 0.93 * Math.cos(eps), 0, 4, 32); ac.rotation.x = PI / 2; rot.add(ac);
    }
    rot.add(U.torus(0.93, 0.022, M.brass, 0, 0, 0, 5, 64));
    const col2 = U.torus(0.93, 0.022, M.brass, 0, 0, 0, 5, 64); col2.rotation.y = PI / 2; rot.add(col2);
    // 黄道带（宽带 + 刻度）
    const ecl = new THREE.Group(); ecl.rotation.x = eps;
    ecl.add(U.lathe([[0.9, -0.07], [0.97, -0.07], [0.97, 0.07], [0.9, 0.07], [0.9, -0.07]], M.ornament, 64));
    for (let i = 0; i < 12; i++) { const a = i / 12 * TAU; const m = U.box(0.02, 0.15, 0.05, M.gold, Math.cos(a) * 0.98, 0, Math.sin(a) * 0.98); m.rotation.y = -a; ecl.add(m); }
    rot.add(ecl);
    U.mergeStatic(rot); rot.userData.dynamic = true; tilt.add(rot);
    const globe = U.sphere(0.36, globeMat, 0, 0, 0, 40, 28); globe.userData.dynamic = true; tilt.add(globe);
    armDyn.rot = rot; armDyn.globe = globe;

    // 太阳系仪悬臂：两颗行星绕基座公转
    const orb = (rad, ballR, mat, h, saturn) => {
      const g = new THREE.Group(); g.position.y = pedTop - 0.12;
      g.add(U.rod(V(0.5, 0, 0), V(rad, 0, 0), 0.02, M.brass, 6));
      g.add(U.rod(V(rad, 0, 0), V(rad, h, 0), 0.016, M.brass, 6));
      g.add(U.sphere(ballR, mat, rad, h + ballR, 0, 16, 12));
      if (saturn) { const t = U.torus(ballR * 1.7, ballR * 0.12, M.gold, rad, h + ballR, 0, 4, 32); t.rotation.x = PI / 2 - 0.4; g.add(t); }
      else { g.add(U.rod(V(rad, h + ballR, 0), V(rad + 0.28, h + ballR, 0), 0.008, M.brass, 4)); g.add(U.sphere(0.04, M.steel, rad + 0.3, h + ballR, 0, 8, 6)); }
      g.add(U.cyl(0.52, 0.52, 0.05, M.brass, 0, 0, 0, 24));
      U.mergeStatic(g); g.userData.dynamic = true; group.add(g);
      return g;
    };
    armDyn.p1 = orb(1.5, 0.1, M.copper, 0.32, false);
    armDyn.p2 = orb(1.85, 0.13, M.steel, 0.5, true);
  }

  // ─────────── 两侧售票亭（八角铜绿穹顶） ───────────
  const kiosk = (sx) => {
    const g = new THREE.Group(); g.position.set(sx * 15, 0, 0.6);
    const oct = (rt, rb, h, mat, y) => { const c = U.cyl(rt, rb, h, mat, 0, y, 0, 8); c.rotation.y = PI / 8; return c; };
    g.add(oct(2.0, 2.05, 0.3, M.stone, 0.15));
    g.add(oct(1.78, 1.78, 0.8, M.woodDark, 0.7));
    for (let k = 0; k < 8; k++) {
      const a = k / 8 * TAU; const f = new THREE.Group(); f.rotation.y = a;
      f.add(U.box(0.92, 0.48, 0.04, M.paintTeal, 0, 0.7, 1.66));
      f.add(U.box(0.7, 0.3, 0.03, M.ornament, 0, 0.7, 1.69));
      g.add(f);
    }
    g.add(oct(1.88, 1.88, 0.07, M.brass, 1.13));
    g.add(oct(1.7, 1.7, 1.1, M.glowWindow, 1.72));
    for (let k = 0; k < 8; k++) {
      const a = k / 8 * TAU + PI / 8; const x = Math.sin(a) * 1.76, z = Math.cos(a) * 1.76;
      g.add(U.cyl(0.05, 0.05, 1.1, M.paintTeal, x, 1.72, z, 8));
      g.add(U.sphere(0.07, M.gold, x, 2.3, z, 8, 6));
      const fa = k / 8 * TAU; const fx = Math.sin(fa), fz = Math.cos(fa);
      // 窗格横档
      const bar = U.box(1.3, 0.035, 0.035, M.paintTeal, fx * 1.58, 2.0, fz * 1.58); bar.rotation.y = fa; g.add(bar);
      const bar2 = U.box(0.035, 1.1, 0.035, M.paintTeal, fx * 1.58, 1.72, fz * 1.58); bar2.rotation.y = fa; g.add(bar2);
    }
    // 售票窗口（正面）铜栅 + 台板
    for (let i = -4; i <= 4; i++) g.add(U.rod(V(i * 0.08, 1.2, 1.6), V(i * 0.08, 1.75, 1.6), 0.009, M.brass, 4));
    g.add(U.box(0.8, 0.04, 0.3, M.brass, 0, 1.18, 1.72));
    const fan = U.torus(0.34, 0.025, M.brass, 0, 1.75, 1.6, 4, 18, PI); g.add(fan);
    // 檐板 + 招牌
    g.add(oct(1.84, 1.84, 0.36, M.paintTeal, 2.45));
    for (const y of [2.29, 2.61]) g.add(oct(1.87, 1.87, 0.04, M.gold, y));
    const sign = U.signBoard('BILLETS', 1.1, 0.28, { w: 512, h: 128, font: 'bold 80px "Times New Roman", serif', bg: '#1f5c5e', edge: M.gold });
    sign.position.set(0, 2.45, 1.75); g.add(sign);
    g.add(oct(2.1, 2.0, 0.12, M.paintTeal, 2.69));
    // 穹顶
    const prof = [[2.08, 0], [2.0, 0.08], [1.82, 0.22], [1.5, 0.5], [1.1, 0.85], [0.68, 1.15], [0.36, 1.4], [0.2, 1.55], [0.24, 1.63], [0.12, 1.72], [0.001, 1.75]];
    const dome = U.lathe(prof, M.patina, 8); dome.rotation.y = PI / 8; dome.position.y = 2.75; g.add(dome);
    for (let k = 0; k < 8; k++) {
      const a = k / 8 * TAU + PI / 8;
      g.add(U.tube(prof.slice(0, 8).map(([r, y]) => V(Math.sin(a) * (r + 0.025), 2.75 + y, Math.cos(a) * (r + 0.025))), 0.03, M.gold, false, 20, 5));
      // 檐口垂饰
      for (let j = 0; j < 3; j++) {
        const a0 = a + (j + 0.5) / 3 * (PI / 4) - PI / 8;
        const dr = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.16, 6), M.gold); dr.position.set(Math.sin(a0) * 2.0, 2.58, Math.cos(a0) * 2.0); dr.rotation.z = PI; g.add(dr);
      }
    }
    g.add(U.sphere(0.13, M.gold, 0, 4.55, 0, 12, 8));
    const sp = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.5, 8), M.gold); sp.position.y = 4.88; g.add(sp);
    // 售票员
    const p = U.person(sx > 0 ? 41 : 42); p.position.set(0, 0.3, 0.4); g.add(p);
    // 排队栏杆
    for (let i = 0; i < 3; i++) {
      const x = -0.9 + i * 0.9; put(g, U.lathe([[0.15, 0], [0.15, 0.03], [0.04, 0.06], [0.03, 0.9], [0.05, 0.95], [0.001, 0.98]], M.brass, 12)).position.set(x, 0.06, 3.0);
      if (i < 2) g.add(U.tube([V(x, 0.9, 3.0), V(x + 0.45, 0.72, 3.0), V(x + 0.9, 0.9, 3.0)], 0.022, M.paintRed, false, 10, 5));
    }
    return g;
  };
  S.add(kiosk(-1)); S.add(kiosk(1));

  // ─────────── 铸铁围栏 ───────────
  const fence = (x0, x1) => {
    const g = new THREE.Group();
    const len = Math.abs(x1 - x0), xm = (x0 + x1) / 2, dir = Math.sign(x1 - x0);
    g.add(U.box(len, 0.55, 0.45, stoneMed, xm, 0.275, 0));
    g.add(U.box(len, 0.08, 0.56, M.stone, xm, 0.59, 0));
    const n = Math.round(len / 0.17);
    for (const y of [0.82, 1.78, 2.08]) g.add(U.box(len, 0.05, 0.04, black, xm, y, 0));
    for (let i = 1; i < n; i++) {
      const x = x0 + dir * i * (len / n); const tall = i % 4 === 0;
      const top = tall ? 2.48 : 2.22;
      g.add(U.rod(V(x, 0.63, 0), V(x, top, 0), 0.014, black, 5));
      const sp = new THREE.Mesh(new THREE.ConeGeometry(tall ? 0.04 : 0.028, tall ? 0.16 : 0.1, 6), M.gold); sp.position.set(x, top + (tall ? 0.08 : 0.05), 0); g.add(sp);
      if (tall) { const fl = U.sphere(0.035, M.gold, x, top - 0.04, 0, 6, 4); g.add(fl); }
      if (i < n) { const t = U.torus(0.065, 0.012, black, x + dir * len / n / 2, 1.93, 0, 3, 10); g.add(t); }
      if (i % 2 === 0) { const t = U.torus(0.06, 0.01, black, x, 0.72, 0, 3, 6, PI); t.rotation.z = PI; g.add(t); }
    }
    // 石墩
    const piers = Math.max(1, Math.round(len / 3));
    for (let k = 0; k <= piers; k++) {
      const x = x0 + dir * k * (len / piers);
      g.add(U.box(0.62, 2.5, 0.62, stoneMed, x, 1.25, 0));
      g.add(U.box(0.78, 0.12, 0.78, M.stone, x, 2.56, 0));
      g.add(U.box(0.68, 0.08, 0.68, M.stone, x, 2.66, 0));
      const panel = U.box(0.4, 1.1, 0.04, M.patina, x, 1.45, 0.32); g.add(panel);
      const panel2 = U.box(0.4, 1.1, 0.04, M.patina, x, 1.45, -0.32); g.add(panel2);
      put(g, U.lathe([[0.001, 0], [0.16, 0], [0.16, 0.04], [0.07, 0.1], [0.05, 0.16], [0.001, 0.17]], M.brass, 12)).position.set(x, 2.7, 0);
      g.add(U.sphere(0.17, M.brass, x, 3.02, 0, 12, 8));
      g.add(U.sphere(0.05, M.gold, x, 3.21, 0, 8, 6));
    }
    return g;
  };
  S.add(fence(-17.4, -26)); S.add(fence(17.4, 26));
  // 塔门与售票亭之间矮栏

  // ─────────── 旗杆（围栏前） ───────────
  for (const sx of [-1, 1]) {
    const x = sx * 21.8, z = 2.2;
    put(S, U.lathe([[0.001, 0], [0.55, 0], [0.55, 0.25], [0.45, 0.3], [0.35, 0.6], [0.22, 0.7], [0.16, 0.9], [0.001, 0.9]], M.stone, 16)).position.set(x, 0, z);
    put(S, U.torus(0.16, 0.03, M.brass, x, 0.88, z, 6, 16)).rotation.x = PI / 2;
    S.add(U.rod(V(x, 0.85, z), V(x, 10.4, z), 0.08, black, 10, 0.045));
    S.add(U.sphere(0.12, M.gold, x, 10.5, z, 12, 8));
    const f = makeFlag(2.5, 1.6, bannerMat); f.position.set(x, 10.2, z); f.rotation.y = sx > 0 ? 0.2 : PI - 0.2;
    group.add(f); flags.push(f);
  }

  // ─────────── 路灯 ───────────
  for (const [x, z] of [[-6.6, 4.4], [6.6, 4.4], [-6.6, -4.4], [6.6, -4.4], [-12.8, 4.6], [12.8, 4.6]]) {
    const l = U.lampPost(M, { h: 4.2, arms: 2 }); l.position.set(x, 0.06, z); l.rotation.y = PI / 2; S.add(l);
  }

  // ─────────── 游客 ───────────
  const statics = [[-3.2, 6.5, 0.2], [-2.6, 6.8, -0.4], [4.6, 7.4, 3.0], [-14.2, 3.4, PI], [-15.4, 4.2, PI], [15.0, 3.6, PI + 0.3], [10.2, -6.5, 0.8], [1.5, -7.6, 2.4]];
  statics.forEach(([x, z, ry], i) => { const p = U.person(100 + i, { child: i === 4 }); p.position.set(x, 0.06, z); p.rotation.y = ry; S.add(p); });
  const walkers = [];
  for (let i = 0; i < 5; i++) {
    const p = U.person(200 + i, { child: i === 3 }); p.userData.dynamic = true;
    p.userData.walk = { off: i * 8.3, x: -2.6 + i * 1.3 + (R() - 0.5) * 0.6, speed: 1.0 + R() * 0.3, dir: i % 2 ? 1 : -1 };
    group.add(p); walkers.push(p);
  }

  // ─────────── 铆钉 InstancedMesh ───────────
  const rv = U.rivetsAt(rivP, rivN, 0.028, iron); rv.castShadow = false; group.add(rv);

  // ─────────── 夜间灯光 ───────────
  const l1 = new THREE.PointLight(0xffb868, 0, 30, 2); l1.position.set(0, 4.2, 3.2); group.add(l1); ctx.addNightLight(l1, 60);
  const l2 = new THREE.PointLight(0xffd8a0, 0, 12, 2); l2.position.set(0, CLK_Y, 3.6); group.add(l2); ctx.addNightLight(l2, 18);

  U.mergeStatic(S);

  return {
    group,
    focus: { pos: [0, 7.5, 32], target: [0, 8.5, 0] },
    footprint: 26,
    update(t, dt, env) {
      // 时钟：分针约 60s 一圈（观赏用加速），时针 12 倍慢
      const m = -t * (TAU / 60), h = m / 12;
      for (const hh of hands) { if (!hh.hourH) continue; hh.minH.rotation.z = m; hh.hourH.rotation.z = h - 1.2; if (hh.sunH) hh.sunH.rotation.z = -t * (TAU / 240) + 0.7; }
      hands.moon.rotation.z = t * 0.05;
      armDyn.rot.rotation.y = t * 0.12;
      armDyn.globe.rotation.y = t * 0.45;
      armDyn.p1.rotation.y = t * 0.35;
      armDyn.p2.rotation.y = -t * 0.16 + 2;
      for (const f of flags) f.userData.wave(t);
      for (const p of walkers) {
        const w = p.userData.walk; const span = 34;
        const s = ((t * w.speed + w.off) % span + span) % span;
        p.position.set(w.x, 0.06, w.dir < 0 ? 17 - s : -17 + s);
        p.rotation.y = w.dir < 0 ? PI : 0;
        U.animatePerson(p, t, w.speed);
      }
    },
  };
}

// ─────────────────────────────────────────────────────────────
//  《八十天环游地球》蒸汽火车（Le Tour du monde en quatre-vingts jours, 1872）
//  · 美式 4-4-0 蒸汽机车：菱形烟囱、排障器、大头灯、铜钟、汽包
//    主动轮 + 连杆 + 十字头真实曲柄运动，左右两侧相位差 90°
//  · 煤水车 + 两节木制客车（采光顶、敞开式端台、转向架随弯道偏转）
//  · 环园铁路：道砟、枕木、钢轨；道口铺板与交叉警示牌
//  · 查令十字车站：站台雨棚、钟楼、行程表、“第 N 天 / 80”计日牌
//    水塔、臂板信号机；每圈在站台停靠
//  · 烟囱随车轮节拍喷出的蒸汽团（世界空间粒子，留下真实的烟迹）
// ─────────────────────────────────────────────────────────────
import * as THREE from 'three';
import * as U from '../util.js';
import { withRepeat } from '../materials.js';
import { railRoute, shoreZ } from '../world.js';

const { V } = U;
const TAU = Math.PI * 2;
const GAUGE = 0.7175;     // 半轨距（标准轨 1435 mm）
const RAIL_Y = 0.47;      // 轨面高度

// ---------- 通用：沿轨道扫掠截面 ----------
function sweep(samples, profile, mat, uLen = 2) {
  const n = samples.length, m = profile.length;
  const pos = [], uv = [], idx = [];
  let arc = 0;
  for (let i = 0; i <= n; i++) {
    const s = samples[i % n];
    if (i > 0) arc += s.p.distanceTo(samples[(i - 1) % n].p);
    const side = V(s.t.z, 0, -s.t.x);
    for (let j = 0; j <= m; j++) {
      const [a, b] = profile[j % m];
      pos.push(s.p.x + side.x * a, s.p.y + b, s.p.z + side.z * a);
      uv.push(arc / uLen, j / m);
    }
  }
  const row = m + 1;
  for (let i = 0; i < n; i++) for (let j = 0; j < m; j++) {
    const a = i * row + j, b = (i + 1) * row + j;
    idx.push(a, b, a + 1, b, b + 1, a + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  // 确保法线朝外：取截面中心检查第一个面
  const cx = profile.reduce((s, p) => s + p[0], 0) / m, cy = profile.reduce((s, p) => s + p[1], 0) / m;
  const s0 = samples[0], side0 = V(s0.t.z, 0, -s0.t.x);
  const center = s0.p.clone().addScaledVector(side0, cx).setY(s0.p.y + cy);
  const pa = g.attributes.position, A = V().fromBufferAttribute(pa, idx[0]), B = V().fromBufferAttribute(pa, idx[1]), C = V().fromBufferAttribute(pa, idx[2]);
  const nrm = V().crossVectors(B.clone().sub(A), C.clone().sub(A));
  if (nrm.dot(A.clone().add(B).add(C).multiplyScalar(1 / 3).sub(center)) < 0) {
    for (let k = 0; k < idx.length; k += 3) { const t = idx[k + 1]; idx[k + 1] = idx[k + 2]; idx[k + 2] = t; }
    g.setIndex(idx); g.computeVertexNormals();
  }
  const mesh = new THREE.Mesh(g, mat); mesh.receiveShadow = true; mesh.castShadow = false;
  return mesh;
}

// ---------- 辐条车轮（轴向 Z） ----------
function spokedWheel(M, r, { spokes = 14, counter = false, crank = 0, paint } = {}) {
  const g = new THREE.Group();
  const red = paint || M.paintRed;
  const tyre = new THREE.LatheGeometry([[r - 0.08, -0.065], [r, -0.065], [r, 0.04], [r + 0.055, 0.055], [r + 0.055, 0.075], [r - 0.08, 0.075], [r - 0.08, -0.065]].map(([a, b]) => new THREE.Vector2(a, b)), 40);
  tyre.rotateX(Math.PI / 2);
  g.add(U.mesh(tyre, M.steel));
  const rim = new THREE.LatheGeometry([[r - 0.15, -0.05], [r - 0.08, -0.05], [r - 0.08, 0.05], [r - 0.15, 0.05], [r - 0.15, -0.05]].map(([a, b]) => new THREE.Vector2(a, b)), 40);
  rim.rotateX(Math.PI / 2);
  g.add(U.mesh(rim, red));
  const hubR = Math.max(0.09, r * 0.2);
  g.add(U.cyl(hubR, hubR * 1.15, 0.16, red, 0, 0, 0, 16).rotateX(Math.PI / 2));
  g.add(U.cyl(hubR * 0.5, hubR * 0.5, 0.2, M.brass, 0, 0, 0.02, 12).rotateX(Math.PI / 2));
  for (let k = 0; k < spokes; k++) {
    const a = (k / spokes) * TAU;
    const sp = U.rod(V(Math.cos(a) * hubR * 0.9, Math.sin(a) * hubR * 0.9, 0), V(Math.cos(a) * (r - 0.12), Math.sin(a) * (r - 0.12), 0), r * 0.032, red, 6, r * 0.024);
    g.add(sp);
  }
  if (counter) {
    const s = new THREE.Shape();
    const a0 = Math.PI - 0.62, a1 = Math.PI + 0.62, ri = r * 0.38, ro = r - 0.14;
    s.absarc(0, 0, ro, a0, a1, false); s.absarc(0, 0, ri, a1, a0, true);
    const cg = new THREE.ExtrudeGeometry(s, { depth: 0.09, bevelEnabled: false, curveSegments: 12 }); cg.translate(0, 0, -0.045);
    g.add(U.mesh(cg, red));
  }
  if (crank > 0) {
    g.add(U.cyl(0.11, 0.11, 0.14, red, crank, 0, 0.06, 14).rotateX(Math.PI / 2));
    g.add(U.cyl(0.05, 0.05, 0.22, M.steel, crank, 0, 0.12, 10).rotateX(Math.PI / 2));
  }
  U.mergeStatic(g);
  return g;
}

// ---------- 转向架（两轴四轮） ----------
function bogie(M, wheelT, wb = 1.6) {
  const g = new THREE.Group();
  const wheels = [];
  for (const x of [-wb / 2, wb / 2]) for (const z of [-GAUGE, GAUGE]) {
    const w = wheelT.clone(); w.position.set(x, 0, z); if (z < 0) w.rotation.y = Math.PI; g.add(w); wheels.push(w);
  }
  const fr = new THREE.Group();
  for (const z of [-0.95, 0.95]) {
    fr.add(U.box(wb + 0.9, 0.18, 0.1, M.ironPlain, 0, 0.0, z));
    fr.add(U.box(0.5, 0.35, 0.12, M.ironPlain, 0, -0.05, z)); // 轴箱弹簧座
    for (const x of [-wb / 2, wb / 2]) fr.add(U.box(0.28, 0.3, 0.14, M.ironPlain, x, 0, z));
    for (let k = 0; k < 3; k++) fr.add(U.torus(0.07, 0.02, M.steel, 0, 0.18 + k * 0.05, z, 4, 10).rotateX(Math.PI / 2));
  }
  fr.add(U.box(0.25, 0.2, 2.0, M.ironPlain, 0, 0.15, 0));
  for (const x of [-wb / 2, wb / 2]) fr.add(U.cyl(0.05, 0.05, 1.7, M.steel, x, 0, 0, 8).rotateX(Math.PI / 2));
  U.mergeStatic(fr);
  g.add(fr);
  g.userData.wheels = wheels;
  return g;
}

// ---------- 画布贴图 ----------
function canvasTex(w, h, draw) {
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const cx = cv.getContext('2d'); draw(cx, w, h);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  t.userData = { cv, cx };
  return t;
}
function plane(tex, w, h, extra = {}) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6, metalness: 0.1, ...extra }));
  m.castShadow = false; m.receiveShadow = true;
  return m;
}
const SERIF = '"Playfair Display", "Times New Roman", serif';

// 行程表
function itineraryTexture() {
  const legs = [
    ['LONDRES', '2 oct.', 'Charing Cross'], ['SUEZ', '9 oct.', 'paquebot Mongolia'], ['BOMBAY', '20 oct.', 'paquebot Mongolia'],
    ['CALCUTTA', '25 oct.', 'éléphant Kiouni'], ['HONG-KONG', '6 nov.', 'paquebot Rangoon'], ['YOKOHAMA', '14 nov.', 'Tankadère'],
    ['SAN FRANCISCO', '3 déc.', 'General Grant'], ['NEW YORK', '11 déc.', 'Pacific Railroad'], ['LONDRES', '21 déc.', 'Henrietta'],
  ];
  return canvasTex(1024, 768, (cx, w, h) => {
    const g = cx.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#16261f'); g.addColorStop(1, '#0d1813');
    cx.fillStyle = g; cx.fillRect(0, 0, w, h);
    cx.strokeStyle = '#c9a24a'; cx.lineWidth = 10; cx.strokeRect(14, 14, w - 28, h - 28); cx.lineWidth = 2; cx.strokeRect(32, 32, w - 64, h - 64);
    cx.fillStyle = '#ecd28a'; cx.textAlign = 'center'; cx.font = `bold 54px ${SERIF}`;
    cx.fillText('LE TOUR DU MONDE', w / 2, 100);
    cx.font = `italic 34px ${SERIF}`; cx.fillText('en quatre-vingts jours · 1872', w / 2, 146);
    cx.fillStyle = '#c9a24a'; cx.fillRect(120, 170, w - 240, 3);
    legs.forEach(([city, date, via], i) => {
      const y = 222 + i * 58;
      cx.textAlign = 'left'; cx.fillStyle = '#efe3c6'; cx.font = `bold 34px ${SERIF}`; cx.fillText(city, 90, y);
      cx.textAlign = 'center'; cx.fillStyle = '#ecd28a'; cx.font = `30px ${SERIF}`; cx.fillText(date, 600, y);
      cx.textAlign = 'right'; cx.fillStyle = '#a9b8a2'; cx.font = `italic 28px ${SERIF}`; cx.fillText(via, w - 90, y);
      cx.strokeStyle = 'rgba(201,162,74,0.3)'; cx.lineWidth = 1; cx.beginPath(); cx.moveTo(90, y + 16); cx.lineTo(w - 90, y + 16); cx.stroke();
    });
  });
}
// 计日牌
function drawDay(tex, n) {
  const { cx, cv } = tex.userData; const w = cv.width, h = cv.height;
  cx.fillStyle = '#1a1410'; cx.fillRect(0, 0, w, h);
  cx.strokeStyle = '#c9a24a'; cx.lineWidth = 8; cx.strokeRect(10, 10, w - 20, h - 20);
  cx.fillStyle = '#ecd28a'; cx.textAlign = 'center'; cx.textBaseline = 'middle';
  cx.font = `italic 40px ${SERIF}`; cx.fillText('Jour', w / 2, 62);
  cx.font = `bold 120px ${SERIF}`; cx.fillText(String(n), w / 2, 160);
  cx.font = `34px ${SERIF}`; cx.fillText('sur 80', w / 2, 240);
  tex.needsUpdate = true;
}
// 钟面
function clockTexture() {
  return canvasTex(256, 256, (cx, w) => {
    cx.fillStyle = '#f3ead2'; cx.beginPath(); cx.arc(w / 2, w / 2, w / 2 - 4, 0, TAU); cx.fill();
    cx.strokeStyle = '#2a1e10'; cx.lineWidth = 6; cx.stroke();
    cx.fillStyle = '#2a1e10'; cx.textAlign = 'center'; cx.textBaseline = 'middle'; cx.font = `bold 26px ${SERIF}`;
    const R = ['XII', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI'];
    R.forEach((s, i) => { const a = (i / 12) * TAU - Math.PI / 2; cx.fillText(s, w / 2 + Math.cos(a) * 96, w / 2 + Math.sin(a) * 96); });
    for (let i = 0; i < 60; i++) { const a = (i / 60) * TAU; const r0 = i % 5 ? 116 : 110; cx.beginPath(); cx.moveTo(w / 2 + Math.cos(a) * r0, w / 2 + Math.sin(a) * r0); cx.lineTo(w / 2 + Math.cos(a) * 122, w / 2 + Math.sin(a) * 122); cx.lineWidth = i % 5 ? 2 : 4; cx.stroke(); }
  });
}
// 交叉警示牌
function crossbuckTexture() {
  return canvasTex(1024, 128, (cx, w, h) => {
    cx.fillStyle = '#f2efe6'; cx.fillRect(0, 0, w, h);
    cx.strokeStyle = '#1a1a1a'; cx.lineWidth = 8; cx.strokeRect(6, 6, w - 12, h - 12);
    cx.fillStyle = '#1a1a1a'; cx.textAlign = 'center'; cx.textBaseline = 'middle'; cx.font = `bold 78px ${SERIF}`;
    cx.fillText('RAILROAD  CROSSING', w / 2, h / 2 + 4);
  });
}

// ═════════════════════════════════════════════════════════════
//  机车
// ═════════════════════════════════════════════════════════════
function buildLocomotive(M) {
  const loco = new THREE.Group();
  const body = new THREE.Group(); loco.add(body);
  const RW = 0.86, RT = 0.42;            // 主动轮 / 导轮半径
  const DRV = [0.0, -2.3];               // 主动轮轴位置
  const CRANK = 0.4, YC = 1.12, MAINROD = 2.25, ZROD = 0.98;
  const boilerY = 2.15, boilerR = 0.72;
  const green = M.paintGreen, black = M.paintBlack, red = M.paintRed;

  // —— 车架 & 走板 ——
  for (const z of [-0.5, 0.5]) body.add(U.box(9.0, 0.32, 0.14, black, 0.2, 1.1, z));
  for (const s of [-1, 1]) {
    body.add(U.box(5.2, 0.05, 0.42, M.deck, 0.5, 1.52, s * 0.98));
    body.add(U.box(5.2, 0.05, 0.03, M.brass, 0.5, 1.5, s * 1.2));
    body.add(U.box(5.2, 0.22, 0.03, red, 0.5, 1.38, s * 1.19));
  }
  // —— 锅炉 ——
  const boiler = U.cyl(boilerR, boilerR, 5.0, green, 0.5, boilerY, 0, 32); boiler.rotation.z = Math.PI / 2; body.add(boiler);
  for (const x of [-1.6, -0.55, 0.6, 1.75, 2.85]) body.add(U.torus(boilerR + 0.012, 0.028, M.brass, x, boilerY, 0, 6, 40).rotateY(Math.PI / 2));
  // 马车顶式火箱（锥形过渡）
  const fb = U.lathe([[boilerR, 0], [0.82, 0.55], [0.82, 1.25]], green, 32); fb.rotation.z = Math.PI / 2; fb.position.set(-2.0, boilerY + 0.06, 0); body.add(fb);
  body.add(U.box(1.3, 1.3, 1.5, green, -2.9, 1.65, 0));
  // 烟箱
  const sb = U.cyl(0.79, 0.79, 1.55, black, 3.78, boilerY, 0, 32); sb.rotation.z = Math.PI / 2; body.add(sb);
  body.add(U.cyl(0.84, 0.84, 0.08, black, 3.0, boilerY, 0, 32).rotateZ(Math.PI / 2));
  // 烟箱门：铰链、把手、编号牌
  body.add(U.cyl(0.74, 0.76, 0.1, black, 4.58, boilerY, 0, 32).rotateZ(Math.PI / 2));
  body.add(U.torus(0.74, 0.035, M.brass, 4.63, boilerY, 0, 6, 40).rotateY(Math.PI / 2));
  for (const y of [0.35, -0.35]) body.add(U.box(0.04, 0.06, 1.05, M.steel, 4.65, boilerY + y, 0.15));
  body.add(U.cyl(0.08, 0.08, 0.1, M.brass, 4.66, boilerY, 0, 10).rotateZ(Math.PI / 2));
  {
    const plate = new THREE.Mesh(new THREE.CircleGeometry(0.28, 32), new THREE.MeshStandardMaterial({ map: canvasTex(256, 256, (cx, w) => {
      cx.fillStyle = '#1a2a1e'; cx.beginPath(); cx.arc(w / 2, w / 2, w / 2 - 2, 0, TAU); cx.fill();
      cx.strokeStyle = '#e6c56a'; cx.lineWidth = 14; cx.stroke(); cx.fillStyle = '#e6c56a'; cx.textAlign = 'center'; cx.textBaseline = 'middle';
      cx.font = `bold 120px ${SERIF}`; cx.fillText('80', w / 2, w / 2 + 6);
    }), metalness: 0.6, roughness: 0.3 }));
    plate.position.set(4.66, boilerY - 0.38, 0); plate.rotation.y = Math.PI / 2; body.add(plate);
  }
  // —— 菱形烟囱 ——
  const stackBase = boilerY + 0.62;
  body.add(U.lathe([[0.26, 0], [0.24, 0.12], [0.22, 0.7], [0.3, 0.82], [0.64, 1.22], [0.72, 1.42], [0.62, 1.54], [0.3, 1.6], [0.26, 1.64], [0, 1.64]], black, 28).translateX(3.85).translateY(stackBase));
  body.add(U.torus(0.24, 0.035, M.brass, 3.85, stackBase + 0.7, 0, 6, 24).rotateX(Math.PI / 2));
  body.add(U.torus(0.71, 0.03, M.brass, 3.85, stackBase + 1.42, 0, 6, 32).rotateX(Math.PI / 2));
  const stackTip = new THREE.Object3D(); stackTip.position.set(3.85, stackBase + 1.7, 0); body.add(stackTip);
  // —— 大头灯 ——
  {
    const L = new THREE.Group(); L.position.set(4.45, boilerY + 0.95, 0);
    L.add(U.box(0.9, 0.08, 0.7, black, 0, -0.04, 0));
    const side = withRepeat(M.ornamentRed, 1, 1);
    L.add(U.box(0.75, 0.62, 0.66, black, 0, 0.32, 0));
    for (const s of [-1, 1]) { const p = U.box(0.62, 0.48, 0.02, side, 0, 0.32, s * 0.34); L.add(p); }
    L.add(U.box(0.8, 0.06, 0.72, M.brass, 0, 0.65, 0));
    L.add(U.lathe([[0.2, 0], [0.08, 0.18], [0.1, 0.32], [0.14, 0.36], [0, 0.4]], black, 12).translateY(0.68));
    L.add(U.sphere(0.06, M.gold, 0, 1.12, 0, 10, 8));
    const lens = U.cyl(0.25, 0.25, 0.05, M.glowWarm, 0.39, 0.32, 0, 24); lens.rotation.z = Math.PI / 2; L.add(lens);
    L.add(U.torus(0.27, 0.035, M.brass, 0.41, 0.32, 0, 6, 28).rotateY(Math.PI / 2));
    body.add(L);
  }
  // —— 铜钟（带轭架） ——
  {
    const B = new THREE.Group(); B.position.set(2.15, boilerY + 0.66, 0);
    for (const z of [-0.22, 0.22]) B.add(U.box(0.06, 0.55, 0.05, M.brass, 0, 0.28, z));
    B.add(U.box(0.08, 0.06, 0.52, M.brass, 0, 0.55, 0));
    B.add(U.lathe([[0.04, 0.5], [0.1, 0.48], [0.13, 0.36], [0.16, 0.2], [0.22, 0.1], [0.23, 0.07], [0.2, 0.07]], M.brass, 24));
    B.add(U.sphere(0.04, M.brass, 0, 0.12, 0, 8, 6));
    B.add(U.box(0.5, 0.06, 0.4, green, 0, 0.0, 0));
    body.add(B);
  }
  // —— 汽包、砂箱、安全阀、汽笛 ——
  body.add(U.lathe([[0.4, 0], [0.4, 0.36], [0.37, 0.46], [0.27, 0.56], [0.1, 0.6], [0, 0.61]], M.brass, 28).translateX(0.75).translateY(boilerY + 0.6));
  body.add(U.lathe([[0.36, 0], [0.36, 0.3], [0.3, 0.38], [0, 0.42]], green, 24).translateX(-0.6).translateY(boilerY + 0.62));
  body.add(U.torus(0.36, 0.03, M.brass, -0.6, boilerY + 0.92, 0, 6, 24).rotateX(Math.PI / 2));
  body.add(U.cyl(0.07, 0.09, 0.3, M.brass, 0.75, boilerY + 1.35, 0, 12));
  body.add(U.lathe([[0.06, 0], [0.06, 0.3], [0.09, 0.34], [0.05, 0.4], [0, 0.42]], M.brass, 12).translateX(0.75).translateY(boilerY + 1.48));
  const whistleTip = new THREE.Object3D(); whistleTip.position.set(0.75, boilerY + 1.95, 0); body.add(whistleTip);
  for (const z of [-0.12, 0.12]) body.add(U.cyl(0.05, 0.06, 0.28, M.brass, -1.6, boilerY + 0.85, z, 10));
  // 扶手
  for (const s of [-1, 1]) {
    body.add(U.rod(V(-2.1, boilerY + 0.3, s * 0.83), V(3.0, boilerY + 0.3, s * 0.83), 0.02, M.brass, 6));
    for (const x of [-1.2, 0.3, 1.8]) body.add(U.rod(V(x, boilerY + 0.3, s * 0.83), V(x, boilerY + 0.15, s * 0.7), 0.015, M.brass, 4));
  }
  // —— 汽缸 & 阀室 ——
  for (const s of [-1, 1]) {
    const cylG = U.cyl(0.33, 0.33, 1.05, black, 3.45, YC, s * 1.05, 24); cylG.rotation.z = Math.PI / 2; body.add(cylG);
    for (const x of [2.93, 3.97]) body.add(U.cyl(0.36, 0.36, 0.06, M.brass, x, YC, s * 1.05, 24).rotateZ(Math.PI / 2));
    body.add(U.box(0.9, 0.34, 0.42, black, 3.45, YC + 0.42, s * 1.05));
    body.add(U.box(0.94, 0.04, 0.46, M.brass, 3.45, YC + 0.6, s * 1.05));
    body.add(U.rod(V(3.45, YC + 0.6, s * 1.0), V(3.3, boilerY + 0.1, s * 0.62), 0.09, black, 10)); // 蒸汽管
    // 滑板（十字头导轨）
    for (const dy of [-0.11, 0.11]) body.add(U.box(1.35, 0.05, 0.08, M.steel, 2.28, YC + dy, s * ZROD));
    body.add(U.box(0.12, 0.4, 0.3, black, 2.98, YC, s * ZROD * 0.95));
  }
  // —— 排障器（牛栏） ——
  body.add(U.box(0.28, 0.3, 2.4, red, 4.78, 1.0, 0));
  body.add(U.box(0.3, 0.05, 2.42, M.brass, 4.78, 1.17, 0));
  for (let k = 0; k <= 11; k++) {
    const z0 = -1.08 + k * (2.16 / 11);
    body.add(U.rod(V(4.92, 0.92, z0), V(5.85 - Math.abs(z0) * 0.65, 0.12, z0 * 0.3), 0.025, red, 5));
  }
  body.add(U.rod(V(5.85, 0.12, -0.33), V(5.85, 0.12, 0.33), 0.03, red, 5));
  for (const s of [-1, 1]) body.add(U.rod(V(4.92, 0.92, s * 1.08), V(5.85, 0.12, s * 0.33), 0.035, red, 6));
  body.add(U.box(0.3, 0.14, 0.18, M.ironPlain, 5.0, 1.02, 0)); // 车钩
  // —— 司机室 ——
  {
    const C = new THREE.Group();
    const X0 = -2.2, X1 = -4.65, W = 1.36, Y0 = 1.5, Y1 = 3.75;
    const wood = withRepeat(M.wood, 1, 1);
    C.add(U.box(X0 - X1 + 0.1, 0.08, W * 2, M.deck, (X0 + X1) / 2, Y0, 0));
    for (const s of [-1, 1]) {
      C.add(U.box(X0 - X1, 1.0, 0.07, wood, (X0 + X1) / 2, Y0 + 0.5, s * W));         // 下墙板
      C.add(U.box(X0 - X1, 0.3, 0.07, wood, (X0 + X1) / 2, Y1 - 0.15, s * W));        // 上横梁
      for (const x of [X0, (X0 + X1) / 2, X1]) C.add(U.box(0.1, Y1 - Y0, 0.09, M.woodDark, x, (Y0 + Y1) / 2, s * W));
      for (const x of [X0 - 0.6, X1 + 0.6]) { const gl = U.box(1.05, 0.95, 0.02, M.glass, x, Y0 + 1.55, s * W); gl.castShadow = false; C.add(gl); }
      C.add(U.box(X0 - X1, 0.05, 0.1, M.brass, (X0 + X1) / 2, Y0 + 1.02, s * W));
      // 编号牌
      const np = U.signBoard('Nº 80', 0.8, 0.32, { bg: '#1b2a1e', fg: '#e6c56a', font: `bold 140px ${SERIF}` });
      np.position.set((X0 + X1) / 2, Y0 + 0.55, s * (W + 0.05)); if (s < 0) np.rotation.y = Math.PI; C.add(np);
    }
    // 前墙（锅炉穿过）+ 圆窗
    for (const s of [-1, 1]) {
      C.add(U.box(0.07, Y1 - Y0, 0.52, wood, X0, (Y0 + Y1) / 2, s * (W - 0.26)));
      C.add(U.torus(0.18, 0.035, M.brass, X0 + 0.04, Y0 + 1.65, s * 1.05, 6, 20).rotateY(Math.PI / 2));
    }
    C.add(U.box(0.07, 0.75, W * 2, wood, X0, Y1 - 0.375, 0));
    // 弧形车顶
    const rs = new THREE.Shape(); rs.moveTo(-W - 0.2, 0); rs.quadraticCurveTo(0, 0.42, W + 0.2, 0); rs.lineTo(W + 0.2, 0.07); rs.quadraticCurveTo(0, 0.49, -W - 0.2, 0.07); rs.lineTo(-W - 0.2, 0);
    const rg = new THREE.ExtrudeGeometry(rs, { depth: X0 - X1 + 0.6, bevelEnabled: false, curveSegments: 16 });
    rg.rotateY(Math.PI / 2); rg.translate(X1 - 0.3, Y1, 0);
    C.add(U.mesh(rg, black));
    C.add(U.box(X0 - X1 + 0.6, 0.04, 0.04, M.brass, (X0 + X1) / 2, Y1 + 0.02, W + 0.2));
    C.add(U.box(X0 - X1 + 0.6, 0.04, 0.04, M.brass, (X0 + X1) / 2, Y1 + 0.02, -W - 0.2));
    // 炉门、仪表、调节杆
    C.add(U.box(0.05, 0.5, 0.6, M.glowRed, X0 - 0.75, Y0 + 0.55, 0));
    for (const z of [-0.35, 0.35]) { C.add(U.cyl(0.12, 0.12, 0.05, M.brass, X0 - 0.75, Y0 + 1.55, z, 16).rotateZ(Math.PI / 2)); C.add(U.cyl(0.1, 0.1, 0.02, M.paintCream, X0 - 0.79, Y0 + 1.55, z, 16).rotateZ(Math.PI / 2)); }
    C.add(U.rod(V(X0 - 0.75, Y0 + 1.2, 0.4), V(X0 - 1.2, Y0 + 1.5, 0.45), 0.03, M.steel, 6));
    const eng = U.person(8001); eng.position.set(-3.5, Y0 + 0.04, 0.75); eng.rotation.y = Math.PI / 2; C.add(eng);
    const fire = U.person(8007); fire.position.set(-3.7, Y0 + 0.04, -0.6); fire.rotation.y = Math.PI / 2 + 0.7; C.add(fire);
    body.add(C);
  }
  // 后车钩
  body.add(U.box(0.4, 0.2, 0.2, M.ironPlain, -4.85, 1.0, 0));

  // —— 车轮 ——
  const driverT = spokedWheel(M, RW, { spokes: 16, counter: true, crank: CRANK });
  const truckT = spokedWheel(M, RT, { spokes: 10 });
  const drivers = [];
  for (const x of DRV) for (const s of [-1, 1]) {
    const w = driverT.clone(); w.position.set(x, RW, s * GAUGE); if (s < 0) w.rotation.y = Math.PI;
    w.userData = { side: s, phase: s > 0 ? Math.PI / 2 : 0 };
    body.add(w); drivers.push(w);
  }
  for (const x of DRV) body.add(U.cyl(0.09, 0.09, 1.7, M.steel, x, RW, 0, 10).rotateX(Math.PI / 2));
  const truck = bogie(M, truckT, 1.2); truck.position.set(3.55, RT, 0); body.add(truck);
  // 主动轮挡泥板/轴箱
  for (const x of DRV) for (const s of [-1, 1]) body.add(U.box(0.3, 0.32, 0.18, black, x, RW + 0.1, s * 0.5));
  // —— 连杆机构（每侧：活塞杆、十字头、主连杆、平行连杆） ——
  const gear = [];
  for (const s of [-1, 1]) {
    const crosshead = U.box(0.3, 0.2, 0.14, M.steel, 0, YC, s * ZROD);
    const piston = U.cyl(0.04, 0.04, 1.3, M.steel, 0, YC, s * ZROD, 8); piston.geometry.rotateZ(Math.PI / 2); piston.geometry.translate(0.65, 0, 0);
    const mainG = new THREE.BoxGeometry(0.09, MAINROD, 0.06); const mainRod = U.mesh(mainG, M.steel);
    const mainBoss = U.cyl(0.1, 0.1, 0.08, M.steel, 0, -MAINROD / 2, 0, 12).rotateX(Math.PI / 2); mainRod.add(mainBoss);
    const cg = new THREE.BoxGeometry(DRV[0] - DRV[1] + 0.25, 0.1, 0.05); const coupling = U.mesh(cg, M.steel);
    for (const o of [crosshead, piston, mainRod, coupling]) { o.userData.dynamic = true; body.add(o); }
    gear.push({ s, crosshead, piston, mainRod, coupling });
  }

  // 锅炉下方的灰箱、管路细节
  for (const s of [-1, 1]) body.add(U.rod(V(-1.9, 1.62, s * 0.7), V(2.8, 1.62, s * 0.7), 0.04, M.copper, 6));
  body.add(U.box(0.5, 0.5, 0.9, black, -1.15, 0.95, 0));

  // 骑乘锚点
  // 骑乘视角：司机从侧窗探出身子，沿锅炉向前看
  const rideAnchor = new THREE.Object3D(); rideAnchor.position.set(-2.75, 3.05, 1.62); body.add(rideAnchor);
  const rideLook = new THREE.Object3D(); rideLook.position.set(40, 0.6, 1.25); body.add(rideLook);
  // 头灯
  const head = new THREE.SpotLight(0xffd59a, 0, 70, 0.35, 0.6, 1.4); head.position.set(4.9, boilerY + 1.27, 0);
  const headT = new THREE.Object3D(); headT.position.set(30, 0, 0); body.add(headT); head.target = headT; body.add(head);

  U.mergeStatic(body);
  return {
    loco, body, drivers, truck, gear, stackTip, whistleTip, rideAnchor, rideLook, head,
    front: 5.9, back: -4.95, pa: 3.55, pb: -1.15,
    setMotion(s) {
      const phi0 = -s / RW;
      // 右侧车轮绕 Y 翻转了 180°，其局部角 α 对应世界曲柄角 π-α
      for (const w of drivers) w.rotation.z = w.userData.side > 0 ? phi0 + w.userData.phase : Math.PI - (phi0 + w.userData.phase);
      for (const w of truck.userData.wheels) w.rotation.z = w.position.z < 0 ? s / RT : -s / RT;
      for (const G of gear) {
        const phi = phi0 + (G.s > 0 ? Math.PI / 2 : 0);
        const px = DRV[0] + CRANK * Math.cos(phi), py = RW + CRANK * Math.sin(phi);
        const dy = YC - py;
        const xc = px + Math.sqrt(MAINROD * MAINROD - dy * dy);
        G.crosshead.position.set(xc, YC, G.s * ZROD);
        G.piston.position.set(xc, YC, G.s * ZROD);
        G.mainRod.position.set((xc + px) / 2, (YC + py) / 2, G.s * (ZROD + 0.06));
        G.mainRod.rotation.z = Math.atan2(py - YC, px - xc) - Math.PI / 2;
        G.coupling.position.set((DRV[0] + DRV[1]) / 2 + CRANK * Math.cos(phi), py, G.s * (ZROD - 0.06));
      }
    },
  };
}

// ═════════════════════════════════════════════════════════════
//  煤水车
// ═════════════════════════════════════════════════════════════
function buildTender(M, wheelT) {
  const t = new THREE.Group();
  const body = new THREE.Group(); t.add(body);
  const L = 5.6, W = 1.38;
  body.add(U.box(L + 0.2, 0.25, 2.6, M.paintBlack, 0, 1.12, 0));
  body.add(U.box(L, 1.35, W * 2, M.paintGreen, 0, 1.92, 0));
  body.add(U.box(L + 0.08, 0.08, W * 2 + 0.08, M.brass, 0, 2.63, 0));
  body.add(U.box(L + 0.12, 0.04, W * 2 + 0.12, M.brass, 0, 1.27, 0));
  // 上部外翻护板
  for (const s of [-1, 1]) { const f = U.box(L * 0.55, 0.35, 0.05, M.paintGreen, L * 0.2, 2.8, s * (W + 0.06)); f.rotation.x = s * 0.25; body.add(f); }
  // 煤堆
  const coal = new THREE.Group();
  const cr = (k) => Math.abs(Math.sin(k * 12.9898) * 43758.5453) % 1;
  for (let k = 0; k < 70; k++) {
    const g = new THREE.IcosahedronGeometry(0.18 + cr(k) * 0.16, 0);
    const m = U.mesh(g, M.black); m.position.set(0.3 + (cr(k + 1) - 0.5) * 2.4, 2.65 + cr(k + 2) * 0.35 * (1 - Math.abs(cr(k + 1) - 0.5) * 1.5), (cr(k + 3) - 0.5) * 2.3); m.rotation.set(cr(k) * 3, cr(k + 4) * 3, 0); coal.add(m);
  }
  body.add(coal);
  // 水箱口 & 工具箱
  body.add(U.cyl(0.32, 0.32, 0.18, M.paintBlack, -2.0, 2.72, 0, 20));
  body.add(U.cyl(0.34, 0.34, 0.04, M.brass, -2.0, 2.82, 0, 20));
  body.add(U.box(0.8, 0.3, 0.5, M.woodDark, -1.0, 2.8, 0.8));
  // 侧面字样
  for (const s of [-1, 1]) {
    const sg = U.signBoard('PHILEAS FOGG & Cie', 4.0, 0.5, { bg: '#1f3a28', fg: '#e6c56a', border: '#c9a24a', font: `bold 96px ${SERIF}` });
    sg.position.set(0, 1.95, s * (W + 0.05)); if (s < 0) sg.rotation.y = Math.PI; body.add(sg);
  }
  // 扶梯
  for (const s of [-1, 1]) for (let k = 0; k < 3; k++) body.add(U.box(0.35, 0.03, 0.12, M.steel, L / 2 - 0.2, 0.55 + k * 0.35, s * 1.3));
  U.mergeStatic(body);
  const b1 = bogie(M, wheelT, 1.5), b2 = bogie(M, wheelT, 1.5);
  b1.position.set(1.9, 0.45, 0); b2.position.set(-1.9, 0.45, 0);
  b1.userData.dynamic = b2.userData.dynamic = true;
  t.add(b1, b2);
  return { group: t, bogies: [b1, b2], front: 3.05, back: -3.05, pa: 1.9, pb: -1.9, wheelR: 0.45 };
}

// ═════════════════════════════════════════════════════════════
//  客车（采光顶、敞开端台）
// ═════════════════════════════════════════════════════════════
function buildCoach(M, wheelT, title, seed) {
  const c = new THREE.Group();
  const body = new THREE.Group(); c.add(body);
  const BL = 6.0, PL = 6.85, W = 1.4, Y0 = 1.25, Y1 = 3.45;
  const maroon = M.paintRed, cream = M.paintCream;
  body.add(U.box(PL * 2, 0.2, 2.5, M.paintBlack, 0, 1.12, 0));
  for (const z of [-0.6, 0.6]) body.add(U.box(BL * 2, 0.3, 0.1, M.paintBlack, 0, 0.92, z));
  // 车厢下部桁架拉杆
  for (const z of [-0.9, 0.9]) {
    body.add(U.rod(V(-4.6, 1.0, z), V(-1.8, 0.55, z), 0.025, M.steel, 5));
    body.add(U.rod(V(-1.8, 0.55, z), V(1.8, 0.55, z), 0.025, M.steel, 5));
    body.add(U.rod(V(1.8, 0.55, z), V(4.6, 1.0, z), 0.025, M.steel, 5));
    for (const x of [-1.8, 1.8]) body.add(U.rod(V(x, 0.55, z), V(x, 1.02, z), 0.03, M.steel, 5));
  }
  // 侧墙：下护板（栗色）+ 窗带 + 名牌带
  const NW = 10, winW = 0.72;
  for (const s of [-1, 1]) {
    body.add(U.box(BL * 2, 0.95, 0.08, maroon, 0, Y0 + 0.475, s * W));
    body.add(U.box(BL * 2, 0.04, 0.1, M.gold, 0, Y0 + 0.96, s * W));
    body.add(U.box(BL * 2, 0.05, 0.1, M.gold, 0, Y0 + 0.1, s * W));
    body.add(U.box(BL * 2, 0.5, 0.08, maroon, 0, Y1 - 0.25, s * W));
    const pitch = (BL * 2 - 0.6) / NW;
    for (let k = 0; k <= NW; k++) body.add(U.box(pitch - winW, 0.92, 0.09, M.woodDark, -BL + 0.3 + k * pitch, Y0 + 1.42, s * W));
    for (let k = 0; k < NW; k++) {
      const x = -BL + 0.3 + (k + 0.5) * pitch;
      const pane = U.box(winW, 0.85, 0.03, M.glowWindow, x, Y0 + 1.42, s * (W - 0.01)); pane.castShadow = false; body.add(pane);
      const arch = new THREE.Mesh(new THREE.CircleGeometry(winW / 2, 12, 0, Math.PI), M.woodDark); arch.position.set(x, Y0 + 1.86, s * (W + 0.05)); if (s < 0) arch.rotation.y = Math.PI; body.add(arch);
    }
    const lb = U.signBoard(title, 7.5, 0.34, { bg: '#4a1410', fg: '#e6c56a', border: '#c9a24a', font: `bold 84px ${SERIF}` });
    lb.position.set(0, Y1 - 0.25, s * (W + 0.05)); if (s < 0) lb.rotation.y = Math.PI; body.add(lb);
  }
  // 端墙 + 门
  for (const e of [-1, 1]) {
    body.add(U.box(0.08, Y1 - Y0, W * 2, maroon, e * BL, (Y0 + Y1) / 2, 0));
    body.add(U.box(0.1, 1.9, 0.75, M.woodDark, e * (BL + 0.02), Y0 + 0.95, 0));
    const gl = U.box(0.03, 0.6, 0.5, M.glowWindow, e * (BL + 0.08), Y0 + 1.45, 0); body.add(gl);
    // 敞开端台：地板、栏杆、踏步
    body.add(U.box(PL - BL, 0.1, 2.5, M.deck, e * (BL + PL) / 2, Y0 - 0.05, 0));
    for (const s of [-1, 1]) {
      body.add(U.rod(V(e * BL, Y0 + 0.95, s * 1.2), V(e * (PL - 0.05), Y0 + 0.95, s * 1.2), 0.025, M.brass, 6));
      body.add(U.rod(V(e * (PL - 0.05), Y0, s * 1.2), V(e * (PL - 0.05), Y0 + 0.95, s * 1.2), 0.03, M.brass, 6));
      body.add(U.rod(V(e * (PL - 0.05), Y0 + 0.95, s * 1.2), V(e * (PL - 0.05), Y0 + 0.95, s * 0.45), 0.025, M.brass, 6));
      for (let k = 0; k < 4; k++) body.add(U.rod(V(e * (PL - 0.05), Y0 + 0.1, s * (1.2 - k * 0.2)), V(e * (PL - 0.05), Y0 + 0.9, s * (1.2 - k * 0.2)), 0.012, M.brass, 4));
      for (let k = 0; k < 3; k++) body.add(U.box(0.5, 0.04, 0.3, M.ironPlain, e * (BL + 0.4), Y0 - 0.32 - k * 0.3, s * 1.32));
      body.add(U.rod(V(e * BL, Y0 + 0.1, s * 1.2), V(e * BL, Y0 + 1.9, s * 1.2), 0.025, M.brass, 6)); // 扶手
    }
    // 端台挂灯
    const l = U.lantern(M, 0.55); l.position.set(e * (BL + 0.12), Y0 + 1.9, 1.05); body.add(l);
  }
  // 车顶：下层弧顶 + 采光顶（clerestory）
  {
    const rs = new THREE.Shape(); rs.moveTo(-W - 0.12, 0); rs.quadraticCurveTo(-W, 0.28, -0.75, 0.32); rs.lineTo(0.75, 0.32); rs.quadraticCurveTo(W, 0.28, W + 0.12, 0); rs.lineTo(-W - 0.12, 0);
    const rg = new THREE.ExtrudeGeometry(rs, { depth: PL * 2 - 0.1, bevelEnabled: false, curveSegments: 10 }); rg.rotateY(Math.PI / 2); rg.translate(-PL + 0.05, Y1, 0);
    body.add(U.mesh(rg, M.paintBlack));
    // 采光顶
    body.add(U.box(BL * 2 - 0.4, 0.4, 1.4, maroon, 0, Y1 + 0.5, 0));
    for (const s of [-1, 1]) for (let k = 0; k < 14; k++) { const p = U.box(0.5, 0.22, 0.02, M.glowWindow, -BL + 0.6 + k * 0.82, Y1 + 0.5, s * 0.71); p.castShadow = false; body.add(p); }
    const cs = new THREE.Shape(); cs.moveTo(-0.85, 0); cs.quadraticCurveTo(0, 0.28, 0.85, 0); cs.lineTo(-0.85, 0);
    const cg2 = new THREE.ExtrudeGeometry(cs, { depth: BL * 2 - 0.2, bevelEnabled: false, curveSegments: 8 }); cg2.rotateY(Math.PI / 2); cg2.translate(-BL + 0.1, Y1 + 0.7, 0);
    body.add(U.mesh(cg2, M.paintBlack));
    // 鸭嘴形端头
    for (const e of [-1, 1]) { const d = U.box(0.9, 0.12, 1.5, M.paintBlack, e * (BL - 0.1 + 0.35), Y1 + 0.42, 0); d.rotation.z = e * -0.35; body.add(d); }
    for (let k = 0; k < 5; k++) body.add(U.cyl(0.08, 0.1, 0.25, M.paintBlack, -4.8 + k * 2.4, Y1 + 1.0, 0, 10)); // 通风帽
  }
  // 乘客（端台）
  const pp = [[-6.3, 0.5], [6.3, -0.4]];
  pp.forEach(([x, z], i) => { const p = U.person(seed + i); p.position.set(x, Y0, z); p.rotation.y = Math.sign(x) * Math.PI / 2 + 0.4; body.add(p); });
  U.mergeStatic(body);
  const b1 = bogie(M, wheelT, 1.7), b2 = bogie(M, wheelT, 1.7);
  b1.position.set(4.7, 0.45, 0); b2.position.set(-4.7, 0.45, 0);
  b1.userData.dynamic = b2.userData.dynamic = true;
  c.add(b1, b2);
  return { group: c, bogies: [b1, b2], body, front: PL + 0.15, back: -PL - 0.15, pa: 4.7, pb: -4.7, wheelR: 0.45 };
}

// ═════════════════════════════════════════════════════════════
//  车站
// ═════════════════════════════════════════════════════════════
function buildStation(M, dayTex, clockTex) {
  const st = new THREE.Group();
  const PX = 28, PZ0 = 1.7, PZ1 = 8.2, PH = 0.95;
  // 站台
  st.add(U.box(PX * 2, PH, 0.6, withRepeat(M.stone, 12, 1), 0, PH / 2, PZ0 + 0.3));
  st.add(U.box(PX * 2, 0.08, 0.5, M.stone, 0, PH + 0.04, PZ0 + 0.22));
  st.add(U.box(PX * 2, PH - 0.05, PZ1 - PZ0 - 0.6, withRepeat(M.cobbles, 10, 1.4), 0, (PH - 0.05) / 2, (PZ0 + 0.6 + PZ1) / 2));
  for (const e of [-1, 1]) { // 坡道
    const r = U.box(4, 0.1, PZ1 - PZ0, M.cobbles, e * (PX + 1.9), PH / 2 - 0.02, (PZ0 + PZ1) / 2); r.rotation.z = e * 0.23; st.add(r);
  }
  // 雨棚：铸铁柱 + 托架 + 双坡屋面 + 齿形挂檐
  const CY = 4.4;
  for (let x = -24; x <= 24.1; x += 6) {
    for (const z of [3.4, 7.0]) {
      st.add(U.cyl(0.12, 0.16, CY - PH, M.paintGreen, x, (CY + PH) / 2, z, 12));
      st.add(U.lathe([[0.24, 0], [0.24, 0.12], [0.16, 0.25], [0.12, 0.3]], M.paintGreen, 12).translateX(x).translateY(PH).translateZ(z));
      st.add(U.lathe([[0.12, 0], [0.22, 0.18], [0.3, 0.26], [0.3, 0.32]], M.paintGreen, 12).translateX(x).translateY(CY - 0.3).translateZ(z));
      for (const dx of [-1, 1]) st.add(U.tube([V(x, CY - 0.9, z), V(x + dx * 0.6, CY - 0.35, z), V(x + dx * 1.4, CY - 0.05, z)], 0.04, M.paintGreen, false, 10, 5));
      st.add(U.torus(0.3, 0.03, M.paintGreen, x, CY - 0.55, z, 4, 16));
    }
  }
  st.add(U.box(PX * 1.8, 0.25, 0.25, M.paintGreen, 0, CY, 3.4));
  st.add(U.box(PX * 1.8, 0.25, 0.25, M.paintGreen, 0, CY, 7.0));
  {
    const roofL = PX * 1.85;
    const sh = new THREE.Shape(); sh.moveTo(1.6, 0); sh.lineTo(5.2, 1.3); sh.lineTo(8.8, 0); sh.lineTo(8.8, 0.12); sh.lineTo(5.2, 1.42); sh.lineTo(1.6, 0.12); sh.lineTo(1.6, 0);
    const g = new THREE.ExtrudeGeometry(sh, { depth: roofL, bevelEnabled: false }); g.rotateY(-Math.PI / 2); g.translate(roofL / 2, CY + 0.12, 0);
    // rotateY(-π/2) 把截面的 x 变到 z
    const roof = U.mesh(g, withRepeat(M.slate, 12, 2)); st.add(roof);
    // 齿形挂檐（dagger boards）
    for (const z of [1.65, 8.75]) {
      st.add(U.box(roofL, 0.35, 0.05, M.paintCream, 0, CY - 0.05, z));
      const n = Math.floor(roofL / 0.25);
      const tri = new THREE.ConeGeometry(0.1, 0.28, 3); tri.rotateX(Math.PI);
      const im = new THREE.InstancedMesh(tri, M.paintCream, n);
      const d = new THREE.Object3D();
      for (let k = 0; k < n; k++) { d.position.set(-roofL / 2 + (k + 0.5) * 0.25, CY - 0.36, z); d.updateMatrix(); im.setMatrixAt(k, d.matrix); }
      st.add(im);
    }
    // 屋脊采光带
    const sky = U.box(roofL - 2, 0.25, 1.0, M.glass, 0, CY + 1.5, 5.2); sky.castShadow = false; st.add(sky);
  }
  // 悬挂站名牌
  {
    const sg = U.signBoard('LONDON · CHARING CROSS', 7, 0.7, { bg: '#1b2a2c', fg: '#ecd28a', font: `bold 90px ${SERIF}` });
    sg.position.set(0, CY - 0.9, 3.4); sg.rotation.y = Math.PI; st.add(sg);
    st.add(U.rod(V(-3, CY - 0.55, 3.4), V(-3, CY - 0.1, 3.4), 0.02, M.steel, 4));
    st.add(U.rod(V(3, CY - 0.55, 3.4), V(3, CY - 0.1, 3.4), 0.02, M.steel, 4));
  }
  // 站房（砖、石角、拱窗、钟楼）
  const BZ0 = 8.6, BZ1 = 16.5, BX = 13, BH = 5.4;
  const brick = withRepeat(M.brick, 6, 2);
  st.add(U.box(BX * 2, BH, BZ1 - BZ0, brick, 0, BH / 2, (BZ0 + BZ1) / 2));
  st.add(U.box(BX * 2 + 0.3, 0.35, BZ1 - BZ0 + 0.3, M.stone, 0, BH, (BZ0 + BZ1) / 2));
  st.add(U.box(BX * 2 + 0.2, 0.5, BZ1 - BZ0 + 0.2, M.stone, 0, 0.25, (BZ0 + BZ1) / 2));
  for (const x of [-BX, BX]) for (const z of [BZ0, BZ1]) for (let k = 0; k < 7; k++) st.add(U.box(0.5 + (k % 2) * 0.25, 0.42, 0.5 + ((k + 1) % 2) * 0.25, M.stone, x, 0.6 + k * 0.7, z));
  // 双折屋顶（mansard）
  {
    const g = new THREE.CylinderGeometry(1, 1.25, 1, 4, 1); g.rotateY(Math.PI / 4);
    const m = U.mesh(g, withRepeat(M.slate, 6, 2)); m.scale.set(BX * 1.42 * 0.98, 2.4, (BZ1 - BZ0) * 0.71 * 0.98); m.position.set(0, BH + 1.37, (BZ0 + BZ1) / 2);
    st.add(m);
    st.add(U.box(BX * 2 * 0.8, 0.12, (BZ1 - BZ0) * 0.8, M.slate, 0, BH + 2.62, (BZ0 + BZ1) / 2));
    for (let x = -BX + 3; x <= BX - 3; x += 4) for (const z of [BZ0 + 0.9, BZ1 - 0.9]) { // 老虎窗
      st.add(U.box(1.0, 1.1, 0.9, M.paintCream, x, BH + 1.2, z));
      const w = U.box(0.6, 0.6, 0.05, M.glowWindow, x, BH + 1.15, z + (z < (BZ0 + BZ1) / 2 ? -0.46 : 0.46)); st.add(w);
      const cap = new THREE.Mesh(new THREE.ConeGeometry(0.75, 0.5, 4), M.slate); cap.position.set(x, BH + 2.0, z); cap.rotation.y = Math.PI / 4; cap.castShadow = true; st.add(cap);
    }
  }
  // 拱窗与门（站台侧 & 广场侧）
  for (const [z, face] of [[BZ0 - 0.05, -1], [BZ1 + 0.05, 1]]) {
    for (let x = -BX + 2; x <= BX - 1.9; x += 2.4) {
      const isDoor = Math.abs(x) < 1.3;
      const w = isDoor ? 1.6 : 1.1, h = isDoor ? 2.9 : 2.2, y = isDoor ? 1.45 + 0.5 : 2.4;
      const win = new THREE.Group(); win.position.set(x, y, z); if (face < 0) win.rotation.y = Math.PI;
      win.add(U.box(w, h, 0.05, isDoor ? M.woodDark : M.glowWindow, 0, 0, 0));
      const ar = new THREE.Mesh(new THREE.CircleGeometry(w / 2, 16, 0, Math.PI), M.glowWindow); ar.position.y = h / 2; ar.position.z = 0.01; win.add(ar);
      win.add(U.torus(w / 2 + 0.08, 0.1, M.stone, 0, h / 2, 0.04, 6, 16, Math.PI));
      win.add(U.box(w + 0.35, 0.14, 0.18, M.stone, 0, -h / 2 - 0.05, 0.05));
      if (!isDoor) { win.add(U.box(0.05, h, 0.06, M.paintWhite, 0, 0, 0.03)); win.add(U.box(w, 0.05, 0.06, M.paintWhite, 0, 0.2, 0.03)); }
      st.add(win);
    }
  }
  // 广场侧大字招牌 & 雨篷
  {
    const s1 = U.signBoard('CHARING CROSS', 9, 1.1, { sub: 'South Eastern Railway · 1872', bg: '#1b2a2c', fg: '#ecd28a' });
    s1.position.set(0, BH - 0.85, BZ1 + 0.12); st.add(s1);
    const s2 = U.signBoard('LE TOUR DU MONDE EN 80 JOURS', 11, 0.9, { bg: '#4a1410', fg: '#ecd28a', font: `bold 104px ${SERIF}` });
    s2.position.set(0, BH + 0.95, BZ0 - 0.95); s2.rotation.y = Math.PI; st.add(s2);
    const can = U.box(6, 0.12, 2.0, M.paintGreen, 0, 3.5, BZ1 + 1.0); st.add(can);
    for (const x of [-2.9, 2.9]) st.add(U.rod(V(x, 3.45, BZ1 + 1.9), V(x, 4.6, BZ1 + 0.05), 0.04, M.paintGreen, 6));
  }
  // 钟楼
  const TX = 0, TZ = (BZ0 + BZ1) / 2, TW = 3.0, TB = BH + 2.6, TH = 6.0;
  st.add(U.box(TW, TH, TW, brick, TX, TB + TH / 2, TZ));
  for (const dx of [-1, 1]) for (const dz of [-1, 1]) st.add(U.box(0.4, TH, 0.4, M.stone, TX + dx * TW / 2, TB + TH / 2, TZ + dz * TW / 2));
  st.add(U.box(TW + 0.4, 0.3, TW + 0.4, M.stone, TX, TB + TH, TZ));
  const hands = [];
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * TAU;
    const face = new THREE.Group(); face.position.set(TX + Math.sin(a) * (TW / 2 + 0.03), TB + TH - 1.6, TZ + Math.cos(a) * (TW / 2 + 0.03)); face.rotation.y = a;
    const dial = new THREE.Mesh(new THREE.CircleGeometry(1.05, 40), new THREE.MeshStandardMaterial({ map: clockTex, roughness: 0.5, emissive: 0xffe2a8, emissiveMap: clockTex, emissiveIntensity: 0.05 }));
    face.add(dial);
    face.add(U.torus(1.08, 0.08, M.gold, 0, 0, 0.02, 8, 40));
    const hh = new THREE.Group(); hh.position.z = 0.05; hh.add(U.box(0.09, 0.6, 0.03, M.paintBlack, 0, 0.28, 0)); hh.userData.dynamic = true;
    const mh = new THREE.Group(); mh.position.z = 0.08; mh.add(U.box(0.06, 0.9, 0.03, M.paintBlack, 0, 0.42, 0)); mh.userData.dynamic = true;
    face.add(hh, mh); face.add(U.sphere(0.07, M.gold, 0, 0, 0.1, 8, 6));
    st.add(face); hands.push({ hh, mh, dial });
  }
  {
    const cap = new THREE.Mesh(new THREE.ConeGeometry(2.6, 3.6, 4), withRepeat(M.patina, 2, 2)); cap.rotation.y = Math.PI / 4; cap.position.set(TX, TB + TH + 1.95, TZ); cap.castShadow = true; st.add(cap);
    st.add(U.cyl(0.04, 0.04, 2.0, M.gold, TX, TB + TH + 4.6, TZ, 6));
    st.add(U.sphere(0.2, M.gold, TX, TB + TH + 3.9, TZ, 10, 8));
    // 风向标：箭头
    const vane = new THREE.Group(); vane.position.set(TX, TB + TH + 5.2, TZ); vane.userData.dynamic = true;
    vane.add(U.box(1.4, 0.05, 0.05, M.gold, 0, 0, 0)); vane.add(U.mesh(new THREE.ConeGeometry(0.12, 0.3, 4), M.gold).rotateZ(-Math.PI / 2).translateY(0.75));
    vane.add(U.box(0.05, 0.35, 0.3, M.gold, -0.65, 0, 0));
    st.add(vane); hands.vane = vane;
  }
  // 计日牌 & 行程表（站台上，面向轨道）
  {
    const day = plane(dayTex, 1.5, 1.5, { emissive: 0xffffff, emissiveMap: dayTex, emissiveIntensity: 0.25 });
    const db = new THREE.Group(); db.position.set(9, 0, 7.6);
    db.add(U.box(1.8, 1.8, 0.12, M.woodDark, 0, PH + 2.3, 0));
    day.position.set(0, PH + 2.3, -0.07); day.rotation.y = Math.PI; db.add(day);
    for (const x of [-0.75, 0.75]) db.add(U.cyl(0.05, 0.06, 2.3, M.paintGreen, x, PH + 1.15, 0, 8));
    st.add(db);
    const it = plane(itineraryTexture(), 4.0, 3.0);
    const ib = new THREE.Group(); ib.position.set(-9, 0, 7.6);
    ib.add(U.box(4.3, 3.3, 0.12, M.woodDark, 0, PH + 2.4, 0));
    it.position.set(0, PH + 2.4, -0.07); it.rotation.y = Math.PI; ib.add(it);
    for (const x of [-2, 2]) ib.add(U.cyl(0.06, 0.07, 2.4, M.paintGreen, x, PH + 0.6, 0, 8));
    st.add(ib);
  }
  // 长椅、行李、路灯、候车旅客
  const benchAt = (x, z) => {
    const b = new THREE.Group(); b.position.set(x, PH, z);
    for (const sx of [-0.75, 0.75]) { b.add(U.box(0.08, 0.45, 0.5, M.paintBlack, sx, 0.22, 0)); b.add(U.box(0.08, 0.5, 0.06, M.paintBlack, sx, 0.7, 0.25)); }
    for (let k = 0; k < 4; k++) b.add(U.box(1.8, 0.04, 0.1, M.woodDark, 0, 0.46, -0.18 + k * 0.12));
    for (let k = 0; k < 3; k++) b.add(U.box(1.8, 0.1, 0.03, M.woodDark, 0, 0.62 + k * 0.13, 0.27));
    b.rotation.y = Math.PI; st.add(b);
  };
  for (const x of [-18, -3, 3, 15]) benchAt(x, 7.3);
  // 行李车 + 皮箱
  {
    const cart = new THREE.Group(); cart.position.set(-14, PH, 4.6);
    cart.add(U.box(2.2, 0.08, 1.0, M.woodDark, 0, 0.45, 0));
    for (const x of [-0.8, 0.8]) for (const z of [-0.45, 0.45]) cart.add(U.cyl(0.22, 0.22, 0.06, M.ironPlain, x, 0.22, z, 12).rotateX(Math.PI / 2));
    cart.add(U.rod(V(1.1, 0.45, 0), V(1.8, 1.05, 0), 0.03, M.ironPlain, 5));
    const trunk = (x, y, z, w, h, d, mat) => { cart.add(U.box(w, h, d, mat, x, y, z)); cart.add(U.box(w + 0.02, 0.05, d + 0.02, M.brass, x, y + h * 0.3, z)); cart.add(U.box(w + 0.02, 0.05, d + 0.02, M.brass, x, y - h * 0.3, z)); };
    trunk(-0.5, 0.75, 0, 0.9, 0.5, 0.7, M.leather); trunk(0.4, 0.72, 0.05, 0.8, 0.45, 0.6, M.paintRed); trunk(-0.3, 1.2, 0, 0.6, 0.38, 0.5, M.woodDark);
    st.add(cart);
  }
  for (const x of [-21, -7, 7, 21]) { const l = U.lampPost(M, { h: 3.2, arms: 1 }); l.position.set(x, PH, 2.5); st.add(l); }
  // 斐利亚·福格（礼帽）、路路通、艾娥达夫人 & 候车旅客
  const tophat = (p) => { const hat = new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.5 }); p.add(U.cyl(0.17, 0.17, 0.015, hat, 0, 1.74, 0, 14)); p.add(U.cyl(0.1, 0.105, 0.22, hat, 0, 1.86, 0, 12)); };
  const fogg = U.person(1872); tophat(fogg); fogg.position.set(1.5, PH, 3.2); fogg.rotation.y = Math.PI; st.add(fogg);
  const pp = U.person(1873); pp.position.set(2.4, PH, 3.6); pp.rotation.y = Math.PI - 0.5; st.add(pp);
  const bag = U.box(0.5, 0.35, 0.22, M.leather, 2.75, PH + 0.6, 3.6); st.add(bag);
  for (let k = 0; k < 9; k++) { const p = U.person(4400 + k); p.position.set(-20 + k * 4.6 + Math.sin(k) * 1.2, PH, 4.2 + (k % 3) * 0.9); p.rotation.y = Math.PI + Math.sin(k * 2) * 0.6; st.add(p); }

  // 水塔（轨道另一侧）
  {
    const wt = new THREE.Group(); wt.position.set(PX + 7, 0, -6.5);
    for (const [x, z] of [[-1.6, -1.6], [1.6, -1.6], [1.6, 1.6], [-1.6, 1.6]]) { wt.add(U.box(0.3, 6.0, 0.3, M.woodDark, x, 3.0, z)); wt.add(U.cyl(0.35, 0.4, 0.4, M.stone, x, 0.2, z, 8)); }
    for (const y of [1.8, 3.8]) {
      wt.add(U.rod(V(-1.6, y, -1.6), V(1.6, y + 1.8, -1.6), 0.06, M.woodDark, 5)); wt.add(U.rod(V(1.6, y, 1.6), V(-1.6, y + 1.8, 1.6), 0.06, M.woodDark, 5));
      wt.add(U.rod(V(-1.6, y, 1.6), V(-1.6, y + 1.8, -1.6), 0.06, M.woodDark, 5)); wt.add(U.rod(V(1.6, y, -1.6), V(1.6, y + 1.8, 1.6), 0.06, M.woodDark, 5));
    }
    wt.add(U.box(4.2, 0.25, 4.2, M.deck, 0, 6.1, 0));
    wt.add(U.cyl(2.2, 2.2, 3.0, withRepeat(M.wood, 4, 1), 0, 7.7, 0, 28));
    for (const y of [6.6, 7.4, 8.2, 8.9]) wt.add(U.torus(2.22, 0.04, M.ironPlain, 0, y, 0, 4, 40).rotateX(Math.PI / 2));
    const roof = new THREE.Mesh(new THREE.ConeGeometry(2.6, 1.6, 20), M.slate); roof.position.y = 10.0; roof.castShadow = true; wt.add(roof);
    wt.add(U.sphere(0.15, M.brass, 0, 10.85, 0, 8, 6));
    // 加水臂（转向轨道）
    wt.add(U.rod(V(0, 6.6, 2.0), V(0, 5.6, 4.6), 0.18, M.ironPlain, 10));
    wt.add(U.lathe([[0.25, 0], [0.18, 0.3], [0.12, 0.5]], M.ironPlain, 10).translateY(5.2).translateZ(4.6));
    wt.add(U.rod(V(0, 6.6, 2.0), V(0, 5.8, 4.6), 0.02, M.rope, 4));
    st.add(wt);
  }
  return { st, hands, PX };
}

// 臂板信号机
function semaphore(M) {
  const g = new THREE.Group();
  g.add(U.cyl(0.1, 0.14, 7.0, M.paintWhite, 0, 3.5, 0, 10));
  g.add(U.cyl(0.35, 0.4, 0.3, M.stone, 0, 0.15, 0, 10));
  for (let k = 0; k < 14; k++) g.add(U.box(0.4, 0.03, 0.05, M.ironPlain, 0.18, 0.6 + k * 0.42, 0)); // 梯级
  g.add(U.sphere(0.12, M.gold, 0, 7.1, 0, 8, 6));
  const arm = new THREE.Group(); arm.position.set(0, 6.3, 0.15); arm.userData.dynamic = true;
  arm.add(U.box(1.6, 0.26, 0.05, M.paintRed, 0.85, 0, 0));
  arm.add(U.box(0.12, 0.27, 0.06, M.paintWhite, 1.35, 0, 0));
  const lamp = U.cyl(0.11, 0.11, 0.06, M.glowRed, -0.2, 0, 0.02, 12); lamp.rotation.x = Math.PI / 2; arm.add(lamp);
  g.add(arm);
  g.add(U.box(0.3, 0.4, 0.3, M.paintBlack, 0, 6.3, -0.1));
  return { g, arm };
}

// ═════════════════════════════════════════════════════════════
export function createTrain(M, ctx) {
  const group = new THREE.Group();
  const curve = new THREE.CatmullRomCurve3(railRoute(), true, 'centripetal');
  curve.arcLengthDivisions = 3000;
  const LEN = curve.getLength();
  const N = Math.round(LEN / 1.0);
  const samples = [];
  for (let i = 0; i < N; i++) { const u = i / N; samples.push({ p: curve.getPointAt(u), t: curve.getTangentAt(u) }); }

  // ---------- 轨道 ----------
  const track = new THREE.Group();
  const gravel = withRepeat(M.sand, 1, 1); gravel.color.setRGB(0.62, 0.6, 0.58); gravel.bumpScale = 3;
  track.add(sweep(samples, [[-1.9, -0.05], [1.9, -0.05], [1.4, 0.25], [-1.4, 0.25]], gravel, 3));
  const railProfile = (o) => [[-0.07, 0.3], [0.07, 0.3], [0.07, 0.32], [0.015, 0.34], [0.015, 0.43], [0.035, 0.435], [0.035, 0.47], [-0.035, 0.47], [-0.035, 0.435], [-0.015, 0.43], [-0.015, 0.34], [-0.07, 0.32]].map(([a, b]) => [a + o, b]);
  for (const o of [-GAUGE, GAUGE]) { const r = sweep(samples, railProfile(o), M.steel, 4); r.castShadow = true; track.add(r); }
  // 枕木
  const tieGap = 0.68, nT = Math.floor(LEN / tieGap);
  const ties = new THREE.InstancedMesh(new THREE.BoxGeometry(0.24, 0.1, 2.6), withRepeat(M.woodDark, 0.3, 1), nT);
  const d = new THREE.Object3D();
  for (let i = 0; i < nT; i++) {
    const u = i / nT; const p = curve.getPointAt(u), t = curve.getTangentAt(u);
    d.position.set(p.x, 0.27, p.z); d.rotation.set(0, Math.atan2(-t.z, t.x), 0); d.updateMatrix(); ties.setMatrixAt(i, d.matrix);
  }
  ties.receiveShadow = true; track.add(ties);
  group.add(track);

  // ---------- 道口（与步道相交处） ----------
  const crossings = new THREE.Group();
  const cbTex = crossbuckTexture();
  const cbMat = new THREE.MeshStandardMaterial({ map: cbTex, roughness: 0.6 });
  const paths = ctx.world ? ctx.world.layout.paths : [];
  const hits = [];
  for (const path of paths) for (let i = 0; i < path.length - 1; i++) {
    const a = path[i], b = path[i + 1];
    for (let k = 0; k < samples.length; k++) {
      const c1 = samples[k].p, c2 = samples[(k + 1) % samples.length].p;
      // 线段求交（XZ 平面）
      const r = { x: b.x - a.x, z: b.z - a.z }, s = { x: c2.x - c1.x, z: c2.z - c1.z };
      const den = r.x * s.z - r.z * s.x; if (Math.abs(den) < 1e-6) continue;
      const qp = { x: c1.x - a.x, z: c1.z - a.z };
      const tt = (qp.x * s.z - qp.z * s.x) / den, uu = (qp.x * r.z - qp.z * r.x) / den;
      if (tt >= 0 && tt <= 1 && uu >= 0 && uu <= 1) { const p = V(a.x + r.x * tt, 0, a.z + r.z * tt); if (!hits.some((h) => h.p.distanceTo(p) < 8)) hits.push({ p, t: samples[k].t, dir: V(r.x, 0, r.z).normalize() }); }
    }
  }
  for (const h of hits) {
    const yaw = Math.atan2(-h.t.z, h.t.x);
    const cg = new THREE.Group(); cg.position.copy(h.p); cg.rotation.y = yaw;
    for (let k = -8; k <= 8; k++) cg.add(U.box(0.28, 0.08, 3.0, M.deck, k * 0.3, 0.44, 0)); // 木铺板
    for (const s of [-1, 1]) {
      const post = new THREE.Group(); post.position.set(s * 4.2, 0, s * 3.4);
      post.add(U.cyl(0.07, 0.08, 3.2, M.paintWhite, 0, 1.6, 0, 8));
      for (const r of [0.6, -0.6]) { const bd = U.mesh(new THREE.BoxGeometry(1.7, 0.22, 0.03), cbMat); bd.position.set(0, 2.8, 0.06); bd.rotation.z = r; post.add(bd); }
      post.rotation.y = s > 0 ? 0 : Math.PI;
      cg.add(post);
    }
    crossings.add(cg);
  }
  U.mergeStatic(crossings);
  group.add(crossings);

  // ---------- 车站 ----------
  const stationTarget = V(55, 0, shoreZ(55) - 20);
  let sStation = 0, best = 1e9;
  for (let i = 0; i < samples.length; i++) { const dd = samples[i].p.distanceTo(stationTarget); if (dd < best) { best = dd; sStation = (i / samples.length) * LEN; } }
  const sp = curve.getPointAt(sStation / LEN), stg = curve.getTangentAt(sStation / LEN);
  let yawS = Math.atan2(-stg.z, stg.x);
  const zDir = V(Math.sin(yawS), 0, Math.cos(yawS));
  if (zDir.dot(V(-sp.x, 0, -sp.z)) < 0) yawS += Math.PI; // 站台朝向乐园中心
  const dayTex = canvasTex(256, 300, () => {}); drawDay(dayTex, 1);
  const clockTex = clockTexture();
  const S = buildStation(M, dayTex, clockTex);
  S.st.position.set(sp.x, 0, sp.z); S.st.rotation.y = yawS;
  // 信号机（轨道另一侧，站台两端）
  const sigs = [];
  for (const e of [-1, 1]) { const sg = semaphore(M); sg.g.position.set(e * (S.PX + 3), 0, -2.6); sg.g.rotation.y = e > 0 ? 0 : Math.PI; S.st.add(sg.g); sigs.push(sg); }
  const stationLight = new THREE.PointLight(0xffc27a, 0, 30, 2); stationLight.position.set(0, 3.8, 5); S.st.add(stationLight);
  ctx.addNightLight(stationLight, 90);
  U.mergeStatic(S.st);
  group.add(S.st);

  // ---------- 列车 ----------
  const wheelT = spokedWheel(M, 0.45, { spokes: 10, paint: M.paintBlack });
  const L = buildLocomotive(M);
  const T = buildTender(M, wheelT);
  const C1 = buildCoach(M, wheelT, 'LE TOUR DU MONDE EN 80 JOURS', 6100);
  const C2 = buildCoach(M, wheelT, 'WAGON-SALON · PACIFIC RAILROAD', 6200);
  // 斐利亚·福格一行站在第一节客车端台
  {
    const tophat = (p) => { const hat = new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.5 }); p.add(U.cyl(0.17, 0.17, 0.015, hat, 0, 1.74, 0, 14)); p.add(U.cyl(0.1, 0.105, 0.22, hat, 0, 1.86, 0, 12)); };
    const fogg = U.person(1872); tophat(fogg); fogg.position.set(6.4, 1.25, -0.6); fogg.rotation.y = Math.PI / 2; C1.group.add(fogg);
  }
  const vehicles = [
    { obj: L.loco, front: L.front, back: L.back, pa: L.pa, pb: L.pb, kind: 'loco' },
    { obj: T.group, front: T.front, back: T.back, pa: T.pa, pb: T.pb, bogies: T.bogies },
    { obj: C1.group, front: C1.front, back: C1.back, pa: C1.pa, pb: C1.pb, bogies: C1.bogies },
    { obj: C2.group, front: C2.front, back: C2.back, pa: C2.pa, pb: C2.pb, bogies: C2.bogies },
  ];
  for (const v of vehicles) { v.obj.userData.dynamic = true; group.add(v.obj); }
  const trainLen = vehicles.reduce((s, v) => s + v.front - v.back + 0.45, 0);
  ctx.addNightLight(L.head, 70);

  // ---------- 世界空间蒸汽团 ----------
  const puffTex = (() => {
    const cv = document.createElement('canvas'); cv.width = cv.height = 64; const cx = cv.getContext('2d');
    const g = cx.createRadialGradient(32, 32, 2, 32, 32, 32); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.5, 'rgba(255,255,255,0.5)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    cx.fillStyle = g; cx.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(cv);
  })();
  const puffs = [];
  const smoke = new THREE.Group(); smoke.userData.dynamic = true; group.add(smoke);
  for (let i = 0; i < 70; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: puffTex, color: 0xe8e4dc, transparent: true, opacity: 0, depthWrite: false }));
    s.visible = false; s.userData = { life: 0, max: 1, vel: V(), grow: 1 }; smoke.add(s); puffs.push(s);
  }
  let pi = 0;
  const emit = (pos, vel, size, life, color, op = 0.55) => {
    const s = puffs[pi++ % puffs.length];
    s.position.copy(pos); s.userData.vel.copy(vel); s.userData.life = 0; s.userData.max = life; s.userData.size = size; s.userData.op = op;
    s.material.color.setHex(color); s.visible = true;
  };

  // ---------- 运行时刻 ----------
  const VMAX = 9.0, STOP = 16;
  const RUN_T = LEN / VMAX * 1.22, PERIOD = RUN_T + STOP;
  const ease = (x) => { const a = 0.16; if (x < a) return (x * x) / (2 * a) / (1 - a); if (x > 1 - a) return 1 - ((1 - x) * (1 - x)) / (2 * a) / (1 - a); return (x - a / 2) / (1 - a); };
  const s0 = sStation + 21; // 停靠时车头位置（车尾位于站台内）
  const sAt = (t) => { const lap = Math.floor(t / PERIOD); const tau = t - lap * PERIOD; return s0 + lap * LEN + LEN * (tau < STOP ? 0 : ease((tau - STOP) / RUN_T)); };
  const lapAt = (t) => Math.floor(t / PERIOD);

  const P1 = V(), P2 = V(), tmp = V();
  const at = (s, out) => curve.getPointAt((((s % LEN) + LEN) % LEN) / LEN, out);
  const tanAt = (s) => curve.getTangentAt((((s % LEN) + LEN) % LEN) / LEN);
  let lastChuff = 0, lastLap = -1, lastIdle = 0;
  const stackW = V(), whistleW = V();

  function update(t, dt, env) {
    const s = sAt(t);
    const v = (sAt(t + 0.05) - sAt(t - 0.05)) / 0.1;
    // 依次放置各车辆
    let cursor = s;
    for (const veh of vehicles) {
      const origin = cursor - veh.front;
      at(origin + veh.pa, P1); at(origin + veh.pb, P2);
      const yaw = Math.atan2(-(P1.z - P2.z), P1.x - P2.x);
      veh.obj.rotation.set(0, yaw, 0);
      tmp.set(veh.pa, 0, 0).applyAxisAngle(V(0, 1, 0), yaw);
      veh.obj.position.set(P1.x - tmp.x, RAIL_Y, P1.z - tmp.z);
      // 轻微摇摆
      veh.obj.rotation.x = Math.sin(t * 7 + origin) * 0.004 * Math.min(1, v / 3);
      if (veh.bogies) {
        veh.bogies.forEach((b, i) => {
          const tg = tanAt(origin + (i === 0 ? veh.pa : veh.pb));
          b.rotation.y = Math.atan2(-tg.z, tg.x) - yaw;
          for (const w of b.userData.wheels) w.rotation.z = (w.position.z < 0 ? 1 : -1) * (origin / 0.45);
        });
      }
      cursor = origin + veh.back - 0.45;
    }
    L.setMotion(s);
    // 烟囱：随车轮节拍喷汽（每转 4 次）
    L.loco.updateMatrixWorld(true);
    L.stackTip.getWorldPosition(stackW);
    const chuffEvery = (TAU * 0.86) / 4;
    const fwd = tanAt(s);
    if (v > 0.3 && s - lastChuff > chuffEvery) {
      lastChuff = s;
      emit(stackW, V((Math.random() - 0.5) * 0.4, 3.2 + v * 0.15, (Math.random() - 0.5) * 0.4).addScaledVector(fwd, -v * 0.2), 1.6, 3.2 + Math.random(), 0xdcd8d0, 0.6);
      // 起步时汽缸排汽
      if (v < 3.5) for (const side of [-1, 1]) {
        const cylW = L.body.localToWorld(V(3.4, 0.4, side * 1.3));
        emit(cylW, V(side * fwd.z * 2, 0.6, -side * fwd.x * 2), 1.2, 1.6, 0xf4f4f0, 0.5);
      }
    } else if (v <= 0.3 && t - lastIdle > 0.7) {
      lastIdle = t;
      emit(stackW, V((Math.random() - 0.5) * 0.3, 1.4, (Math.random() - 0.5) * 0.3), 1.0, 3.5, 0xcfcac2, 0.35);
    }
    // 发车鸣笛
    const tau = t - lapAt(t) * PERIOD;
    if (tau > STOP - 2.0 && tau < STOP - 0.6 && Math.random() < 0.6) { L.whistleTip.getWorldPosition(whistleW); emit(whistleW, V(0, 2.2, 0), 0.6, 1.2, 0xffffff, 0.7); }
    for (const p of puffs) {
      if (!p.visible) continue;
      const u = p.userData; u.life += dt;
      if (u.life > u.max) { p.visible = false; continue; }
      const k = u.life / u.max;
      p.position.addScaledVector(u.vel, dt); u.vel.multiplyScalar(1 - dt * 0.9); u.vel.y += dt * 0.4;
      const sc = u.size * (0.6 + k * 3.2); p.scale.set(sc, sc, sc);
      p.material.opacity = u.op * Math.sin(Math.min(1, k * 4) * Math.PI / 2) * (1 - k);
    }
    // 计日牌：每跑一圈翻一天
    const lap = lapAt(t);
    if (lap !== lastLap) { lastLap = lap; drawDay(dayTex, (lap % 80) + 1); }
    // 信号机：发车前后放行
    const clear = tau > STOP - 4 && tau < STOP + 12 ? 1 : (tau > PERIOD - 18 ? 1 : 0);
    for (const sg of sigs) sg.arm.rotation.z += ((clear ? 0.75 : 0) - sg.arm.rotation.z) * Math.min(1, dt * 3);
    // 钟楼时针（按乐园流逝的时间转动）
    const mins = t * 2;
    for (const h of S.hands) { h.mh.rotation.z = -(mins / 60) * TAU; h.hh.rotation.z = -(mins / 720) * TAU; h.dial.material.emissiveIntensity = 0.05 + env.night * 1.4; }
    if (S.hands.vane) S.hands.vane.rotation.y = Math.sin(t * 0.1) * 0.6;
  }

  return {
    group, update,
    walker: L.loco, labelY: 8,
    moving: true,
    rideAnchor: L.rideAnchor, rideLook: L.rideLook,
    footprint: 0,
    focus() {
      const p = L.loco.position, h = L.loco.rotation.y;
      const fwd = V(Math.cos(h), 0, -Math.sin(h)), side = V(Math.sin(h), 0, Math.cos(h));
      if (side.dot(V(p.x, 0, p.z)) < 0) side.negate(); // 从远离乐园中心的一侧观看（车站在背景中）
      const pos = p.clone().addScaledVector(fwd, 12).addScaledVector(side, 15).setY(5.5);
      return { pos: pos.toArray(), target: [p.x - fwd.x * 6, 2.2, p.z - fwd.z * 6] };
    },
    info: { length: LEN, trainLen },
  };
}

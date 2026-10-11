// ─────────────────────────────────────────────────────────────
//  Nautilus —— 《海底两万里》尼摩船长的潜艇（按 0.7 比例，约 50 m）
//  · 纺锤形鱼鳞铁甲船体、撞角、锯齿背鳍
//  · 舵手室（透镜舷窗）、探照灯室、隐藏小艇、甲板平台
//  · 两侧大型沙龙圆窗（夜间青色辉光）
//  · 四叶螺旋桨、舵、水平鳍
//  · 木栈桥码头 + 巨型章鱼（大王乌贼）从水中探出
//  原点：水面（y=0）上的船体中心；船首朝 +X，码头朝 +Z
// ─────────────────────────────────────────────────────────────
import * as THREE from 'three';
import * as U from '../util.js';
import { withRepeat } from '../materials.js';

const { V } = U;
const TAU = Math.PI * 2;

const HL = 25;   // 半长
const HR = 3.9;  // 最大半径
const CY = 0.55; // 船体中心高度（相对水面）

// 船体半径函数：x∈[-HL, HL]
function hullR(x) {
  const t = x / HL;
  const front = t > 0;
  const a = Math.abs(t);
  const p = front ? 2.1 : 1.7;
  return HR * Math.pow(Math.max(0, 1 - Math.pow(a, p)), front ? 0.62 : 0.7);
}

function hullGeometry(ns = 120, nt = 64, uRep = 5, vRep = 6) {
  const pos = [], uv = [], idx = [];
  for (let i = 0; i <= ns; i++) {
    const s = i / ns;
    const x = -HL + 2 * HL * (0.5 - 0.5 * Math.cos(s * Math.PI));
    const r = hullR(x);
    for (let j = 0; j <= nt; j++) {
      const a = (j / nt) * TAU;
      // 截面略扁：上部更平
      const y = Math.sin(a) * r * (Math.sin(a) > 0 ? 0.9 : 1.0);
      const z = Math.cos(a) * r;
      pos.push(x, y, z);
      uv.push((j / nt) * uRep, ((x + HL) / (2 * HL)) * vRep);
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
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}
const hullPoint = (x, a, off = 0) => { const r = hullR(x) + off; return V(x, CY + Math.sin(a) * r * (Math.sin(a) > 0 ? 0.9 : 1.0), Math.cos(a) * r); };
const hullTop = (x) => CY + hullR(x) * 0.9;

// 胶囊形舱室（舵手室/探照灯室）
function capsule(M, len, r, h, mat) {
  const geo = new THREE.CapsuleGeometry(r, len, 10, 28);
  geo.rotateZ(Math.PI / 2); geo.scale(1, h, 1);
  const g = new THREE.Group(); g.add(U.mesh(geo, mat));
  // 底部与甲板相接的围裙 + 腰线
  g.add(U.box(len + r * 1.6, 0.25, r * 1.7, mat, 0, -r * h * 0.8, 0));
  const belt = new THREE.TorusGeometry(1, 0.045, 6, 48); belt.rotateX(Math.PI / 2); belt.scale(len / 2 + r, 1, r);
  g.add(U.mesh(belt, M.brass));
  return g;
}

// ═════════════════════════════════════════════════════════════
export function createNautilus(M, ctx) {
  const group = new THREE.Group();
  const boat = new THREE.Group(); boat.userData.dynamic = true; group.add(boat);
  const hullMat = withRepeat(M.hull, 5, 6);

  // ---------- 船体 ----------
  boat.add(U.mesh(hullGeometry(), hullMat));
  // 纵向肋条（水线、上腰线）
  for (const a of [0.0, Math.PI, 0.55, Math.PI - 0.55, -0.45, Math.PI + 0.45]) {
    const pts = []; for (let x = -HL + 1.2; x <= HL - 1.0; x += 1) pts.push(hullPoint(x, a, 0.04));
    boat.add(U.tube(pts, a === 0 || a === Math.PI ? 0.09 : 0.06, M.ironPlain, false, 100, 6));
  }
  // 环形加强箍 + 铆钉
  const rivP = [], rivN = [];
  for (let x = -21; x <= 21; x += 3.5) {
    const pts = [];
    for (let k = 0; k < 48; k++) {
      const a = (k / 48) * TAU; const p = hullPoint(x, a, 0.035); pts.push(p);
      const n = V(0, Math.sin(a), Math.cos(a));
      rivP.push(hullPoint(x, a, 0.09)); rivN.push(n);
    }
    boat.add(U.tube(pts, 0.065, M.ironPlain, true, 96, 6));
  }
  boat.add(U.rivetsAt(rivP, rivN, 0.05, M.ironPlain));

  // ---------- 撞角（船首钢刺） ----------
  const ram = U.mesh(new THREE.ConeGeometry(0.75, 7.5, 16), M.steel); ram.rotation.z = -Math.PI / 2; ram.position.set(HL + 2.6, CY, 0); boat.add(ram);
  boat.add(U.cyl(0.95, 0.95, 0.4, M.brass, HL - 0.9, CY, 0, 20).rotateZ(Math.PI / 2));
  for (let k = 0; k < 6; k++) { // 撞角上的螺旋沟纹
    const pts = []; for (let q = 0; q <= 12; q++) { const f = q / 12; const x = HL - 0.6 + f * 6.5; const r = 0.75 * (1 - f) + 0.03; const a = k / 6 * TAU + f * 2.5; pts.push(V(x, CY + Math.sin(a) * r, Math.cos(a) * r)); }
    boat.add(U.tube(pts, 0.035, M.brass, false, 24, 4));
  }

  // ---------- 锯齿背鳍 ----------
  const fin = (x0, x1, h0, h1, teeth, yFn, mat) => {
    const s = new THREE.Shape(); s.moveTo(0, 0);
    const L = x1 - x0;
    for (let k = 0; k < teeth; k++) {
      const f0 = k / teeth, f1 = (k + 1) / teeth;
      const h = h0 + (h1 - h0) * f0;
      s.lineTo(L * (f0 + (f1 - f0) * 0.75), h); s.lineTo(L * f1, h * 0.35);
    }
    s.lineTo(L, 0); s.lineTo(0, 0);
    const g = new THREE.ExtrudeGeometry(s, { depth: 0.14, bevelEnabled: true, bevelSize: 0.03, bevelThickness: 0.03, bevelSegments: 1 });
    g.translate(0, 0, -0.07);
    const m = U.mesh(g, mat); m.position.set(x0, 0, 0);
    // 根部贴合船体
    const pa = g.attributes.position;
    for (let i = 0; i < pa.count; i++) { const x = pa.getX(i) + x0; pa.setY(i, pa.getY(i) + yFn(x) - 0.15); }
    g.computeVertexNormals();
    return m;
  };
  boat.add(fin(13.5, HL + 0.5, 1.6, 0.6, 9, hullTop, M.ironPlain));
  boat.add(fin(-20.5, -12.5, 0.6, 1.4, 6, hullTop, M.ironPlain));


  // ---------- 甲板平台 ----------
  const DX0 = -11, DX1 = 11.5, DW = 1.7;
  const deckY = hullTop(0) + 0.05;
  const deckM = withRepeat(M.deck, 6, 1);
  boat.add(U.box(DX1 - DX0, 0.12, DW * 2, deckM, (DX0 + DX1) / 2, deckY, 0));
  // 甲板与船体之间的裙边
  for (const z of [-DW, DW]) {
    const pts = []; for (let x = DX0; x <= DX1; x += 0.5) pts.push(V(x, deckY - 0.02, z));
    boat.add(U.tube(pts, 0.05, M.brass, false, 50, 5));
    for (let x = DX0; x <= DX1; x += 1.5) boat.add(U.rod(V(x, deckY - 0.06, z), hullPoint(x, z > 0 ? 1.05 : Math.PI - 1.05, -0.05), 0.05, M.ironPlain, 6));
  }
  // 可拆卸栏杆（立柱 + 链索）
  for (const z of [-DW + 0.05, DW - 0.05]) {
    for (let x = DX0 + 0.3; x <= DX1 - 0.2; x += 1.6) {
      boat.add(U.rod(V(x, deckY, z), V(x, deckY + 1.0, z), 0.03, M.steel, 6));
      boat.add(U.sphere(0.05, M.brass, x, deckY + 1.02, z, 8, 6));
      if (x + 1.6 <= DX1 - 0.2) {
        const sag = []; for (let q = 0; q <= 6; q++) { const f = q / 6; sag.push(V(x + f * 1.6, deckY + 0.95 - Math.sin(f * Math.PI) * 0.12, z)); }
        boat.add(U.tube(sag, 0.012, M.steel, false, 8, 4));
        const sag2 = sag.map((p) => p.clone().setY(p.y - 0.45));
        boat.add(U.tube(sag2, 0.012, M.steel, false, 8, 4));
      }
    }
  }
  // 舱口盖（通往内部）
  {
    const hatch = new THREE.Group(); hatch.position.set(3.2, deckY + 0.06, 0);
    hatch.add(U.cyl(0.6, 0.65, 0.3, M.brass, 0, 0.15, 0, 20));
    const lid = U.cyl(0.62, 0.62, 0.08, M.ironPlain, 0, 0.0, 0, 20); lid.position.set(-0.5, 0.75, 0); lid.rotation.z = 1.25; hatch.add(lid);
    hatch.add(U.torus(0.3, 0.03, M.brass, -0.6, 0.85, 0, 6, 16).rotateZ(1.25).rotateX(Math.PI / 2));
    boat.add(hatch);
  }

  // ---------- 舵手室（前） ----------
  const wh = capsule(M, 1.6, 1.0, 0.85, M.ironPlain); wh.position.set(9.0, deckY + 0.55, 0); boat.add(wh);
  // 透镜舷窗：环绕一圈
  const portSpots = [];
  for (let k = 0; k < 7; k++) { const a = -Math.PI / 2 + ((k + 0.5) / 7) * Math.PI; portSpots.push([V(9.0 + 0.8 + Math.cos(a) * 0.98, deckY + 0.68, Math.sin(a) * 0.98), V(Math.cos(a), 0, Math.sin(a))]); }
  for (const s of [1, -1]) for (const dx of [-0.5, 0.25]) portSpots.push([V(9.0 + dx, deckY + 0.68, s * 0.98), V(0, 0, s)]);
  for (const [p, n] of portSpots) {
    const port = new THREE.Group(); port.position.copy(p); port.lookAt(p.clone().add(n));
    port.add(U.torus(0.24, 0.06, M.brass, 0, 0, 0, 8, 20));
    const lens = U.sphere(0.22, M.glowCyan, 0, 0, -0.06, 16, 10); lens.scale.z = 0.45; port.add(lens);
    for (let q = 0; q < 6; q++) { const b = q / 6 * TAU; port.add(U.sphere(0.025, M.brass, Math.cos(b) * 0.3, Math.sin(b) * 0.3, 0.03, 5, 4)); }
    boat.add(port);
  }
  boat.add(U.cyl(0.25, 0.3, 0.12, M.brass, 9.0, deckY + 1.35, 0, 12));
  boat.add(U.sphere(0.18, M.brass, 9.0, deckY + 1.5, 0, 10, 8));

  // ---------- 探照灯室（后） ----------
  const lh = capsule(M, 1.0, 0.95, 0.85, M.ironPlain); lh.position.set(-7.5, deckY + 0.5, 0); boat.add(lh);
  const lensF = new THREE.Group(); lensF.position.set(-7.5, deckY + 0.6, 0); boat.add(lensF);
  lensF.userData.dynamic = true;
  {
    const head = new THREE.Group(); head.position.set(0, 0.9, 0); lensF.add(head);
    head.add(U.cyl(0.55, 0.65, 1.2, M.brass, 0, 0, 0, 20).rotateZ(Math.PI / 2));
    head.add(U.torus(0.6, 0.06, M.brass, 0.62, 0, 0, 8, 24).rotateY(Math.PI / 2));
    const glass = U.cyl(0.55, 0.55, 0.05, M.glowBeacon, 0.63, 0, 0, 24); glass.rotation.z = Math.PI / 2; head.add(glass);
    for (let k = 0; k < 5; k++) head.add(U.torus(0.12 + k * 0.1, 0.012, M.brass, 0.66, 0, 0, 4, 20).rotateY(Math.PI / 2));
    head.add(U.cyl(0.15, 0.2, 0.6, M.ironPlain, -0.3, 0.55, 0, 10));
    head.add(U.rod(V(0, -0.6, 0), V(0, -1.0, 0), 0.18, M.ironPlain, 10));
    // 光束（夜间可见）
    const beamMat = new THREE.MeshBasicMaterial({ color: 0xbff4ff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    const beamG = new THREE.CylinderGeometry(7, 0.5, 70, 24, 1, true); beamG.translate(0, 35, 0); beamG.rotateZ(-Math.PI / 2);
    const beam = new THREE.Mesh(beamG, beamMat); beam.position.x = 0.65; beam.castShadow = false; head.add(beam);
    lensF.userData.head = head; lensF.userData.beam = beam;
  }
  const spot = new THREE.SpotLight(0xcff6ff, 0, 120, 0.22, 0.5, 1.5);
  spot.position.set(0.7, 0, 0);
  const spotTarget = new THREE.Object3D(); spotTarget.position.set(30, -3, 0); lensF.userData.head.add(spotTarget); spot.target = spotTarget;
  lensF.userData.head.add(spot);
  ctx.addNightLight(spot, 2500);

  // ---------- 隐藏式小艇（倒扣在凹槽中） ----------
  {
    const dg = new THREE.Group(); dg.position.set(-1.8, deckY + 0.35, 0);
    const prof = []; for (let i = 0; i <= 12; i++) { const f = i / 12; prof.push([Math.sin(f * Math.PI) * 0.75 + 0.02, (f - 0.5) * 4.6]); }
    const dinghy = U.lathe(prof, withRepeat(M.woodDark, 1, 2), 20, 0, Math.PI); dinghy.rotation.z = Math.PI / 2; dinghy.scale.set(1, 1, 0.55);
    dg.add(dinghy);
    dg.add(U.box(4.8, 0.08, 1.7, M.ironPlain, 0, -0.32, 0));
    for (const x of [-1.6, 0, 1.6]) dg.add(U.box(0.12, 0.25, 1.8, M.brass, x, -0.2, 0));
    boat.add(dg);
  }

  // ---------- 沙龙大圆窗 + 舷窗 ----------
  for (const s of [1, -1]) {
    for (const wx of [-2.6, 2.6]) {
      const a = s > 0 ? 0.32 : Math.PI - 0.32;
      const p = hullPoint(wx, a, 0.05); const n = V(0, Math.sin(a), Math.cos(a));
      const w = new THREE.Group(); w.position.copy(p); w.lookAt(p.clone().add(n));
      w.add(U.torus(1.35, 0.16, M.brass, 0, 0, 0, 12, 48));
      w.add(U.torus(1.12, 0.06, M.brass, 0, 0, 0.05, 8, 48));
      const g = U.mesh(new THREE.CircleGeometry(1.25, 48), M.glowCyan); g.position.z = -0.05; w.add(g);
      for (let k = 0; k < 12; k++) { const b = k / 12 * TAU; w.add(U.rod(V(Math.cos(b) * 0.25, Math.sin(b) * 0.25, 0.03), V(Math.cos(b) * 1.2, Math.sin(b) * 1.2, 0.03), 0.025, M.brass, 4)); }
      w.add(U.torus(0.25, 0.05, M.brass, 0, 0, 0.04, 6, 20));
      w.add(U.sphere(0.14, M.brass, 0, 0, 0.06, 10, 8));
      for (let k = 0; k < 16; k++) { const b = k / 16 * TAU; w.add(U.sphere(0.05, M.brass, Math.cos(b) * 1.55, Math.sin(b) * 1.55, 0.05, 6, 4)); }
      boat.add(w);
    }
    // 小舷窗一排
    for (let x = -17; x <= 18; x += 2.2) {
      if (Math.abs(x) < 4.8) continue;
      const a = s > 0 ? 0.62 : Math.PI - 0.62;
      const p = hullPoint(x, a, 0.04); const n = V(0, Math.sin(a), Math.cos(a));
      const w = new THREE.Group(); w.position.copy(p); w.lookAt(p.clone().add(n));
      w.add(U.torus(0.22, 0.05, M.brass, 0, 0, 0, 6, 18));
      const g = U.mesh(new THREE.CircleGeometry(0.2, 16), M.glowWindow); g.position.z = -0.02; w.add(g);
      boat.add(w);
    }
  }

  // ---------- 船尾：螺旋桨、舵、水平鳍 ----------
  const prop = new THREE.Group(); prop.position.set(-HL - 1.2, CY, 0); prop.userData.dynamic = true; boat.add(prop);
  prop.add(U.sphere(0.5, M.brass, 0, 0, 0, 16, 12).translateX(-0.1));
  for (let k = 0; k < 4; k++) {
    const blade = new THREE.Group(); blade.rotation.x = k / 4 * TAU;
    const bs = new THREE.Shape(); bs.moveTo(-0.15, 0); bs.quadraticCurveTo(-0.9, 1.2, -0.2, 2.6); bs.quadraticCurveTo(0.6, 2.2, 0.35, 0); bs.lineTo(-0.15, 0);
    const bg = new THREE.ExtrudeGeometry(bs, { depth: 0.06, bevelEnabled: true, bevelSize: 0.03, bevelThickness: 0.02, bevelSegments: 1 });
    const bm = U.mesh(bg, M.brass); bm.rotation.y = Math.PI / 2 - 0.5; blade.add(bm);
    prop.add(blade);
  }
  boat.add(U.cyl(0.18, 0.25, 1.5, M.steel, -HL - 0.3, CY, 0, 12).rotateZ(Math.PI / 2));
  // 尾部十字鳍 + 舵
  const finShape = (w, h) => { const s = new THREE.Shape(); s.moveTo(0, 0); s.lineTo(w, 0); s.lineTo(w * 0.35, h); s.lineTo(-w * 0.1, h * 0.9); s.lineTo(0, 0); return new THREE.ExtrudeGeometry(s, { depth: 0.12, bevelEnabled: false }); };
  for (const [rx, sc] of [[0, 1], [Math.PI, 1], [Math.PI / 2, 0.8], [-Math.PI / 2, 0.8]]) {
    const f = U.mesh(finShape(3.2, 2.6 * sc), M.ironPlain);
    f.geometry.translate(0, 0.6, -0.06);
    const fg = new THREE.Group(); fg.position.set(-HL + 4.6, CY, 0); fg.rotation.x = rx; f.rotation.y = Math.PI; f.position.x = 0.0;
    fg.add(f); boat.add(fg);
  }
  // 两侧水平舵
  for (const s of [1, -1]) {
    const h = U.box(2.2, 0.1, 1.6, M.ironPlain, 12, CY - 0.6, s * (hullR(12) + 0.6));
    h.rotation.y = 0; boat.add(h);
    boat.add(U.cyl(0.08, 0.08, 1.2, M.steel, 12, CY - 0.6, s * (hullR(12) + 0.1), 8).rotateX(Math.PI / 2));
  }

  // 船名铭牌
  for (const s of [1, -1]) {
    const plate = U.signBoard('NAUTILUS', 4.2, 0.7, { bg: '#1a2626', fg: '#d9b86a', font: 'bold 150px "Times New Roman", serif' });
    const p = hullPoint(16.5, s > 0 ? 0.5 : Math.PI - 0.5, 0.06);
    plate.position.copy(p); plate.lookAt(p.clone().add(V(0, Math.sin(0.5), s * Math.cos(0.5))));
    boat.add(plate);
  }
  // 尼摩船长 & 阿龙纳斯教授
  const nemo = U.person(1870); nemo.position.set(6.5, deckY + 0.06, 0.6); nemo.rotation.y = Math.PI / 2; boat.add(nemo);
  const prof2 = U.person(1866); prof2.position.set(5.6, deckY + 0.06, -0.7); prof2.rotation.y = Math.PI / 2 + 0.6; boat.add(prof2);
  const ned = U.person(1868); ned.position.set(-4, deckY + 0.06, 1.0); ned.rotation.y = -0.4; boat.add(ned);
  // 鱼叉（尼德·兰）
  boat.add(U.rod(V(-3.7, deckY + 0.9, 1.25), V(-2.4, deckY + 2.6, 1.0), 0.025, M.woodDark, 5));
  boat.add(U.mesh(new THREE.ConeGeometry(0.06, 0.3, 6), M.steel).translateX(-2.33).translateY(deckY + 2.72).translateZ(0.98));

  U.mergeStatic(boat);

  // ═════════════ 码头栈桥 ═════════════
  const pier = new THREE.Group();
  const PZ0 = HR + 2.2, PZ1 = 34, PW = 3.2, PY = 1.6;
  const plank = withRepeat(M.deck, 1, 8);
  pier.add(U.box(PW * 2, 0.2, PZ1 - PZ0, plank, 0, PY, (PZ0 + PZ1) / 2));
  // T 形泊位
  pier.add(U.box(26, 0.2, 3.2, withRepeat(M.deck, 6, 1), 0, PY, PZ0 + 1.6));
  for (let x = -12.5; x <= 12.6; x += 2.5) for (const z of [PZ0 + 0.2, PZ0 + 3.0]) {
    pier.add(U.cyl(0.2, 0.22, PY + 5, M.woodDark, x, PY - 2.5, z, 8));
  }
  for (let z = PZ0 + 5; z <= PZ1; z += 3) for (const x of [-PW + 0.2, PW - 0.2]) pier.add(U.cyl(0.2, 0.22, PY + 5, M.woodDark, x, PY - 2.5, z, 8));
  // 系缆桩 + 缆绳
  for (const x of [-10, -2, 6, 11]) {
    pier.add(U.lathe([[0.25, 0], [0.22, 0.25], [0.16, 0.45], [0.26, 0.55], [0.26, 0.62], [0, 0.62]], M.ironPlain, 14).translateX(x).translateY(PY + 0.1).translateZ(PZ0 + 0.4));
    const to = hullPoint(x * 1.3, 1.2, 0.0);
    const mid = V((x + to.x) / 2, PY - 0.6, (PZ0 + 0.4 + to.z) / 2);
    pier.add(U.tube([V(x, PY + 0.5, PZ0 + 0.4), mid, V(to.x, to.y + 0.1, to.z)], 0.04, M.rope, false, 16, 5));
  }
  // 登船舷梯
  {
    const a = V(0, PY + 0.1, PZ0 + 0.3), b = V(0.5, deckY + 0.1, DW - 0.1);
    pier.add(U.box(1.2, 0.08, a.distanceTo(b), M.deck, (a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2).rotateX(Math.atan2(b.y - a.y, a.z - b.z)));
    pier.add(U.rod(a.clone().add(V(-0.6, 1, 0)), b.clone().add(V(-0.6, 1, 0)), 0.03, M.brass, 6));
    pier.add(U.rod(a.clone().add(V(0.6, 1, 0)), b.clone().add(V(0.6, 1, 0)), 0.03, M.brass, 6));
  }
  // 栏杆、灯柱
  pier.add(U.railing([V(-PW + 0.1, PY + 0.1, PZ0 + 3.2), V(-PW + 0.1, PY + 0.1, PZ1)], { height: 1.0, mat: M.woodDark, postEvery: 2, baluster: 0 }));
  pier.add(U.railing([V(PW - 0.1, PY + 0.1, PZ0 + 3.2), V(PW - 0.1, PY + 0.1, PZ1)], { height: 1.0, mat: M.woodDark, postEvery: 2, baluster: 0 }));
  for (const z of [PZ0 + 6, PZ0 + 15, PZ0 + 24]) for (const x of [-PW + 0.3, PW - 0.3]) { const l = U.lampPost(M, { h: 3.4, arms: 1 }); l.position.set(x, PY + 0.1, z); pier.add(l); }
  // 货物箱、桶、起重吊杆
  for (const [x, z, r] of [[9, PZ0 + 2, 0.2], [10.2, PZ0 + 2.1, 0.5], [9.6, PZ0 + 1.9, 0.0]]) pier.add(U.box(1, 0.9, 1, M.woodDark, x, PY + 0.55 + (r === 0 ? 0.9 : 0), z).rotateY(r));
  for (const [x, z] of [[-9, PZ0 + 2.3], [-8.2, PZ0 + 2.5]]) pier.add(U.lathe([[0.32, 0], [0.38, 0.4], [0.32, 0.85], [0, 0.85]], M.woodDark, 14).translateX(x).translateY(PY + 0.1).translateZ(z));
  {
    const c = new THREE.Group(); c.position.set(-6, PY + 0.1, PZ0 + 2.4);
    c.add(U.cyl(0.18, 0.22, 5.5, M.ironPlain, 0, 2.75, 0, 10));
    c.add(U.rod(V(0, 0.8, 0), V(3.2, 5.6, -2.0), 0.1, M.ironPlain, 8));
    c.add(U.rod(V(0, 5.5, 0), V(3.2, 5.6, -2.0), 0.03, M.steel, 4));
    c.add(U.rod(V(3.2, 5.6, -2.0), V(3.2, 2.4, -2.0), 0.02, M.rope, 4));
    c.add(U.box(0.7, 0.5, 0.7, M.woodDark, 3.2, 2.1, -2.0));
    c.add(U.gear({ radius: 0.45, teeth: 14, spokes: 4, thickness: 0.08 }, M.brass).translateY(1.2).translateZ(0.2));
    pier.add(c);
  }
  // 码头招牌（尼摩的格言）
  {
    const arch = new THREE.Group(); arch.position.set(0, PY + 0.1, PZ0 + 9);
    for (const x of [-PW + 0.2, PW - 0.2]) arch.add(U.box(0.3, 4.4, 0.3, M.ironPlain, x, 2.2, 0));
    arch.add(U.torus(PW - 0.2, 0.12, M.ironPlain, 0, 4.4, 0, 8, 32, Math.PI));
    const sign = U.signBoard('MOBILIS IN MOBILI', 4.8, 0.9, { sub: '— Capitaine Nemo —', bg: '#102226', fg: '#7fd6d0', border: '#b89a4a' });
    sign.position.set(0, 4.2, 0.1); arch.add(sign);
    const n = U.mesh(new THREE.TorusGeometry(0.6, 0.06, 6, 24), M.brass); n.position.set(0, 6.2, 0); arch.add(n);
    arch.add(U.mesh(new THREE.CircleGeometry(0.55, 24), M.glowCyan).translateY(6.2));
    pier.add(arch);
  }
  // 游客
  for (let k = 0; k < 10; k++) {
    const p = U.person(3000 + k); p.position.set((k % 3 - 1) * 1.4 + Math.sin(k) * 0.3, PY + 0.1, PZ0 + 4 + k * 2.2); p.rotation.y = Math.PI + Math.sin(k * 3) * 0.8; pier.add(p);
  }
  U.mergeStatic(pier);
  group.add(pier);

  // ═════════════ 大王乌贼 ═════════════
  const squid = new THREE.Group(); squid.position.set(-14, 0, -15); squid.userData.dynamic = true; group.add(squid);
  const skinMat = new THREE.MeshStandardMaterial({ color: 0x9a3b2c, roughness: 0.38, metalness: 0.05, side: THREE.DoubleSide });
  const skinMat2 = new THREE.MeshStandardMaterial({ color: 0xd9a089, roughness: 0.5 });
  {
    // 外套膜（向后倾斜露出水面）
    const mantle = U.lathe([[0.0, 0], [1.6, 0.5], [2.0, 2], [1.9, 4], [1.4, 6.5], [0.7, 8.4], [0, 9.2]], skinMat, 32);
    mantle.position.set(0, -1.5, 0); mantle.rotation.z = 0.55; squid.add(mantle);
    // 尾鳍
    const fs = new THREE.Shape(); fs.moveTo(0, 0); fs.quadraticCurveTo(2.6, 1.0, 0.2, 3.2); fs.lineTo(0, 0);
    for (const s of [1, -1]) {
      const f = U.mesh(new THREE.ShapeGeometry(fs, 12), skinMat); f.position.set(-3.6, 5.8, 0); f.rotation.set(0, s > 0 ? 0 : Math.PI, 0.55); squid.add(f);
    }
    // 巨眼
    for (const s of [1, -1]) {
      squid.add(U.sphere(0.75, skinMat2, 0.55, 0.6, s * 1.45, 20, 14));
      const e = U.sphere(0.6, M.eye, 0.75, 0.65, s * 1.62, 20, 14); squid.add(e);
      squid.add(U.sphere(0.22, new THREE.MeshStandardMaterial({ color: 0xffd060, emissive: 0x553300, roughness: 0.2 }), 1.05, 0.75, s * 1.95, 12, 8));
    }
  }
  // 腕足：每帧重算管状几何
  const ARMS = [];
  const ARM_SEG = 36, ARM_RAD = 10;
  const mkArm = (baseAngle, len, r0, club) => {
    const nV = (ARM_SEG + 1) * (ARM_RAD + 1);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(nV * 3), 3));
    const idx = []; const row = ARM_RAD + 1;
    for (let i = 0; i < ARM_SEG; i++) for (let j = 0; j < ARM_RAD; j++) { const a = i * row + j, b = (i + 1) * row + j; idx.push(a, b, a + 1, b, b + 1, a + 1); }
    g.setIndex(idx);
    const uvs = []; for (let i = 0; i <= ARM_SEG; i++) for (let j = 0; j <= ARM_RAD; j++) uvs.push(j / ARM_RAD, i / ARM_SEG); g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    const m = new THREE.Mesh(g, skinMat); m.castShadow = true; m.frustumCulled = false;
    squid.add(m);
    // 吸盘（每条腕 18 个，跟随更新）
    const suck = new THREE.InstancedMesh(new THREE.TorusGeometry(1, 0.35, 5, 10), skinMat2, 18); suck.frustumCulled = false; squid.add(suck);
    ARMS.push({ m, g, baseAngle, len, r0, club, suck, phase: Math.random() * 10 });
  };
  for (let k = 0; k < 8; k++) mkArm((k / 8) * TAU + 0.2, 10 + (k % 3) * 1.5, 0.66, false);
  mkArm(0.5, 17, 0.42, true); mkArm(-0.5, 17, 0.42, true);

  const tA = V(), nA = V(), bA = V(), pPrev = V();
  const pts = Array.from({ length: ARM_SEG + 1 }, () => V());
  const dum = new THREE.Object3D();
  const updateArms = (t) => {
    for (const A of ARMS) {
      // 2D 弯曲链：先从口部向外，再向上卷曲
      let ang = 0.15; // 与水平面夹角
      const dir0 = V(Math.cos(A.baseAngle), 0, Math.sin(A.baseAngle));
      const step = A.len / ARM_SEG;
      let p = V(0.9 + Math.cos(A.baseAngle) * 0.6, -0.4, Math.sin(A.baseAngle) * 0.9);
      let yaw = A.baseAngle;
      for (let i = 0; i <= ARM_SEG; i++) {
        pts[i].copy(p);
        const f = i / ARM_SEG;
        const w = Math.sin(t * 0.9 + A.phase - f * 4);
        ang += (0.06 + 0.11 * f) * (0.6 + 0.6 * w) * (A.club ? 0.7 : 1);
        yaw += Math.sin(t * 0.5 + A.phase * 2 + f * 3) * 0.03;
        const d = V(Math.cos(yaw) * Math.cos(ang), Math.sin(ang), Math.sin(yaw) * Math.cos(ang));
        p = p.clone().addScaledVector(d, step);
      }
      void dir0;
      const pa = A.g.attributes.position;
      let si = 0;
      for (let i = 0; i <= ARM_SEG; i++) {
        const f = i / ARM_SEG;
        tA.subVectors(pts[Math.min(ARM_SEG, i + 1)], pts[Math.max(0, i - 1)]).normalize();
        nA.set(0, 1, 0).cross(tA).normalize(); if (nA.lengthSq() < 0.1) nA.set(1, 0, 0);
        bA.crossVectors(tA, nA).normalize();
        let r = A.r0 * (1 - f * 0.92) + 0.02;
        if (A.club && f > 0.78) r *= 1 + 1.4 * Math.sin(((f - 0.78) / 0.22) * Math.PI);
        for (let j = 0; j <= ARM_RAD; j++) {
          const a = -(j / ARM_RAD) * TAU;
          const k = (i * (ARM_RAD + 1) + j) * 3;
          pa.array[k] = pts[i].x + (nA.x * Math.cos(a) + bA.x * Math.sin(a)) * r;
          pa.array[k + 1] = pts[i].y + (nA.y * Math.cos(a) + bA.y * Math.sin(a)) * r;
          pa.array[k + 2] = pts[i].z + (nA.z * Math.cos(a) + bA.z * Math.sin(a)) * r;
        }
        // 吸盘：位于内侧（-b 方向）
        if (i % 2 === 0 && i > 0 && si < 18) {
          const sr = r * 0.28;
          dum.position.copy(pts[i]).addScaledVector(bA, -r * 0.95);
          dum.lookAt(pPrev.copy(dum.position).addScaledVector(bA, -1));
          dum.scale.setScalar(sr);
          dum.updateMatrix(); A.suck.setMatrixAt(si++, dum.matrix);
        }
      }
      A.suck.instanceMatrix.needsUpdate = true;
      pa.needsUpdate = true; A.g.computeVertexNormals();
    }
  };

  // 水花环（乌贼周围的白色泡沫）
  const foamMat = new THREE.MeshStandardMaterial({ color: 0xf4f8f8, roughness: 0.6, transparent: true, opacity: 0.55, depthWrite: false });
  const foam = U.mesh(new THREE.RingGeometry(2.0, 5.5, 48, 1), foamMat); foam.rotation.x = -Math.PI / 2; foam.position.y = 0.05; foam.castShadow = false; squid.add(foam);

  function update(t, dt, env) {
    // 潜艇轻微起伏 & 横摇
    boat.position.y = Math.sin(t * 0.5) * 0.12;
    boat.rotation.x = Math.sin(t * 0.37) * 0.012;
    boat.rotation.z = Math.sin(t * 0.29) * 0.006;
    prop.rotation.x = t * 0.6;
    // 探照灯左右扫动
    const head = lensF.userData.head;
    head.rotation.y = Math.sin(t * 0.25) * 1.1;
    head.rotation.z = -0.05 + Math.sin(t * 0.17) * 0.05;
    lensF.userData.beam.material.opacity = 0.2 * env.night;
    lensF.userData.beam.visible = env.night > 0.05;
    // 乌贼
    squid.position.y = -0.3 + Math.sin(t * 0.6) * 0.25;
    squid.rotation.y = Math.sin(t * 0.13) * 0.25 + 0.4;
    updateArms(t);
    foam.scale.setScalar(1 + Math.sin(t * 1.3) * 0.05);
  }

  return {
    group, update,
    footprint: 38,
    focus: { pos: [26, 12, 34], target: [0, 1.5, 0] },
  };
}

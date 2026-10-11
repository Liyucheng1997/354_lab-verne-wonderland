// ─────────────────────────────────────────────────────────────
//  « La Galerie des Machines » —— 铸铁玻璃机械展厅
//  参照南特机械岛长廊 + 1889 巴黎世博会机械馆：
//  三铰格构拱架（每 5 m 一榀）+ 全玻璃拱顶 + 顶部通风天窗 + 砖砌山墙（扇窗 / 玫瑰窗）
//  厅内：大苍鹭原型机、机械巨蚁、蒸汽机飞轮、齿轮墙、行车吊着鹦鹉螺号螺旋桨、工作台……
//  长轴沿 X（40 m），宽沿 Z（18 m）。+X 山墙为敞开的主入口（带雨棚），-X 山墙为玫瑰窗。
// ─────────────────────────────────────────────────────────────
import * as THREE from 'three';
import * as U from '../util.js';
import { withRepeat, rng } from '../materials.js';

const PI = Math.PI, TAU = Math.PI * 2;
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const AX = V(1, 0, 0), AZ = V(0, 0, 1);
const put = (parent, o) => { parent.add(o); return o; };

/** 两点间的矩形截面型钢：h 为面内高度，w 为沿 n 方向的宽度 */
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
function scrollHalf(L, c, turns = 1.5, n = 18) {
  const pts = [V(0, 0, 0), V(L * 0.5, 0, 0)];
  for (let i = 0; i <= n; i++) { const th = (i / n) * turns * TAU; const r = c * Math.exp(-0.3 * th); const ph = -PI / 2 + th; pts.push(V(L + Math.cos(ph) * r, c + Math.sin(ph) * r, 0)); }
  return pts;
}
function sScrollPts(L, c, turns = 1.4) { const h = scrollHalf(L, c, turns); const neg = h.map((p) => V(-p.x, -p.y, 0)).reverse(); return [...neg.slice(0, -1), ...h]; }
function scrollMesh(pts, r, mat) { return U.tube(pts, r, mat, false, Math.round(pts.length * 1.6), 5); }
function rayGeo(r0, r1, w, depth) {
  const s = new THREE.Shape(); s.moveTo(r0, -w / 2); s.lineTo(r1, 0); s.lineTo(r0, w / 2); s.lineTo(r0, -w / 2);
  const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: false }); g.translate(0, 0, -depth / 2); return g;
}
/** 一节铁链（交替转向的环） */
function chain(a, b, linkR, mat) {
  const g = new THREE.Group();
  const d = new THREE.Vector3().subVectors(b, a); const len = d.length(); const n = Math.max(2, Math.floor(len / (linkR * 2.6)));
  const q = new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), d.clone().normalize());
  for (let i = 0; i < n; i++) {
    const t = U.torus(linkR, linkR * 0.28, mat, 0, 0, 0, 3, 8); t.scale.y = 1.5;
    t.position.copy(a).addScaledVector(d, (i + 0.5) / n);
    t.quaternion.copy(q); if (i % 2) t.rotateY(PI / 2);
    g.add(t);
  }
  return g;
}

// ─── 拱架剖面（外表面 / 玻璃面），半边：w = |z|，y 向上 ───
const PROF = [[9.0, 0], [9.12, 2.3], [9.02, 4.6], [8.55, 6.8], [7.5, 8.8], [5.8, 10.6], [3.4, 11.95], [0, 12.8]];
const NP = 26;
function buildStations() {
  const curve = new THREE.CatmullRomCurve3(PROF.map(([w, y]) => V(w, y, 0)), false, 'centripetal');
  const st = [];
  for (let i = 0; i < NP; i++) {
    const u = i / (NP - 1); const p = curve.getPointAt(u); const tg = curve.getTangentAt(u);
    st.push({ u, w: i === NP - 1 ? 0 : p.x, y: p.y, tw: tg.x, ty: tg.y, nw: -tg.y, ny: tg.x });
  }
  return st;
}

export function createGalerie(M, ctx) {
  const group = new THREE.Group(); group.name = 'Galerie';
  const S = new THREE.Group(); group.add(S);
  const R = rng(1889);
  const ST = buildStations();
  const L2 = 20; // 半长
  const depth = (i) => 0.32 + 0.9 * Math.pow(Math.sin(PI * ST[i].u), 1.2);
  /** 剖面站点 i 处，沿内法线偏移 off，σ 为 z 侧，x 为纵向位置 */
  const pt = (i, off, sg, x) => { const s = ST[i]; return V(x, s.y + s.ny * off, sg * (s.w + s.nw * off)); };
  const iC = ST.findIndex((s) => s.w < 2.8); // 天窗起点
  const wL = ST[iC].w, yC = ST[iC].y, yT = yC + 1.3;

  // 局部材质
  const iron = M.ironPlain, black = M.paintBlack;
  const glassD = M.glass.clone(); glassD.side = THREE.DoubleSide; glassD.depthWrite = false;
  const brickW = withRepeat(M.brick, 0.55, 0.55);
  const brickBox = withRepeat(M.brick, 20, 0.6);
  const floorMat = withRepeat(M.deck, 8, 6);
  const apronMat = withRepeat(M.cobbles, 13, 7.5);
  const stoneL = withRepeat(M.stone, 6, 1);
  const glowBackFan = M.glowWindow; // 扇窗玻璃（双面各一片）

  // ─────────── 地面 ───────────
  S.add(U.box(52, 0.06, 30, apronMat, 0, 0.03, 0));
  S.add(U.box(40, 0.1, 18.4, floorMat, 0, 0.05, 0));
  for (const z of [-15, 15]) S.add(U.box(52.3, 0.14, 0.3, M.stone, 0, 0.07, z));
  for (const x of [-26, 26]) S.add(U.box(0.3, 0.14, 30, M.stone, x, 0.07, 0));

  // ─────────── 侧墙砖砌勒脚 ───────────
  for (const sg of [-1, 1]) {
    S.add(U.box(40, 1.2, 0.42, brickBox, 0, 0.6, sg * 9.33));
    S.add(U.box(40.3, 0.1, 0.58, M.stone, 0, 1.25, sg * 9.33));
    S.add(U.box(40.3, 0.22, 0.52, M.stone, 0, 0.11, sg * 9.36));
  }

  // ─────────── 三铰格构拱架 ×7 ───────────
  const frameXs = [-15, -10, -5, 0, 5, 10, 15];
  const rivP = [], rivN = [];
  for (const x of frameXs) {
    for (const sg of [-1, 1]) {
      const O = (i) => pt(i, 0.12, sg, x), I = (i) => pt(i, 0.12 + depth(i), sg, x);
      for (let i = 0; i < NP - 1; i++) {
        S.add(beam(O(i), O(i + 1), 0.16, 0.2, iron, AX));
        S.add(beam(pt(i, 0.035, sg, x), pt(i + 1, 0.035, sg, x), 0.03, 0.4, iron, AX));
        S.add(beam(I(i), I(i + 1), 0.14, 0.18, iron, AX));
        S.add(beam(pt(i, 0.12 + depth(i) + 0.075, sg, x), pt(i + 1, 0.12 + depth(i + 1) + 0.075, sg, x), 0.03, 0.34, iron, AX));
        if (i % 2 === 0) S.add(beam(O(i), I(i + 1), 0.05, 0.1, iron, AX)); else S.add(beam(I(i), O(i + 1), 0.05, 0.1, iron, AX));
        // 铸铁装饰圆环（大跨部分）
        const dA = (depth(i) + depth(i + 1)) / 2;
        if (dA > 0.8 && i % 2 === 1) {
          const c = O(i).add(O(i + 1)).add(I(i)).add(I(i + 1)).multiplyScalar(0.25);
          const t = U.torus(dA * 0.27, 0.025, iron, c.x, c.y, c.z, 4, 16); t.rotation.y = PI / 2; S.add(t);
          const b = U.sphere(0.05, M.brass, c.x, c.y, c.z, 6, 4); S.add(b);
        }
        // 外翼缘铆钉
        const m = pt(i, 0.12 + depth(i) + 0.09, sg, x).lerp(pt(i + 1, 0.12 + depth(i + 1) + 0.09, sg, x), 0.5);
        const n = V(0, ST[i].ny, sg * ST[i].nw);
        if (i % 2 === 0) for (const dx of [-0.11, 0.11]) { rivP.push(V(m.x + dx, m.y, m.z)); rivN.push(n); }
      }
      for (let i = 0; i < NP; i++) S.add(beam(O(i), I(i), 0.07, 0.12, iron, AX));
      // 拱脚铰：石墩 + 铸铁靴 + 铜销
      S.add(U.box(0.9, 0.5, 1.3, M.stone, x, 0.25, sg * 8.62));
      S.add(U.box(0.6, 0.18, 0.9, iron, x, 0.59, sg * 8.66));
      const pin = U.cyl(0.11, 0.11, 0.62, M.brass, x, 0.72, sg * 8.72, 14); pin.rotation.z = PI / 2; S.add(pin);
      for (const dx of [-0.32, 0.32]) put(S, U.cyl(0.14, 0.14, 0.04, M.gold, x + dx, 0.72, sg * 8.72, 14)).rotation.z = PI / 2;
    }
    // 拱顶铰
    const ap = U.cyl(0.12, 0.12, 0.6, M.brass, x, ST[NP - 1].y - 0.25, 0, 14); ap.rotation.z = PI / 2; S.add(ap);
    S.add(U.sphere(0.16, M.gold, x, ST[NP - 1].y - 0.62, 0, 10, 8));
  }
  // 纵向檩条（在外弦与玻璃之间）
  for (const sg of [-1, 1]) {
    for (let i = 2; i < NP - 1; i += 3) {
      const s = ST[i]; const a = pt(i, 0.1, sg, -L2), b = pt(i, 0.1, sg, L2);
      S.add(beam(a, b, 0.2, 0.1, iron, V(0, s.ty, sg * s.tw)));
    }
  }
  // 拱顶脊梁 + 下吊灯
  S.add(U.box(40, 0.22, 0.16, iron, 0, ST[NP - 1].y - 0.55, 0));

  // ─────────── 玻璃围护（侧墙 + 拱顶，合并为单一几何） ───────────
  {
    const pos = [];
    const quad = (a, b, c, d) => { pos.push(...a.toArray(), ...b.toArray(), ...c.toArray(), ...a.toArray(), ...c.toArray(), ...d.toArray()); };
    for (const sg of [-1, 1]) for (let i = 1; i < iC; i++) quad(pt(i, 0, sg, -L2), pt(i, 0, sg, L2), pt(i + 1, 0, sg, L2), pt(i + 1, 0, sg, -L2));
    // 天窗：竖向玻璃（上半）+ 弧形玻璃顶
    const lantArc = (k, n) => { const a = (k / n) * PI / 2; return [(wL + 0.3) * Math.cos(a), yT + 0.95 * Math.sin(a)]; };
    for (const sg of [-1, 1]) {
      quad(V(-L2, yC + 0.65, sg * wL), V(L2, yC + 0.65, sg * wL), V(L2, yT, sg * wL), V(-L2, yT, sg * wL));
      for (let k = 0; k < 8; k++) { const [w0, y0] = lantArc(k, 8), [w1, y1] = lantArc(k + 1, 8); quad(V(-L2, y0, sg * w0), V(L2, y0, sg * w0), V(L2, y1, sg * w1), V(-L2, y1, sg * w1)); }
    }
    // 天窗两端山花玻璃
    for (const ex of [-L2 + 0.02, L2 - 0.02]) {
      const pts = []; for (let k = 0; k <= 8; k++) { const [w, y] = lantArc(k, 8); pts.push([Math.min(w, wL), y]); }
      for (let k = 0; k < 8; k++) {
        const [w0, y0] = pts[k], [w1, y1] = pts[k + 1];
        quad(V(ex, y0, -w0), V(ex, y0, w0), V(ex, y1, w1), V(ex, y1, -w1));
      }
      quad(V(ex, yC, -wL), V(ex, yC, wL), V(ex, yT, wL), V(ex, yT, -wL));
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(pos.length / 3 * 2), 2));
    g.computeVertexNormals();
    const glass = new THREE.Mesh(g, glassD); glass.castShadow = false; glass.receiveShadow = false; S.add(glass);

    // 玻璃格条：沿剖面（每 1 m）
    for (let k = 1; k < 32; k++) {
      const x = -L2 + k * 1.25; if (k % 4 === 0) continue;
      for (const sg of [-1, 1]) for (let i = 1; i < iC; i++) S.add(beam(pt(i, -0.03, sg, x), pt(i + 1, -0.03, sg, x), 0.05, 0.06, black, AX));
    }
    // 横向压条
    for (const sg of [-1, 1]) for (let i = 1; i <= iC; i += 2) { const s = ST[i]; S.add(beam(pt(i, -0.03, sg, -L2), pt(i, -0.03, sg, L2), 0.05, 0.08, black, V(0, s.ty, sg * s.tw))); }
    // 天窗骨架：立柱、百叶、弧形椽、屋脊花饰
    for (const sg of [-1, 1]) {
      for (let k = 0; k <= 32; k++) {
        const x = -L2 + k * 1.25; const main = k % 4 === 0;
        S.add(U.box(main ? 0.14 : 0.05, yT - yC, main ? 0.14 : 0.05, main ? iron : black, x, (yC + yT) / 2, sg * wL));
        for (let j = 0; j < 8; j++) { const [w0, y0] = lantArc(j, 8), [w1, y1] = lantArc(j + 1, 8); S.add(beam(V(x, y0, sg * w0), V(x, y1, sg * w1), main ? 0.12 : 0.04, main ? 0.12 : 0.05, main ? iron : black, AX)); }
      }
      for (const y of [yC, yC + 0.65, yT]) S.add(U.box(40, 0.08, 0.1, iron, 0, y, sg * wL));
      // 百叶
      for (let j = 0; j < 3; j++) { const lv = U.box(40, 0.03, 0.26, iron, 0, yC + 0.12 + j * 0.18, sg * (wL + 0.04)); lv.rotation.x = sg * 0.6; S.add(lv); }
      S.add(U.box(40.3, 0.08, 0.5, iron, 0, yT + 0.02, sg * (wL + 0.15)));
    }
    const ridgeY = yT + 0.95;
    S.add(U.box(40.4, 0.1, 0.18, iron, 0, ridgeY + 0.03, 0));
    for (let k = 0; k <= 80; k++) {
      const x = -L2 + k * 0.5;
      if (k % 2 === 0) { const f = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.36, 5), M.gold); f.position.set(x, ridgeY + 0.26, 0); S.add(f); S.add(U.sphere(0.045, M.gold, x, ridgeY + 0.1, 0, 5, 4)); }
      else { const t = U.torus(0.13, 0.016, black, x, ridgeY + 0.2, 0, 3, 10); S.add(t); }
    }
    for (const ex of [-L2]) { S.add(U.sphere(0.2, M.gold, ex, ridgeY + 0.3, 0, 12, 8)); const sp = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.7, 6), M.gold); sp.position.set(ex, ridgeY + 0.75, 0); S.add(sp); }
  }

  // ─────────── 山墙（+X 主入口扇窗 / -X 玫瑰窗） ───────────
  const gable = (sx) => {
    const g = new THREE.Group();
    const entrance = sx > 0;
    const dH = entrance ? 3.0 : 1.8, dS = entrance ? 3.6 : 2.4; // 门半宽 / 起拱高度
    const outline = ST.map((s) => [s.w - s.nw * 0.35, s.y - s.ny * 0.35]);
    outline[0][1] = 0; outline[NP - 1][0] = Math.max(outline[NP - 1][0], 0.12);
    const sh = new THREE.Shape();
    sh.moveTo(dH, 0);
    for (const [w, y] of outline) sh.lineTo(w, y);
    for (let i = NP - 1; i >= 0; i--) sh.lineTo(-outline[i][0], outline[i][1]);
    sh.lineTo(-dH, 0); sh.lineTo(-dH, dS);
    for (let k = 1; k <= 20; k++) { const a = PI - (k / 20) * PI; sh.lineTo(Math.cos(a) * dH, dS + Math.sin(a) * dH); }
    sh.lineTo(dH, 0);
    const yF = 7.2, rF = 4.0, yR = 8.0, rR = 3.4;
    const hole = new THREE.Path();
    if (entrance) { hole.moveTo(rF, yF); for (let k = 1; k <= 32; k++) { const a = (k / 32) * PI; hole.lineTo(Math.cos(a) * rF, yF + Math.sin(a) * rF); } hole.lineTo(rF, yF); }
    else hole.absarc(0, yR, rR, 0, TAU, true);
    sh.holes.push(hole);
    const wg = new THREE.ExtrudeGeometry(sh, { depth: 0.6, bevelEnabled: false, curveSegments: 24 });
    const wall = U.mesh(wg, brickW); wall.rotation.y = PI / 2; g.add(wall);
    // 外立面朝向：+X 墙外表面在 x=0.6，-X 墙外表面在 x=0（组整体镜像）
    const xo = 0.62;
    // 石砌压顶
    for (let i = 0; i < NP - 1; i++) for (const s of [-1, 1]) {
      const a = V(0.3, outline[i][1] + 0.0, s * outline[i][0]), b = V(0.3, outline[i + 1][1], s * outline[i + 1][0]);
      const n = V(0, ST[i].ty, s * ST[i].tw);
      const cp = beam(a, b, 0.32, 0.86, M.stone, AX); cp.position.add(V(0, -ST[i].ny * -0.05, s * -ST[i].nw * -0.05)); g.add(cp); void n;
    }
    // 隅石
    const wAt = (y) => { for (let i = 0; i < NP - 1; i++) if (outline[i + 1][1] >= y) { const t = (y - outline[i][1]) / (outline[i + 1][1] - outline[i][1] || 1); return outline[i][0] + (outline[i + 1][0] - outline[i][0]) * t; } return 0; };
    for (const s of [-1, 1]) for (let k = 0; k < 14; k++) {
      const wide = k % 2 === 0; const y = 0.25 + k * 0.48; const wo = Math.min(wAt(y - 0.22), wAt(y + 0.22)) + 0.04;
      g.add(U.box(0.74, 0.44, wide ? 0.95 : 0.6, M.stone, 0.3, y, s * (wo - (wide ? 0.475 : 0.3))));
    }
    // 勒脚 & 腰线
    for (const s of [-1, 1]) {
      const z0 = dH + 0.35, z1 = 9.45; g.add(U.box(0.76, 0.9, z1 - z0, stoneL, 0.3, 0.45, s * (z0 + z1) / 2));
    }
    g.add(U.box(0.78, 0.26, 17.2, M.stone, 0.3, 6.95, 0));
    g.add(U.box(0.86, 0.1, 17.4, M.stone, 0.3, 7.1, 0));
    // 门洞拱券 + 拱心石 + 门侧壁柱
    for (const xf of [xo, -0.02]) {
      const ar = U.torus(dH + 0.2, 0.2, M.stone, xf, dS, 0, 6, 32, PI); ar.rotation.y = PI / 2; g.add(ar);
    }
    g.add(U.box(0.8, 0.7, 0.5, M.stone, 0.3, dS + dH + 0.2, 0));
    g.add(U.box(0.84, 0.16, 0.66, M.stone, 0.3, dS + dH + 0.6, 0));
    for (const s of [-1, 1]) { g.add(U.box(0.8, dS, 0.36, M.stone, 0.3, dS / 2, s * (dH + 0.18))); g.add(U.box(0.86, 0.2, 0.5, M.stone, 0.3, dS, s * (dH + 0.18))); }
    if (entrance) {
      // ── 扇形大窗（双面玻璃 + 放射窗棂 + 金色旭日中心）──
      for (const [xf, ry] of [[0.42, PI / 2], [0.18, -PI / 2]]) {
        const p = U.mesh(new THREE.CircleGeometry(rF, 48, 0, PI), glowBackFan); p.position.set(xf, yF, 0); p.rotation.y = ry; p.castShadow = false; g.add(p);
      }
      for (let k = 1; k < 10; k++) { const a = (k / 10) * PI; g.add(beam(V(0.3, yF + Math.sin(a) * 0.75, Math.cos(a) * 0.75), V(0.3, yF + Math.sin(a) * rF, Math.cos(a) * rF), 0.09, 0.32, iron, AX)); }
      for (const r of [0.75, 2.2, 3.15]) { const t = U.torus(r, 0.05, iron, 0.3, yF, 0, 4, 40, PI); t.rotation.y = PI / 2; t.scale.z = 3; g.add(t); }
      for (let k = 0; k < 10; k++) { const a = ((k + 0.5) / 10) * PI; const t = U.torus(0.3, 0.025, iron, 0.3, yF + Math.sin(a) * 2.68, Math.cos(a) * 2.68, 3, 14); t.rotation.y = PI / 2; t.scale.z = 3; g.add(t); }
      const fr = U.torus(rF + 0.12, 0.2, M.stone, xo, yF, 0, 6, 40, PI); fr.rotation.y = PI / 2; g.add(fr);
      const frI = U.torus(rF + 0.12, 0.2, M.stone, -0.02, yF, 0, 6, 40, PI); frI.rotation.y = PI / 2; g.add(frI);
      const hub = U.cyl(0.72, 0.72, 0.7, M.brass, 0.3, yF, 0, 24, false, ); hub.rotation.z = PI / 2; g.add(hub);
      for (let k = 0; k <= 12; k++) { const r = U.mesh(rayGeo(0.25, k % 2 ? 0.62 : 0.7, 0.12, 0.05), M.gold); r.rotation.set(0, PI / 2, 0); r.position.set(xo + 0.05, yF, 0); r.rotateZ((k / 12) * PI); g.add(r); }
      g.add(U.box(0.82, 0.16, rF * 2 + 0.7, M.stone, 0.3, yF - 0.08, 0));
      // 山尖：旋转大齿轮（动态，单独挂到 group）
    } else {
      // ── 玫瑰窗 ──
      for (const [xf, ry] of [[0.42, PI / 2], [0.18, -PI / 2]]) {
        const p = U.mesh(new THREE.CircleGeometry(rR, 48), glowBackFan); p.position.set(xf, yR, 0); p.rotation.y = ry; p.castShadow = false; g.add(p);
      }
      for (let k = 0; k < 16; k++) { const a = (k / 16) * TAU; g.add(beam(V(0.3, yR + Math.sin(a) * 0.8, Math.cos(a) * 0.8), V(0.3, yR + Math.sin(a) * rR, Math.cos(a) * rR), 0.08, 0.3, iron, AX)); }
      const ring = (r, tb, x, y, z, mat = iron, sc = 3) => { const t = U.torus(r, tb, mat, x, y, z, 4, Math.max(12, Math.round(r * 24))); t.rotation.y = PI / 2; t.scale.z = sc; g.add(t); };
      ring(0.8, 0.06, 0.3, yR, 0); ring(2.0, 0.05, 0.3, yR, 0);
      for (let k = 0; k < 8; k++) { const a = ((k + 0.5) / 8) * TAU; ring(0.5, 0.035, 0.3, yR + Math.sin(a) * 1.4, Math.cos(a) * 1.4); }
      for (let k = 0; k < 16; k++) { const a = ((k + 0.5) / 16) * TAU; ring(0.36, 0.03, 0.3, yR + Math.sin(a) * 2.72, Math.cos(a) * 2.72); }
      for (const xf of [xo, -0.02]) { const fr = U.torus(rR + 0.12, 0.22, M.stone, xf, yR, 0, 6, 48); fr.rotation.y = PI / 2; g.add(fr); }
      const hub = U.cyl(0.62, 0.62, 0.72, M.brass, 0.3, yR, 0, 24); hub.rotation.z = PI / 2; g.add(hub);
      for (let k = 0; k < 16; k++) { const r = U.mesh(rayGeo(0.2, k % 2 ? 0.52 : 0.6, 0.1, 0.05), M.gold); r.rotation.set(0, PI / 2, 0); r.position.set(xo + 0.05, yR, 0); r.rotateZ((k / 16) * TAU); g.add(r); }
      // 关闭的木门（带铜钉）
      const door = new THREE.Group(); door.position.set(0.3, 0, 0);
      const ds = new THREE.Shape(); ds.moveTo(-dH, 0); ds.lineTo(dH, 0); ds.lineTo(dH, dS); for (let k = 1; k <= 16; k++) { const a = (k / 16) * PI; ds.lineTo(Math.cos(a) * dH, dS + Math.sin(a) * dH); } ds.lineTo(-dH, 0);
      const dg = new THREE.ExtrudeGeometry(ds, { depth: 0.12, bevelEnabled: false }); dg.translate(0, 0, -0.06);
      const dm = U.mesh(dg, M.woodDark); dm.rotation.y = PI / 2; door.add(dm);
      door.add(U.box(0.2, dS + dH, 0.05, M.ironPlain, 0, (dS + dH) / 2, 0));
      for (const y of [0.6, 1.6, 2.6]) door.add(U.box(0.18, 0.08, dH * 2 - 0.1, M.ironPlain, 0, y, 0));
      for (let i = 0; i < 6; i++) for (let j = 0; j < 7; j++) { const z = -dH + 0.3 + i * (dH * 2 - 0.6) / 5; for (const xs of [0.08, -0.08]) door.add(U.sphere(0.03, M.brass, xs, 0.3 + j * 0.42, z, 5, 3)); }
      for (const s of [-1, 1]) for (const xs of [0.1, -0.1]) put(door, U.torus(0.09, 0.015, M.brass, xs, 1.25, s * 0.25, 3, 12)).rotation.y = PI / 2;
      g.add(door);
      // 门楣铭牌
      const sign = U.signBoard('ATELIER DES MACHINES', 3.2, 0.5, { w: 1024, h: 160, font: 'bold 84px "Playfair Display", "Times New Roman", serif', edge: M.brass });
      sign.position.set(xo + 0.05, 4.68, 0); sign.rotation.y = PI / 2; g.add(sign);
    }
    // 山尖基座
    const topY = outline[NP - 1][1];
    g.add(U.box(0.9, 0.5, 1.2, M.stone, 0.47, topY + 0.1, 0));
    g.add(U.box(1.0, 0.12, 1.3, M.stone, 0.47, topY + 0.4, 0));
    if (!entrance) {
      put(g, U.lathe([[0.001, 0], [0.32, 0], [0.32, 0.1], [0.16, 0.2], [0.12, 0.5], [0.2, 0.58], [0.001, 0.62]], M.brass, 16)).position.set(0.47, topY + 0.46, 0);
      g.add(U.sphere(0.3, M.brass, 0.47, topY + 1.35, 0, 18, 12));
      const t = U.torus(0.38, 0.03, M.gold, 0.47, topY + 1.35, 0, 4, 32); t.rotation.x = 0.5; g.add(t);
      const sp = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.6, 6), M.gold); sp.position.set(0.47, topY + 1.9, 0); g.add(sp);
    }
    // 镜像：-X 墙外表面朝 -X
    g.position.x = sx > 0 ? L2 : -L2; if (sx < 0) g.rotation.y = PI;
    return { g, topY };
  };
  const gE = gable(1), gW = gable(-1);
  S.add(gE.g); S.add(gW.g);

  // 山尖旋转齿轮（+X）
  const crestGear = new THREE.Group(); crestGear.position.set(L2 + 0.47, gE.topY + 1.58, 0); crestGear.rotation.y = PI / 2; crestGear.userData.dynamic = true;
  {
    const gr = U.gear({ radius: 1.0, teeth: 22, depth: 0.12, thickness: 0.18, hole: 0.12, spokes: 6, rim: 0.16 }, M.brass); crestGear.add(gr);
    crestGear.add(U.torus(0.55, 0.03, M.gold, 0, 0, 0.1, 4, 32));
    crestGear.add(U.sphere(0.14, M.gold, 0, 0, 0, 12, 8));
    U.mergeStatic(crestGear); group.add(crestGear);
    S.add(U.box(0.36, 1.1, 0.3, M.ironPlain, L2 + 0.47, gE.topY + 1.0, 0));
  }

  // ─────────── 主入口雨棚（玻璃 marquise）+ 招牌 + 折叠铁门 ───────────
  {
    const x0 = L2 + 0.62, x1 = L2 + 3.4, zH = 4.2, yW = 5.55, yF = 5.05;
    const c = new THREE.Group();
    c.add(beam(V(x1, yF, -zH), V(x1, yF, zH), 0.22, 0.14, black, AX));
    for (const s of [-1, 1]) c.add(beam(V(x0, yW, s * zH), V(x1, yF, s * zH), 0.18, 0.12, black, AZ));
    for (let k = 0; k <= 12; k++) { const z = -zH + k * (zH * 2 / 12); c.add(beam(V(x0, yW + 0.06, z), V(x1, yF + 0.08, z), 0.06, 0.05, black, AZ)); }
    const gl = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, zH * 2), glassD);
    gl.position.set((x0 + x1) / 2, (yW + yF) / 2 + 0.1, 0); gl.rotation.set(-PI / 2, 0, 0); gl.rotateY(Math.atan2(yW - yF, x1 - x0)); gl.castShadow = false; c.add(gl);
    // 斜拉杆 + 墙面托架涡卷
    for (const s of [-1, 1]) {
      c.add(U.rod(V(x0, 7.0, s * (zH - 0.4)), V(x1 - 0.1, yF + 0.1, s * (zH - 0.4)), 0.03, black, 6));
      c.add(U.sphere(0.07, M.brass, x0 + 0.1, 7.0, s * (zH - 0.4), 8, 6));
      const sc = scrollMesh(scrollHalf(0.9, 0.35, 1.5), 0.04, black); sc.position.set(x0, yW - 1.1, s * (zH - 0.4)); sc.rotation.z = 0.0; c.add(sc);
      c.add(U.rod(V(x0, yW - 1.15, s * (zH - 0.4)), V(x0 + 1.25, yW - 0.08, s * (zH - 0.4)), 0.035, black, 6));
    }
    // 檐口花边垂饰
    for (let k = 0; k < 28; k++) {
      const z = -zH + 0.15 + k * 0.3;
      const ar = U.torus(0.15, 0.015, black, x1 + 0.08, yF - 0.12, z, 3, 8, PI); ar.rotation.set(0, PI / 2, PI); c.add(ar);
      const d = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.12, 5), M.gold); d.position.set(x1 + 0.08, yF - 0.33, z); d.rotation.z = PI; c.add(d);
    }
    // 招牌
    const sb = U.signBoard('LA GALERIE DES MACHINES', 7.4, 0.72, { w: 2048, h: 200, font: 'bold 120px "Playfair Display", "Times New Roman", serif', edge: M.brass });
    sb.position.set(x1 + 0.12, yF + 0.5, 0); sb.rotation.y = PI / 2; c.add(sb);
    for (const y of [yF + 0.12, yF + 0.88]) c.add(U.box(0.12, 0.06, 7.6, M.brass, x1 + 0.12, y, 0));
    for (const s of [-1, 1]) { c.add(U.sphere(0.12, M.gold, x1 + 0.12, yF + 0.5, s * 3.85, 10, 8)); const sc = scrollMesh(sScrollPts(0.2, 0.18), 0.022, M.gold); sc.position.set(x1 + 0.12, yF + 1.12, s * 3.3); sc.rotation.y = PI / 2; c.add(sc); }
    // 冠饰（中心）
    const cr = new THREE.Group(); cr.position.set(x1 + 0.12, yF + 1.25, 0); cr.rotation.y = PI / 2;
    cr.add(U.gear({ radius: 0.32, teeth: 12, depth: 0.06, thickness: 0.05, hole: 0.06, spokes: 4, rim: 0.08 }, M.gold));
    for (const s of [-1, 1]) { const sc = scrollMesh(scrollHalf(0.4, 0.14), 0.02, M.gold); sc.position.set(s * 0.3, -0.25, 0); sc.scale.x = s; cr.add(sc); }
    c.add(cr);
    // 檐角吊灯
    for (const s of [-1, 1]) { c.add(U.rod(V(x1, yF - 0.1, s * zH), V(x1, yF - 0.5, s * zH), 0.012, black, 4)); const l = U.lantern(M, 1.1); l.position.set(x1, yF - 1.3, s * zH); c.add(l); }
    // 折叠铁门（敞开靠墙）
    for (const s of [-1, 1]) {
      const z0 = s * 3.5;
      for (let j = 0; j < 4; j++) {
        const z = z0 + s * j * 0.36;
        c.add(U.box(0.05, 3.6, 0.05, black, x0 + 0.12, 1.85, z));
        for (let k = 0; k < 9; k++) { const y = 0.25 + k * 0.38; if (j < 3) { c.add(U.rod(V(x0 + 0.12, y, z), V(x0 + 0.12, y + 0.38, z + s * 0.36), 0.01, black, 4)); c.add(U.rod(V(x0 + 0.12, y + 0.38, z), V(x0 + 0.12, y, z + s * 0.36), 0.01, black, 4)); } }
        const sp = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.12, 5), M.gold); sp.position.set(x0 + 0.12, 3.71, z); c.add(sp);
      }
    }
    // 门口两侧花箱 + 修剪球树
    for (const s of [-1, 1]) {
      const pz = s * 5.4, px = L2 + 1.6;
      c.add(U.box(1.0, 0.9, 1.0, M.paintGreen, px, 0.51, pz));
      for (const dx of [-0.48, 0.48]) for (const dz of [-0.48, 0.48]) { c.add(U.box(0.08, 1.0, 0.08, M.paintGreen, px + dx, 0.56, pz + dz)); c.add(U.sphere(0.07, M.gold, px + dx, 1.12, pz + dz, 8, 6)); }
      c.add(U.cyl(0.07, 0.09, 1.1, M.bark, px, 1.4, pz, 6));
      const ball = new THREE.Mesh(new THREE.IcosahedronGeometry(0.75, 1), M.foliage2); ball.position.set(px, 2.35, pz); ball.castShadow = true; c.add(ball);
    }
    S.add(c);
  }

  // ═════════════ 厅内：机械与工坊 ═════════════
  const dynamics = {};

  // ─── 1. 大苍鹭原型机（x≈-10） ───
  {
    const hx = -10.5;
    const H = new THREE.Group(); H.position.set(hx, 0, 0);
    // 试验台车
    H.add(U.box(4.6, 0.35, 3.0, M.deck, 0, 0.52, 0));
    for (const s of [-1, 1]) H.add(U.box(4.7, 0.12, 0.12, M.ironPlain, 0, 0.3, s * 1.35));
    for (const x of [-1.8, 1.8]) for (const s of [-1, 1]) { const w = U.torus(0.24, 0.06, M.ironPlain, x, 0.26, s * 1.45, 6, 18); H.add(w); const hb = U.cyl(0.07, 0.07, 0.14, M.brass, x, 0.26, s * 1.45, 10); hb.rotation.x = PI / 2; H.add(hb); }
    // 腿（鸟类反关节）
    for (const s of [-1, 1]) {
      const foot = V(0.5, 0.7, s * 0.5), ankle = V(0.3, 0.95, s * 0.5), knee = V(-0.4, 2.8, s * 0.45), hip = V(0.0, 4.5, s * 0.38);
      H.add(U.rod(ankle, knee, 0.09, M.ironPlain, 10, 0.07)); H.add(U.rod(knee, hip, 0.13, M.wood, 10, 0.1));
      for (const p of [ankle, knee, hip]) H.add(U.sphere(0.15, M.brass, p.x, p.y, p.z, 12, 8));
      for (const a of [-0.5, 0, 0.5]) H.add(U.rod(ankle, V(ankle.x + Math.cos(a) * 0.8, 0.72, ankle.z + Math.sin(a) * 0.8), 0.05, M.ironPlain, 6, 0.03));
      H.add(U.rod(ankle, V(ankle.x - 0.5, 0.72, ankle.z), 0.045, M.ironPlain, 6, 0.03));
      // 液压缸
      H.add(U.rod(V(-0.2, 2.2, s * 0.62), V(0.1, 4.1, s * 0.55), 0.06, M.steel, 8)); H.add(U.rod(V(-0.32, 1.5, s * 0.62), V(-0.15, 2.4, s * 0.62), 0.09, M.brass, 10));
    }
    // 身体（郁金香木 + 铜箍）
    const body = U.lathe([[0.001, -1.9], [0.3, -1.75], [0.62, -1.3], [0.82, -0.6], [0.88, 0.1], [0.8, 0.8], [0.55, 1.4], [0.3, 1.75], [0.001, 1.9]], M.wood, 28);
    body.rotation.z = -PI / 2 + 0.12; body.position.set(0, 5.0, 0); body.scale.set(1, 1, 0.9); H.add(body);
    for (const t of [-1.3, -0.6, 0.1, 0.8, 1.4]) {
      const r = [0.62, 0.82, 0.88, 0.8, 0.55][[-1.3, -0.6, 0.1, 0.8, 1.4].indexOf(t)] + 0.015;
      const ring = U.torus(r, 0.035, M.copper, 0, 0, 0, 5, 32); ring.scale.set(1, 0.9, 1);
      const rg = new THREE.Group(); rg.position.set(0, 5.0, 0); rg.rotation.z = -PI / 2 + 0.12; ring.position.y = t; ring.rotation.x = PI / 2; ring.scale.set(1, 1, 1); rg.add(ring); rg.scale.set(1, 1, 0.9); H.add(rg);
    }
    // 背部驾驶座 + 操纵杆
    H.add(U.box(0.7, 0.12, 0.6, M.leather, -0.2, 5.92, 0));
    H.add(U.box(0.12, 0.5, 0.6, M.leather, -0.55, 6.15, 0));
    for (const z of [-0.2, 0.2]) { H.add(U.rod(V(0.25, 5.9, z), V(0.45, 6.5, z), 0.025, M.brass, 6)); H.add(U.sphere(0.05, M.paintRed, 0.45, 6.52, z, 8, 6)); }
    // 颈（S 形）+ 颈椎铜环
    const neckPts = [V(1.7, 5.4, 0), V(2.2, 6.2, 0), V(2.0, 7.0, 0), V(2.3, 7.7, 0), V(2.75, 8.0, 0)];
    const neckCurve = new THREE.CatmullRomCurve3(neckPts);
    H.add(U.tube(neckPts, 0.2, M.wood, false, 40, 10));
    for (let k = 1; k < 12; k++) {
      const u = k / 12; const p = neckCurve.getPointAt(u), tg = neckCurve.getTangentAt(u);
      const ring = U.torus(0.21, 0.03, M.copper, 0, 0, 0, 4, 16); ring.position.copy(p); ring.quaternion.setFromUnitVectors(AZ, tg); H.add(ring);
    }
    // 头 + 长喙 + 眼
    const head = U.sphere(0.32, M.wood, 2.85, 8.05, 0, 18, 12); head.scale.set(1.5, 0.85, 0.85); H.add(head);
    const beak = new THREE.Mesh(new THREE.ConeGeometry(0.15, 1.6, 12), M.brass); beak.rotation.z = -PI / 2 - 0.1; beak.position.set(4.0, 7.95, 0); beak.castShadow = true; H.add(beak);
    H.add(beam(V(3.3, 7.95, 0), V(4.75, 7.85, 0), 0.015, 0.2, M.ironPlain, V(0, 0, 1)));
    for (const s of [-1, 1]) { H.add(U.sphere(0.08, M.eye, 3.05, 8.12, s * 0.25, 10, 8)); H.add(U.torus(0.09, 0.02, M.brass, 3.05, 8.12, s * 0.255, 4, 14)); }
    for (let k = 0; k < 4; k++) H.add(beam(V(2.5, 8.2, 0), V(1.8 - k * 0.15, 8.4 + k * 0.1, (k - 1.5) * 0.06), 0.02, 0.05, M.wood, AZ));
    // 尾羽
    for (let k = 0; k < 7; k++) { const a = (k - 3) * 0.16; H.add(beam(V(-1.7, 4.75, 0), V(-2.9, 4.45 + Math.sin(k) * 0.05, Math.sin(a) * 1.0), 0.02, 0.18, M.wood, V(0, 1, 0))); }
    // 双翼（动态，两节）
    const makeWing = (s) => {
      const shoulder = new THREE.Group(); shoulder.position.set(hx + 0.4, 5.55, s * 0.6);
      const inner = new THREE.Group(), outer = new THREE.Group();
      const spanIn = 2.8, spanOut = 3.0;
      // 内段
      inner.add(U.rod(V(0, 0, 0), V(0.35, 0.05, s * spanIn), 0.07, M.woodDark, 8));
      for (let k = 0; k <= 5; k++) {
        const f = k / 5; const lead = V(0.35 * f, 0.05 * f, s * spanIn * f); const len = 2.3 - f * 0.4;
        inner.add(U.rod(lead, V(lead.x - len, lead.y - 0.08, lead.z), 0.025, M.wood, 5));
        for (let j = 0; j < 2; j++) inner.add(beam(V(lead.x - len + 0.1, lead.y - 0.08, lead.z + s * j * 0.18), V(lead.x - len - 0.75, lead.y - 0.12, lead.z + s * (j * 0.18 + 0.08)), 0.015, 0.16, M.wood, V(0, 1, 0)));
      }
      // 内段蒙皮
      {
        const pos = [];
        for (let k = 0; k < 5; k++) {
          const f0 = k / 5, f1 = (k + 1) / 5;
          const a0 = V(0.35 * f0, 0.04 * f0, s * spanIn * f0), a1 = V(0.35 * f1, 0.04 * f1, s * spanIn * f1);
          const b0 = V(a0.x - (2.3 - f0 * 0.4), a0.y - 0.08, a0.z), b1 = V(a1.x - (2.3 - f1 * 0.4), a1.y - 0.08, a1.z);
          pos.push(...a0.toArray(), ...a1.toArray(), ...b1.toArray(), ...a0.toArray(), ...b1.toArray(), ...b0.toArray());
        }
        const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(pos.length / 3 * 2), 2)); g.computeVertexNormals();
        const m = new THREE.Mesh(g, M.canvas); m.castShadow = true; inner.add(m);
      }
      inner.add(U.gear({ radius: 0.22, teeth: 12, depth: 0.05, thickness: 0.06, hole: 0.04, spokes: 4, rim: 0.06 }, M.brass)).rotation;
      // 外段（肘关节处再转）
      outer.position.set(0.35, 0.05, s * spanIn);
      outer.add(U.sphere(0.12, M.brass, 0, 0, 0, 10, 8));
      outer.add(U.rod(V(0, 0, 0), V(-0.5, 0.0, s * spanOut), 0.055, M.woodDark, 8, 0.03));
      const pos = [];
      for (let k = 0; k <= 6; k++) {
        const f = k / 6; const lead = V(-0.5 * f, 0, s * spanOut * f); const len = 1.9 * (1 - f * 0.75);
        outer.add(U.rod(lead, V(lead.x - len, lead.y - 0.06, lead.z + s * f * 0.3), 0.02, M.wood, 5));
        // 主羽
        for (let j = 0; j < 2; j++) outer.add(beam(V(lead.x - len + 0.05, lead.y - 0.06, lead.z + s * (f * 0.3 + j * 0.15)), V(lead.x - len - 0.9 + f * 0.3, lead.y - 0.1, lead.z + s * (f * 0.3 + j * 0.15 + 0.25 + f * 0.3)), 0.012, 0.15, M.wood, V(0, 1, 0)));
        if (k < 6) {
          const f1 = (k + 1) / 6; const l1 = V(-0.5 * f1, 0, s * spanOut * f1); const len1 = 1.9 * (1 - f1 * 0.75);
          const b0 = V(lead.x - len, -0.06, lead.z + s * f * 0.3), b1 = V(l1.x - len1, -0.06, l1.z + s * f1 * 0.3);
          pos.push(...lead.toArray(), ...l1.toArray(), ...b1.toArray(), ...lead.toArray(), ...b1.toArray(), ...b0.toArray());
        }
      }
      const og = new THREE.BufferGeometry(); og.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); og.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(pos.length / 3 * 2), 2)); og.computeVertexNormals();
      const om = new THREE.Mesh(og, M.canvas); om.castShadow = true; outer.add(om);
      U.mergeStatic(outer); outer.userData.dynamic = true;
      U.mergeStatic(inner); inner.add(outer); inner.userData.dynamic = true;
      shoulder.add(inner); shoulder.userData.dynamic = true;
      shoulder.userData.parts = { inner, outer, s };
      return shoulder;
    };
    dynamics.wings = [makeWing(1), makeWing(-1)];
    for (const w of dynamics.wings) group.add(w);
    // 肩部机构
    for (const s of [-1, 1]) { H.add(U.cyl(0.18, 0.18, 0.3, M.brass, 0.4, 5.55, s * 0.62, 14)).rotation; const sc = H.children[H.children.length - 1]; sc.rotation.x = PI / 2; }
    S.add(H);
    // 木脚手架
    const sc = new THREE.Group(); sc.position.set(-14.6, 0, -4.4);
    for (const x of [-1, 1]) for (const z of [-1, 1]) sc.add(U.box(0.14, 6.2, 0.14, M.wood, x * 0.9, 3.2, z * 0.9));
    for (const y of [2.2, 4.4]) { sc.add(U.box(2.1, 0.08, 2.1, M.deck, 0, y, 0)); for (const z of [-1, 1]) sc.add(U.box(2.0, 0.06, 0.06, M.wood, 0, y + 1.0, z * 0.95)); }
    for (const z of [-1, 1]) { sc.add(beam(V(-0.9, 0.2, z * 0.92), V(0.9, 2.2, z * 0.92), 0.08, 0.05, M.wood)); sc.add(beam(V(0.9, 2.3, z * 0.92), V(-0.9, 4.4, z * 0.92), 0.08, 0.05, M.wood)); }
    for (const x of [-0.25, 0.25]) sc.add(U.box(0.06, 4.6, 0.06, M.wood, x, 2.3, 1.05)); for (let k = 0; k < 14; k++) sc.add(U.box(0.5, 0.04, 0.05, M.wood, 0, 0.3 + k * 0.32, 1.05));
    sc.add(U.cyl(0.3, 0.3, 0.6, M.woodDark, 0.4, 4.74, 0.3, 12));
    S.add(sc);
  }

  // ─── 2. 机械巨蚁（x≈+4） ───
  {
    const A = new THREE.Group(); A.position.set(4.0, 0.22, -3.4); A.rotation.y = 0.15;
    const body = new THREE.Group(); body.userData.dynamic = true;
    // 腹部
    const abd = U.lathe([[0.001, -1.25], [0.5, -1.1], [0.85, -0.6], [0.95, 0.0], [0.82, 0.6], [0.45, 1.05], [0.001, 1.2]], M.wood, 24);
    abd.rotation.z = PI / 2 - 0.25; abd.position.set(-1.7, 1.9, 0); body.add(abd);
    for (const [t, r] of [[-0.6, 0.86], [0.0, 0.96], [0.6, 0.83]]) {
      const rg = new THREE.Group(); rg.position.copy(abd.position); rg.rotation.z = abd.rotation.z;
      const ring = U.torus(r, 0.045, M.ironPlain, 0, t, 0, 4, 28); ring.rotation.x = PI / 2; rg.add(ring); body.add(rg);
    }
    // 胸 + 腰节
    const thor = U.sphere(0.55, M.wood, 0.2, 1.75, 0, 20, 14); thor.scale.set(1.5, 0.85, 0.9); body.add(thor);
    body.add(U.rod(V(-0.75, 1.82, 0), V(-0.45, 1.78, 0), 0.18, M.steel, 10));
    body.add(U.rod(V(0.95, 1.85, 0), V(1.35, 1.95, 0), 0.15, M.steel, 10));
    // 头
    const head = U.sphere(0.5, M.wood, 1.8, 2.05, 0, 20, 14); head.scale.set(1.1, 0.95, 1.05); body.add(head);
    for (const s of [-1, 1]) {
      body.add(U.sphere(0.2, M.glassDark, 1.95, 2.2, s * 0.4, 14, 10));
      body.add(U.torus(0.2, 0.03, M.brass, 1.95, 2.2, s * 0.42, 4, 18)).rotation;
      body.children[body.children.length - 1].rotation.y = s * 0.4;
      body.add(U.tube([V(2.15, 1.7, s * 0.2), V(2.6, 1.55, s * 0.32), V(2.85, 1.5, s * 0.12), V(2.8, 1.48, s * 0.0)], 0.045, M.copper, false, 14, 6));
    }
    // 背鞍（游客座位）
    body.add(U.box(0.9, 0.12, 0.7, M.leather, 0.2, 2.32, 0));
    body.add(U.box(0.1, 0.4, 0.7, M.leather, -0.25, 2.5, 0));
    put(body, U.ringRailing(0.55, 2.38, { height: 0.35, mat: M.brass, postEvery: 0.5, baluster: 0 }, 12, PI * 0.6, PI * 0.8)).position.set(0.2, 0, 0);
    // 触角（动态）
    const antennae = [];
    for (const s of [-1, 1]) {
      const an = new THREE.Group(); an.position.set(2.0, 2.4, s * 0.2); an.userData.dynamic = true;
      an.add(U.tube([V(0, 0, 0), V(0.2, 0.6, s * 0.15), V(0.7, 0.95, s * 0.3), V(1.3, 0.85, s * 0.45)], 0.03, M.ironPlain, false, 16, 5));
      an.add(U.sphere(0.06, M.brass, 0, 0, 0, 8, 6)); an.add(U.sphere(0.05, M.brass, 1.3, 0.85, s * 0.45, 8, 6));
      U.mergeStatic(an); an.userData.dynamic = true; antennae.push(an); body.add(an);
    }
    U.mergeStatic(body);
    // 腿（动态，三对）
    const legs = [];
    [[0.55, 1], [0.15, 1], [-0.25, 1], [0.55, -1], [0.15, -1], [-0.25, -1]].forEach(([lx, s], idx) => {
      const leg = new THREE.Group(); leg.position.set(lx, 1.6, s * 0.4); leg.userData.dynamic = true;
      const k = idx % 3; const fx = [1.2, 0.0, -1.3][k];
      const knee = V(fx * 0.5, 0.8, s * 1.2), foot = V(fx, -1.6, s * 2.0);
      leg.add(U.sphere(0.12, M.brass, 0, 0, 0, 10, 8));
      leg.add(U.rod(V(0, 0, 0), knee, 0.07, M.ironPlain, 8)); leg.add(U.rod(knee, foot, 0.055, M.wood, 8, 0.03));
      leg.add(U.sphere(0.09, M.brass, knee.x, knee.y, knee.z, 10, 8));
      leg.add(U.rod(V(0, 0.15, s * 0.05), V(knee.x * 0.5, knee.y + 0.15, knee.z * 0.5), 0.03, M.steel, 6));
      leg.add(U.sphere(0.07, M.ironPlain, foot.x, foot.y, foot.z, 8, 6));
      U.mergeStatic(leg); leg.userData.dynamic = true; leg.userData.ph = (idx % 2 === (s > 0 ? 0 : 1) ? 0 : PI) + k * 0.3; legs.push(leg); A.add(leg);
    });
    A.add(body);
    dynamics.ant = { body, legs, antennae };
    // 展台：低矮木台 + 铜栏
    S.add(U.cyl(3.3, 3.4, 0.12, M.deck, 4.0, 0.16, -3.4, 40));
    put(S, U.torus(3.32, 0.04, M.brass, 4.0, 0.22, -3.4, 4, 64)).rotation.x = PI / 2;
    group.add(A);
  }

  // ─── 3. 蒸汽机 + 大飞轮（x≈+12, z≈+4.4） ───
  {
    const cz = 4.4, wz = 5.5, CX = 14.5, CY = 2.4, rc = 0.45, Lr = 2.4;
    // 砖砌机座 + 石压顶
    S.add(U.box(7.2, 1.6, 1.4, withRepeat(M.brick, 4, 1), 12.4, 0.8, cz));
    S.add(U.box(7.4, 0.1, 1.55, M.stone, 12.4, 1.65, cz));
    S.add(U.box(0.8, 1.9, 0.7, M.brick, CX, 0.95, 6.35)); S.add(U.box(0.9, 0.1, 0.8, M.stone, CX, 1.95, 6.35));
    // 主轴承座
    for (const z of [cz + 0.5, 6.35]) {
      S.add(U.box(0.6, 0.45, 0.5, M.paintGreen, CX, z < 6 ? 1.92 : 2.17, z));
      const cap = U.cyl(0.2, 0.2, 0.5, M.brass, CX, CY, z, 16); cap.rotation.x = PI / 2; S.add(cap);
    }
    // 汽缸（木条包覆 + 铜箍）
    const cyl = U.cyl(0.52, 0.52, 1.8, M.woodDark, 10.1, CY, cz, 24); cyl.rotation.z = PI / 2; S.add(cyl);
    for (const x of [9.2, 11.0]) { const c = U.cyl(0.62, 0.62, 0.12, M.brass, x, CY, cz, 24); c.rotation.z = PI / 2; S.add(c); for (let k = 0; k < 10; k++) { const a = k / 10 * TAU; S.add(U.sphere(0.03, M.steel, x + (x > 10 ? 0.07 : -0.07), CY + Math.cos(a) * 0.54, cz + Math.sin(a) * 0.54, 5, 3)); } }
    for (const x of [9.6, 10.1, 10.6]) { const b = U.torus(0.53, 0.025, M.brass, x, CY, cz, 4, 32); b.rotation.y = PI / 2; S.add(b); }
    S.add(U.box(1.2, 0.35, 0.5, M.paintGreen, 10.1, CY + 0.7, cz)); // 汽室
    S.add(U.tube([V(10.1, CY + 0.88, cz), V(10.1, CY + 1.6, cz), V(9.4, CY + 2.2, cz), V(8.6, CY + 2.2, cz), V(8.2, 1.8, cz + 1.2), V(8.2, 0.1, cz + 1.2)], 0.09, M.copper, false, 40, 8));
    for (const [x, y, z] of [[10.1, CY + 1.25, cz], [8.2, 1.0, cz + 1.2]]) { const fl = U.cyl(0.15, 0.15, 0.05, M.brass, x, y, z, 12); S.add(fl); }
    // 压力表
    const gauge = new THREE.Group(); gauge.position.set(9.5, CY + 1.25, cz + 0.3);
    gauge.add(U.cyl(0.16, 0.16, 0.06, M.brass, 0, 0, 0, 20)).children; gauge.children[0].rotation.x = PI / 2;
    gauge.add(U.cyl(0.13, 0.13, 0.065, M.ivory, 0, 0, 0.01, 20)); gauge.children[1].rotation.x = PI / 2;
    gauge.add(U.rod(V(0, -0.16, 0), V(0, -0.6, -0.25), 0.015, M.copper, 5));
    S.add(gauge);
    // 十字头导轨
    for (const y of [CY - 0.22, CY + 0.22]) S.add(U.box(1.5, 0.08, 0.3, M.steel, 12.1, y, cz));
    for (const x of [11.35, 12.85]) S.add(U.box(0.12, 0.85, 0.3, M.paintGreen, x, CY - 0.1, cz));
    // 运动部件（动态）
    const fly = new THREE.Group(); fly.position.set(CX, CY, wz); fly.userData.dynamic = true;
    {
      const rim = U.lathe([[1.72, -0.16], [2.02, -0.16], [2.05, -0.1], [2.05, 0.1], [2.02, 0.16], [1.72, 0.16], [1.68, 0.06], [1.68, -0.06], [1.72, -0.16]], M.ironPlain, 72);
      rim.rotation.x = PI / 2; fly.add(rim);
      const band = U.torus(1.7, 0.03, M.brass, 0, 0, 0, 4, 64); fly.add(band);
      for (let k = 0; k < 8; k++) { const a = k / 8 * TAU; fly.add(U.rod(V(Math.cos(a) * 0.3, Math.sin(a) * 0.3, 0), V(Math.cos(a) * 1.72, Math.sin(a) * 1.72, 0), 0.075, M.ironPlain, 8, 0.05)); }
      const hub = U.cyl(0.36, 0.36, 0.42, M.ironPlain, 0, 0, 0, 20); hub.rotation.x = PI / 2; fly.add(hub);
      fly.add(U.torus(0.36, 0.035, M.brass, 0, 0, 0.21, 4, 24)); fly.add(U.torus(0.36, 0.035, M.brass, 0, 0, -0.21, 4, 24));
      for (let k = 0; k < 8; k++) { const a = (k + 0.5) / 8 * TAU; fly.add(U.sphere(0.04, M.brass, Math.cos(a) * 0.27, Math.sin(a) * 0.27, 0.22, 6, 4)); }
      const shaft = U.cyl(0.11, 0.11, 2.8, M.steel, 0, 0, -0.6, 14); shaft.rotation.x = PI / 2; fly.add(shaft);
      // 曲柄（固定在轴上，随飞轮转）
      const crankArm = beam(V(0, 0, cz - wz - 0.15), V(rc, 0, cz - wz - 0.15), 0.3, 0.12, M.ironPlain); fly.add(crankArm);
      const pinM = U.cyl(0.07, 0.07, 0.3, M.steel, rc, 0, cz - wz - 0.05, 12); pinM.rotation.x = PI / 2; fly.add(pinM);
      fly.add(U.sphere(0.12, M.brass, 0, 0, cz - wz - 0.22, 10, 8));
    }
    U.mergeStatic(fly); fly.userData.dynamic = true; group.add(fly);
    const conrod = U.rod(V(0, 0, 0), V(0, 1, 0), 0.07, M.steel, 10); conrod.userData.baseLen = 1; conrod.userData.dynamic = true; group.add(conrod);
    const cross = U.box(0.35, 0.34, 0.3, M.brass, 12, CY, cz); cross.userData.dynamic = true; group.add(cross);
    const prod = U.rod(V(0, 0, 0), V(0, 1, 0), 0.045, M.steel, 10); prod.userData.baseLen = 1; prod.userData.dynamic = true; group.add(prod);
    // 离心调速器（飞球）
    const gov = new THREE.Group(); gov.position.set(13.6, 1.7, 3.88); gov.userData.dynamic = true;
    gov.add(U.rod(V(0, 0, 0), V(0, 1.3, 0), 0.025, M.steel, 6));
    gov.add(U.sphere(0.05, M.brass, 0, 1.32, 0, 8, 6));
    for (const s of [-1, 1]) { gov.add(U.rod(V(0, 1.2, 0), V(s * 0.38, 0.75, 0), 0.015, M.brass, 5)); gov.add(U.sphere(0.1, M.brass, s * 0.38, 0.72, 0, 12, 8)); gov.add(U.rod(V(0, 0.55, 0), V(s * 0.2, 0.75, 0), 0.01, M.brass, 4)); }
    U.mergeStatic(gov); gov.userData.dynamic = true; group.add(gov);
    S.add(U.cyl(0.08, 0.1, 0.12, M.paintGreen, 13.6, 1.72, 3.88, 10));
    dynamics.engine = { fly, conrod, cross, prod, CX, CY, cz, rc, Lr, gov };
    // 观赏铜栏
    S.add(U.railing([V(8.3, 0.1, 2.9), V(17.2, 0.1, 2.9), V(17.2, 0.1, 7.3)], { height: 0.95, mat: M.brass, postMat: M.paintGreen, baluster: 0, postEvery: 1.4, ornate: true }));
  }

  // ─── 4. 齿轮墙（x≈-3，靠 -Z 侧） ───
  {
    const gz = -7.0;
    const G = new THREE.Group();
    for (const x of [-5.0 + 0.45, -0.25]) { G.add(U.box(0.25, 5.6, 0.25, M.paintTeal, x, 2.8, gz - 0.45)); G.add(U.box(0.5, 0.2, 0.6, M.stone, x, 0.2, gz - 0.45)); G.add(U.sphere(0.12, M.gold, x, 5.72, gz - 0.45, 10, 8)); }
    G.add(U.box(4.6, 0.22, 0.25, M.paintTeal, -2.4, 5.4, gz - 0.45));
    G.add(U.box(4.6, 0.16, 0.2, M.paintTeal, -2.4, 1.0, gz - 0.45));
    G.add(beam(V(-4.55, 1.1, gz - 0.5), V(-0.25, 5.3, gz - 0.5), 0.08, 0.06, M.paintTeal));
    G.add(beam(V(-0.25, 1.1, gz - 0.5), V(-4.55, 5.3, gz - 0.5), 0.08, 0.06, M.paintTeal));
    S.add(G);
    const specs = [{ r: 1.3, teeth: 26, x: -3.6, y: 2.9 }, { r: 0.8, teeth: 16, x: -1.65, y: 4.03 }, { r: 0.5, teeth: 10, x: -0.54, y: 3.1 }];
    // 校正中心距 r1+r2+齿高
    const g1 = specs[0], g2 = specs[1], g3 = specs[2];
    const place = (a, b, ang) => { const d = a.r + b.r + 0.12; b.x = a.x + Math.cos(ang) * d; b.y = a.y + Math.sin(ang) * d; };
    place(g1, g2, 0.52); place(g2, g3, -0.85);
    dynamics.gears = specs.map((sp, i) => {
      const gr = U.gear({ radius: sp.r, teeth: sp.teeth, depth: 0.12, thickness: 0.2, hole: 0.1, spokes: sp.r > 0.7 ? 6 : 4, rim: sp.r * 0.16 }, i === 1 ? M.brass : M.ironPlain);
      const gg = new THREE.Group(); gg.position.set(sp.x, sp.y, gz); gg.add(gr);
      gg.add(U.torus(sp.r * 0.3, 0.03, M.gold, 0, 0, 0.12, 4, 24));
      U.mergeStatic(gg); gg.userData.dynamic = true; gg.userData.w = (i % 2 ? -1 : 1) * 0.45 * (1.3 / sp.r); gg.userData.ph = i * 0.13; group.add(gg);
      const ax = U.cyl(0.1, 0.1, 0.55, M.steel, sp.x, sp.y, gz - 0.25, 12); ax.rotation.x = PI / 2; S.add(ax);
      S.add(beam(V(sp.x, sp.y, gz - 0.45), V(sp.x < -2.4 ? -4.55 : -0.25, sp.y, gz - 0.45), 0.12, 0.1, M.paintTeal));
      return gg;
    });
    const plaque = U.signBoard('ENGRENAGES · 1863', 1.8, 0.36, { w: 768, h: 154, font: 'bold 68px "Times New Roman", serif', edge: M.brass });
    plaque.position.set(-2.4, 0.75, gz - 0.3); group.add(plaque);
  }

  // ─── 5. 行车（桥式起重机）+ 吊着的鹦鹉螺号螺旋桨 ───
  {
    const zr = 6.75, yr = 7.1;
    for (const s of [-1, 1]) {
      S.add(U.box(40, 0.28, 0.16, iron, 0, yr, s * zr));
      S.add(U.box(40, 0.05, 0.36, iron, 0, yr - 0.14, s * zr));
      S.add(U.box(40, 0.06, 0.08, M.steel, 0, yr + 0.17, s * zr));
      for (const x of frameXs) { S.add(beam(V(x, yr - 0.12, s * zr), V(x, yr - 1.2, s * (zr + 0.7)), 0.12, 0.12, iron, AX)); S.add(U.box(0.3, 0.3, 0.9, iron, x, yr - 0.25, s * (zr + 0.35))); }
    }
    const bridge = new THREE.Group(); bridge.userData.dynamic = true;
    for (const dx of [-0.35, 0.35]) {
      bridge.add(U.box(0.14, 0.12, zr * 2, M.paintRed, dx, yr + 0.85, 0));
      bridge.add(U.box(0.14, 0.12, zr * 2, M.paintRed, dx, yr + 0.3, 0));
      const n = 14;
      for (let k = 0; k <= n; k++) { const z = -zr + k * (zr * 2 / n); bridge.add(U.box(0.06, 0.55, 0.06, M.paintRed, dx, yr + 0.57, z)); if (k < n) bridge.add(beam(V(dx, yr + 0.3, z), V(dx, yr + 0.85, z + zr * 2 / n), 0.05, 0.05, M.paintRed, AX)); }
    }
    for (let k = 0; k <= 14; k += 2) { const z = -zr + k * (zr / 7); bridge.add(U.box(0.7, 0.05, 0.05, M.paintRed, 0, yr + 0.85, z)); }
    for (const s of [-1, 1]) {
      bridge.add(U.box(1.5, 0.3, 0.3, M.paintRed, 0, yr + 0.35, s * zr));
      for (const dx of [-0.55, 0.55]) { const w = U.cyl(0.14, 0.14, 0.1, M.steel, dx, yr + 0.32, s * zr, 14); w.rotation.x = PI / 2; bridge.add(w); }
    }
    const bsign = U.box(0.02, 0.3, 2.4, M.paintCream, 0.43, yr + 0.57, 0); bridge.add(bsign);
    U.mergeStatic(bridge); bridge.userData.dynamic = true; group.add(bridge);
    const trolley = new THREE.Group(); trolley.userData.dynamic = true;
    trolley.add(U.box(1.1, 0.35, 0.9, M.paintGreen, 0, yr + 1.08, 0));
    const drum = U.cyl(0.22, 0.22, 0.8, M.steel, 0, yr + 1.12, 0, 16); drum.rotation.x = PI / 2; trolley.add(drum);
    for (const dx of [-0.4, 0.4]) for (const dz of [-0.35, 0.35]) { const w = U.cyl(0.08, 0.08, 0.06, M.steel, dx, yr + 0.92, dz, 10); w.rotation.z = PI / 2; trolley.add(w); }
    const hookY = 5.9;
    for (const dz of [-0.18, 0.18]) trolley.add(chain(V(0, yr + 0.9, dz), V(0, hookY + 0.3, dz * 0.4), 0.05, M.steel));
    trolley.add(U.box(0.3, 0.42, 0.22, M.paintRed, 0, hookY + 0.15, 0));
    trolley.add(U.tube([V(0, hookY - 0.05, 0), V(0, hookY - 0.35, 0), V(0.14, hookY - 0.48, 0), V(0.2, hookY - 0.3, 0)], 0.035, M.steel, false, 12, 6));
    // 吊索 → 螺旋桨
    trolley.add(U.rod(V(0, hookY - 0.4, 0), V(0, hookY - 0.85, 0), 0.02, M.rope, 5));
    U.mergeStatic(trolley); trolley.userData.dynamic = true; group.add(trolley);
    const prop = new THREE.Group(); prop.userData.dynamic = true;
    {
      prop.add(U.lathe([[0.001, -0.55], [0.22, -0.5], [0.3, -0.2], [0.3, 0.25], [0.2, 0.5], [0.06, 0.62], [0.001, 0.64]], M.brass, 20));
      for (let k = 0; k < 4; k++) {
        const s = new THREE.Shape(); s.moveTo(0, -0.12); s.bezierCurveTo(0.5, -0.32, 1.2, -0.3, 1.45, 0.0); s.bezierCurveTo(1.3, 0.25, 0.6, 0.3, 0, 0.14);
        const bg = new THREE.ExtrudeGeometry(s, { depth: 0.04, bevelEnabled: true, bevelSize: 0.015, bevelThickness: 0.015, bevelSegments: 1, curveSegments: 10 });
        const b = U.mesh(bg, M.brass); const bw = new THREE.Group(); bw.rotation.y = (k / 4) * TAU; b.rotation.x = PI / 2 - 0.5; b.position.x = 0.22; bw.add(b); prop.add(bw);
      }
      prop.add(U.torus(0.3, 0.03, M.gold, 0, 0.0, 0, 4, 24)).rotation;
      prop.children[prop.children.length - 1].rotation.x = PI / 2;
    }
    const propHolder = new THREE.Group(); propHolder.userData.dynamic = true; propHolder.add(prop); group.add(propHolder);
    U.mergeStatic(prop);
    dynamics.crane = { bridge, trolley, propHolder, prop, hookY };
  }

  // ─── 6. 工作台 / 杂物 / 链吊 ───
  const bench = (x, z, ry, seed) => {
    const r = rng(seed); const g = new THREE.Group(); g.position.set(x, 0.1, z); g.rotation.y = ry;
    g.add(U.box(3.0, 0.1, 1.0, M.woodDark, 0, 0.9, 0));
    for (const dx of [-1.38, 1.38]) for (const dz of [-0.42, 0.42]) g.add(U.box(0.1, 0.85, 0.1, M.woodDark, dx, 0.43, dz));
    g.add(U.box(2.8, 0.05, 0.8, M.wood, 0, 0.25, 0));
    // 台钳
    g.add(U.box(0.3, 0.18, 0.18, M.paintGreen, 1.15, 1.04, 0.42)); g.add(U.box(0.3, 0.16, 0.06, M.paintGreen, 1.15, 1.08, 0.58));
    g.add(U.rod(V(1.15, 1.06, 0.3), V(1.15, 1.06, 0.8), 0.02, M.steel, 6)); g.add(U.rod(V(1.0, 1.06, 0.8), V(1.3, 1.06, 0.8), 0.015, M.steel, 5));
    // 工具：锤、扳手、小齿轮、图纸卷、油灯
    g.add(U.rod(V(-0.6, 0.97, 0.1), V(-0.2, 0.97, 0.25), 0.02, M.wood, 5)); g.add(U.box(0.06, 0.06, 0.16, M.steel, -0.2, 0.98, 0.25));
    g.add(U.box(0.32, 0.02, 0.05, M.steel, 0.3, 0.96, -0.2));
    for (let k = 0; k < 3; k++) { const gr = U.gear({ radius: 0.08 + r() * 0.1, teeth: 10 + k * 3, depth: 0.025, thickness: 0.03, hole: 0.02, spokes: 0, rim: 0.03 }, k % 2 ? M.brass : M.steel); gr.rotation.x = -PI / 2; gr.position.set(-1.1 + k * 0.28, 0.97, -0.25 + r() * 0.2); g.add(gr); }
    for (let k = 0; k < 3; k++) { const c = U.cyl(0.04, 0.04, 0.7, M.canvas, 0.5 + k * 0.1, 0.99, 0.2 - k * 0.05, 8); c.rotation.z = PI / 2; c.rotation.y = r() * 0.4; g.add(c); }
    const bp = U.box(0.8, 0.005, 0.55, M.paintNavy, -0.3, 0.955, -0.05); bp.rotation.y = 0.15; g.add(bp);
    g.add(U.cyl(0.07, 0.09, 0.05, M.brass, 1.2, 0.98, -0.3, 10)); const lg = U.sphere(0.07, M.glowWarm, 1.2, 1.08, -0.3, 10, 8); lg.castShadow = false; g.add(lg);
    g.add(U.cyl(0.05, 0.05, 0.12, M.glass, 1.2, 1.1, -0.3, 10));
    // 凳子
    g.add(U.cyl(0.2, 0.2, 0.05, M.wood, -0.5, 0.62, -0.85, 14));
    for (let k = 0; k < 3; k++) { const a = k / 3 * TAU; g.add(U.rod(V(-0.5 + Math.cos(a) * 0.15, 0.6, -0.85 + Math.sin(a) * 0.15), V(-0.5 + Math.cos(a) * 0.24, 0, -0.85 + Math.sin(a) * 0.24), 0.02, M.woodDark, 5)); }
    return g;
  };
  S.add(bench(-2.5, 7.3, PI, 3)); S.add(bench(1.5, 7.3, PI, 5)); S.add(bench(10.0, -7.3, 0, 7));
  // 木箱 & 木桶
  const crates = [[-6.6, 7.4, 0.2], [-7.4, 7.0, 0.8], [-6.9, 7.2, 0], [16.6, -7.0, 0.4], [17.4, -6.4, 0.1], [7.8, -7.5, 0.3]];
  crates.forEach(([x, z, ry], i) => { const s = 0.7 + (i % 3) * 0.15; const c = U.box(s, s, s, M.woodDark, x, 0.1 + s / 2 + (i === 2 ? 0.85 : 0), z); c.rotation.y = ry; S.add(c); for (const y of [-0.3, 0.3]) { const b = U.box(s + 0.02, 0.06, s + 0.02, M.ironPlain, x, c.position.y + y * s, z); b.rotation.y = ry; S.add(b); } });
  for (const [x, z] of [[-17.5, 6.8], [-16.7, 7.4], [-17.8, 5.9], [17.8, -4.6]]) {
    S.add(U.lathe([[0.001, 0], [0.3, 0], [0.36, 0.25], [0.38, 0.45], [0.36, 0.65], [0.3, 0.9], [0.001, 0.9]], M.woodDark, 16)).position;
    const b = S.children[S.children.length - 1]; b.position.set(x, 0.1, z);
    for (const y of [0.15, 0.75]) S.add(U.torus(0.34, 0.02, M.ironPlain, x, 0.1 + y, z, 3, 20)).rotation;
    S.children.slice(-2).forEach((t) => (t.rotation.x = PI / 2));
  }
  // 链吊：手拉葫芦挂着一只大齿轮
  {
    const x = -4.8, z = 3.2;
    S.add(chain(V(x, ST[NP - 1].y - 0.7, z * 0.0 + 0.0), V(x, 8.0, z * 0.0), 0.06, M.steel));
    S.add(beam(V(x, 8.0, 0), V(x, 8.0, z), 0.12, 0.12, iron, AX));
    S.add(U.box(0.35, 0.5, 0.3, M.paintRed, x, 7.6, z));
    S.add(chain(V(x, 7.35, z), V(x, 4.2, z), 0.05, M.steel));
    S.add(chain(V(x + 0.12, 7.35, z), V(x + 0.12, 5.6, z), 0.035, M.steel));
    const hg = U.gear({ radius: 0.95, teeth: 24, depth: 0.1, thickness: 0.18, hole: 0.12, spokes: 5, rim: 0.16 }, M.ironPlain); hg.position.set(x, 3.15, z); hg.rotation.y = 0.5; S.add(hg);
    S.add(U.rod(V(x, 4.2, z), V(x, 3.6, z), 0.03, M.rope, 5));
  }
  // 吊灯（工业搪瓷灯罩）
  for (let k = 0; k < 8; k++) {
    const x = -17.5 + k * 5; const top = ST[NP - 1].y - 0.65;
    S.add(U.rod(V(x, top, 0), V(x, 9.4, 0), 0.012, black, 4));
    const shade = new THREE.Mesh(new THREE.ConeGeometry(0.42, 0.3, 16, 1, true), M.paintGreen); shade.material.side = THREE.DoubleSide; shade.position.set(x, 9.25, 0); shade.castShadow = true; S.add(shade);
    S.add(U.cyl(0.06, 0.08, 0.1, M.brass, x, 9.4, 0, 10));
    const b = U.sphere(0.11, M.glowWarm, x, 9.08, 0, 10, 8); b.castShadow = false; S.add(b);
  }

  // ─── 7. 人物 ───
  const inside = [[-7.3, 1.6, -1.4], [-6.8, -2.2, -2.0], [0.6, -0.4, 2.6], [2.6, 2.6, -2.9], [7.8, -0.4, -0.5], [-1.5, 6.3, 0], [10.2, -6.3, PI], [16.2, 1.5, 1.8], [-13.6, -4.4, 0]];
  inside.forEach(([x, z, ry], i) => { const p = U.person(300 + i, { child: i === 3 }); p.position.set(x, i === 8 ? 2.25 : 0.1, z); p.rotation.y = ry; S.add(p); });
  const outsideP = [[24.0, 5.0, -1.2], [24.9, 4.4, -1.9], [23.0, -8.5, 0.4], [-23.5, 3.0, 1.6], [6, -12.0, 0.2], [-8, 12.2, 3.0]];
  outsideP.forEach(([x, z, ry], i) => { const p = U.person(330 + i); p.position.set(x, 0.06, z); p.rotation.y = ry; S.add(p); });
  const walkers = [];
  for (let i = 0; i < 3; i++) { const p = U.person(360 + i); p.userData.dynamic = true; p.userData.w = { off: i * 9, z: 0.2 + i * 0.8, sp: 0.9 + i * 0.15 }; group.add(p); walkers.push(p); }

  // ─── 室外：长椅、路灯 ───
  const benchOut = (x, z, ry) => {
    const g = new THREE.Group(); g.position.set(x, 0.06, z); g.rotation.y = ry;
    for (const dx of [-0.85, 0.85]) {
      g.add(U.tube([V(dx, 0, 0.25), V(dx, 0.42, 0.2), V(dx, 0.45, -0.1), V(dx, 0.9, -0.28), V(dx, 0.95, -0.2)], 0.03, black, false, 16, 5));
      g.add(U.tube([V(dx, 0, -0.25), V(dx, 0.42, 0.2)], 0.028, black, false, 4, 5));
      g.add(scrollMesh(scrollHalf(0.12, 0.08, 1.3), 0.015, black)).position;
      g.children[g.children.length - 1].position.set(dx, 0.62, 0.22); g.children[g.children.length - 1].rotation.y = PI / 2;
    }
    for (let k = 0; k < 4; k++) g.add(U.box(1.9, 0.035, 0.09, M.wood, 0, 0.45, 0.17 - k * 0.1));
    for (let k = 0; k < 3; k++) g.add(U.box(1.9, 0.08, 0.03, M.wood, 0, 0.62 + k * 0.11, -0.16 - k * 0.04)).rotation;
    return g;
  };
  for (const sg of [-1, 1]) {
    for (const x of [-12.5, -2.5, 7.5]) S.add(benchOut(x, sg * 11.4, sg > 0 ? PI : 0));
    for (const x of [-17.5, -7.5, 2.5, 12.5]) { const l = U.lampPost(M, { h: 4.0, arms: Math.abs(x) > 15 ? 2 : 1 }); l.position.set(x, 0.06, sg * 11.6); S.add(l); }
  }
  for (const s of [-1, 1]) { const l = U.lampPost(M, { h: 4.4, arms: 2 }); l.position.set(L2 + 4.6, 0.06, s * 6.6); S.add(l); }

  // 铆钉
  const rv = U.rivetsAt(rivP, rivN, 0.025, iron); rv.castShadow = false; group.add(rv);

  // 夜间灯光
  const l1 = new THREE.PointLight(0xffb868, 0, 30, 2); l1.position.set(-8, 8.5, 0); group.add(l1); ctx.addNightLight(l1, 45);
  const l2 = new THREE.PointLight(0xffb868, 0, 30, 2); l2.position.set(9, 8.5, 0); group.add(l2); ctx.addNightLight(l2, 45);

  U.mergeStatic(S);

  const _a = V(), _b = V();
  return {
    group,
    focus: { pos: [36, 11, 24], target: [2, 5, 0] },
    footprint: 28,
    update(t, dt, env) {
      // 苍鹭振翅（内段 + 外段相位滞后）
      const f = Math.sin(t * 0.85);
      for (const w of dynamics.wings) {
        const { inner, outer, s } = w.userData.parts;
        inner.rotation.x = -s * (-0.075 + 0.225 * f);
        outer.rotation.x = -s * (0.2 * Math.sin(t * 0.85 - 0.9));
        inner.rotation.y = s * 0.06 * Math.sin(t * 0.85 + 0.6);
      }
      // 巨蚁：三足步态原地踏步 + 身体起伏 + 触角摆动
      const A = dynamics.ant;
      A.body.position.y = Math.sin(t * 2.4) * 0.04;
      A.legs.forEach((lg) => { const ph = t * 1.2 + lg.userData.ph; lg.rotation.y = Math.sin(ph) * 0.16; lg.rotation.x = -Math.max(0, Math.cos(ph)) * 0.08 * Math.sign(lg.position.z); });
      A.antennae.forEach((an, i) => { an.rotation.z = Math.sin(t * 1.7 + i) * 0.15; an.rotation.y = Math.sin(t * 1.1 + i * 2) * 0.2; });
      // 蒸汽机：飞轮—曲柄—连杆—十字头—活塞杆
      const E = dynamics.engine; const th = -t * 1.3;
      E.fly.rotation.z = th;
      const pin = _a.set(E.CX + Math.cos(th) * E.rc, E.CY + Math.sin(th) * E.rc, E.cz);
      const xh = pin.x - Math.sqrt(E.Lr * E.Lr - (pin.y - E.CY) ** 2);
      _b.set(xh, E.CY, E.cz);
      U.aimRod(E.conrod, _b, pin);
      E.cross.position.set(xh, E.CY, E.cz);
      U.aimRod(E.prod, V(11.0, E.CY, E.cz), _b);
      E.gov.rotation.y = t * 3.2;
      // 齿轮墙
      for (const g of dynamics.gears) g.rotation.z = t * g.userData.w + g.userData.ph;
      // 山尖齿轮
      crestGear.rotation.x = t * 0.25;
      // 行车往复
      const C = dynamics.crane; const bx = 6 + 8.5 * Math.sin(t * 0.09); const tz = 1.8 * Math.sin(t * 0.17);
      C.bridge.position.x = bx; C.trolley.position.set(bx, 0, tz);
      C.propHolder.position.set(bx, C.hookY - 1.5 + Math.sin(t * 0.6) * 0.04, tz);
      C.propHolder.rotation.y = Math.sin(t * 0.3) * 0.3; C.prop.rotation.y = t * 0.2;
      // 漫步游客（沿中轴从入口进出）
      for (const p of walkers) {
        const w = p.userData.w; const span = 30; const s = ((t * w.sp + w.off) % span + span) % span;
        const x = 26 - s; p.position.set(x, x > L2 ? 0.06 : 0.1, w.z); p.rotation.y = -PI / 2; U.animatePerson(p, t, w.sp);
      }
    },
  };
}

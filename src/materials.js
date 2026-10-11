// ─────────────────────────────────────────────────────────────
//  凡尔纳幻想乐园 · 程序化材质库
//  所有贴图都在运行时用 Canvas 逐像素生成（无外部图片资源）
// ─────────────────────────────────────────────────────────────
import * as THREE from 'three';

// ---------- 随机数 & 噪声 ----------
export function rng(seed = 1) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// 可平铺的数值噪声（period 为格子数），u,v ∈ [0,1)
function makeValueNoise(seed, period) {
  const r = rng(seed);
  const g = new Float32Array(period * period);
  for (let i = 0; i < g.length; i++) g[i] = r();
  return (u, v) => {
    const x = u * period, y = v * period;
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = x - xi, yf = y - yi;
    const x0 = ((xi % period) + period) % period, y0 = ((yi % period) + period) % period;
    const x1 = (x0 + 1) % period, y1 = (y0 + 1) % period;
    const sx = xf * xf * (3 - 2 * xf), sy = yf * yf * (3 - 2 * yf);
    const a = g[y0 * period + x0], b = g[y0 * period + x1];
    const c = g[y1 * period + x0], d = g[y1 * period + x1];
    return (a + (b - a) * sx) + ((c + (d - c) * sx) - (a + (b - a) * sx)) * sy;
  };
}

export function makeFbm(seed, basePeriod = 4, octaves = 5) {
  const layers = [];
  for (let o = 0; o < octaves; o++) layers.push(makeValueNoise(seed * 31 + o * 977, basePeriod << o));
  return (u, v) => {
    let sum = 0, amp = 0.5, norm = 0;
    for (let o = 0; o < octaves; o++) { sum += layers[o](u, v) * amp; norm += amp; amp *= 0.5; }
    return sum / norm;
  };
}

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const mix = (a, b, t) => a + (b - a) * t;
const smooth = (e0, e1, x) => { const t = clamp01((x - e0) / (e1 - e0)); return t * t * (3 - 2 * t); };

// ---------- 通用逐像素贴图构造器 ----------
// fn(u, v, px, py) → { c:[r,g,b] (0..1), h: 高度 0..1, r: 粗糙度 0..1, m: 金属度 0..1, e:[r,g,b] 自发光 }
function bake(size, fn, want = { h: true, r: true }) {
  const mk = () => { const cv = document.createElement('canvas'); cv.width = cv.height = size; const cx = cv.getContext('2d'); return { cv, cx, img: cx.createImageData(size, size) }; };
  const col = mk();
  const hgt = want.h ? mk() : null;
  const rgh = want.r ? mk() : null;
  const met = want.m ? mk() : null;
  const emi = want.e ? mk() : null;
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      const s = fn(px / size, py / size, px, py);
      const i = (py * size + px) * 4;
      const c = s.c;
      col.img.data[i] = clamp01(c[0]) * 255; col.img.data[i + 1] = clamp01(c[1]) * 255; col.img.data[i + 2] = clamp01(c[2]) * 255; col.img.data[i + 3] = 255;
      if (hgt) { const h = clamp01(s.h ?? 0.5) * 255; hgt.img.data[i] = hgt.img.data[i + 1] = hgt.img.data[i + 2] = h; hgt.img.data[i + 3] = 255; }
      if (rgh) { const r = clamp01(s.r ?? 0.7) * 255; rgh.img.data[i] = rgh.img.data[i + 1] = rgh.img.data[i + 2] = r; rgh.img.data[i + 3] = 255; }
      if (met) { const m = clamp01(s.m ?? 0) * 255; met.img.data[i] = met.img.data[i + 1] = met.img.data[i + 2] = m; met.img.data[i + 3] = 255; }
      if (emi) { const e = s.e || [0, 0, 0]; emi.img.data[i] = clamp01(e[0]) * 255; emi.img.data[i + 1] = clamp01(e[1]) * 255; emi.img.data[i + 2] = clamp01(e[2]) * 255; emi.img.data[i + 3] = 255; }
    }
  }
  const out = {};
  const tex = (o, srgb) => {
    o.cx.putImageData(o.img, 0, 0);
    const t = new THREE.CanvasTexture(o.cv);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    t.anisotropy = 8;
    t.generateMipmaps = true;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    return t;
  };
  out.map = tex(col, true);
  if (hgt) out.bump = tex(hgt, false);
  if (rgh) out.rough = tex(rgh, false);
  if (met) out.metal = tex(met, false);
  if (emi) out.emissive = tex(emi, true);
  return out;
}

// ---------- 各类程序贴图 ----------

// 木板（郁金香木：南特大象的主体材质），横向木板 + 错缝 + 木纹 + 钉眼
function woodTex({ size = 1024, base = [0.62, 0.42, 0.24], planks = 8, seed = 3, contrast = 1, nails = true } = {}) {
  const n1 = makeFbm(seed, 4, 5), n2 = makeFbm(seed + 7, 2, 4), n3 = makeFbm(seed + 13, 16, 3);
  const r = rng(seed);
  const plankTint = [], plankOff = [], plankCut = [];
  for (let i = 0; i < planks; i++) { plankTint.push(0.82 + r() * 0.3); plankOff.push(r() * 40); plankCut.push(0.15 + r() * 0.7); }
  return bake(size, (u, v) => {
    const pv = v * planks; const pi = Math.floor(pv) % planks; const lv = pv - Math.floor(pv);
    const seg = u + plankCut[pi] > 1 ? 1 : 0; // 每块木板的对接缝
    const cutDist = Math.abs(u - (1 - plankCut[pi]));
    const warp = n1(u, v * 0.25 + pi * 0.37) * 6;
    let grain = Math.sin((lv * 9 + warp + plankOff[pi] + seg * 3.1) * 6.2832);
    grain = 0.5 + 0.5 * grain;
    grain = Math.pow(grain, 2.2);
    const fine = n3(u, v);
    let k = plankTint[pi] * (seg ? 0.95 : 1.0) * (0.86 + 0.24 * grain * contrast) * (0.9 + 0.2 * fine) * (0.9 + 0.2 * n2(u, v));
    // 边缘缝
    const edge = Math.min(lv, 1 - lv);
    const seam = smooth(0.0, 0.035, edge) * smooth(0.0, 0.004, cutDist);
    k *= mix(0.35, 1, seam);
    // 钉眼
    let nail = 0;
    if (nails) {
      for (const nx of [0.1, 0.5, 0.9]) {
        const dx = (u - nx) * planks * 1.0, dy = (lv - 0.5);
        const d = Math.sqrt(dx * dx * 4 + dy * dy * 4);
        if (d < 0.06) nail = 1 - d / 0.06;
      }
    }
    k *= 1 - nail * 0.55;
    const c = [base[0] * k, base[1] * k, base[2] * k];
    return { c, h: 0.35 + 0.35 * seam + 0.15 * grain - nail * 0.3, r: 0.55 + 0.25 * (1 - grain) + (1 - seam) * 0.2 };
  });
}

// 铆接钢板（鹦鹉螺号的鱼鳞状铁甲 / 结构钢）
function platesTex({ size = 1024, base = [0.22, 0.25, 0.26], cols = 4, rows = 6, seed = 11, rust = 0.25, rivetColor = null } = {}) {
  const n = makeFbm(seed, 4, 5), nr = makeFbm(seed + 5, 8, 4), ns = makeFbm(seed + 9, 32, 2);
  const r = rng(seed);
  const tint = []; for (let i = 0; i < cols * rows * 2; i++) tint.push(0.85 + r() * 0.25);
  return bake(size, (u, v) => {
    const ry = v * rows; const row = Math.floor(ry); const lv = ry - row;
    const ux = u * cols + (row % 2) * 0.5; const col = Math.floor(ux); const lu = ux - col;
    const t = tint[(row * cols + ((col % cols) + cols) % cols) % tint.length];
    // 鱼鳞叠压：板下沿稍暗形成阴影
    const lap = smooth(0.82, 1.0, lv);
    const edgeU = Math.min(lu, 1 - lu), edgeV = Math.min(lv, 1 - lv);
    const seam = smooth(0, 0.012, edgeU) * smooth(0, 0.016, edgeV);
    // 铆钉：沿四周一圈
    let rivet = 0;
    const rv = 0.055, rpitch = 1 / 10;
    const near = (a, b) => { const dx = (a) * cols, dy = (b) * rows; return Math.sqrt(dx * dx + dy * dy) / Math.max(cols, rows) * 6; };
    for (const yy of [0.07, 0.93]) {
      const k = Math.round(lu / rpitch) * rpitch;
      const d = Math.hypot((lu - k) / rows * cols * 1.0, (lv - yy)) ;
      if (d < rv) rivet = Math.max(rivet, 1 - d / rv);
    }
    for (const xx of [0.04, 0.96]) {
      const k = Math.round(lv / (rpitch * 1.4)) * rpitch * 1.4;
      const d = Math.hypot((lu - xx), (lv - k) * rows / cols * 1.0);
      if (d < rv * 0.8) rivet = Math.max(rivet, 1 - d / (rv * 0.8));
    }
    void near;
    const rustM = smooth(0.55, 0.85, nr(u, v) + (1 - edgeV) * 0.15) * rust;
    const streak = ns(u * 0.2, v) * 0.15;
    let k = t * (0.85 + 0.25 * n(u, v)) * (1 - lap * 0.25) * mix(0.4, 1, seam) * (1 + streak - 0.07);
    let c = [base[0] * k, base[1] * k, base[2] * k];
    c = [mix(c[0], 0.36 * k, rustM), mix(c[1], 0.17 * k, rustM), mix(c[2], 0.08 * k, rustM)];
    if (rivet > 0) {
      const rc = rivetColor || [base[0] * 1.3, base[1] * 1.3, base[2] * 1.3];
      const sh = 0.6 + 0.6 * Math.sqrt(rivet);
      c = [mix(c[0], rc[0] * sh, smooth(0, 0.25, rivet)), mix(c[1], rc[1] * sh, smooth(0, 0.25, rivet)), mix(c[2], rc[2] * sh, smooth(0, 0.25, rivet))];
    }
    return { c, h: 0.5 + 0.3 * seam - lap * 0.25 + rivet * 0.5, r: 0.45 + 0.3 * rustM + 0.15 * n(u, v) - rivet * 0.15, m: 0.85 - rustM * 0.8 };
  }, { h: true, r: true, m: true });
}

// 金属表面（黄铜/铜/钢）：细微斑驳 + 拉丝划痕
function metalTex({ size = 512, base = [0.78, 0.6, 0.28], seed = 21, tarnish = 0.3, tarnishColor = [0.25, 0.2, 0.1], brushed = 0.3 } = {}) {
  const n = makeFbm(seed, 4, 5), nb = makeFbm(seed + 3, 64, 2), nt = makeFbm(seed + 6, 3, 4);
  return bake(size, (u, v) => {
    const b = nb(u * 0.05, v) * brushed;
    const t = smooth(0.5, 0.8, nt(u, v)) * tarnish;
    const k = 0.9 + 0.2 * n(u, v) + b * 0.2;
    const c = [mix(base[0] * k, tarnishColor[0], t), mix(base[1] * k, tarnishColor[1], t), mix(base[2] * k, tarnishColor[2], t)];
    return { c, h: 0.5 + b * 0.2, r: 0.22 + 0.25 * t + 0.12 * n(u, v) + b * 0.15 };
  });
}

// 铜绿（老铜屋顶 / 灯塔穹顶）
function patinaTex({ size = 512, seed = 31 } = {}) {
  const n = makeFbm(seed, 4, 6), s = makeFbm(seed + 2, 2, 5), d = makeFbm(seed + 8, 24, 2);
  return bake(size, (u, v) => {
    const streak = s(u * 3, v * 0.3);
    const p = smooth(0.3, 0.7, n(u, v) * 0.6 + streak * 0.5 + v * 0.1);
    const copper = [0.55, 0.3, 0.16], green = [0.32, 0.62, 0.52], pale = [0.55, 0.78, 0.68];
    const g2 = d(u, v);
    const g = [mix(green[0], pale[0], g2), mix(green[1], pale[1], g2), mix(green[2], pale[2], g2)];
    const c = [mix(copper[0], g[0], p), mix(copper[1], g[1], p), mix(copper[2], g[2], p)];
    return { c, h: 0.4 + p * 0.3 + g2 * 0.1, r: mix(0.35, 0.85, p) };
  }, { h: true, r: true });
}

// 鹅卵石/花岗岩条石铺地
function cobblesTex({ size = 1024, seed = 41, base = [0.56, 0.52, 0.47], rows = 14 } = {}) {
  const n = makeFbm(seed, 8, 4), nf = makeFbm(seed + 1, 64, 2), moss = makeFbm(seed + 4, 4, 4);
  const r = rng(seed);
  const tints = []; for (let i = 0; i < 4096; i++) tints.push([0.8 + r() * 0.35, r(), r()]);
  return bake(size, (u, v) => {
    const ry = v * rows; const row = Math.floor(ry); const lv = ry - row;
    const off = tints[row % 4096][1];
    const cx = u * rows * 0.5 + off; const col = Math.floor(cx); const lu = cx - col;
    const id = ((row * 131 + col * 17) % 4096 + 4096) % 4096;
    const t = tints[id][0];
    // 圆角石块
    const ex = Math.min(lu, 1 - lu) * 2 * 0.5, ey = Math.min(lv, 1 - lv);
    const e = Math.min(ex * 1.0, ey);
    const bulge = smooth(0, 0.18, e);
    const gap = smooth(0.02, 0.07, e);
    const mo = smooth(0.55, 0.75, moss(u, v)) * (1 - gap);
    let k = t * (0.85 + 0.2 * n(u, v)) * (0.9 + 0.15 * nf(u, v));
    let c = [base[0] * k, base[1] * k * (0.98 + tints[id][2] * 0.04), base[2] * k];
    c = [mix(c[0] * 0.3, c[0], gap), mix(c[1] * 0.3, c[1], gap), mix(c[2] * 0.3, c[2], gap)];
    c = [mix(c[0], 0.22, mo * 0.6), mix(c[1], 0.27, mo * 0.6), mix(c[2], 0.12, mo * 0.6)];
    return { c, h: bulge * 0.8 + nf(u, v) * 0.1, r: 0.7 + (1 - gap) * 0.25 - bulge * 0.1 };
  });
}

// 草地 / 沙地 / 泥土
function groundTex({ size = 512, seed = 51, a = [0.24, 0.36, 0.14], b = [0.36, 0.44, 0.2], c2 = [0.3, 0.26, 0.16], fine = 64 } = {}) {
  const n = makeFbm(seed, 4, 5), nf = makeFbm(seed + 1, fine, 2), nd = makeFbm(seed + 2, 8, 3);
  return bake(size, (u, v) => {
    const t = n(u, v), f = nf(u, v), d = smooth(0.62, 0.78, nd(u, v));
    let c = [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)];
    c = c.map((x, i) => mix(x, c2[i], d) * (0.8 + 0.4 * f));
    return { c, h: f * 0.6 + t * 0.4, r: 0.85 + 0.1 * f };
  });
}

// 玄武岩 / 熔岩（带发光裂缝）
function rockTex({ size = 512, seed = 61, base = [0.2, 0.18, 0.17], lava = false } = {}) {
  const n = makeFbm(seed, 4, 6), nc = makeFbm(seed + 3, 8, 4), nl = makeFbm(seed + 7, 16, 3);
  return bake(size, (u, v) => {
    const t = n(u, v);
    const cr = Math.abs(nc(u, v) - 0.5);
    const crack = 1 - smooth(0.0, lava ? 0.05 : 0.03, cr);
    const strata = 0.5 + 0.5 * Math.sin((v * 22 + t * 4) * 3.1416);
    const k = (0.7 + 0.6 * t) * (0.9 + 0.1 * strata) * (1 - crack * 0.6) * (0.85 + 0.3 * nl(u, v));
    const c = [base[0] * k, base[1] * k, base[2] * k];
    const out = { c, h: t * 0.8 - crack * 0.4 + nl(u, v) * 0.2, r: 0.85 + 0.1 * t };
    if (lava) { const g = crack * (0.6 + 0.4 * nl(u, v)); out.e = [g * 1.0, g * 0.35, g * 0.05]; }
    return out;
  }, { h: true, r: true, e: lava });
}

// 皮革（大象耳朵、坐垫）
function leatherTex({ size = 512, seed = 71, base = [0.35, 0.2, 0.12] } = {}) {
  const n = makeFbm(seed, 4, 5), cell = makeFbm(seed + 2, 48, 2), cr = makeFbm(seed + 5, 24, 3);
  return bake(size, (u, v) => {
    const c0 = cell(u, v); const k = 0.75 + 0.35 * n(u, v);
    const wr = 1 - smooth(0.0, 0.06, Math.abs(cr(u, v) - 0.5));
    const kk = k * (0.9 + 0.15 * c0) * (1 - wr * 0.3);
    return { c: [base[0] * kk, base[1] * kk, base[2] * kk], h: c0 * 0.6 - wr * 0.3 + 0.3, r: 0.55 + 0.25 * c0 };
  });
}

// 条纹帆布（热气球 / 遮阳篷 / 旋转木马顶棚）
function stripeTex({ size = 512, colors = [[0.72, 0.12, 0.1], [0.93, 0.86, 0.7]], stripes = 8, seed = 81 } = {}) {
  const n = makeFbm(seed, 8, 4), w = makeFbm(seed + 1, 128, 1);
  return bake(size, (u, v) => {
    const s = Math.floor(u * stripes) % colors.length;
    const lu = (u * stripes) % 1;
    const seam = smooth(0, 0.03, Math.min(lu, 1 - lu));
    const weave = 0.93 + 0.07 * w(u, v);
    const k = (0.88 + 0.18 * n(u, v)) * weave * mix(0.75, 1, seam);
    const c = colors[s].map((x) => x * k);
    return { c, h: weave * 0.5 + seam * 0.3, r: 0.85 };
  });
}

// 砖墙
function brickTex({ size = 512, seed = 91, base = [0.55, 0.26, 0.18], rows = 16, cols = 8 } = {}) {
  const n = makeFbm(seed, 8, 4), r = rng(seed);
  const t = []; for (let i = 0; i < 512; i++) t.push(0.75 + r() * 0.4);
  return bake(size, (u, v) => {
    const ry = v * rows; const row = Math.floor(ry); const lv = ry - row;
    const cx = u * cols + (row % 2) * 0.5; const col = Math.floor(cx); const lu = cx - col;
    const id = ((row * 37 + col * 11) % 512 + 512) % 512;
    const mort = smooth(0.0, 0.08, Math.min(lv, 1 - lv)) * smooth(0, 0.04, Math.min(lu, 1 - lu));
    const k = t[id] * (0.85 + 0.25 * n(u, v));
    const c = [mix(0.72, base[0] * k, mort), mix(0.7, base[1] * k, mort), mix(0.64, base[2] * k, mort)];
    return { c, h: mort * 0.7 + n(u, v) * 0.2, r: 0.85 };
  });
}

// 石材（灯塔砌块、基座）
function stoneTex({ size = 512, seed = 101, base = [0.78, 0.74, 0.66], rows = 6, cols = 3 } = {}) {
  const n = makeFbm(seed, 6, 5), nf = makeFbm(seed + 2, 48, 2), r = rng(seed);
  const t = []; for (let i = 0; i < 256; i++) t.push(0.86 + r() * 0.2);
  return bake(size, (u, v) => {
    const ry = v * rows; const row = Math.floor(ry); const lv = ry - row;
    const cx = u * cols + (row % 2) * 0.5; const col = Math.floor(cx); const lu = cx - col;
    const id = ((row * 7 + col * 13) % 256 + 256) % 256;
    const mort = smooth(0.0, 0.04, Math.min(lv, 1 - lv)) * smooth(0, 0.02, Math.min(lu, 1 - lu));
    const dirt = smooth(0.4, 0.9, n(u, v * 0.5)) * 0.25;
    const k = t[id] * (0.9 + 0.15 * nf(u, v)) * (1 - dirt);
    const c = [mix(0.35, base[0] * k, mort), mix(0.34, base[1] * k, mort), mix(0.32, base[2] * k, mort)];
    return { c, h: mort * 0.7 + nf(u, v) * 0.25, r: 0.8 + 0.15 * nf(u, v) };
  });
}

// 石板瓦屋顶
function slateTex({ size = 512, seed = 111, base = [0.24, 0.27, 0.31], rows = 12, cols = 8 } = {}) {
  const n = makeFbm(seed, 6, 4), r = rng(seed);
  const t = []; for (let i = 0; i < 256; i++) t.push(0.8 + r() * 0.35);
  return bake(size, (u, v) => {
    const ry = v * rows; const row = Math.floor(ry); const lv = ry - row;
    const cx = u * cols + (row % 2) * 0.5; const col = Math.floor(cx); const lu = cx - col;
    const id = ((row * 7 + col * 13) % 256 + 256) % 256;
    const lap = smooth(0.7, 1.0, lv);
    const gap = smooth(0, 0.04, Math.min(lu, 1 - lu));
    const k = t[id] * (0.85 + 0.2 * n(u, v)) * (1 - lap * 0.35) * mix(0.5, 1, gap);
    return { c: [base[0] * k, base[1] * k, base[2] * k], h: (1 - lv) * 0.6 * gap, r: 0.6 + 0.2 * n(u, v) };
  });
}

// 彩绘装饰（旋转木马的描金花饰面板）
function ornamentTex({ size = 512, bg = [0.12, 0.28, 0.32], fg = [0.85, 0.66, 0.28], seed = 121 } = {}) {
  const n = makeFbm(seed, 4, 4);
  return bake(size, (u, v) => {
    const x = (u - 0.5) * 2, y = (v - 0.5) * 2;
    const rr = Math.hypot(x, y), a = Math.atan2(y, x);
    const border = Math.min(u, 1 - u, v, 1 - v);
    const frame = border < 0.06 ? 1 : (border > 0.08 && border < 0.1 ? 1 : 0);
    const rosette = Math.abs(rr - (0.45 + 0.12 * Math.cos(a * 8))) < 0.035 ? 1 : 0;
    const inner = rr < 0.16 ? 1 : 0;
    const scroll = Math.abs(Math.sin(a * 4 + rr * 9)) < 0.08 && rr > 0.6 && rr < 0.85 ? 1 : 0;
    const g = Math.max(frame, rosette, inner, scroll);
    const k = 0.9 + 0.2 * n(u, v);
    const c = [mix(bg[0] * k, fg[0], g), mix(bg[1] * k, fg[1], g), mix(bg[2] * k, fg[2], g)];
    return { c, h: g * 0.8 + 0.1, r: g ? 0.3 : 0.6, m: g ? 1 : 0 };
  }, { h: true, r: true, m: true });
}

// 水面法线贴图（用于 Water 反射着色器）
export function waterNormalTexture(size = 512) {
  const n1 = makeFbm(7, 8, 5), n2 = makeFbm(19, 16, 4);
  const h = (u, v) => n1(u, v) * 0.6 + n2(u, v) * 0.4;
  const cv = document.createElement('canvas'); cv.width = cv.height = size;
  const cx = cv.getContext('2d'); const img = cx.createImageData(size, size);
  const e = 1 / size;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const u = x / size, v = y / size;
    const dx = (h((u + e) % 1, v) - h((u - e + 1) % 1, v)) * 18;
    const dy = (h(u, (v + e) % 1) - h(u, (v - e + 1) % 1)) * 18;
    const l = Math.hypot(dx, dy, 1);
    const i = (y * size + x) * 4;
    img.data[i] = (-dx / l * 0.5 + 0.5) * 255; img.data[i + 1] = (-dy / l * 0.5 + 0.5) * 255; img.data[i + 2] = (1 / l * 0.5 + 0.5) * 255; img.data[i + 3] = 255;
  }
  cx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
}

// ---------- 材质工厂 ----------
function std(params, tex, rep = [1, 1]) {
  const p = { ...params };
  if (tex) {
    const set = (t) => { if (!t) return t; const c = t.clone(); c.repeat.set(rep[0], rep[1]); c.needsUpdate = true; return c; };
    p.map = set(tex.map);
    if (tex.bump) { p.bumpMap = set(tex.bump); p.bumpScale = params.bumpScale ?? 1.5; }
    if (tex.rough) p.roughnessMap = set(tex.rough);
    if (tex.metal && params.useMetalMap) p.metalnessMap = set(tex.metal);
    if (tex.emissive) { p.emissiveMap = set(tex.emissive); }
  }
  delete p.useMetalMap;
  return new THREE.MeshStandardMaterial(p);
}

/**
 * 创建全部共享材质。返回对象 M，各景点模块共享使用。
 * 夜间发光材质（glow*）的 emissiveIntensity 由主循环统一调节。
 */
export function createMaterials() {
  const T = {
    wood: woodTex({ base: [0.66, 0.45, 0.26], seed: 3 }),
    woodDark: woodTex({ size: 512, base: [0.34, 0.2, 0.11], seed: 5, planks: 6 }),
    deck: woodTex({ size: 512, base: [0.52, 0.38, 0.24], seed: 8, planks: 10, contrast: 0.7 }),
    hull: platesTex({ base: [0.2, 0.26, 0.27], seed: 11, rust: 0.18 }),
    iron: platesTex({ size: 512, base: [0.17, 0.17, 0.18], seed: 13, cols: 3, rows: 4, rust: 0.35 }),
    brass: metalTex({ base: [0.8, 0.6, 0.3], seed: 21, tarnish: 0.25 }),
    copper: metalTex({ base: [0.78, 0.42, 0.25], seed: 23, tarnish: 0.35, tarnishColor: [0.3, 0.16, 0.1] }),
    steel: metalTex({ base: [0.62, 0.63, 0.65], seed: 25, tarnish: 0.15, tarnishColor: [0.3, 0.3, 0.3], brushed: 0.6 }),
    gunmetal: metalTex({ base: [0.24, 0.24, 0.25], seed: 27, tarnish: 0.4, tarnishColor: [0.28, 0.17, 0.1], brushed: 0.2 }),
    patina: patinaTex(),
    cobbles: cobblesTex(),
    grass: groundTex({ seed: 51 }),
    sand: groundTex({ seed: 53, a: [0.72, 0.64, 0.48], b: [0.8, 0.72, 0.55], c2: [0.62, 0.55, 0.42], fine: 128 }),
    dirt: groundTex({ seed: 55, a: [0.4, 0.31, 0.22], b: [0.48, 0.38, 0.27], c2: [0.32, 0.25, 0.18] }),
    rock: rockTex({ seed: 61 }),
    lava: rockTex({ seed: 63, base: [0.12, 0.1, 0.1], lava: true }),
    leather: leatherTex(),
    stripeRed: stripeTex({ colors: [[0.68, 0.1, 0.09], [0.94, 0.86, 0.68]], stripes: 12 }),
    stripeBlue: stripeTex({ colors: [[0.1, 0.22, 0.42], [0.92, 0.84, 0.62]], stripes: 12, seed: 83 }),
    stripeGreen: stripeTex({ colors: [[0.12, 0.34, 0.26], [0.9, 0.8, 0.5]], stripes: 16, seed: 85 }),
    brick: brickTex(),
    stone: stoneTex(),
    slate: slateTex(),
    ornament: ornamentTex(),
    ornamentRed: ornamentTex({ bg: [0.45, 0.07, 0.07], seed: 123 }),
  };

  const M = {
    // —— 木材 ——
    wood: std({ color: 0xffffff, roughness: 0.75, metalness: 0, bumpScale: 2 }, T.wood, [1, 1]),
    woodDark: std({ color: 0xffffff, roughness: 0.6, metalness: 0, bumpScale: 1.2 }, T.woodDark, [1, 1]),
    deck: std({ color: 0xffffff, roughness: 0.85, bumpScale: 1.5 }, T.deck, [2, 2]),
    // —— 金属 ——
    hull: std({ color: 0xffffff, roughness: 0.55, metalness: 0.75, bumpScale: 3, useMetalMap: true }, T.hull, [6, 2]),
    iron: std({ color: 0xffffff, roughness: 0.6, metalness: 0.8, bumpScale: 2, useMetalMap: true }, T.iron, [1, 1]),
    ironPlain: std({ color: 0x3a3a3c, roughness: 0.5, metalness: 0.85 }, T.gunmetal, [1, 1]),
    steel: std({ color: 0xffffff, roughness: 0.25, metalness: 1.0, bumpScale: 0.3 }, T.steel, [1, 1]),
    brass: std({ color: 0xffffff, roughness: 0.3, metalness: 1.0, bumpScale: 0.2 }, T.brass, [1, 1]),
    copper: std({ color: 0xffffff, roughness: 0.35, metalness: 1.0, bumpScale: 0.2 }, T.copper, [1, 1]),
    gold: new THREE.MeshStandardMaterial({ color: 0xe0b450, roughness: 0.22, metalness: 1.0 }),
    patina: std({ color: 0xffffff, roughness: 0.6, metalness: 0.4, bumpScale: 1 }, T.patina, [2, 2]),
    // —— 地面/岩石 ——
    cobbles: std({ color: 0xffffff, roughness: 0.85, bumpScale: 3 }, T.cobbles, [1, 1]),
    grass: std({ color: 0xffffff, roughness: 0.95, bumpScale: 1 }, T.grass, [1, 1]),
    sand: std({ color: 0xffffff, roughness: 0.95, bumpScale: 1 }, T.sand, [1, 1]),
    dirt: std({ color: 0xffffff, roughness: 0.95, bumpScale: 1 }, T.dirt, [1, 1]),
    rock: std({ color: 0xffffff, roughness: 0.92, bumpScale: 4 }, T.rock, [2, 2]),
    lava: std({ color: 0xffffff, roughness: 0.9, bumpScale: 3, emissive: 0xffffff, emissiveIntensity: 2.2 }, T.lava, [2, 2]),
    stone: std({ color: 0xffffff, roughness: 0.85, bumpScale: 2 }, T.stone, [1, 1]),
    brick: std({ color: 0xffffff, roughness: 0.9, bumpScale: 2 }, T.brick, [1, 1]),
    slate: std({ color: 0xffffff, roughness: 0.7, bumpScale: 2 }, T.slate, [2, 2]),
    // —— 织物/皮革 ——
    leather: std({ color: 0xffffff, roughness: 0.7, bumpScale: 1.5 }, T.leather, [2, 2]),
    stripeRed: std({ color: 0xffffff, roughness: 0.9, side: THREE.DoubleSide, bumpScale: 0.6 }, T.stripeRed, [1, 1]),
    stripeBlue: std({ color: 0xffffff, roughness: 0.9, side: THREE.DoubleSide, bumpScale: 0.6 }, T.stripeBlue, [1, 1]),
    stripeGreen: std({ color: 0xffffff, roughness: 0.9, side: THREE.DoubleSide, bumpScale: 0.6 }, T.stripeGreen, [1, 1]),
    canvas: new THREE.MeshStandardMaterial({ color: 0xe8dcc0, roughness: 0.95, side: THREE.DoubleSide }),
    rope: new THREE.MeshStandardMaterial({ color: 0x8a7350, roughness: 1 }),
    ornament: std({ color: 0xffffff, roughness: 0.5, metalness: 0.3, bumpScale: 0.8 }, T.ornament, [1, 1]),
    ornamentRed: std({ color: 0xffffff, roughness: 0.5, metalness: 0.3, bumpScale: 0.8 }, T.ornamentRed, [1, 1]),
    // —— 彩漆 ——
    paintRed: new THREE.MeshStandardMaterial({ color: 0x8e1c18, roughness: 0.38, metalness: 0.1 }),
    paintCream: new THREE.MeshStandardMaterial({ color: 0xeee2c2, roughness: 0.45, metalness: 0.05 }),
    paintTeal: new THREE.MeshStandardMaterial({ color: 0x1f5c5e, roughness: 0.4, metalness: 0.15 }),
    paintNavy: new THREE.MeshStandardMaterial({ color: 0x1b2a44, roughness: 0.4, metalness: 0.15 }),
    paintGreen: new THREE.MeshStandardMaterial({ color: 0x2f4a2a, roughness: 0.45, metalness: 0.1 }),
    paintBlack: new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.4, metalness: 0.3 }),
    paintWhite: new THREE.MeshStandardMaterial({ color: 0xf2efe8, roughness: 0.5 }),
    ivory: new THREE.MeshStandardMaterial({ color: 0xf0e6cc, roughness: 0.3, metalness: 0.0 }),
    // —— 玻璃 & 发光 ——
    glass: new THREE.MeshStandardMaterial({ color: 0x9fc4c8, roughness: 0.04, metalness: 0.9, transparent: true, opacity: 0.38, envMapIntensity: 1.5 }),
    glassDark: new THREE.MeshStandardMaterial({ color: 0x1a2a30, roughness: 0.05, metalness: 1.0, envMapIntensity: 1.6 }),
    glowWarm: new THREE.MeshStandardMaterial({ color: 0xffd9a0, emissive: 0xffa040, emissiveIntensity: 0.4, roughness: 0.3 }),
    glowWindow: new THREE.MeshStandardMaterial({ color: 0x2a2418, emissive: 0xffb860, emissiveIntensity: 0.15, roughness: 0.15, metalness: 0.4 }),
    glowCyan: new THREE.MeshStandardMaterial({ color: 0xa0f0ff, emissive: 0x40d8ff, emissiveIntensity: 0.6, roughness: 0.2 }),
    glowRed: new THREE.MeshStandardMaterial({ color: 0xff8070, emissive: 0xff2a10, emissiveIntensity: 0.6, roughness: 0.3 }),
    glowBeacon: new THREE.MeshStandardMaterial({ color: 0xfff6e0, emissive: 0xfff0c0, emissiveIntensity: 1.0, roughness: 0.1 }),
    // —— 其它 ——
    black: new THREE.MeshStandardMaterial({ color: 0x0b0b0b, roughness: 0.6 }),
    eye: new THREE.MeshStandardMaterial({ color: 0x120c08, roughness: 0.08, metalness: 0.3 }),
    foliage: new THREE.MeshStandardMaterial({ color: 0x3d5e2a, roughness: 0.9, flatShading: true }),
    foliage2: new THREE.MeshStandardMaterial({ color: 0x55703a, roughness: 0.9, flatShading: true }),
    foliage3: new THREE.MeshStandardMaterial({ color: 0x2c4a2e, roughness: 0.9, flatShading: true }),
    bark: new THREE.MeshStandardMaterial({ color: 0x4a3626, roughness: 1 }),
    water: new THREE.MeshStandardMaterial({ color: 0x5aa0b8, roughness: 0.05, metalness: 0.2, transparent: true, opacity: 0.6 }),
    smoke: new THREE.MeshStandardMaterial({ color: 0xdedad2, roughness: 1, transparent: true, opacity: 0.5, depthWrite: false }),
  };

  // 便于夜间统一控制
  M._nightGlow = [
    { mat: M.glowWarm, day: 0.4, night: 5.5 },
    { mat: M.glowWindow, day: 0.15, night: 3.2 },
    { mat: M.glowCyan, day: 0.6, night: 4.5 },
    { mat: M.glowRed, day: 0.6, night: 3.5 },
    { mat: M.glowBeacon, day: 1.0, night: 9.0 },
  ];
  M._textures = T;
  return M;
}

/** 给某个材质克隆一份并设置贴图重复次数（避免不同尺寸部件纹理拉伸） */
export function withRepeat(mat, rx, ry) {
  const m = mat.clone();
  for (const k of ['map', 'bumpMap', 'roughnessMap', 'metalnessMap', 'emissiveMap', 'normalMap']) {
    if (m[k]) { m[k] = m[k].clone(); m[k].repeat.set(rx, ry); m[k].needsUpdate = true; }
  }
  return m;
}

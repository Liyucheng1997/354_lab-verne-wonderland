// 无头检查景点模块：node scripts/check-module.mjs src/attractions/carousel.js
// 构造模块、运行若干帧 update，打印网格数、三角形数、包围盒，捕获运行时错误。
import * as THREE from 'three';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

// —— 最小 document/canvas 桩 ——
function fakeCtx(w, h) {
  return new Proxy({
    createImageData: (W, H) => ({ width: W, height: H, data: new Uint8ClampedArray(W * H * 4) }),
    getImageData: (x, y, W, H) => ({ width: W, height: H, data: new Uint8ClampedArray(W * H * 4) }),
    createRadialGradient: () => ({ addColorStop() {} }),
    createLinearGradient: () => ({ addColorStop() {} }),
    measureText: (t) => ({ width: String(t).length * 10 }),
  }, { get: (o, k) => (k in o ? o[k] : () => {}), set: () => true });
}
globalThis.document = {
  createElement: () => { const c = { width: 1, height: 1, style: {} }; c.getContext = () => fakeCtx(c.width, c.height); return c; },
  createElementNS: () => ({ style: {} }),
};
globalThis.window = globalThis;
globalThis.self = globalThis;

const file = process.argv[2];
if (!file) { console.error('用法: node scripts/check-module.mjs <模块路径>'); process.exit(1); }

// 材质桩：任何 M.xxx 都返回一个具名 MeshStandardMaterial（与真实材质库同名即可）
const cache = {};
const M = new Proxy({}, { get: (o, k) => { if (k === '_nightGlow') return []; if (!cache[k]) { cache[k] = new THREE.MeshStandardMaterial(); cache[k].name = String(k); } return cache[k]; } });
const nightLights = [];
const ctx = { addNightLight: (l, i) => nightLights.push([l, i]), M };

const mod = await import(pathToFileURL(path.resolve(file)).href);
const fnName = Object.keys(mod).find((k) => /^create/.test(k) && typeof mod[k] === 'function');
if (!fnName) { console.error('未找到 create* 导出函数'); process.exit(1); }
const t0 = Date.now();
const res = mod[fnName](M, ctx);
const ms = Date.now() - t0;
if (!res || !res.group) { console.error('create* 必须返回 { group, update }'); process.exit(1); }
for (let i = 0; i < 120; i++) res.update?.(i / 30, 1 / 30, { night: i % 2, camera: new THREE.PerspectiveCamera() });
res.group.updateMatrixWorld(true);
let meshes = 0, tris = 0, inst = 0; const mats = new Set();
res.group.traverse((o) => {
  if (o.isMesh) {
    meshes++; if (o.isInstancedMesh) inst++;
    const g = o.geometry; const n = g.index ? g.index.count / 3 : g.attributes.position.count / 3;
    tris += n * (o.isInstancedMesh ? o.count : 1);
    (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => mats.add(m.name || m.type));
    const p = g.attributes.position.array; for (let i = 0; i < p.length; i++) if (!Number.isFinite(p[i])) { console.error('⚠ NaN/Infinity 顶点于', o.name || o.type); break; }
  }
});
const bb = new THREE.Box3().setFromObject(res.group);
const sz = bb.getSize(new THREE.Vector3());
console.log(`✓ ${fnName}() 构造耗时 ${ms}ms`);
console.log(`  网格 ${meshes}（实例化 ${inst}），三角形约 ${Math.round(tris).toLocaleString()}`);
console.log(`  包围盒 min(${bb.min.toArray().map((v) => v.toFixed(1)).join(', ')}) max(${bb.max.toArray().map((v) => v.toFixed(1)).join(', ')})`);
console.log(`  尺寸 ${sz.x.toFixed(1)} × ${sz.y.toFixed(1)} × ${sz.z.toFixed(1)} m`);
console.log(`  用到材质: ${[...mats].join(', ')}`);
console.log(`  夜间灯光 ${nightLights.length} 个；focus: ${JSON.stringify(res.focus || null)}`);

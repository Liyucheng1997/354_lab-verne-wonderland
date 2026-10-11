// ─────────────────────────────────────────────────────────────
//  凡尔纳幻想王国 · 主程序
// ─────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { Sky } from 'three/examples/jsm/objects/Sky.js';
import { Water } from 'three/examples/jsm/objects/Water.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { createMaterials, waterNormalTexture, makeFbm } from './materials.js';
import { World, Crowd, WATER, shoreZ } from './world.js';
import * as U from './util.js';
import { GUIDE } from './content.js';

const { V } = U;
const $ = (s) => document.querySelector(s);
const sleep = () => new Promise((r) => setTimeout(r, 0));
const loadBar = $('#load-bar'), loadMsg = $('#load-msg');
async function progress(p, msg) { loadBar.style.width = `${Math.round(p * 100)}%`; loadMsg.textContent = msg; await sleep(); await sleep(); }

// ---------- 渲染器 ----------
const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.62;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.info.autoReset = false;
$('#app').appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.3, 9000);
camera.layers.enable(1);
camera.position.set(95, 55, 150);
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 6, 10);
controls.enableDamping = true; controls.dampingFactor = 0.07;
controls.maxPolarAngle = Math.PI * 0.58;
controls.minDistance = 4; controls.maxDistance = 650;
controls.zoomSpeed = 1.2;

// ---------- 天空 / 雾 ----------
const sky = new Sky(); sky.scale.setScalar(8000); scene.add(sky);
const su = sky.material.uniforms;
su.turbidity.value = 4.2; su.rayleigh.value = 1.9; su.mieCoefficient.value = 0.004; su.mieDirectionalG.value = 0.86;
scene.fog = new THREE.FogExp2(0xb8c4c8, 0.0011);

// 星空
const stars = (() => {
  const N = 4000, p = new Float32Array(N * 3), c = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    const u = Math.random() * 2 - 1, a = Math.random() * Math.PI * 2, r = 6000;
    const y = Math.abs(u) * 0.98 + 0.02;
    const s = Math.sqrt(1 - y * y);
    p.set([Math.cos(a) * s * r, y * r, Math.sin(a) * s * r], i * 3);
    const k = 0.6 + Math.random() * 0.4; const w = Math.random();
    c.set([k, k * (0.9 + w * 0.1), k * (0.8 + w * 0.2)], i * 3);
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(p, 3)); g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  const m = new THREE.PointsMaterial({ size: 1.6, sizeAttenuation: false, vertexColors: true, transparent: true, opacity: 0, depthWrite: false, fog: false });
  const pts = new THREE.Points(g, m); pts.renderOrder = -1; scene.add(pts); return pts;
})();

// 月亮（程序陨石坑贴图）
const moon = (() => {
  const S = 512, cv = document.createElement('canvas'); cv.width = cv.height = S; const cx = cv.getContext('2d');
  const n = makeFbm(42, 4, 6); const img = cx.createImageData(S, S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const v = n(x / S, y / S); const k = 0.62 + 0.38 * v - (v > 0.55 ? (v - 0.55) * 0.9 : 0);
    const i = (y * S + x) * 4; img.data[i] = k * 235; img.data[i + 1] = k * 232; img.data[i + 2] = k * 222; img.data[i + 3] = 255;
  }
  cx.putImageData(img, 0, 0);
  for (let i = 0; i < 70; i++) { const x = Math.random() * S, y = Math.random() * S, r = 4 + Math.random() ** 2 * 40; const g = cx.createRadialGradient(x, y, r * 0.2, x, y, r); g.addColorStop(0, 'rgba(90,88,80,0.35)'); g.addColorStop(0.8, 'rgba(90,88,80,0.15)'); g.addColorStop(1, 'rgba(255,255,250,0.25)'); cx.fillStyle = g; cx.beginPath(); cx.arc(x, y, r, 0, 7); cx.fill(); }
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.Mesh(new THREE.SphereGeometry(130, 48, 32), new THREE.MeshBasicMaterial({ map: t, fog: false, transparent: true }));
  scene.add(m); return m;
})();
let moonDir = V(0.55, 0.42, -0.72).normalize();

// 云
const clouds = (() => {
  const g = new THREE.Group();
  const S = 256, cv = document.createElement('canvas'); cv.width = cv.height = S; const cx = cv.getContext('2d');
  const n = makeFbm(17, 4, 5); const img = cx.createImageData(S, S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const dx = (x / S - 0.5) * 2, dy = (y / S - 0.5) * 2; const r = Math.sqrt(dx * dx * 0.8 + dy * dy * 2.2);
    const a = Math.max(0, Math.min(1, (n(x / S, y / S) * 1.4 - 0.25) - r * 0.85)) ;
    const i = (y * S + x) * 4; img.data[i] = img.data[i + 1] = img.data[i + 2] = 255; img.data[i + 3] = a * 255;
  }
  cx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(cv);
  for (let i = 0; i < 46; i++) {
    const m = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, opacity: 0.85, fog: false });
    const s = new THREE.Sprite(m);
    const a = Math.random() * Math.PI * 2, d = 500 + Math.random() * 2200;
    s.position.set(Math.cos(a) * d, 260 + Math.random() * 300, Math.sin(a) * d);
    const sc = 300 + Math.random() * 500; s.scale.set(sc * 2.2, sc * 0.75, 1);
    s.material.rotation = (Math.random() - 0.5) * 0.2;
    g.add(s);
  }
  scene.add(g); return g;
})();

// ---------- 灯光 ----------
const hemi = new THREE.HemisphereLight(0xcfe3ff, 0x5b4a36, 0.6); scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff1dc, 3.0);
sun.castShadow = true;
sun.shadow.mapSize.set(4096, 4096);
const SH = 95;
Object.assign(sun.shadow.camera, { left: -SH, right: SH, top: SH, bottom: -SH, near: 1, far: 900 });
sun.shadow.bias = -0.0003; sun.shadow.normalBias = 0.5;
scene.add(sun, sun.target);

const pmrem = new THREE.PMREMGenerator(renderer);
const envScene = new THREE.Scene();
let envRT = null;

// ---------- 状态 ----------
const state = {
  tod: 17.2,          // 当天时刻（小时）
  autoTime: false,
  night: 0,
  focusId: null,
  follow: null,
  ride: null,
  tour: false,
  tourIdx: 0,
  tourNext: 0,
};

// ---------- 后期 ----------
const rt = new THREE.WebGLRenderTarget(window.innerWidth, window.innerHeight, { type: THREE.HalfFloatType, samples: 4 });
const composer = new EffectComposer(renderer, rt);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(window.innerWidth / 2, window.innerHeight / 2), 0.35, 0.55, 0.9);
composer.addPass(bloom);
composer.addPass(new OutputPass());

// ---------- 世界构建 ----------
const attractions = {};
const nightLights = [];
let M, world, water, crowd, gulls, lightPools;

const LAYOUT = {
  elephant: { file: 'elephant', fn: 'createElephant', pos: [0, 0, 0], rot: 0 },
  plaza: { file: 'plaza', fn: 'createPlazaProps', pos: [0, 0, 0], rot: 0, noGuide: true },
  fountain: { file: 'plaza', fn: 'createFountain', pos: [0, 0, -58], rot: 0, noGuide: true },
  cafe: { file: 'plaza', fn: 'createCafe', pos: [-50, 0, 36], face: true, noGuide: true },
  carousel: { file: 'carousel', fn: 'createCarousel', pos: [-84, 0, -6], face: true },
  galerie: { file: 'galerie', fn: 'createGalerie', pos: [88, 0, -30], rot: Math.PI },
  gate: { file: 'gate', fn: 'createGate', pos: [0, 0, -100], rot: Math.PI },
  columbiad: { file: 'columbiad', fn: 'createColumbiad', pos: [125, 0, -125], face: true, muzzle: [0, 0.766, -0.643] },
  volcano: { file: 'volcano', fn: 'createVolcano', pos: [-140, 0, -130], face: true },
  nautilus: { file: 'nautilus', fn: 'createNautilus', pos: [18, WATER, shoreZ(18) + 31], rot: Math.PI, water: true },
  lighthouse: { file: 'lighthouse', fn: 'createLighthouse', pos: [-100, WATER, 168], rot: 0.6, water: true, focus: { pos: [38, 14, 46], target: [0, 17, 0] } },
  albatross: { file: 'albatross', fn: 'createAlbatross', pos: [0, 80, 0], rot: 0, flying: true },
  balloon: { file: 'balloon', fn: 'createBalloon', pos: [40, 50, 40], rot: 0, flying: true },
  train: { file: 'train', fn: 'createTrain', pos: [0, 0, 0], rot: 0, moving: true },
};
const FOOT = { elephant: 0, plaza: 0, fountain: 12, cafe: 14, carousel: 16, galerie: 28, gate: 28, columbiad: 34, volcano: 52 };

function buildLayout() {
  const flats = [], paved = [];
  for (const [id, L] of Object.entries(LAYOUT)) if (FOOT[id]) flats.push({ x: L.pos[0], z: L.pos[2], r: FOOT[id] });
  paved.push({ x: 0, z: -58, r: 11 }, { x: -50, z: 36, r: 12 }, { x: -84, z: -6, r: 15 }, { x: 0, z: -100, r: 16 });
  const P = (...a) => a.map(([x, z]) => V(x, 0, z));
  const sz = shoreZ;
  const promenade = []; for (let x = -150; x <= 150; x += 15) promenade.push(V(x, 0, sz(x) - 10));
  const paths = [
    P([0, -88], [0, -64]), P([0, -52], [0, -33]),               // 正门 → 喷泉 → 广场
    P([-43, -4], [-68, -6]),                                    // 广场 → 旋转木马
    P([36, -20], [56, -30], [70, -30]),                         // 广场 → 机器长廊
    P([56, -30], [80, -62], [106, -104]),                       // → 哥伦比亚大炮
    P([-32, -22], [-70, -62], [-104, -100]),                    // → 火山
    P([14, 32], [17, sz(17) - 4]),                              // → 鹦鹉螺号码头
    P([-37, 20], [-46, 30]),                                    // → 咖啡馆
    promenade,                                                  // 海滨长廊
    P([-40, 23], [-80, sz(-80) - 10]), P([38, 22], [50, 47]),   // → 查令十字车站
  ];
  return { flats, paved, paths };
}

async function loadAttraction(id, L) {
  try {
    const mod = await import(`./attractions/${L.file}.js`);
    const ctx = { M, world, addNightLight: (l, i) => { nightLights.push({ l, i }); l.intensity = 0; } };
    const a = mod[L.fn](M, ctx);
    const g = a.group;
    const h = L.water || L.flying ? 0 : world.heightAt(L.pos[0], L.pos[2]);
    g.position.set(L.pos[0], L.pos[1] + h, L.pos[2]);
    let rot = L.rot || 0;
    if (L.face) rot = Math.atan2(-L.pos[0], -L.pos[2]);
    g.rotation.y = rot;
    scene.add(g);
    if (L.focus) a.focus = L.focus;
    attractions[id] = { ...a, id, L, base: g.position.clone() };
  } catch (e) {
    console.error(`[景点 ${id}] 加载失败：`, e);
  }
}

async function build() {
  await progress(0.04, '铸造黄铜、刨削郁金香木……');
  M = createMaterials();
  await progress(0.18, '测绘乐园地形……');
  world = new World(buildLayout());
  scene.add(world.buildTerrain(M));
  await progress(0.28, '引入潟湖之水……');
  const wn = waterNormalTexture(512);
  water = new Water(new THREE.PlaneGeometry(4000, 4000), {
    textureWidth: 512, textureHeight: 512, waterNormals: wn,
    sunDirection: V(0.5, 0.5, 0.5), sunColor: 0xfff2dc, waterColor: 0x0d3a44, distortionScale: 2.2, fog: true,
  });
  water.rotation.x = -Math.PI / 2; water.position.y = WATER;
  water.material.uniforms.size.value = 3.5;
  scene.add(water);

  const order = ['elephant', 'nautilus', 'carousel', 'columbiad', 'volcano', 'lighthouse', 'galerie', 'gate', 'plaza', 'fountain', 'cafe', 'train', 'albatross', 'balloon'];
  const names = { elephant: '组装机械巨象', nautilus: '铆接鹦鹉螺号船壳', carousel: '架设海洋旋转木马', columbiad: '浇铸哥伦比亚大炮', volcano: '唤醒斯奈菲尔火山', lighthouse: '点亮世界尽头的灯塔', galerie: '搭建机器长廊', gate: '竖起奇异旅行之门', plaza: '布置音乐亭', fountain: '安装喷泉', cafe: '摆好尼摩咖啡馆', albatross: '信天翁号升空', balloon: '为维多利亚号充气', train: '铺设环球铁路、给机车生火' };
  for (let i = 0; i < order.length; i++) {
    await progress(0.3 + (i / order.length) * 0.55, names[order[i]] + '……');
    await loadAttraction(order[i], LAYOUT[order[i]]);
  }
  await progress(0.87, '种植林木、摆放长椅……');
  const trees = world.buildTrees(M), furniture = world.buildFurniture(M), flowers = world.buildFlowers(M);
  scene.add(trees, furniture, flowers);
  lightPools = world.buildLightPools(); scene.add(lightPools);
  crowd = new Crowd(world, 34);
  crowd.group.traverse((o) => { if (o.isMesh) o.castShadow = false; });
  flowers.traverse((o) => { if (o.isMesh) o.castShadow = false; });
  scene.add(crowd.group);
  // 远离水面的物体不参与水面反射渲染（显著降低每帧开销）
  for (const o of [trees, furniture, flowers, crowd.group, lightPools]) noReflect(o);
  for (const id of ['carousel', 'galerie', 'gate', 'plaza', 'fountain', 'cafe', 'volcano', 'columbiad']) if (attractions[id]) noReflect(attractions[id].group);
  gulls = makeGulls(); scene.add(gulls);
  // 哥伦比亚大炮：月亮挂在炮口方向
  const col = attractions.columbiad;
  if (col && (col.muzzleDir || col.L.muzzle)) {
    const d = V(...(col.muzzleDir || col.L.muzzle)).applyQuaternion(col.group.quaternion).normalize();
    // 沿炮管方位角，仰角压低到约 28°，让月亮在常规视角中可见
    const az = Math.atan2(d.z, d.x), el = THREE.MathUtils.degToRad(28);
    if (d.y > 0.15) moonDir = V(Math.cos(el) * Math.cos(az), Math.sin(el), Math.cos(el) * Math.sin(az)).normalize();
  }
  await progress(0.95, '编译着色器……');
  renderer.compile(scene, camera);
  buildUI();
  await progress(1, '欢迎来到凡尔纳幻想王国');
}

// 图层 1：只被主相机看到，水面反射相机（图层 0）跳过；灯光保持在图层 0 以免着色器切换
function noReflect(root) { root.traverse((o) => { if (!o.isLight) o.layers.set(1); }); }

// ---------- 海鸥 ----------
function makeGulls() {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: 0xf2f2ee, roughness: 0.8, side: THREE.DoubleSide });
  const dark = new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.8, side: THREE.DoubleSide });
  for (let i = 0; i < 14; i++) {
    const b = new THREE.Group();
    b.add(U.mesh(new THREE.CapsuleGeometry(0.12, 0.45, 4, 8).rotateZ(Math.PI / 2), mat));
    const wings = [];
    for (const s of [1, -1]) {
      const w = new THREE.Group();
      const shape = new THREE.Shape(); shape.moveTo(0, 0); shape.lineTo(0.15, 0.95 * s); shape.lineTo(-0.25, 0.85 * s); shape.lineTo(-0.2, 0);
      const wm = new THREE.Mesh(new THREE.ShapeGeometry(shape), mat); wm.rotation.x = Math.PI / 2; w.add(wm);
      const tip = new THREE.Mesh(new THREE.ShapeGeometry(new THREE.Shape([new THREE.Vector2(0.12, 0.8 * s), new THREE.Vector2(0.15, 0.95 * s), new THREE.Vector2(-0.25, 0.85 * s), new THREE.Vector2(-0.2, 0.72 * s)])), dark); tip.rotation.x = Math.PI / 2; tip.position.y = 0.001; w.add(tip);
      b.add(w); wings.push(w);
    }
    b.userData = { wings, r: 40 + Math.random() * 60, h: 18 + Math.random() * 25, sp: 0.08 + Math.random() * 0.06, ph: Math.random() * 6.28, cx: -40 + Math.random() * 120, cz: 140 + Math.random() * 60 };
    b.scale.setScalar(1.4);
    g.add(b);
  }
  return g;
}

// ---------- 时间 / 光照 ----------
let lastEnvKey = '';
function applyTime(dtSec) {
  if (state.autoTime) state.tod = (state.tod + dtSec * 0.04) % 24;
  const tod = state.tod;
  const dayAngle = ((tod - 6) / 24) * Math.PI * 2;      // 6 点日出
  const elev = Math.sin(dayAngle) * THREE.MathUtils.degToRad(58);
  const az = Math.PI * 0.5 + ((tod - 6) / 12) * Math.PI;  // 东升西落
  const sunDir = V(Math.cos(elev) * Math.cos(az), Math.sin(elev), Math.cos(elev) * Math.sin(az));
  const night = 1 - THREE.MathUtils.smoothstep(THREE.MathUtils.radToDeg(elev), -5, 7);
  state.night = night;
  su.sunPosition.value.copy(sunDir);
  const golden = 1 - THREE.MathUtils.smoothstep(THREE.MathUtils.radToDeg(elev), 4, 28);

  // 太阳 / 月亮作为主光源
  const target = controls.target;
  const lightDir = night > 0.5 ? moonDir : sunDir;
  const snap = (v) => Math.round(v / 2) * 2;
  sun.target.position.set(snap(target.x), 0, snap(target.z));
  sun.position.copy(sun.target.position).addScaledVector(lightDir, 400);
  const dayI = THREE.MathUtils.smoothstep(THREE.MathUtils.radToDeg(elev), -2, 10);
  sun.intensity = dayI * 3.1 + night * 0.55;
  sun.color.setRGB(1, 0.86 + 0.14 * (1 - golden), 0.7 + 0.3 * (1 - golden)).lerp(new THREE.Color(0x9fb4ff), night);
  hemi.intensity = 0.25 + dayI * 0.45 + night * 0.2;
  hemi.color.set(0xcfe3ff).lerp(new THREE.Color(0x3a4a7a), night);
  hemi.groundColor.set(0x5b4a36).lerp(new THREE.Color(0x101018), night);
  renderer.toneMappingExposure = 0.6 + night * 0.25;
  // 雾色与天色
  const fogDay = new THREE.Color(0xa9bccb).lerp(new THREE.Color(0xe8b48a), golden * 0.6);
  scene.fog.color.copy(fogDay).lerp(new THREE.Color(0x0b1020), night);
  scene.fog.density = 0.00062 + golden * 0.0002 + night * 0.0005;
  stars.material.opacity = night;
  moon.position.copy(camera.position).addScaledVector(moonDir, 3200);
  moon.material.opacity = 0.25 + night * 0.75;
  clouds.children.forEach((c) => { c.material.color.setRGB(1, 0.92 - golden * 0.12, 0.85 - golden * 0.2).multiplyScalar(1 - night * 0.82); c.material.opacity = 0.85 - night * 0.45; });
  // 水面
  water.material.uniforms.sunDirection.value.copy(lightDir);
  water.material.uniforms.sunColor.value.set(night > 0.5 ? 0x8fa6d8 : 0xfff0d8);
  water.material.uniforms.waterColor.value.set(0x0d3a44).lerp(new THREE.Color(0x030a12), night);
  // 发光材质
  for (const g of M._nightGlow) g.mat.emissiveIntensity = THREE.MathUtils.lerp(g.day, g.night, night);
  // 夜灯（为避免反复编译着色器，以 0.5 为阈值切换可见性）
  const lit = night > 0.35;
  for (const { l, i } of nightLights) { l.visible = lit; l.intensity = i * THREE.MathUtils.smoothstep(night, 0.35, 0.8); }
  if (lightPools) { lightPools.material.opacity = night * 0.42; lightPools.visible = night > 0.02; }
  bloom.strength = 0.22 + night * 0.75;
  bloom.threshold = 0.92 - night * 0.2;
  // 环境贴图（量化后才重建）
  const key = `${Math.round(THREE.MathUtils.radToDeg(elev) / 2)}`;
  if (key !== lastEnvKey) {
    lastEnvKey = key;
    scene.remove(sky); envScene.add(sky);
    const old = envRT; envRT = pmrem.fromScene(envScene, 0.02);
    envScene.remove(sky); scene.add(sky);
    scene.environment = envRT.texture;
    if (old) old.dispose();
  }
  scene.environmentIntensity = 0.35 + dayI * 0.65 + night * 0.25;
  // UI 指示
  const hh = Math.floor(tod), mm = Math.floor((tod - hh) * 60);
  const lbl = $('#time-label'); if (lbl) lbl.textContent = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
  const sl = $('#time-slider'); if (sl && document.activeElement !== sl) sl.value = tod;
}

// ---------- 相机动画 ----------
let fly = null;
function worldFocus(a) {
  a.group.updateMatrixWorld(true);
  const f = typeof a.focus === 'function' ? a.focus() : a.focus;
  if (!f) { const p = a.group.getWorldPosition(V()); return { pos: p.clone().add(V(45, 28, 45)), target: p.clone().add(V(0, 8, 0)) }; }
  return { pos: V(...f.pos).applyMatrix4(a.group.matrixWorld), target: V(...f.target).applyMatrix4(a.group.matrixWorld) };
}
function flyTo(pos, target, dur = 2.6, then = null) {
  fly = { p0: camera.position.clone(), t0: controls.target.clone(), p1: pos.clone(), t1: target.clone(), time: 0, dur, then };
}
function goTo(id) {
  const a = attractions[id]; if (!a) return;
  exitRide();
  state.focusId = id;
  const f = worldFocus(a);
  const moving = !!(a.L.flying || a.L.moving || id === 'elephant');
  state.follow = null;
  flyTo(f.pos, f.target, 2.8, () => { if (moving) state.follow = { id, last: worldFocus(a).target.clone() }; });
  showInfo(id);
  document.querySelectorAll('.spot').forEach((el) => el.classList.toggle('active', el.dataset.id === id));
}

// ---------- 乘坐模式 ----------
function enterRide(id) {
  const a = attractions[id]; if (!a) return;
  state.tour = false; updateTourBtn();
  state.ride = id; state.follow = null; fly = null;
  controls.enabled = false;
  document.body.classList.add('riding');
  const rideName = { elephant: '正在骑乘机械巨象', albatross: '正在乘坐信天翁号', train: '正在乘坐环球蒸汽火车' }[id];
  $('#ride-hint').textContent = rideName + ' · 拖动鼠标环顾 · Esc 退出';
  showInfo(id);
}
function exitRide() {
  if (!state.ride) return;
  state.ride = null; controls.enabled = true; document.body.classList.remove('riding');
  rideLook.yaw = 0; rideLook.pitch = 0;
}
const rideLook = { yaw: 0, pitch: 0, drag: false, x: 0, y: 0 };
renderer.domElement.addEventListener('pointerdown', (e) => { if (state.ride) { rideLook.drag = true; rideLook.x = e.clientX; rideLook.y = e.clientY; } });
window.addEventListener('pointerup', () => (rideLook.drag = false));
window.addEventListener('pointermove', (e) => {
  if (!state.ride || !rideLook.drag) return;
  rideLook.yaw -= (e.clientX - rideLook.x) * 0.004; rideLook.pitch -= (e.clientY - rideLook.y) * 0.003;
  rideLook.pitch = Math.max(-1.0, Math.min(0.8, rideLook.pitch)); rideLook.x = e.clientX; rideLook.y = e.clientY;
});
function updateRide() {
  const a = attractions[state.ride]; if (!a) return exitRide();
  let eye, look;
  if (a.rideAnchor) {
    eye = a.rideAnchor.getWorldPosition(V()); look = a.rideLook.getWorldPosition(V());
    // 空中乘坐：视线偏向乐园中心
    if (state.ride === 'albatross') { const fwd = look.clone().sub(eye).normalize(); const toC = V(0, 0, 10).sub(eye).normalize(); look = eye.clone().add(fwd.lerp(toC, 0.55).normalize()); }
  }
  else {
    a.group.updateMatrixWorld(true);
    const ra = a.ride || { eye: [6, 3.2, 0], look: [60, -12, 0] };
    eye = V(...ra.eye).applyMatrix4(a.group.matrixWorld); look = V(...ra.look).applyMatrix4(a.group.matrixWorld);
  }
  const dir = look.clone().sub(eye).normalize();
  const yawQ = new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), rideLook.yaw);
  dir.applyQuaternion(yawQ);
  const right = V().crossVectors(dir, V(0, 1, 0)).normalize();
  dir.applyQuaternion(new THREE.Quaternion().setFromAxisAngle(right, rideLook.pitch));
  camera.position.copy(eye);
  camera.lookAt(eye.clone().add(dir));
  controls.target.copy(eye.clone().addScaledVector(dir, 10));
}

// ---------- 漫游导览 ----------
const TOUR = ['elephant', 'carousel', 'train', 'nautilus', 'lighthouse', 'columbiad', 'galerie', 'volcano', 'albatross', 'gate', 'balloon'];
function updateTourBtn() { const b = $('#btn-tour'); if (b) b.classList.toggle('on', state.tour); }

// ---------- UI ----------
function buildUI() {
  const list = $('#spots');
  const ids = Object.keys(GUIDE).filter((id) => attractions[id]);
  for (const id of ids) {
    const g = GUIDE[id];
    const el = document.createElement('button');
    el.className = 'spot'; el.dataset.id = id;
    el.innerHTML = `<span class="no">${g.no}</span><span class="t"><b>${g.title}</b><i>${g.fr}</i></span>`;
    el.onclick = () => { state.tour = false; updateTourBtn(); goTo(id); };
    list.appendChild(el);
  }
  // 漂浮标签
  const labels = $('#labels');
  for (const id of ids) {
    const el = document.createElement('div'); el.className = 'label'; el.dataset.id = id;
    el.innerHTML = `<span>${GUIDE[id].no}</span>${GUIDE[id].title}`;
    el.onclick = () => goTo(id);
    labels.appendChild(el);
    attractions[id].labelEl = el;
  }
  $('#time-slider').addEventListener('input', (e) => { state.tod = parseFloat(e.target.value); state.autoTime = false; $('#btn-auto').classList.remove('on'); });
  $('#btn-day').onclick = () => { state.tod = 11.5; };
  $('#btn-dusk').onclick = () => { state.tod = 18.35; };
  $('#btn-night').onclick = () => { state.tod = 22.5; };
  $('#btn-auto').onclick = (e) => { state.autoTime = !state.autoTime; e.currentTarget.classList.toggle('on', state.autoTime); };
  $('#btn-tour').onclick = () => { state.tour = !state.tour; state.tourNext = 0; updateTourBtn(); if (!state.tour) state.follow = null; };
  $('#btn-ride').onclick = () => (state.ride === 'elephant' ? exitRide() : enterRide('elephant'));
  $('#btn-fly').onclick = () => (state.ride === 'albatross' ? exitRide() : enterRide('albatross'));
  $('#btn-train').onclick = () => (state.ride === 'train' ? exitRide() : enterRide('train'));
  $('#btn-overview').onclick = () => { exitRide(); state.follow = null; state.focusId = null; hideInfo(); flyTo(V(95, 55, 150), V(0, 6, 10)); };
  $('#info-close').onclick = hideInfo;
  $('#btn-labels').onclick = (e) => { document.body.classList.toggle('no-labels'); e.currentTarget.classList.toggle('on'); };
  $('#btn-panel').onclick = () => document.body.classList.toggle('panel-collapsed');
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { exitRide(); state.tour = false; updateTourBtn(); }
    if (e.key === 'n' || e.key === 'N') state.tod = state.night > 0.5 ? 11.5 : 22.5;
  });
  renderer.domElement.addEventListener('pointerdown', () => { if (fly && !state.tour) fly = null; if (!state.ride) state.follow = state.follow; });
  controls.addEventListener('start', () => { if (state.tour) { state.tour = false; updateTourBtn(); } fly = null; });
  if (!attractions.albatross) $('#btn-fly').style.display = 'none';
  if (!attractions.train) $('#btn-train').style.display = 'none';
}
function showInfo(id) {
  const g = GUIDE[id]; if (!g) return;
  $('#info-no').textContent = g.no; $('#info-title').textContent = g.title; $('#info-fr').textContent = g.fr;
  $('#info-book').textContent = g.book; $('#info-text').textContent = g.text; $('#info-tips').textContent = g.tips || '';
  $('#info').classList.add('show');
}
function hideInfo() { $('#info').classList.remove('show'); }

const _v = V();
function updateLabels() {
  const w = window.innerWidth, h = window.innerHeight;
  for (const a of Object.values(attractions)) {
    const el = a.labelEl; if (!el) continue;
    a.group.getWorldPosition(_v);
    const ly = a.L.flying ? 12 : a.id === 'volcano' ? 62 : a.id === 'elephant' ? 0 : a.id === 'lighthouse' ? 40 : a.id === 'columbiad' ? 34 : 24;
    if (a.walker) { a.walker.getWorldPosition(_v); _v.y += a.labelY || 19; } else _v.y += ly;
    const dist = _v.distanceTo(camera.position);
    _v.project(camera);
    const vis = _v.z < 1 && Math.abs(_v.x) < 1.05 && Math.abs(_v.y) < 1.05 && dist > 30 && !state.ride;
    el.style.display = vis ? 'block' : 'none';
    if (vis) { el.style.transform = `translate(${(_v.x * 0.5 + 0.5) * w}px, ${(-_v.y * 0.5 + 0.5) * h}px) translate(-50%, -100%)`; el.style.opacity = Math.min(1, (dist - 30) / 40); }
  }
}

// ---------- 主循环 ----------
const clock = new THREE.Clock();
let elapsed = 0;
const ease = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
function tick() {
  renderer.info.reset();
  const dt = Math.min(clock.getDelta(), 0.05);
  elapsed += dt;
  const t = elapsed;
  const env = { night: state.night, camera };

  // 飞行器航线
  const alb = attractions.albatross;
  if (alb) {
    const R = 150, w = 0.018, a0 = t * w;
    alb.group.position.set(Math.cos(a0) * R + 10, 78 + Math.sin(t * 0.13) * 5, Math.sin(a0) * R * 0.85 + 10);
    const tx = -Math.sin(a0) * R, tz = Math.cos(a0) * R * 0.85;
    alb.group.rotation.set(0, Math.atan2(-tz, tx), 0);
    alb.group.rotateX(-0.06);
  }
  const bal = attractions.balloon;
  if (bal) {
    const a = t * 0.012;
    bal.group.position.set(Math.sin(a) * 110 + 20, 46 + Math.sin(t * 0.07) * 8, Math.sin(a * 2) * 55 + 20);
  }
  for (const a of Object.values(attractions)) { try { a.update && a.update(t, dt, env); } catch (e) { console.error(a.id, e); a.update = null; } }
  crowd && crowd.update(t, dt);
  if (gulls) gulls.children.forEach((b) => {
    const u = b.userData; const a = t * u.sp + u.ph;
    b.position.set(u.cx + Math.cos(a) * u.r, WATER + u.h + Math.sin(t * 0.5 + u.ph) * 3, u.cz + Math.sin(a) * u.r * 0.6);
    b.rotation.y = -a + Math.PI; b.rotation.z = 0.25;
    const f = Math.sin(t * 7 + u.ph * 5) * 0.5; u.wings[0].rotation.x = f; u.wings[1].rotation.x = -f;
  });
  water.material.uniforms.time.value += dt * 0.6;

  // 导览
  if (state.tour && !state.ride) {
    if (t > state.tourNext) {
      let id = TOUR[state.tourIdx % TOUR.length]; state.tourIdx++;
      let guard = 0; while (!attractions[id] && guard++ < 20) { id = TOUR[state.tourIdx % TOUR.length]; state.tourIdx++; }
      goTo(id); state.tourNext = t + 13;
    }
  }
  // 相机
  if (state.ride) updateRide();
  else if (fly) {
    fly.time += dt; const k = ease(Math.min(1, fly.time / fly.dur));
    // 弧形飞行：中途抬高
    const lift = Math.sin(k * Math.PI) * Math.min(60, fly.p0.distanceTo(fly.p1) * 0.18);
    camera.position.lerpVectors(fly.p0, fly.p1, k).y += lift;
    controls.target.lerpVectors(fly.t0, fly.t1, k);
    if (fly.time >= fly.dur) { const th = fly.then; fly = null; th && th(); }
    controls.update();
  } else {
    if (state.follow) {
      const a = attractions[state.follow.id];
      const nt = worldFocus(a).target;
      const d = nt.clone().sub(controls.target);
      camera.position.add(d); controls.target.add(d);
    }
    controls.update();
  }
  if (!state.ride && world) {
    const gy = Math.max(WATER, world.heightAt(camera.position.x, camera.position.z)) + 1.6;
    if (camera.position.y < gy) camera.position.y = gy;
  }
  applyTime(dt);
  updateLabels();
  composer.render(dt);
  requestAnimationFrame(tick);
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight); composer.setSize(window.innerWidth, window.innerHeight);
});

build().then(() => {
  $('#loader').classList.add('done');
  setTimeout(() => $('#loader').remove(), 1400);
  clock.getDelta();
  tick();
  // 开场：从高空俯冲到广场
  camera.position.set(260, 160, 330);
  flyTo(V(95, 48, 140), V(0, 6, 10), 5);
}).catch((e) => { console.error(e); loadMsg.textContent = '加载失败：' + e.message; });

// 调试入口
window.__park = {
  scene, camera, controls, attractions, state, goTo, enterRide, renderer,
  view(p, t) { fly = null; state.follow = null; camera.position.set(...p); controls.target.set(...t); controls.update(); },
  skip(s) { elapsed += s; },
  setTime(s) { elapsed = s; },
  stats() { const i = renderer.info; return { calls: i.render.calls, tris: i.render.triangles, geos: i.memory.geometries, tex: i.memory.textures }; },
};

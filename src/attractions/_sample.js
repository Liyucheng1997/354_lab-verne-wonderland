// 景点模块模板（示例，不在乐园中使用）
// 约定：
//   export function createXxx(M, ctx) → { group, update(t, dt, env), focus, footprint }
//   - 单位：米；Y 轴向上；模块原点 = 地面中心（y=0 为地面）
//   - M：共享材质库（见 src/materials.js 的 createMaterials）
//   - ctx.addNightLight(light, nightIntensity)：注册夜间才点亮的灯（每个模块最多 2 盏 PointLight/SpotLight）
//   - env.night ∈ [0,1]，env.camera 当前相机
//   - focus：{ pos:[x,y,z], target:[x,y,z] } 相机参观视角（模块局部坐标）
//   - footprint：占地半径（主程序据此压平地形）
import * as THREE from 'three';
import * as U from '../util.js';

export function createSample(M, ctx) {
  const group = new THREE.Group();
  group.add(U.cyl(2, 2.2, 0.5, M.stone, 0, 0.25, 0));
  const g = U.gear({ radius: 1.5, teeth: 20, spokes: 6 }, M.brass);
  g.position.y = 2.5; group.add(g);
  const lamp = new THREE.PointLight(0xffb060, 0, 20, 2); lamp.position.set(0, 4, 0); group.add(lamp);
  ctx.addNightLight(lamp, 30);
  return {
    group,
    focus: { pos: [8, 5, 8], target: [0, 2, 0] },
    footprint: 3,
    update(t, dt, env) { g.rotation.z = t * 0.5; },
  };
}

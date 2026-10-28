import type { CaseParams, RetainerParams } from './params';
import type { Box3 } from './holes';
import { WALL_AXES } from './holes';

// 抜け止めの寸法計算（形状ライブラリに依存しない部分）。入力検証と形状生成の両方から使う。
// 高さ z は床面（底面の上側）基準。壁に沿った位置 u は穴と同じく外から見て右が＋。

type WallFace = 'front' | 'back' | 'left' | 'right';

/** 下側の斜面が壁に沿って下がる量（突き出し p、壁となす角 angle） */
export function undersideDrop(protrusion: number, angleDeg: number): number {
  return protrusion / Math.tan((angleDeg * Math.PI) / 180);
}

/** 内側の壁の長さ（壁に沿った方向の内寸） */
export function innerWallLength(p: CaseParams, face: WallFace): number {
  return face === 'front' || face === 'back' ? p.body.innerWidth : p.body.innerDepth;
}

/** 壁に沿った範囲 [uMin, uMax] */
export function retainerSpan(p: CaseParams, r: RetainerParams): { uMin: number; uMax: number } {
  if (r.type === 'crushRib') {
    const half = ((Math.max(Math.floor(r.ribCount), 1) - 1) / 2) * r.ribPitch + r.ribBase / 2;
    return { uMin: r.u - half, uMax: r.u + half };
  }
  if (r.fullLength && r.face !== 'all') {
    const half = innerWallLength(p, r.face) / 2;
    return { uMin: -half, uMax: half };
  }
  return { uMin: r.u - r.length / 2, uMax: r.u + r.length / 2 };
}

/** 床面基準の高さの範囲 [zMin, zMax] */
export function retainerZRange(r: RetainerParams): { zMin: number; zMax: number } {
  switch (r.type) {
    case 'crushRib':
      return { zMin: r.z, zMax: r.z + r.ribLength };
    case 'stopper':
      return {
        zMin: r.z - undersideDrop(r.protrusion, r.undersideAngle),
        zMax: r.z + undersideDrop(r.protrusion, r.topAngle),
      };
    case 'shelf':
      return { zMin: r.z - r.shelfThickness - undersideDrop(r.protrusion, r.undersideAngle), zMax: r.z };
  }
}

/** crushRib の各リブの中心 u */
export function ribCenters(r: RetainerParams): number[] {
  const n = Math.max(Math.floor(r.ribCount), 1);
  return Array.from({ length: n }, (_, i) => r.u + (i - (n - 1) / 2) * r.ribPitch);
}

/** 壁の内面から突き出す部分が占めるワールド座標の箱（全周の棚は対象外） */
export function retainerBox(p: CaseParams, r: RetainerParams, uMin: number, uMax: number): Box3 | null {
  if (r.face === 'all') return null;
  const { right, normal } = WALL_AXES[r.face];
  const half = normal[0] !== 0 ? p.body.innerWidth / 2 : p.body.innerDepth / 2;
  // 内面 half から内側へ protrusion まで（法線は外向きなので内側は half - protrusion）
  const n0 = half - r.protrusion;
  const n1 = half;
  const pts = [
    [uMin, n0],
    [uMin, n1],
    [uMax, n0],
    [uMax, n1],
  ].map(([u, n]) => [right[0] * u + normal[0] * n, right[1] * u + normal[1] * n]);
  const { zMin, zMax } = retainerZRange(r);
  const tb = p.body.bottomThickness;
  return {
    min: [Math.min(...pts.map((q) => q[0])), Math.min(...pts.map((q) => q[1])), tb + zMin],
    max: [Math.max(...pts.map((q) => q[0])), Math.max(...pts.map((q) => q[1])), tb + zMax],
  };
}

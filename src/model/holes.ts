import type { CaseParams, HoleFace, HoleParams } from './params';
import { deriveDims, deriveLidDims } from './derive';

// 穴の寸法計算（形状ライブラリに依存しない部分）。入力検証と形状生成の両方から使う。

export const isWallFace = (f: HoleFace) => f === 'front' || f === 'back' || f === 'left' || f === 'right';

/** 回転を無視する形状 */
export const ignoresRotation = (h: HoleParams) => h.shape === 'circle' || h.shape === 'teardrop';
/** height を使う形状 */
export const usesHeight = (h: HoleParams) => h.shape === 'rect' || h.shape === 'roundRect' || h.shape === 'slot';

/** 寸法補正後の幅・高さ */
export function compensatedSize(h: HoleParams, compensation: number): { w: number; h: number } {
  return { w: h.width + compensation, h: h.height + compensation };
}

export interface Extent {
  uMin: number;
  uMax: number;
  vMin: number;
  vMax: number;
}

/** 穴 1 個の、中心からの広がり（面内座標、回転・寸法補正込み） */
export function holeExtent(hole: HoleParams, compensation: number): Extent {
  const { w, h } = compensatedSize(hole, compensation);
  const r = w / 2;
  switch (hole.shape) {
    case 'circle':
      return { uMin: -r, uMax: r, vMin: -r, vMax: r };
    case 'teardrop':
      // 上側は 45° の接線が交わる点まで尖る
      return { uMin: -r, uMax: r, vMin: -r, vMax: r * Math.SQRT2 };
  }
  let pts: [number, number][];
  if (hole.shape === 'hexagon') {
    // 対辺 w の正六角形。頂点は左右（平らな辺が上下）
    const R = w / Math.sqrt(3);
    pts = Array.from({ length: 6 }, (_, i) => [R * Math.cos((i * Math.PI) / 3), R * Math.sin((i * Math.PI) / 3)]);
  } else {
    pts = [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]];
  }
  const a = (hole.rotation * Math.PI) / 180;
  const rot = pts.map(([x, y]) => [x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a)]);
  return {
    uMin: Math.min(...rot.map((p) => p[0])),
    uMax: Math.max(...rot.map((p) => p[0])),
    vMin: Math.min(...rot.map((p) => p[1])),
    vMax: Math.max(...rot.map((p) => p[1])),
  };
}

/** 配列の各穴の中心（面内座標） */
export function holeCenters(hole: HoleParams): [number, number][] {
  const { cols, rows, pitchU, pitchV } = hole.pattern;
  const nc = Math.max(Math.floor(cols), 1);
  const nr = Math.max(Math.floor(rows), 1);
  const out: [number, number][] = [];
  for (let j = 0; j < nr; j++) {
    for (let i = 0; i < nc; i++) {
      out.push([hole.u + (i - (nc - 1) / 2) * pitchU, hole.v + (j - (nr - 1) / 2) * pitchV]);
    }
  }
  return out;
}

/** 配列全体の広がり（面内座標） */
export function patternExtent(hole: HoleParams, compensation: number): Extent {
  const e = holeExtent(hole, compensation);
  const centers = holeCenters(hole);
  return {
    uMin: Math.min(...centers.map((c) => c[0])) + e.uMin,
    uMax: Math.max(...centers.map((c) => c[0])) + e.uMax,
    vMin: Math.min(...centers.map((c) => c[1])) + e.vMin,
    vMax: Math.max(...centers.map((c) => c[1])) + e.vMax,
  };
}

export interface Box3 {
  min: [number, number, number];
  max: [number, number, number];
}

/** 壁の面の、外側から見た右方向（ワールド XY）と外向き法線 */
export const WALL_AXES: Record<'front' | 'back' | 'left' | 'right', { right: [number, number]; normal: [number, number] }> = {
  front: { right: [1, 0], normal: [0, -1] },
  back: { right: [-1, 0], normal: [0, 1] },
  left: { right: [0, -1], normal: [-1, 0] },
  right: { right: [0, 1], normal: [1, 0] },
};

/** 面内の範囲を、穴が貫通する部分のワールド座標の箱に変換する */
export function faceBox(p: CaseParams, face: HoleFace, e: Extent): Box3 {
  const d = deriveDims(p);
  const t = p.body.wallThickness;
  if (face === 'bottom') {
    return { min: [e.uMin, e.vMin, 0], max: [e.uMax, e.vMax, p.body.bottomThickness] };
  }
  if (face === 'lid') {
    const ld = deriveLidDims(p);
    return { min: [e.uMin, e.vMin, ld.zLid], max: [e.uMax, e.vMax, ld.zTop] };
  }
  const { right, normal } = WALL_AXES[face];
  const half = normal[0] !== 0 ? d.outerWidth / 2 : d.outerDepth / 2;
  // 壁の厚み方向：外面 half から内面 half - t まで
  const n0 = half - t;
  const n1 = half;
  const xs = [
    right[0] * e.uMin + normal[0] * n0,
    right[0] * e.uMax + normal[0] * n1,
    right[0] * e.uMin + normal[0] * n1,
    right[0] * e.uMax + normal[0] * n0,
  ];
  const ys = [
    right[1] * e.uMin + normal[1] * n0,
    right[1] * e.uMax + normal[1] * n1,
    right[1] * e.uMin + normal[1] * n1,
    right[1] * e.uMax + normal[1] * n0,
  ];
  return {
    min: [Math.min(...xs), Math.min(...ys), e.vMin],
    max: [Math.max(...xs), Math.max(...ys), e.vMax],
  };
}

export function boxesOverlap(a: Box3, b: Box3, eps = 1e-6): boolean {
  return [0, 1, 2].every((k) => a.min[k] < b.max[k] - eps && b.min[k] < a.max[k] - eps);
}

import type { CrossSection, Manifold, ManifoldToplevel } from 'manifold-3d';
import type { CaseParams, HoleParams } from '../params';
import { deriveDims, deriveLidDims } from '../derive';
import { compensatedSize, holeCenters, ignoresRotation } from '../holes';
import { roundedRect } from './profiles';
import type { Scope } from './scope';

// 穴の形状。面内座標 (u, v) の 2D 形状を作り、面の厚み方向に押し出して差し引く。

/** 穴を内側へ抜く余裕。仕切りなど内側の形状を削りすぎないよう、ごく小さくする */
const INNER_MARGIN = 0.05;
/** 外側へ抜く余裕 */
const OUTER_MARGIN = 1;

/** 穴 1 個の 2D 形状（中心が原点、寸法補正・回転込み） */
export function holeProfile(wasm: ManifoldToplevel, scope: Scope, p: CaseParams, hole: HoleParams): CrossSection {
  const { CrossSection } = wasm;
  const segs = p.print.circularSegments;
  const { w, h } = compensatedSize(hole, p.print.holeCompensation);
  const r = w / 2;
  let shape: CrossSection;
  switch (hole.shape) {
    case 'circle':
      shape = scope.keep(CrossSection.circle(r, segs));
      break;
    case 'teardrop': {
      // 円と、45° の接点 2 つ + 頂点の三角形の凸包。頂点は中心から r√2 上
      const t = r / Math.SQRT2;
      const tri = scope.keep(CrossSection.ofPolygons([[[-t, t], [t, t], [0, r * Math.SQRT2]]]));
      shape = scope.keep(CrossSection.hull([scope.keep(CrossSection.circle(r, segs)), tri]));
      break;
    }
    case 'hexagon':
      shape = scope.keep(CrossSection.circle(w / Math.sqrt(3), 6));
      break;
    case 'rect':
      shape = roundedRect(wasm, scope, w, h, 0, segs);
      break;
    case 'roundRect':
      shape = roundedRect(wasm, scope, w, h, Math.max(hole.cornerRadius, 0), segs);
      break;
    case 'slot':
      shape = roundedRect(wasm, scope, w, h, Math.min(w, h) / 2, segs);
      break;
  }
  return ignoresRotation(hole) || hole.rotation === 0 ? shape : scope.keep(shape.rotate(hole.rotation));
}

/** 配列を含む穴の 2D 形状（面内座標） */
function patternProfile(wasm: ManifoldToplevel, scope: Scope, p: CaseParams, hole: HoleParams): CrossSection {
  const single = holeProfile(wasm, scope, p, hole);
  const copies = holeCenters(hole).map(([u, v]) => scope.keep(single.translate(u, v)));
  return copies.length === 1 ? copies[0] : scope.keep(wasm.CrossSection.union(copies));
}

/** 差し引く立体（ワールド座標） */
function holeCutter(wasm: ManifoldToplevel, scope: Scope, p: CaseParams, hole: HoleParams): Manifold {
  const profile = patternProfile(wasm, scope, p, hole);
  const b = p.body;

  if (hole.face === 'bottom') {
    const depth = OUTER_MARGIN + b.bottomThickness + INNER_MARGIN;
    return scope.keep(scope.keep(profile.extrude(depth)).translate(0, 0, -OUTER_MARGIN));
  }
  if (hole.face === 'lid') {
    const ld = deriveLidDims(p);
    const depth = ld.zTop - ld.zLid + 2 * OUTER_MARGIN;
    return scope.keep(scope.keep(profile.extrude(depth)).translate(0, 0, ld.zLid - OUTER_MARGIN));
  }

  // 壁：まず「手前（-Y）の壁」として作る。押し出し方向 w は外向き
  const d = deriveDims(p);
  const depth = b.wallThickness + INNER_MARGIN + OUTER_MARGIN;
  const slab = scope.keep(scope.keep(profile.extrude(depth)).translate(0, 0, -(b.wallThickness + INNER_MARGIN)));
  // X 軸回りに +90°：(u, v, w) → (u, -w, v)。u は +X、v は Z、外向き w は -Y
  const front = scope.keep(slab.rotate(90, 0, 0));
  const half = hole.face === 'front' || hole.face === 'back' ? d.outerDepth / 2 : d.outerWidth / 2;
  const placed = scope.keep(front.translate(0, -half, 0));
  const angle = { front: 0, back: 180, left: -90, right: 90 }[hole.face as 'front' | 'back' | 'left' | 'right'];
  return angle === 0 ? placed : scope.keep(placed.rotate(0, 0, angle));
}

export interface HoleCutters {
  /** 本体から差し引く（壁・底） */
  body: Manifold | null;
  /** フタから差し引く */
  lid: Manifold | null;
}

export function buildHoleCutters(wasm: ManifoldToplevel, scope: Scope, p: CaseParams): HoleCutters {
  const bodyCuts: Manifold[] = [];
  const lidCuts: Manifold[] = [];
  for (const hole of p.holes) {
    if (hole.face === 'lid') {
      if (p.lid.enabled) lidCuts.push(holeCutter(wasm, scope, p, hole));
    } else {
      bodyCuts.push(holeCutter(wasm, scope, p, hole));
    }
  }
  const union = (ms: Manifold[]) =>
    ms.length === 0 ? null : ms.length === 1 ? ms[0] : scope.keep(wasm.Manifold.union(ms));
  return { body: union(bodyCuts), lid: union(lidCuts) };
}

import type { CrossSection, Manifold, ManifoldToplevel } from 'manifold-3d';
import type { CaseParams } from '../params';
import { deriveLayerDims } from '../derive';
import { roundedRect } from './profiles';
import { perimeterLedge } from './retainers';
import type { Scope } from './scope';

// 中板（高さ方向の仕切り）。受けの段は本体と一体、中板は別部品。

/** 本体に足す受けの段（下側 45° でサポート不要） */
export function buildLayerLedge(wasm: ManifoldToplevel, scope: Scope, p: CaseParams): Manifold {
  const l = p.layer;
  return perimeterLedge(wasm, scope, p, p.body.bottomThickness + l.height, l.ledgeDepth, l.ledgeThickness, 45);
}

function fingerHole(wasm: ManifoldToplevel, scope: Scope, p: CaseParams): CrossSection | null {
  const l = p.layer;
  const segs = p.print.circularSegments;
  if (l.fingerHole === 'circle') return scope.keep(wasm.CrossSection.circle(l.fingerHoleSize / 2, segs));
  if (l.fingerHole === 'slot') {
    return roundedRect(wasm, scope, l.fingerHoleSize, l.fingerHoleWidth, Math.min(l.fingerHoleSize, l.fingerHoleWidth) / 2, segs);
  }
  return null;
}

/** 中板（組み立てた位置）。内側の輪郭を隙間ぶん縮めた形で、中央に指穴 */
export function buildLayerPlate(wasm: ManifoldToplevel, scope: Scope, p: CaseParams): Manifold {
  const ld = deriveLayerDims(p);
  let outline = roundedRect(wasm, scope, ld.plateWidth, ld.plateDepth, ld.plateCornerRadius, p.print.circularSegments);
  const hole = fingerHole(wasm, scope, p);
  if (hole) outline = scope.keep(outline.subtract(hole));
  return scope.keep(scope.keep(outline.extrude(ld.zTop - ld.zBottom)).translate(0, 0, ld.zBottom));
}

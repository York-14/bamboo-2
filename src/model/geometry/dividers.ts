import type { CrossSection, Manifold, ManifoldToplevel } from 'manifold-3d';
import type { CaseParams } from '../params';
import { deriveDividerLayout, type DividerPlacement } from '../derive';
import type { Scope } from './scope';

// 固定仕切り。ワールド座標で作り、本体に足し合わせる。
// 板は壁の中ほどと底面の中ほどまで食い込ませて一体化し、本体の外形（凸包）で切り取って外に出ないようにする。

/**
 * 板の面内座標 (u, v) の 2D 形状を、厚み方向に押し出して配置する。
 * u は板の延びる方向、v は Z。axis = 'x' なら板の法線は X。
 */
function placeInPlane(
  scope: Scope,
  shape: CrossSection,
  axis: 'x' | 'y',
  center: number,
  thickness: number,
): Manifold {
  // extrude は Z 方向。X 軸回りに +90° 回すと (u, v, w) → (u, -w, v) で、法線 Y の板になる
  const slab = scope.keep(shape.extrude(thickness, 0, 0, [1, 1], true));
  const normalY = scope.keep(slab.rotate(90, 0, 0));
  if (axis === 'y') return scope.keep(normalY.translate(0, center, 0));
  // さらに Z 軸回りに +90° 回すと (u, -w, v) → (w, u, v) で、法線 X の板になる
  const normalX = scope.keep(normalY.rotate(0, 0, 90));
  return scope.keep(normalX.translate(center, 0, 0));
}

/** 切り欠きの 2D 形状（上端 vTop から下へ depth、幅 width、u = 0 中心）。上端より 1 mm 上まで伸ばす */
function notchShape(
  wasm: ManifoldToplevel,
  scope: Scope,
  p: CaseParams,
  vTop: number,
): CrossSection | null {
  const { notchShape: kind, notchWidth: w, notchDepth: d } = p.dividers;
  if (kind === 'none' || w <= 0 || d <= 0) return null;
  const { CrossSection } = wasm;
  const above = scope.keep(CrossSection.square([w, 1]).translate(-w / 2, vTop));
  if (kind === 'v') {
    const tri = scope.keep(CrossSection.ofPolygons([[[-w / 2, vTop], [0, vTop - d], [w / 2, vTop]]]));
    return scope.keep(tri.add(above));
  }
  // U 字：底が半円、その上は垂直
  const r = w / 2;
  const cy = vTop - d + r;
  const circle = scope.keep(scope.keep(CrossSection.circle(r, p.print.circularSegments)).translate(0, cy));
  const rect = scope.keep(CrossSection.square([w, Math.max(vTop + 1 - cy, 0.01)]).translate(-r, cy));
  return scope.keep(CrossSection.union([circle, rect, above]));
}

function buildPlate(
  wasm: ManifoldToplevel,
  scope: Scope,
  p: CaseParams,
  pl: DividerPlacement,
  zTop: number,
): Manifold {
  const b = p.body;
  const t = p.dividers.thickness;
  const half = (pl.axis === 'x' ? b.innerDepth : b.innerWidth) / 2;
  // 壁の中ほど・底面の中ほどまで伸ばして本体と一体化する
  const reach = half + b.wallThickness / 2;
  const zBottom = b.bottomThickness / 2;
  let shape = scope.keep(wasm.CrossSection.square([2 * reach, zTop - zBottom]).translate(-reach, zBottom));

  const notch = notchShape(wasm, scope, p, zTop);
  if (notch) {
    const notches = pl.segments.map((s) => scope.keep(notch.translate((s.from + s.to) / 2, 0)));
    shape = scope.keep(shape.subtract(scope.keep(wasm.CrossSection.union(notches))));
  }
  return placeInPlane(scope, shape, pl.axis, pl.center, t);
}

/** 仕切りをすべて作る。なければ null。hull は本体の外形（はみ出し防止の切り取りに使う） */
export function buildDividers(
  wasm: ManifoldToplevel,
  scope: Scope,
  p: CaseParams,
  hull: Manifold,
): Manifold | null {
  const layout = deriveDividerLayout(p);
  if (layout.placements.length === 0) return null;
  const plates = layout.placements.map((pl) => buildPlate(wasm, scope, p, pl, layout.zTop));
  const all = scope.keep(wasm.Manifold.union(plates));
  return scope.keep(all.intersect(hull));
}

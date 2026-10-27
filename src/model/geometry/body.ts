import type { Manifold, ManifoldToplevel } from 'manifold-3d';
import type { CaseParams } from '../params';
import { deriveDims } from '../derive';
import { roundedRect } from './profiles';
import type { Scope } from './scope';

/**
 * ケース本体。原点は外形底面の中心、Z 上向き、開口部が上。
 * 外形（角丸長方形の押し出し）から内側の空間を差し引いて作る。
 */
export function buildBody(wasm: ManifoldToplevel, scope: Scope, p: CaseParams): Manifold {
  const { Manifold } = wasm;
  const b = p.body;
  const d = deriveDims(p);
  const segs = p.print.circularSegments;

  const outerProfile = roundedRect(wasm, scope, d.outerWidth, d.outerDepth, b.cornerRadius, segs);

  let outer: Manifold;
  const c = b.bottomChamfer;
  if (c > 0) {
    // 外形は平面で見て凸なので、面取り後の底面と本体上部の凸包で面取り形状になる
    const insetProfile = roundedRect(
      wasm, scope,
      d.outerWidth - 2 * c,
      d.outerDepth - 2 * c,
      Math.max(b.cornerRadius - c, 0),
      segs,
    );
    const foot = scope.keep(insetProfile.extrude(c));
    const upper = scope.keep(scope.keep(outerProfile.extrude(d.outerHeight - c)).translate(0, 0, c));
    outer = scope.keep(Manifold.hull([foot, upper]));
  } else {
    outer = scope.keep(outerProfile.extrude(d.outerHeight));
  }

  // 上面と同じ高さで差し引くと面が重なるので、空間は上に 1 mm はみ出させる
  const cavityProfile = roundedRect(wasm, scope, b.innerWidth, b.innerDepth, d.innerCornerRadius, segs);
  const cavity = scope.keep(
    scope.keep(cavityProfile.extrude(b.innerHeight + 1)).translate(0, 0, b.bottomThickness),
  );

  return scope.keep(outer.subtract(cavity));
}

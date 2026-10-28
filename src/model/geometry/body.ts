import type { CrossSection, Manifold, ManifoldToplevel } from 'manifold-3d';
import type { CaseParams } from '../params';
import { roundedRect } from './profiles';
import type { Scope } from './scope';

export interface BodyShell {
  shell: Manifold;
  /** 外形の平面形状（面取りなし）。フタの前リップを切り出すのに使う */
  outerProfile: CrossSection;
}

/**
 * ケース本体の外殻（フタ用の加工前）。
 * 原点は外形底面の中心、Z 上向き、開口部が上。length は X 方向、span は Y 方向の内寸。
 * 外形（角丸長方形の押し出し）から内側の空間を差し引いて作る。
 */
export function buildBodyShell(
  wasm: ManifoldToplevel,
  scope: Scope,
  p: CaseParams,
  length: number,
  span: number,
  outerHeight: number,
): BodyShell {
  const { Manifold } = wasm;
  const b = p.body;
  const segs = p.print.circularSegments;
  const outerX = length + 2 * b.wallThickness;
  const outerY = span + 2 * b.wallThickness;

  const outerProfile = roundedRect(wasm, scope, outerX, outerY, b.cornerRadius, segs);

  let outer: Manifold;
  const c = b.bottomChamfer;
  if (c > 0) {
    // 外形は平面で見て凸なので、面取り後の底面と本体上部の凸包で面取り形状になる
    const insetProfile = roundedRect(
      wasm, scope,
      outerX - 2 * c,
      outerY - 2 * c,
      Math.max(b.cornerRadius - c, 0),
      segs,
    );
    const foot = scope.keep(insetProfile.extrude(c));
    const upper = scope.keep(scope.keep(outerProfile.extrude(outerHeight - c)).translate(0, 0, c));
    outer = scope.keep(Manifold.hull([foot, upper]));
  } else {
    outer = scope.keep(outerProfile.extrude(outerHeight));
  }

  // 上面と同じ高さで差し引くと面が重なるので、空間は上に 1 mm はみ出させる
  const innerR = Math.max(b.cornerRadius - b.wallThickness, 0);
  const cavityProfile = roundedRect(wasm, scope, length, span, innerR, segs);
  const cavityHeight = outerHeight - b.bottomThickness + 1;
  const cavity = scope.keep(
    scope.keep(cavityProfile.extrude(cavityHeight)).translate(0, 0, b.bottomThickness),
  );

  return { shell: scope.keep(outer.subtract(cavity)), outerProfile };
}

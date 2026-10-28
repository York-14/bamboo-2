import type { CrossSection, Manifold, ManifoldToplevel } from 'manifold-3d';
import type { CaseParams } from '../params';
import { CLICK_DIMPLE_MARGIN, type LidDims } from '../derive';
import { roundedRect } from './profiles';
import type { Scope } from './scope';

// スライドフタの形状。すべて「差し込み側が -X」のフレーム座標で作る（derive.ts の LidDims を参照）。
//
// 断面（側面の壁、+Y 側）:
//
//        壁の内面        溝の外側
//   zTop ─┐ ......... ╱
//         │  フタ    ╱   ← 45° の面取り（高さ = 溝の深さ）
//         │ ........│
//   zLid ─┼─────────┘   ← 垂直部分（高さ = フタ厚 − 溝の深さ）
//   zCut ─┘ 溝の下面
//
// フタは下面が広く上面が狭いアリ形なので、上には抜けず、差し込み方向にだけスライドする。
// 差し込み側の壁は zCut で切り落とし、そこをフタの前リップが埋める。

/** フタまわりの演算で「十分大きい」とみなす寸法 */
function bigSize(ld: LidDims): number {
  return 2 * (ld.length + ld.span + ld.zTop) + 100;
}

/** 内側の空間を off だけ外側に広げた輪郭。角の丸みは溝の最深部（off = 溝の深さ）を基準にする */
function outlineAt(wasm: ManifoldToplevel, scope: Scope, p: CaseParams, ld: LidDims, off: number): CrossSection {
  const r = Math.max(ld.grooveCornerRadius - (p.lid.grooveDepth - off), 0);
  return roundedRect(wasm, scope, ld.length + 2 * off, ld.span + 2 * off, r, p.print.circularSegments);
}

function slab(scope: Scope, profile: CrossSection, z0: number, z1: number): Manifold {
  return scope.keep(scope.keep(profile.extrude(z1 - z0)).translate(0, 0, z0));
}

/** 断面がアリ形の板。下側 (zBottom〜zStraightTop) は wideOff、上端 zTop で narrowOff の輪郭になる */
function dovetailPlate(
  wasm: ManifoldToplevel,
  scope: Scope,
  p: CaseParams,
  ld: LidDims,
  wideOff: number,
  narrowOff: number,
  zBottom: number,
  zTop: number,
): Manifold {
  const zStraightTop = ld.zLid + ld.straightHeight;
  const wide = slab(scope, outlineAt(wasm, scope, p, ld, wideOff), zBottom, zStraightTop);
  const narrow = slab(scope, outlineAt(wasm, scope, p, ld, narrowOff), zBottom, zTop);
  // 平面形状は凸なので、凸包でそのまま 45° の面取りになる
  return scope.keep(wasm.Manifold.hull([wide, narrow]));
}

/** 形状を差し込み側（-X）へ引き伸ばす。スライドで通る範囲を作るのに使う */
function extendTowardEntry(wasm: ManifoldToplevel, scope: Scope, m: Manifold, distance: number): Manifold {
  return scope.keep(wasm.Manifold.hull([m, scope.keep(m.translate(-distance, 0, 0))]));
}

/** x ≤ xMax、zMin ≤ z ≤ zMax の大きな直方体 */
function boxBelowX(wasm: ManifoldToplevel, scope: Scope, big: number, xMax: number, zMin: number, zMax: number): Manifold {
  const cube = scope.keep(wasm.Manifold.cube([big, big, zMax - zMin]));
  return scope.keep(cube.translate(xMax - big, -big / 2, zMin));
}

/** クリック凸・凹の球の中心の高さ */
function clickCenterZ(p: CaseParams, ld: LidDims): number {
  return ld.zLid + p.lid.clickDiameter / 2 - ld.clickBumpHeight;
}

/** 本体から差し引く形状：溝（差し込み側へ貫通）、差し込み側の壁の切り落とし、クリック凹 */
export function buildLidCuts(wasm: ManifoldToplevel, scope: Scope, p: CaseParams, ld: LidDims): Manifold {
  const big = bigSize(ld);
  // 上面と同じ高さで差し引くと面が重なるので 1 mm 上まで伸ばす。45° を保つため、上端の輪郭も 1 mm 内側にする
  const groove = dovetailPlate(wasm, scope, p, ld, p.lid.grooveDepth, -1, ld.zCut, ld.zTop + 1);
  const cuts: Manifold[] = [
    extendTowardEntry(wasm, scope, groove, ld.length + p.body.wallThickness + 10),
    boxBelowX(wasm, scope, big, -ld.length / 2, ld.zCut, ld.zTop + 1),
  ];
  if (p.lid.clickEnabled) {
    const r = p.lid.clickDiameter / 2 + CLICK_DIMPLE_MARGIN;
    const sphere = scope.keep(wasm.Manifold.sphere(r, p.print.circularSegments));
    for (const y of ld.clickYs) {
      cuts.push(scope.keep(sphere.translate(ld.clickX, y, clickCenterZ(p, ld))));
    }
  }
  return scope.keep(wasm.Manifold.union(cuts));
}

/** フタ本体（組み立てた位置）。outerProfile は本体外形の平面形状 */
export function buildLid(
  wasm: ManifoldToplevel,
  scope: Scope,
  p: CaseParams,
  ld: LidDims,
  outerProfile: CrossSection,
): Manifold {
  const l = p.lid;
  const big = bigSize(ld);
  const c = l.sideClearance;

  const plate = dovetailPlate(wasm, scope, p, ld, l.grooveDepth - c, -c, ld.zLid, ld.zTop);
  const plateExt = extendTowardEntry(wasm, scope, plate, ld.length + p.body.wallThickness + 10);
  // 前リップ：切り落とした壁の位置を、本体の外形に合わせて埋める
  const lip = boxBelowX(wasm, scope, big, -ld.length / 2 - c, ld.zLid, ld.zTop);
  const zone = slab(scope, outerProfile, ld.zLid, ld.zTop);
  let lid = scope.keep(scope.keep(plateExt.add(lip)).intersect(zone));

  if (l.clickEnabled) {
    const rb = l.clickDiameter / 2;
    const sphere = scope.keep(wasm.Manifold.sphere(rb, p.print.circularSegments));
    const below = scope.keep(
      scope.keep(wasm.Manifold.cube([big, big, big], true)).translate(0, 0, ld.zLid - big / 2),
    );
    const bumps = ld.clickYs.map((y) =>
      scope.keep(scope.keep(sphere.translate(ld.clickX, y, clickCenterZ(p, ld))).intersect(below)),
    );
    lid = scope.keep(wasm.Manifold.union([lid, ...bumps]));
  }
  return lid;
}

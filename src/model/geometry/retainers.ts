import type { CrossSection, Manifold, ManifoldToplevel } from 'manifold-3d';
import type { CaseParams, RetainerParams } from '../params';
import { innerWallLength, ribCenters, undersideDrop } from '../retainers';
import { roundedRect } from './profiles';
import type { Scope } from './scope';

// 抜け止めの形状。まず「手前（-Y）の壁」として作り、Z 軸回りに回して各壁へ置く。
// 手前の壁のフレーム：x = 壁に沿った u（外から見て右）、y = 内面からの突き出し n（内側が +）、z = ワールドの Z。
// 根元は壁の中へ EMBED だけ埋め込んで本体と一体にする。下側はすべて 45° 以下の斜面で、サポート不要。

const EMBED = 0.5;
const WALL_ANGLE = { front: 0, back: 180, left: -90, right: 90 } as const;

/** (n, z) 平面の断面を、壁に沿った長さ length（中心 u）で押し出して手前の壁のフレームに置く */
function sweepAlongWall(scope: Scope, section: CrossSection, u: number, length: number): Manifold {
  const slab = scope.keep(section.extrude(length, 0, 0, [1, 1], true));
  // X 軸回りに +90°：(n, z, s) → (n, -s, z)、続けて Z 軸回りに +90°：→ (s, n, z)
  const rotated = scope.keep(scope.keep(slab.rotate(90, 0, 0)).rotate(0, 0, 90));
  return scope.keep(rotated.translate(u, 0, 0));
}

function crushRibs(wasm: ManifoldToplevel, scope: Scope, p: CaseParams, r: RetainerParams): Manifold {
  const { CrossSection, Manifold } = wasm;
  const z0 = p.body.bottomThickness + r.z;
  const z1 = z0 + r.ribLength;
  const pr = r.protrusion;
  const b = r.ribBase;
  // 断面は (u, n) 平面の三角形（根元は壁に埋め込む）。上下の端は 45° に絞る
  const tri = scope.keep(CrossSection.ofPolygons([[[-b / 2, -EMBED], [b / 2, -EMBED], [b / 2, 0], [0, pr], [-b / 2, 0]]]));
  const base = scope.keep(CrossSection.square([b, EMBED]).translate(-b / 2, -EMBED));
  const full = scope.keep(scope.keep(tri.extrude(z1 - z0 - 2 * pr)).translate(0, 0, z0 + pr));
  const root = scope.keep(scope.keep(base.extrude(z1 - z0)).translate(0, 0, z0));
  const rib = scope.keep(Manifold.hull([full, root]));
  const ribs = ribCenters(r).map((u) => scope.keep(rib.translate(u, 0, 0)));
  return ribs.length === 1 ? ribs[0] : scope.keep(Manifold.union(ribs));
}

function stopper(wasm: ManifoldToplevel, scope: Scope, p: CaseParams, r: RetainerParams, u: number, length: number): Manifold {
  const zt = p.body.bottomThickness + r.z;
  const drop = undersideDrop(r.protrusion, r.undersideAngle);
  const rise = undersideDrop(r.protrusion, r.topAngle);
  // (n, z)：下の斜面 → 先端 → 上の斜面（差し込み時のガイド）
  const section = scope.keep(
    wasm.CrossSection.ofPolygons([
      [[-EMBED, zt - drop], [0, zt - drop], [r.protrusion, zt], [0, zt + rise], [-EMBED, zt + rise]],
    ]),
  );
  return sweepAlongWall(scope, section, u, length);
}

function shelfSection(wasm: ManifoldToplevel, scope: Scope, p: CaseParams, r: RetainerParams): CrossSection {
  const zt = p.body.bottomThickness + r.z;
  const zf = zt - r.shelfThickness;
  const drop = undersideDrop(r.protrusion, r.undersideAngle);
  // (n, z)：壁際の下端 → 斜面 → 先端の垂直面 → 上面
  return scope.keep(
    wasm.CrossSection.ofPolygons([
      [[-EMBED, zf - drop], [0, zf - drop], [r.protrusion, zf], [r.protrusion, zt], [-EMBED, zt]],
    ]),
  );
}

/** 全周の棚：内側の空間の輪郭に沿ったリング。凸なので「空ける部分」を凸包で作れる */
function shelfAll(wasm: ManifoldToplevel, scope: Scope, p: CaseParams, r: RetainerParams): Manifold {
  const { Manifold } = wasm;
  const b = p.body;
  const segs = p.print.circularSegments;
  const innerR = Math.max(b.cornerRadius - b.wallThickness, 0);
  const zt = b.bottomThickness + r.z;
  const zf = zt - r.shelfThickness;
  const drop = undersideDrop(r.protrusion, r.undersideAngle);
  const outline = (off: number) =>
    roundedRect(wasm, scope, b.innerWidth + 2 * off, b.innerDepth + 2 * off, Math.max(innerR + off, 0), segs);
  const slab = (cs: CrossSection, z0: number, z1: number) =>
    scope.keep(scope.keep(cs.extrude(z1 - z0)).translate(0, 0, z0));

  const ring = slab(outline(EMBED), zf - drop, zt);
  // 空ける部分：上は輪郭を奥行きぶん縮めた形、下は元の輪郭。その間が斜面になる
  const open = scope.keep(
    Manifold.hull([slab(outline(-r.protrusion), zf, zt + 1), slab(outline(0), zf - drop - 1, zf - drop)]),
  );
  return scope.keep(ring.subtract(open));
}

function buildRetainer(wasm: ManifoldToplevel, scope: Scope, p: CaseParams, r: RetainerParams): Manifold {
  if (r.type === 'shelf' && r.face === 'all') return shelfAll(wasm, scope, p, r);
  const face = r.face === 'all' ? 'front' : r.face;
  const wallLen = innerWallLength(p, face);
  const u = r.fullLength ? 0 : r.u;
  const length = r.fullLength ? wallLen : r.length;

  let local: Manifold;
  if (r.type === 'crushRib') local = crushRibs(wasm, scope, p, r);
  else if (r.type === 'stopper') local = stopper(wasm, scope, p, r, u, length);
  else local = sweepAlongWall(scope, shelfSection(wasm, scope, p, r), u, length);

  const half = face === 'front' || face === 'back' ? p.body.innerDepth / 2 : p.body.innerWidth / 2;
  const placed = scope.keep(local.translate(0, -half, 0));
  return WALL_ANGLE[face] === 0 ? placed : scope.keep(placed.rotate(0, 0, WALL_ANGLE[face]));
}

/** 抜け止めをすべて作る。なければ null。hull は本体の外形（はみ出し防止の切り取りに使う） */
export function buildRetainers(
  wasm: ManifoldToplevel,
  scope: Scope,
  p: CaseParams,
  hull: Manifold,
): Manifold | null {
  if (p.retainers.length === 0) return null;
  const parts = p.retainers.map((r) => buildRetainer(wasm, scope, p, r));
  const all = parts.length === 1 ? parts[0] : scope.keep(wasm.Manifold.union(parts));
  return scope.keep(all.intersect(hull));
}

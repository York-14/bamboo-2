import type { CrossSection, ManifoldToplevel } from 'manifold-3d';
import type { Scope } from './scope';

/**
 * 原点中心の角丸長方形。
 * 四隅の円の凸包で作るので、r が短辺の半分ちょうど（長穴形・円）でも破綻しない。
 */
export function roundedRect(
  wasm: ManifoldToplevel,
  scope: Scope,
  width: number,
  depth: number,
  radius: number,
  segments: number,
): CrossSection {
  const { CrossSection } = wasm;
  const r = Math.min(Math.max(radius, 0), width / 2, depth / 2);
  if (r < 1e-6) {
    return scope.keep(CrossSection.square([width, depth], true));
  }
  const cx = width / 2 - r;
  const cy = depth / 2 - r;
  const circle = scope.keep(CrossSection.circle(r, segments));
  const corners = [
    [cx, cy],
    [-cx, cy],
    [-cx, -cy],
    [cx, -cy],
  ].map(([x, y]) => scope.keep(circle.translate(x, y)));
  return scope.keep(CrossSection.hull(corners));
}

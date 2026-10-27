import type { CaseParams } from './params';

export interface DerivedDims {
  outerWidth: number;
  outerDepth: number;
  outerHeight: number;
  /** 内側の空間の角の丸み */
  innerCornerRadius: number;
}

export function deriveDims(p: CaseParams): DerivedDims {
  const b = p.body;
  return {
    outerWidth: b.innerWidth + 2 * b.wallThickness,
    outerDepth: b.innerDepth + 2 * b.wallThickness,
    // ステップ 2 でフタ部の高さが加わる
    outerHeight: b.bottomThickness + b.innerHeight,
    innerCornerRadius: Math.max(b.cornerRadius - b.wallThickness, 0),
  };
}
